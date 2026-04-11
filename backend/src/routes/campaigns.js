import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { generateKey } from '../services/hashService.js';
import { createMediaStore } from '../services/mediaStore.js';
import { config } from '../config.js';
import { deserializeCharacterRow } from '../services/characterMutations.js';

const store = createMediaStore(config);
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 50;
const SUMMARY_CACHE_MAX_ITEMS = 40;

function extractTotalCost(coreState) {
  if (!coreState) return 0;
  const obj = typeof coreState === 'string' ? JSON.parse(coreState) : coreState;
  return obj?.aiCosts?.total || 0;
}

/**
 * Strip normalized branches out of coreState before saving.
 * Character data is NOT touched here — characters live in their own collection
 * and are referenced via Campaign.characterIds.
 */
function stripNormalizedFromCoreState(coreStateObj) {
  const slim = { ...coreStateObj };

  // Defensive: drop any leftover embedded character from old client payloads.
  if ('character' in slim) delete slim.character;

  const npcs = slim.world?.npcs || [];
  if (slim.world && 'npcs' in slim.world) {
    const { npcs: _n, ...worldRest } = slim.world;
    slim.world = worldRest;
  }

  const knowledgeEvents = slim.world?.knowledgeBase?.events || [];
  const knowledgeDecisions = slim.world?.knowledgeBase?.decisions || [];
  if (slim.world?.knowledgeBase && ('events' in slim.world.knowledgeBase || 'decisions' in slim.world.knowledgeBase)) {
    const { events: _e, decisions: _d, ...kbRest } = slim.world.knowledgeBase;
    slim.world = { ...slim.world, knowledgeBase: kbRest };
  }

  const quests = slim.quests || { active: [], completed: [] };
  delete slim.quests;

  return { slim, npcs, knowledgeEvents, knowledgeDecisions, quests };
}

/**
 * Fetch and deserialize all Character records for a campaign by IDs.
 * Returns an array in the same order as characterIds (missing IDs filtered out).
 */
async function fetchCampaignCharacters(characterIds) {
  if (!Array.isArray(characterIds) || characterIds.length === 0) return [];
  const rows = await prisma.character.findMany({
    where: { id: { in: characterIds } },
  });
  // Preserve characterIds order
  const byId = new Map(rows.map((r) => [r.id, deserializeCharacterRow(r)]));
  return characterIds.map((id) => byId.get(id)).filter(Boolean);
}

async function syncNPCsToNormalized(campaignId, npcs) {
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
        relationships: JSON.stringify(npc.relationships || []),
      };
      await prisma.campaignNPC.upsert({
        where: { campaignId_npcId: { campaignId, npcId } },
        create: { campaignId, npcId, ...data },
        update: data,
      });
    } catch (err) {
      console.error(`[campaigns] NPC sync failed for ${npc.name}:`, err.message);
    }
  }
}

async function syncKnowledgeToNormalized(campaignId, events, decisions) {
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
          content: JSON.stringify(e),
          importance: e.importance || null,
          tags: JSON.stringify(e.tags || []),
          sceneIndex: e.sceneIndex ?? null,
        },
      });
    } catch (err) {
      console.error('[campaigns] Knowledge event sync failed:', err.message);
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
          content: JSON.stringify(d),
          importance: d.importance || null,
          tags: JSON.stringify(d.tags || []),
          sceneIndex: d.sceneIndex ?? null,
        },
      });
    } catch (err) {
      console.error('[campaigns] Knowledge decision sync failed:', err.message);
    }
  }
}

async function syncQuestsToNormalized(campaignId, quests) {
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
        prerequisiteQuestIds: JSON.stringify(q.prerequisiteQuestIds || []),
        objectives: JSON.stringify(q.objectives || []),
        reward: q.reward ? JSON.stringify(q.reward) : null,
        status: q._status,
        completedAt: q.completedAt ? new Date(q.completedAt) : null,
      };
      await prisma.campaignQuest.upsert({
        where: { campaignId_questId: { campaignId, questId: q.id } },
        create: { campaignId, questId: q.id, ...data },
        update: data,
      });
    } catch (err) {
      console.error(`[campaigns] Quest sync failed for ${q.name}:`, err.message);
    }
  }
}

