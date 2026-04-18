import { prisma } from '../../lib/prisma.js';
import { deserializeCharacterRow } from '../characterMutations.js';

/**
 * Load all DB state needed for scene generation for a given campaign:
 * - campaign row (coreState + characterIds)
 * - normalized NPCs / quests / codex / knowledge
 * - the active player character (first characterId)
 *
 * Returns { coreState, activeCharacter, activeCharacterId, dbNpcs, dbQuests,
 * dbCodex, dbKnowledge }. `coreState` has had npcs/quests/codexSummary/
 * keyPlotFacts merged in from the normalized collections so the prompt builder
 * sees a single hydrated view.
 */
export async function loadCampaignState(campaignId) {
  const [campaign, dbNpcs, dbQuests, dbCodex, dbKnowledge] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { coreState: true, characterIds: true, livingWorldEnabled: true },
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
  ]);

  if (!campaign) throw new Error('Campaign not found');
  const coreState = JSON.parse(campaign.coreState);

  // Load the active player character from the Character collection.
  // Single-player → characterIds[0]. Multiplayer routes through multiplayerAI.
  const characterIds = Array.isArray(campaign.characterIds) ? campaign.characterIds : [];
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
      alive: n.alive, lastLocation: n.lastLocation, factionId: n.factionId,
      notes: n.notes, relationships: JSON.parse(n.relationships || '[]'),
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
        prerequisiteQuestIds: JSON.parse(q.prerequisiteQuestIds || '[]'),
        objectives: JSON.parse(q.objectives || '[]'),
        reward: q.reward ? JSON.parse(q.reward) : null,
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
      const fragments = JSON.parse(c.fragments || '[]');
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
