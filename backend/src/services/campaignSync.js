import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { reconstructCharacterSnapshot } from './characterRelations.js';

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
    include: {
      characterSkills: true,
      inventoryItems: { orderBy: { addedAt: 'asc' } },
      materials: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, reconstructCharacterSnapshot(r)]));
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
  // Bulk: findMany existing → split into createMany (new) + per-row update.
  // Cuts query count from 2N (upsert) to ~2 + (N - newCount).
  const valid = npcs
    .filter((n) => n && n.name)
    .map((npc) => ({
      relationships: Array.isArray(npc.relationships) ? npc.relationships : [],
      data: {
        npcId: npc.name.toLowerCase().replace(/\s+/g, '_'),
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
      },
    }));
  if (valid.length === 0) return;

  let existing = [];
  try {
    existing = await prisma.campaignNPC.findMany({
      where: { campaignId, npcId: { in: valid.map((v) => v.data.npcId) } },
      select: { id: true, npcId: true },
    });
  } catch (err) {
    log.error({ err, campaignId }, 'NPC sync existing-lookup failed');
    return;
  }
  const idByNpcId = new Map(existing.map((r) => [r.npcId, r.id]));

  const toCreate = [];
  const toUpdate = [];
  for (const v of valid) {
    const existingId = idByNpcId.get(v.data.npcId);
    if (existingId) {
      const { npcId: _drop, ...updateData } = v.data;
      toUpdate.push({ id: existingId, npcId: v.data.npcId, data: updateData, relationships: v.relationships });
    } else {
      toCreate.push({ campaignId, ...v.data, _npcKey: v.data.npcId, _relationships: v.relationships });
    }
  }

  if (toCreate.length > 0) {
    try {
      await prisma.campaignNPC.createMany({
        data: toCreate.map(({ _npcKey, _relationships, ...row }) => row),
        skipDuplicates: true,
      });
    } catch (err) {
      log.error({ err, count: toCreate.length }, 'NPC bulk createMany failed');
    }
  }
  for (const u of toUpdate) {
    try {
      await prisma.campaignNPC.update({ where: { id: u.id }, data: u.data });
    } catch (err) {
      log.error({ err, id: u.id }, 'NPC update failed');
    }
  }

  // F4 — replace relationships for every touched NPC. Need fresh DB ids
  // (created rows weren't returned by createMany), so re-resolve in one shot.
  try {
    const allTouched = [...toUpdate, ...toCreate];
    if (allTouched.length === 0) return;
    const allNpcIds = allTouched.map((r) => r.npcId ?? r._npcKey);
    const dbRows = await prisma.campaignNPC.findMany({
      where: { campaignId, npcId: { in: allNpcIds } },
      select: { id: true, npcId: true },
    });
    const idByNpcKey = new Map(dbRows.map((r) => [r.npcId, r.id]));

    const targetNpcDbIds = allTouched.map((r) => idByNpcKey.get(r.npcId ?? r._npcKey)).filter(Boolean);
    if (targetNpcDbIds.length > 0) {
      await prisma.campaignNpcRelationship.deleteMany({
        where: { campaignNpcId: { in: targetNpcDbIds } },
      });
    }

    const relInserts = [];
    for (const t of allTouched) {
      const dbId = idByNpcKey.get(t.npcId ?? t._npcKey);
      const relList = t.relationships ?? t._relationships ?? [];
      if (!dbId || relList.length === 0) continue;
      for (const rel of relList) {
        if (!rel || !rel.npcName) continue;
        relInserts.push({
          campaignNpcId: dbId,
          targetType: 'npc',
          targetRef: rel.npcName,
          relation: rel.type || 'unknown',
          strength: typeof rel.strength === 'number' ? rel.strength : 0,
        });
      }
    }
    if (relInserts.length > 0) {
      await prisma.campaignNpcRelationship.createMany({
        data: relInserts,
        skipDuplicates: true,
      });
    }
  } catch (err) {
    log.error({ err, campaignId }, 'NPC relationships sync failed');
  }
}

