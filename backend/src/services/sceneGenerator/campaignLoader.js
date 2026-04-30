import { prisma } from '../../lib/prisma.js';
import { loadCharacterSnapshotById } from '../characterRelations.js';
import { getCampaignCharacterIds } from '../campaignSync.js';

/**
 * Load all DB state needed for scene generation for a given campaign:
 * - campaign row (coreState)
 * - normalized NPCs / quests / codex / knowledge
 * - the active player character (first participant)
 *
 * Returns { coreState, activeCharacter, activeCharacterId, dbNpcs, dbQuests,
 * dbCodex, dbKnowledge }. `coreState` has had npcs/quests/codexSummary/
 * keyPlotFacts merged in from the normalized collections so the prompt builder
 * sees a single hydrated view.
 */
export async function loadCampaignState(campaignId) {
  const [campaign, dbNpcs, dbQuests, dbCodex, dbKnowledge, characterIds] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      // F5 — currentLocationName lifted from coreState.world.currentLocation; merged below.
      // F5b — currentLocationKind/Id pair surfaced for the travel resolver
      // (needs the polymorphic ref to load the row + its locationType +
      // parent walk-up chain).
      select: {
        coreState: true,
        livingWorldEnabled: true,
        currentLocationName: true,
        currentLocationKind: true,
        currentLocationId: true,
      },
    }),
    prisma.campaignNPC.findMany({
      where: { campaignId },
      include: { relationships: true },
    }),
    prisma.campaignQuest.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
      include: {
        prerequisites: { select: { prerequisiteId: true } },
        objectives: { orderBy: { displayOrder: 'asc' } },
      },
    }),
    prisma.campaignCodex.findMany({
      where: { campaignId },
      select: { codexKey: true, name: true, category: true, fragments: true },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    }),
    prisma.campaignKnowledge.findMany({
      where: { campaignId, importance: { in: ['high', 'critical'] } },
      select: { summary: true, importance: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    getCampaignCharacterIds(campaignId),
  ]);

  if (!campaign) throw new Error('Campaign not found');
  const coreState = campaign.coreState || {};

  // F5 — inject currentLocationName from the dedicated column into the legacy
  // coreState.world.currentLocation slot so prompt builders + downstream
  // handlers see the same shape they always did.
  if (campaign.currentLocationName) {
    if (!coreState.world) coreState.world = {};
    if (!coreState.world.currentLocation) coreState.world.currentLocation = campaign.currentLocationName;
  }

  // Load `currentLocationType` so the conditional prompt rules can decide
  // whether to surface the sublocation-creation slot (in a settlement /
  // canonical sublocation) or the dungeon-room navigation slot
  // (currentLocationType='dungeon_room'). Wilderness/null = no slot offered.
  if (campaign.currentLocationKind && campaign.currentLocationId) {
    try {
      const row = campaign.currentLocationKind === 'world'
        ? await prisma.worldLocation.findUnique({
            where: { id: campaign.currentLocationId },
            select: { locationType: true },
          })
        : await prisma.campaignLocation.findUnique({
            where: { id: campaign.currentLocationId },
            select: { locationType: true },
          });
      if (row?.locationType) {
        if (!coreState.world) coreState.world = {};
        coreState.world.currentLocationType = row.locationType;
      }
    } catch { /* non-fatal — conditional rules just won't fire */ }
  }

  // Single-player → first participant. Multiplayer routes through multiplayerAI.
  const activeCharacterId = characterIds[0] || null;
  let activeCharacter = null;
  if (activeCharacterId) {
    activeCharacter = await loadCharacterSnapshotById(activeCharacterId);
    if (activeCharacter) {
      coreState.character = activeCharacter;
    }
  }

  if (dbNpcs.length > 0) {
    if (!coreState.world) coreState.world = {};
    coreState.world.npcs = dbNpcs.map((n) => ({
      name: n.name, gender: n.gender, role: n.role,
      personality: n.personality, attitude: n.attitude, disposition: n.disposition,
      alive: n.alive, lastLocation: n.lastLocation,
      notes: n.notes,
      race: n.race,
      creatureKind: n.creatureKind,
      level: n.level,
      stats: n.stats && typeof n.stats === 'object' ? n.stats : {},
      relationships: (n.relationships || []).map((r) => ({
        npcName: r.targetRef,
        type: r.relation,
        ...(r.strength ? { strength: r.strength } : {}),
      })),
    }));
  }

  if (dbQuests.length > 0) {
    const active = [];
    const completed = [];
    for (const q of dbQuests) {
      const quest = {
        id: q.questId, name: q.name, type: q.type, description: q.description,
        completionCondition: q.completionCondition, questGiverId: q.questGiverId,
        turnInNpcId: q.turnInNpcId, locationId: q.locationId,
        prerequisiteQuestIds: Array.isArray(q.prerequisites)
          ? q.prerequisites.map((p) => p.prerequisiteId)
          : [],
        objectives: (q.objectives || []).map((o) => ({
          description: o.description,
          completed: o.status === 'done',
          progress: o.progress,
          target: o.targetAmount,
          ...(o.metadata && typeof o.metadata === 'object' ? o.metadata : {}),
        })),
        reward: q.reward ?? null,
      };
      if (q.status === 'completed') completed.push({ ...quest, completedAt: q.completedAt });
      else active.push(quest);
    }
    coreState.quests = { active, completed };
  }

  if (dbCodex.length > 0) {
    if (!coreState.world) coreState.world = {};
    const ASPECT_TYPES = ['history', 'description', 'location', 'weakness', 'rumor', 'technical', 'political'];
    coreState.world.codexSummary = dbCodex.map((c) => {
      const fragments = Array.isArray(c.fragments) ? c.fragments : [];
      const knownAspects = [...new Set(fragments.map(f => f.aspect).filter(Boolean))];
      const canReveal = ASPECT_TYPES.filter(a => !knownAspects.includes(a));
      return { name: c.name, category: c.category, knownAspects, canReveal };
    });
  }

  if (dbKnowledge.length > 0) {
    if (!coreState.world) coreState.world = {};
    coreState.world.keyPlotFacts = dbKnowledge.map(k => k.summary);
  }

  return {
    coreState,
    activeCharacter,
    activeCharacterId,
    dbNpcs,
    dbQuests,
    dbCodex,
    dbKnowledge,
    livingWorldEnabled: campaign.livingWorldEnabled === true,
    currentRef: campaign.currentLocationKind && campaign.currentLocationId
      ? { kind: campaign.currentLocationKind, id: campaign.currentLocationId, name: campaign.currentLocationName || null }
      : null,
  };
}