async function reconstructFromNormalized(campaignId, coreState) {
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
      relationships: JSON.parse(n.relationships || '[]'),
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
      try {
        const content = JSON.parse(k.content);
        if (k.entryType === 'event') events.push({ ...content, sceneIndex: k.sceneIndex });
        else decisions.push({ ...content, sceneIndex: k.sceneIndex });
      } catch { /* skip malformed */ }
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
        prerequisiteQuestIds: JSON.parse(q.prerequisiteQuestIds || '[]'),
        objectives: JSON.parse(q.objectives || '[]'),
        reward: q.reward ? JSON.parse(q.reward) : null,
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

async function withRetry(fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.code === 'P2034' || err.code === 'P2028';
      if (!isRetryable || attempt === MAX_RETRIES - 1) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
    }
  }
}

function normalizeRecapCacheKey(rawKey) {
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) return '';
  return key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180);
}

function buildRecapAssetKey(campaignId, cacheKey) {
  return `recap/${campaignId}/${cacheKey}`;
}

function parseRecapMetadata(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildDistinctSceneCountMap(rows) {
  const perCampaign = new Map();
  for (const row of rows) {
    if (!perCampaign.has(row.campaignId)) {
      perCampaign.set(row.campaignId, new Set());
    }
    perCampaign.get(row.campaignId).add(row.sceneIndex);
  }
  return Object.fromEntries(
    Array.from(perCampaign.entries()).map(([campaignId, indices]) => [campaignId, indices.size])
  );
}

const SCENE_CLIENT_SELECT = {
  id: true, campaignId: true, sceneIndex: true,
  narrative: true, chosenAction: true,
  suggestedActions: true, dialogueSegments: true,
  imagePrompt: true, imageUrl: true, soundEffect: true,
  diceRoll: true, stateChanges: true, scenePacing: true,
  createdAt: true,
};

function dedupeScenesByIndexAsc(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const byIndex = new Map();
  for (const scene of rows) {
    const existing = byIndex.get(scene.sceneIndex);
    if (!existing || new Date(scene.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      byIndex.set(scene.sceneIndex, scene);
    }
  }
  return Array.from(byIndex.values()).sort((a, b) => a.sceneIndex - b.sceneIndex);
}

export async function campaignRoutes(fastify) {
  // ── Public routes (no auth) ──────────────────────────────────────────

  fastify.get('/public', async (request) => {
    const { genre, tone, sort = 'newest', q, limit = 50, offset = 0 } = request.query;
    const where = { isPublic: true };
    if (genre) where.genre = genre;
    if (tone) where.tone = tone;
    if (q) where.name = { contains: q, mode: 'insensitive' };

    const orderBy = sort === 'rating'
      ? { rating: 'desc' }
      : sort === 'popular'
        ? { playCount: 'desc' }
        : { createdAt: 'desc' };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        select: {
          id: true, name: true, genre: true, tone: true,
          rating: true, playCount: true,
          coreState: true, characterIds: true, createdAt: true,
          user: { select: { email: true } },
        },
        orderBy,
        take: Math.min(Number(limit) || 50, 100),
        skip: Number(offset) || 0,
      }),
      prisma.campaign.count({ where }),
    ]);

    // Get scene counts for all campaigns in one query
    const campaignIds = campaigns.map((c) => c.id);
    const sceneCounts = await prisma.campaignScene.groupBy({
      by: ['campaignId', 'sceneIndex'],
      where: { campaignId: { in: campaignIds } },
    });
    const sceneCountMap = buildDistinctSceneCountMap(sceneCounts);

    // Bulk-fetch first character per campaign for the gallery card label.
    const firstCharIds = campaigns
      .map((c) => (Array.isArray(c.characterIds) && c.characterIds.length > 0 ? c.characterIds[0] : null))
      .filter(Boolean);
    const firstChars = firstCharIds.length > 0
      ? await prisma.character.findMany({
          where: { id: { in: firstCharIds } },
          select: { id: true, name: true, species: true, characterLevel: true, portraitUrl: true },
        })
      : [];
    const charById = new Map(firstChars.map((c) => [c.id, c]));

    return {
      campaigns: campaigns.map((c) => {
        let parsed = {};
        try { parsed = JSON.parse(c.coreState); } catch { /* empty */ }
        const firstId = Array.isArray(c.characterIds) && c.characterIds.length > 0 ? c.characterIds[0] : null;
        const firstChar = firstId ? charById.get(firstId) : null;
        return {
          id: c.id,
          name: c.name,
          genre: c.genre,
          tone: c.tone,
          rating: c.rating,
          playCount: c.playCount,
          createdAt: c.createdAt,
          author: c.user?.email ? c.user.email.slice(0, 2) + '***' : 'Anonymous',
          sceneCount: sceneCountMap[c.id] || 0,
          worldDescription: parsed.campaign?.worldDescription?.substring(0, 300) || '',
          hook: parsed.campaign?.hook?.substring(0, 200) || '',
          characterName: firstChar?.name || '',
          characterSpecies: firstChar?.species || '',
          characterLevel: firstChar?.characterLevel || 1,
          characterPortraitUrl: firstChar?.portraitUrl || '',
        };
      }),
      total,
    };
  });

  fastify.get('/public/:id', async (request, reply) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, isPublic: true },
      select: {
        id: true, name: true, genre: true, tone: true,
        rating: true, playCount: true,
        coreState: true, characterIds: true, isPublic: true, createdAt: true,
      },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    await withRetry(() =>
      prisma.campaign.update({
        where: { id: campaign.id },
        data: { playCount: { increment: 1 } },
      }),
    );

    let coreState = {};
    try { coreState = JSON.parse(campaign.coreState); } catch { /* corrupted data */ }

    await reconstructFromNormalized(campaign.id, coreState);

    const [scenes, characters] = await Promise.all([
      prisma.campaignScene.findMany({
        where: { campaignId: campaign.id },
        orderBy: { sceneIndex: 'asc' },
        select: SCENE_CLIENT_SELECT,
      }),
      fetchCampaignCharacters(campaign.characterIds || []),
    ]);
    const dedupedScenes = dedupeScenesByIndexAsc(scenes);

    return { ...campaign, coreState, scenes: dedupedScenes, characters };
  });

  fastify.get('/share/:token', async (request, reply) => {
    const campaign = await prisma.campaign.findUnique({
      where: { shareToken: request.params.token },
      select: {
        id: true, name: true, genre: true, tone: true,
        coreState: true, characterIds: true, createdAt: true,
        user: { select: { email: true } },
      },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found or link expired' });

    let coreState = {};
    try { coreState = JSON.parse(campaign.coreState); } catch { /* corrupted data */ }

    await reconstructFromNormalized(campaign.id, coreState);

    if (!coreState.narratorVoiceId && config.elevenlabsDefaultVoiceId) {
      coreState.narratorVoiceId = config.elevenlabsDefaultVoiceId;
    }

    const [scenes, characters] = await Promise.all([
      prisma.campaignScene.findMany({
        where: { campaignId: campaign.id },
        orderBy: { sceneIndex: 'asc' },
        select: SCENE_CLIENT_SELECT,
      }),
      fetchCampaignCharacters(campaign.characterIds || []),
    ]);
    const dedupedScenes = dedupeScenesByIndexAsc(scenes);

    return {
      id: campaign.id,
      name: campaign.name,
      genre: campaign.genre,
      tone: campaign.tone,
      createdAt: campaign.createdAt,
      author: campaign.user?.email ? campaign.user.email.slice(0, 2) + '***' : 'Anonymous',
      coreState,
      scenes: dedupedScenes,
      characters,
    };
  });

  const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1';

  // Public TTS for shared campaigns — no auth required, uses server key
  fastify.post('/share/:token/tts', async (request, reply) => {
    const campaign = await prisma.campaign.findUnique({
      where: { shareToken: request.params.token },
      select: { id: true, userId: true },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    const { voiceId, text, modelId } = request.body || {};
    if (!voiceId || !text) return reply.code(400).send({ error: 'voiceId and text are required' });

    const model = modelId || 'eleven_multilingual_v2';
    const cacheParams = { voiceId, text, modelId: model };
    const cacheKey = generateKey('tts', cacheParams, campaign.id);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      const meta = JSON.parse(existing.metadata);
      return { url, alignment: meta.alignment || null };
    }

    const apiKey = config.apiKeys.elevenlabs;
    if (!apiKey) return reply.code(404).send({ error: 'Audio not cached' });

    const response = await fetch(`${ELEVENLABS_URL}/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      return reply.code(502).send({ error: 'TTS generation failed' });
    }

    const data = await response.json();
    const audioBytes = Buffer.from(data.audio_base64, 'base64');
    await store.put(cacheKey, audioBytes, 'audio/mpeg');
    const url = await store.getUrl(cacheKey);

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: campaign.userId,
        campaignId: campaign.id,
        key: cacheKey,
        type: 'tts',
        contentType: 'audio/mpeg',
        size: audioBytes.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: JSON.stringify({ ...cacheParams, alignment: data.alignment }),
      },
      update: {},
    });

    return { url, alignment: data.alignment || null };
  });

  // ── Authenticated routes (wrapped in a child scope with auth hook) ───

  fastify.register(async function authedCampaignRoutes(app) {
    app.addHook('onRequest', app.authenticate);

    app.get('/', async (request) => {
      const campaigns = await prisma.campaign.findMany({
        where: { userId: request.user.id },
        select: {
          id: true, name: true, genre: true, tone: true,
          characterIds: true, totalCost: true,
          lastSaved: true, createdAt: true,
        },
        orderBy: { lastSaved: 'desc' },
      });

      const campaignIds = campaigns.map((c) => c.id);
      const sceneCounts = await prisma.campaignScene.groupBy({
        by: ['campaignId', 'sceneIndex'],
        where: { campaignId: { in: campaignIds } },
      });
      const sceneCountMap = buildDistinctSceneCountMap(sceneCounts);

      // Bulk-fetch first character per campaign for the lobby card label.
      const allFirstIds = campaigns
        .map((c) => (Array.isArray(c.characterIds) && c.characterIds.length > 0 ? c.characterIds[0] : null))
        .filter(Boolean);
      const firstChars = allFirstIds.length > 0
        ? await prisma.character.findMany({
            where: { id: { in: allFirstIds } },
            select: { id: true, name: true, species: true, characterLevel: true },
          })
        : [];
      const charById = new Map(firstChars.map((c) => [c.id, c]));

      return campaigns.map((c) => {
        const firstId = Array.isArray(c.characterIds) && c.characterIds.length > 0 ? c.characterIds[0] : null;
        const firstChar = firstId ? charById.get(firstId) : null;
        return {
          id: c.id,
          name: c.name,
          genre: c.genre,
          tone: c.tone,
          lastSaved: c.lastSaved,
          createdAt: c.createdAt,
          characterIds: c.characterIds || [],
          characterName: firstChar?.name || '',
          characterSpecies: firstChar?.species || '',
          characterLevel: firstChar?.characterLevel || 1,
          sceneCount: sceneCountMap[c.id] || 0,
          totalCost: c.totalCost || 0,
        };
      });
    });

    app.get('/:id', async (request, reply) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

      let coreState = {};
      try { coreState = JSON.parse(campaign.coreState); } catch { /* corrupted data */ }

      await reconstructFromNormalized(campaign.id, coreState);

      const [scenes, characters] = await Promise.all([
        prisma.campaignScene.findMany({
          where: { campaignId: campaign.id },
          orderBy: { sceneIndex: 'asc' },
          select: SCENE_CLIENT_SELECT,
        }),
        fetchCampaignCharacters(campaign.characterIds || []),
      ]);
      const dedupedScenes = dedupeScenesByIndexAsc(scenes);

      return {
        ...campaign,
        coreState,
        scenes: dedupedScenes,
        characters,
      };
    });

    app.post('/', async (request) => {
      const { name, genre, tone, coreState: rawCoreState, characterIds: rawCharIds } = request.body;
      const parsed = typeof rawCoreState === 'object' ? rawCoreState : JSON.parse(rawCoreState || '{}');

      const { slim, npcs, knowledgeEvents, knowledgeDecisions, quests } =
        stripNormalizedFromCoreState(parsed);

      // Validate characterIds: must be a non-empty array of strings owned by user.
      const characterIds = Array.isArray(rawCharIds) ? rawCharIds.filter((id) => typeof id === 'string' && id) : [];
      if (characterIds.length > 0) {
        const owned = await prisma.character.findMany({
          where: { id: { in: characterIds }, userId: request.user.id },
          select: { id: true },
        });
        const ownedSet = new Set(owned.map((c) => c.id));
        for (const id of characterIds) {
          if (!ownedSet.has(id)) {
            return { error: `Character ${id} not found or not owned by user` };
          }
        }
      }

      const campaign = await prisma.campaign.create({
        data: {
          userId: request.user.id,
          name: name || '',
          genre: genre || '',
          tone: tone || '',
          coreState: JSON.stringify(slim),
          characterIds,
          totalCost: extractTotalCost(slim),
          lastSaved: new Date(),
          shareToken: crypto.randomUUID(),
        },
      });

      await syncNPCsToNormalized(campaign.id, npcs).catch((e) => console.error('[campaigns] NPC sync:', e.message));
      await syncKnowledgeToNormalized(campaign.id, knowledgeEvents, knowledgeDecisions).catch((e) => console.error('[campaigns] Knowledge sync:', e.message));
      await syncQuestsToNormalized(campaign.id, quests).catch((e) => console.error('[campaigns] Quest sync:', e.message));

      const fullState = { ...slim };
      if (npcs.length > 0) { if (!fullState.world) fullState.world = {}; fullState.world.npcs = npcs; }
      if (quests.active?.length || quests.completed?.length) fullState.quests = quests;

      const characters = await fetchCampaignCharacters(characterIds);
      return { ...campaign, coreState: fullState, scenes: [], characters };
    });

    app.put('/:id', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      const { name, genre, tone, coreState: rawCoreState, characterIds: rawCharIds } = request.body;

      // Reject any attempt to write character data through the campaign endpoint.
      if ('character' in (request.body || {}) || 'characterState' in (request.body || {})) {
        return reply.code(400).send({
          error: 'Character data must be saved via /characters endpoints, not /campaigns. Use PATCH /characters/:id/state-changes for AI deltas or PUT /characters/:id for full snapshots.',
        });
      }

      const updateData = { lastSaved: new Date() };

      if (name !== undefined) updateData.name = name;
      if (genre !== undefined) updateData.genre = genre;
      if (tone !== undefined) updateData.tone = tone;

      // Allow updating characterIds (e.g. adding a player on a multiplayer host
      // promotion, or removing a character that left the campaign).
      if (Array.isArray(rawCharIds)) {
        const ids = rawCharIds.filter((id) => typeof id === 'string' && id);
        if (ids.length > 0) {
          const owned = await prisma.character.findMany({
            where: { id: { in: ids }, userId: request.user.id },
            select: { id: true },
          });
          const ownedSet = new Set(owned.map((c) => c.id));
          for (const id of ids) {
            if (!ownedSet.has(id)) {
              return reply.code(400).send({ error: `Character ${id} not found or not owned by user` });
            }
          }
        }
        updateData.characterIds = ids;
      }

      let pendingSync = null;

      if (rawCoreState !== undefined) {
        const parsed = typeof rawCoreState === 'object' ? rawCoreState : JSON.parse(rawCoreState || '{}');
        const { slim, npcs, knowledgeEvents, knowledgeDecisions, quests } =
          stripNormalizedFromCoreState(parsed);

        updateData.coreState = JSON.stringify(slim);
        updateData.totalCost = extractTotalCost(slim);

        pendingSync = { campaignId: request.params.id, npcs, knowledgeEvents, knowledgeDecisions, quests };
      }

      const campaign = await withRetry(() =>
        prisma.campaign.update({
          where: { id: request.params.id },
          data: updateData,
        }),
      );

      if (pendingSync) {
        const { campaignId, npcs, knowledgeEvents, knowledgeDecisions, quests } = pendingSync;
        await syncNPCsToNormalized(campaignId, npcs).catch((e) => console.error('[campaigns] NPC sync:', e.message));
        await syncKnowledgeToNormalized(campaignId, knowledgeEvents, knowledgeDecisions).catch((e) => console.error('[campaigns] Knowledge sync:', e.message));
        await syncQuestsToNormalized(campaignId, quests).catch((e) => console.error('[campaigns] Quest sync:', e.message));
      }

      let parsedCoreState = {};
      try { parsedCoreState = JSON.parse(campaign.coreState); } catch { /* corrupted data */ }
      return { ...campaign, coreState: parsedCoreState };
    });

    app.delete('/:id', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      // Delete normalized collections first
      await Promise.all([
        prisma.campaignScene.deleteMany({ where: { campaignId: request.params.id } }),
        prisma.campaignNPC.deleteMany({ where: { campaignId: request.params.id } }),
        prisma.campaignKnowledge.deleteMany({ where: { campaignId: request.params.id } }),
        prisma.campaignCodex.deleteMany({ where: { campaignId: request.params.id } }),
        prisma.campaignQuest.deleteMany({ where: { campaignId: request.params.id } }),
      ]);
      await prisma.campaign.delete({ where: { id: request.params.id } });
      return { success: true };
    });

    app.post('/:id/share', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      if (existing.shareToken) {
        return { shareToken: existing.shareToken };
      }

      const shareToken = crypto.randomUUID();
      await withRetry(() =>
        prisma.campaign.update({
          where: { id: request.params.id },
          data: { shareToken },
        }),
      );
      return { shareToken };
    });

    app.delete('/:id/share', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      await withRetry(() =>
        prisma.campaign.update({
          where: { id: request.params.id },
          data: { shareToken: null },
        }),
      );
      return { success: true };
    });

    app.patch('/:id/publish', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      const { isPublic } = request.body;
      if (typeof isPublic !== 'boolean') {
        return reply.code(400).send({ error: 'isPublic must be a boolean' });
      }
      const campaign = await withRetry(() =>
        prisma.campaign.update({
          where: { id: request.params.id },
          data: { isPublic },
        }),
      );
      return { id: campaign.id, isPublic: campaign.isPublic };
    });

    app.get('/:id/recaps', async (request, reply) => {
      const key = normalizeRecapCacheKey(request.query?.key);
      if (!key) return reply.code(400).send({ error: 'key is required' });

      const campaign = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
        select: { id: true },
      });
      if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

      const assetKey = buildRecapAssetKey(campaign.id, key);
      const existing = await prisma.mediaAsset.findUnique({
        where: { key: assetKey },
        select: { metadata: true, createdAt: true },
      });
      if (!existing) return { found: false };

      const metadata = parseRecapMetadata(existing.metadata);
      const recap = typeof metadata.recap === 'string' ? metadata.recap.trim() : '';
      if (!recap) return { found: false };

      return {
        found: true,
        recap,
        cachedAt: existing.createdAt,
        meta: metadata.meta && typeof metadata.meta === 'object' ? metadata.meta : {},
      };
    });

    app.post('/:id/recaps', async (request, reply) => {
      const key = normalizeRecapCacheKey(request.body?.key);
      const recap = typeof request.body?.recap === 'string' ? request.body.recap.trim() : '';
      const meta = request.body?.meta && typeof request.body.meta === 'object' ? request.body.meta : {};

      if (!key) return reply.code(400).send({ error: 'key is required' });
      if (!recap) return reply.code(400).send({ error: 'recap is required' });

      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
        select: { id: true, userId: true },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      const assetKey = buildRecapAssetKey(existing.id, key);
      const metadata = JSON.stringify({
        recap,
        meta,
        cachedAt: new Date().toISOString(),
      });

      await withRetry(() =>
        prisma.mediaAsset.upsert({
          where: { key: assetKey },
          create: {
            userId: existing.userId,
            campaignId: existing.id,
            key: assetKey,
            type: 'recap',
            contentType: 'application/json',
            size: Buffer.byteLength(recap, 'utf8'),
            backend: 'db',
            path: assetKey,
            metadata,
          },
          update: {
            size: Buffer.byteLength(recap, 'utf8'),
            metadata,
            lastAccessedAt: new Date(),
          },
        }),
      );

      const oldEntries = await prisma.mediaAsset.findMany({
        where: {
          userId: existing.userId,
          campaignId: existing.id,
          type: 'recap',
        },
        orderBy: { createdAt: 'desc' },
        skip: SUMMARY_CACHE_MAX_ITEMS,
        select: { id: true },
      });

      if (oldEntries.length > 0) {
        await prisma.mediaAsset.deleteMany({
          where: { id: { in: oldEntries.map((entry) => entry.id) } },
        });
      }

      return { ok: true };
    });
  });
}