export async function syncKnowledgeToNormalized(campaignId, events, decisions) {
  if (events.length === 0 && decisions.length === 0) return;
  const existing = await prisma.campaignKnowledge.findMany({
    where: { campaignId, entryType: { in: ['event', 'decision'] } },
    select: { summary: true, entryType: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.entryType}:${e.summary}`));

  const toInsert = [];
  for (const e of events) {
    const summary = e.summary || (typeof e === 'string' ? e : '');
    if (!summary) continue;
    if (existingKeys.has(`event:${summary}`)) continue;
    existingKeys.add(`event:${summary}`);
    toInsert.push({
      campaignId,
      entryType: 'event',
      summary,
      content: e,
      importance: e.importance || null,
      tags: e.tags || [],
      sceneIndex: e.sceneIndex ?? null,
    });
  }
  for (const d of decisions) {
    const summary = `${d.choice || ''} -> ${d.consequence || ''}`;
    if (!d.choice) continue;
    if (existingKeys.has(`decision:${summary}`)) continue;
    existingKeys.add(`decision:${summary}`);
    toInsert.push({
      campaignId,
      entryType: 'decision',
      summary,
      content: d,
      importance: d.importance || null,
      tags: d.tags || [],
      sceneIndex: d.sceneIndex ?? null,
    });
  }

  if (toInsert.length === 0) return;
  try {
    await prisma.campaignKnowledge.createMany({ data: toInsert });
  } catch (err) {
    log.error({ err, count: toInsert.length }, 'Knowledge bulk createMany failed');
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
  // Bulk: findMany existing → split into createMany (new) + per-row update.
  const valid = all.filter((q) => q.id && q.name).map((q) => ({
    questId: q.id,
    prereqIds: Array.isArray(q.prerequisiteQuestIds) ? q.prerequisiteQuestIds.filter(Boolean) : [],
    objectives: Array.isArray(q.objectives) ? q.objectives : [],
    data: {
      name: q.name,
      type: q.type || 'side',
      description: q.description || '',
      completionCondition: q.completionCondition || null,
      questGiverId: q.questGiverId || null,
      turnInNpcId: q.turnInNpcId || q.questGiverId || null,
      locationId: q.locationId || null,
      reward: q.reward ?? null,
      status: q._status,
      completedAt: q.completedAt ? new Date(q.completedAt) : null,
      forcedGiver: q.forcedGiver === true,
    },
  }));
  if (valid.length === 0) return;

  let existing = [];
  try {
    existing = await prisma.campaignQuest.findMany({
      where: { campaignId, questId: { in: valid.map((v) => v.questId) } },
      select: { id: true, questId: true },
    });
  } catch (err) {
    log.error({ err, campaignId }, 'Quest sync existing-lookup failed');
    return;
  }
  const idByQuestId = new Map(existing.map((r) => [r.questId, r.id]));

  const toCreate = [];
  const toUpdate = [];
  for (const v of valid) {
    const existingId = idByQuestId.get(v.questId);
    if (existingId) {
      toUpdate.push({ id: existingId, data: v.data });
    } else {
      toCreate.push({ campaignId, questId: v.questId, ...v.data });
    }
  }

  if (toCreate.length > 0) {
    try {
      await prisma.campaignQuest.createMany({ data: toCreate, skipDuplicates: true });
    } catch (err) {
      log.error({ err, count: toCreate.length }, 'Quest bulk createMany failed');
    }
  }
  for (const u of toUpdate) {
    try {
      await prisma.campaignQuest.update({ where: { id: u.id }, data: u.data });
    } catch (err) {
      log.error({ err, id: u.id }, 'Quest update failed');
    }
  }

  // F4 — replace objectives + prerequisites for every touched quest. Need
  // fresh DB ids so re-resolve in one shot.
  try {
    const dbRows = await prisma.campaignQuest.findMany({
      where: { campaignId, questId: { in: valid.map((v) => v.questId) } },
      select: { id: true, questId: true },
    });
    const idByQuestId2 = new Map(dbRows.map((r) => [r.questId, r.id]));

    const allDependentIds = valid.map((v) => idByQuestId2.get(v.questId)).filter(Boolean);

    // ── Objectives (replace strategy) ──
    if (allDependentIds.length > 0) {
      await prisma.campaignQuestObjective.deleteMany({
        where: { questId: { in: allDependentIds } },
      });
    }
    const objectiveInserts = [];
    for (const v of valid) {
      const dbId = idByQuestId2.get(v.questId);
      if (!dbId) continue;
      v.objectives.forEach((obj, idx) => {
        if (!obj) return;
        const description = obj.description || obj.text || '';
        if (!description) return;
        const completed = obj.completed === true || obj.status === 'done';
        // Stash AI-emitted metadata (onComplete triggers, hints,
        // locationId/locationName for promotion-pipeline scoring, etc.) in
        // JSONB. Anything not in the column set survives roundtrip via the
        // reader-side serializer.
        const KNOWN_COLS = new Set(['description', 'text', 'completed', 'status', 'progress', 'target', 'id']);
        const metadata = {};
        for (const [k, v2] of Object.entries(obj)) {
          if (!KNOWN_COLS.has(k) && v2 !== undefined && v2 !== null) metadata[k] = v2;
        }
        objectiveInserts.push({
          questId: dbId,
          displayOrder: idx,
          description,
          progress: typeof obj.progress === 'number' ? obj.progress : (completed ? 1 : 0),
          targetAmount: typeof obj.target === 'number' ? obj.target : 1,
          status: completed ? 'done' : 'pending',
          metadata,
        });
      });
    }
    if (objectiveInserts.length > 0) {
      await prisma.campaignQuestObjective.createMany({ data: objectiveInserts });
    }

    // ── Prerequisites (replace strategy, scoped to dependents with prereqs) ──
    const prereqInserts = [];
    const dependentWithPrereqs = [];
    for (const v of valid) {
      if (v.prereqIds.length === 0) continue;
      const dependentId = idByQuestId2.get(v.questId);
      if (!dependentId) continue;
      dependentWithPrereqs.push(dependentId);
      for (const prereqQuestId of v.prereqIds) {
        const prereqId = idByQuestId2.get(prereqQuestId);
        if (!prereqId) continue;
        prereqInserts.push({ questId: dependentId, prerequisiteId: prereqId });
      }
    }
    if (dependentWithPrereqs.length > 0) {
      await prisma.campaignQuestPrerequisite.deleteMany({
        where: { questId: { in: dependentWithPrereqs } },
      });
    }
    if (prereqInserts.length > 0) {
      await prisma.campaignQuestPrerequisite.createMany({
        data: prereqInserts,
        skipDuplicates: true,
      });
    }
  } catch (err) {
    log.error({ err, campaignId }, 'Quest objectives/prerequisites sync failed');
  }
}

export async function reconstructFromNormalized(campaignId, coreState, { currentLocationName = null } = {}) {
  if (!coreState.world) coreState.world = {};

  // F5 — inject currentLocationName from the dedicated column. Doesn't clobber
  // anything caller already merged in; first write wins.
  if (currentLocationName && !coreState.world.currentLocation) {
    coreState.world.currentLocation = currentLocationName;
  }

  const dbNpcs = await prisma.campaignNPC.findMany({
    where: { campaignId },
    include: { relationships: true },
  });
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
    include: {
      prerequisites: { select: { prerequisite: { select: { questId: true } } } },
      objectives: { orderBy: { displayOrder: 'asc' } },
    },
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
        prerequisiteQuestIds: Array.isArray(q.prerequisites)
          ? q.prerequisites.map((p) => p.prerequisite?.questId).filter(Boolean)
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
