import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { deserializeCharacterRow } from './characterMutations.js';

const log = childLogger({ module: 'campaigns' });

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 50;

export async function withRetry(fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Postgres serialization failure (40001) — Prisma surfaces as P2034.
      // Mongo replica-set transient (P2028) is dead with the engine swap.
      const isRetryable = err.code === 'P2034' || err.code === '40001';
      if (!isRetryable || attempt === MAX_RETRIES - 1) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
    }
  }
}

/**
 * Fetch and deserialize all Character records for a campaign by IDs.
 * Returns an array in the same order as characterIds (missing IDs filtered out).
 */
export async function fetchCampaignCharacters(characterIds) {
  if (!Array.isArray(characterIds) || characterIds.length === 0) return [];
  const rows = await prisma.character.findMany({
    where: { id: { in: characterIds } },
  });
  const byId = new Map(rows.map((r) => [r.id, deserializeCharacterRow(r)]));
  return characterIds.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Resolve a campaign's character IDs from CampaignParticipant rows.
 * Replaces the old `Campaign.characterIds[]` array column. Order is by
 * `joinedAt` ASC so the host (first to join) lands at index 0.
 */
export async function getCampaignCharacterIds(campaignId) {
  if (!campaignId) return [];
  const rows = await prisma.campaignParticipant.findMany({
    where: { campaignId },
    select: { characterId: true },
    orderBy: { joinedAt: 'asc' },
  });
  return rows.map((r) => r.characterId);
}

/**
 * Bulk variant for callsites that need character IDs for many campaigns
 * in one round-trip (campaign list endpoints). Returns a Map<campaignId, string[]>.
 */
export async function getCharacterIdsForCampaigns(campaignIds) {
  if (!Array.isArray(campaignIds) || campaignIds.length === 0) return new Map();
  const rows = await prisma.campaignParticipant.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { campaignId: true, characterId: true, joinedAt: true },
    orderBy: { joinedAt: 'asc' },
  });
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.campaignId)) out.set(r.campaignId, []);
    out.get(r.campaignId).push(r.characterId);
  }
  return out;
}

export async function syncNPCsToNormalized(campaignId, npcs) {
  if (!Array.isArray(npcs) || npcs.length === 0) return;
  for (const npc of npcs) {
    if (!npc.name) continue;
    const npcId = npc.name.toLowerCase().replace(/\s+/g, '_');
    try {
      const data = {
        name: npc.name,
        gender: npc.gender || 'unknown',
        role: npc.role || null,
        personality: npc.personality || null,
        attitude: npc.attitude || 'neutral',
        disposition: npc.disposition ?? 0,
        alive: npc.alive ?? true,
        lastLocation: npc.lastLocation || null,
        factionId: npc.factionId || null,
        notes: npc.notes || null,
        relationships: npc.relationships || [],
      };
      await prisma.campaignNPC.upsert({
        where: { campaignId_npcId: { campaignId, npcId } },
        create: { campaignId, npcId, ...data },
        update: data,
      });
    } catch (err) {
      log.error({ err, npcName: npc.name }, 'NPC sync failed');
    }
  }
}

