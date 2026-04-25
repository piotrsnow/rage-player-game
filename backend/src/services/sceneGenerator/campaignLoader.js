import { prisma } from '../../lib/prisma.js';
import { deserializeCharacterRow } from '../characterMutations.js';
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
      select: { coreState: true, livingWorldEnabled: true },
    }),
    prisma.campaignNPC.findMany({ where: { campaignId } }),
    prisma.campaignQuest.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } }),
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

  // Single-player → first participant. Multiplayer routes through multiplayerAI.
  const activeCharacterId = characterIds[0] || null;
  let activeCharacter = null;
  if (activeCharacterId) {
    const row = await prisma.character.findUnique({ where: { id: activeCharacterId } });
    if (row) {
      activeCharacter = deserializeCharacterRow(row);
      coreState.character = activeCharacter;
    }
  }

  if (dbNpcs.length > 0) {
    if (!coreState.world) coreState.world = {};
    coreState.world.npcs = dbNpcs.map((n) => ({
      name: n.name, gender: n.gender, role: n.role,
      personality: n.personality, attitude: n.attitude, disposition: n.disposition,
      alive: n.alive, lastLocation: n.lastLocation,
      notes: n.notes, relationships: Array.isArray(n.relationships) ? n.relationships : [],
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
        prerequisiteQuestIds: Array.isArray(q.prerequisiteQuestIds) ? q.prerequisiteQuestIds : [],
        objectives: Array.isArray(q.objectives) ? q.objectives : [],
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
  };
}