export async function syncKnowledgeToNormalized(campaignId, events, decisions) {
  if (events.length === 0 && decisions.length === 0) return;
  const existing = await prisma.campaignKnowledge.findMany({
    where: { campaignId, entryType: { in: ['event', 'decision'] } },
    select: { summary: true, entryType: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.entryType}:${e.summary}`));

  for (const e of events) {
    const summary = e.summary || (typeof e === 'string' ? e : '');
    if (!summary) continue;
    if (existingKeys.has(`event:${summary}`)) continue;
    try {
      await prisma.campaignKnowledge.create({
        data: {
          campaignId,
          entryType: 'event',
          summary,
          content: e,
          importance: e.importance || null,
          tags: e.tags || [],
          sceneIndex: e.sceneIndex ?? null,
        },
      });
    } catch (err) {
      log.error({ err }, 'Knowledge event sync failed');
    }
  }

  for (const d of decisions) {
    const summary = `${d.choice || ''} -> ${d.consequence || ''}`;
    if (!d.choice) continue;
    if (existingKeys.has(`decision:${summary}`)) continue;
    try {
      await prisma.campaignKnowledge.create({
        data: {
          campaignId,
          entryType: 'decision',
          summary,
          content: d,
          importance: d.importance || null,
          tags: d.tags || [],
          sceneIndex: d.sceneIndex ?? null,
        },
      });
    } catch (err) {
      log.error({ err }, 'Knowledge decision sync failed');
    }
  }
}

export async function syncQuestsToNormalized(campaignId, quests) {
  const active = quests.active || [];
  const completed = quests.completed || [];
  const all = [
    ...active.map((q) => ({ ...q, _status: 'active' })),
    ...completed.map((q) => ({ ...q, _status: 'completed' })),
  ];
  if (all.length === 0) return;
  for (const q of all) {
    if (!q.id || !q.name) continue;
    try {
      const data = {
        name: q.name,
        type: q.type || 'side',
        description: q.description || '',
        completionCondition: q.completionCondition || null,
        questGiverId: q.questGiverId || null,
        turnInNpcId: q.turnInNpcId || q.questGiverId || null,
        locationId: q.locationId || null,
        prerequisiteQuestIds: q.prerequisiteQuestIds || [],
        objectives: q.objectives || [],
        reward: q.reward ?? null,
        status: q._status,
        completedAt: q.completedAt ? new Date(q.completedAt) : null,
        forcedGiver: q.forcedGiver === true,
      };
      await prisma.campaignQuest.upsert({
        where: { campaignId_questId: { campaignId, questId: q.id } },
        create: { campaignId, questId: q.id, ...data },
        update: data,
      });
    } catch (err) {
      log.error({ err, questName: q.name }, 'Quest sync failed');
    }
  }
}

export async function reconstructFromNormalized(campaignId, coreState) {
  if (!coreState.world) coreState.world = {};

  const dbNpcs = await prisma.campaignNPC.findMany({ where: { campaignId } });
  if (dbNpcs.length > 0) {
    coreState.world.npcs = dbNpcs.map((n) => ({
      name: n.name,
      gender: n.gender,
      role: n.role,
      personality: n.personality,
      attitude: n.attitude,
      disposition: n.disposition,
      alive: n.alive,
      lastLocation: n.lastLocation,
      factionId: n.factionId,
      notes: n.notes,
      relationships: n.relationships || [],
    }));
  }

  if (!coreState.world.knowledgeBase) {
    coreState.world.knowledgeBase = { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] };
  }
  const dbKnowledge = await prisma.campaignKnowledge.findMany({
    where: { campaignId, entryType: { in: ['event', 'decision'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (dbKnowledge.length > 0) {
    const events = [];
    const decisions = [];
    for (const k of dbKnowledge) {
      const content = k.content || {};
      if (k.entryType === 'event') events.push({ ...content, sceneIndex: k.sceneIndex });
      else decisions.push({ ...content, sceneIndex: k.sceneIndex });
    }
    if (events.length > 0) coreState.world.knowledgeBase.events = events;
    if (decisions.length > 0) coreState.world.knowledgeBase.decisions = decisions;
  }

  const dbQuests = await prisma.campaignQuest.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
  if (dbQuests.length > 0) {
    const active = [];
    const completed = [];
    for (const q of dbQuests) {
      const quest = {
        id: q.questId,
        name: q.name,
        type: q.type,
        description: q.description,
        completionCondition: q.completionCondition,
        questGiverId: q.questGiverId,
        turnInNpcId: q.turnInNpcId,
        locationId: q.locationId,
        prerequisiteQuestIds: q.prerequisiteQuestIds || [],
        objectives: q.objectives || [],
        reward: q.reward ?? null,
      };
      if (q.status === 'completed') {
        completed.push({ ...quest, completedAt: q.completedAt?.getTime?.() || q.completedAt, rewardGranted: true });
      } else {
        active.push(quest);
      }
    }
    coreState.quests = { active, completed };
  }

  return coreState;
}
