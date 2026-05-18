import { prisma } from '../lib/prisma.js';
import { applyCharacterStateChanges } from '../services/characterMutations.js';
import {
  loadCharacterSnapshot,
  persistCharacterSnapshot,
  createCharacterWithRelations,
} from '../services/characterRelations.js';
import { toCanonicalStoragePath } from '../services/urlCanonical.js';
import { callAIJson, parseJsonOrNull } from '../services/aiJsonCall.js';
import { loadUserApiKeys } from '../services/apiKeyService.js';
import { SCENE_CLIENT_SELECT, normalizeSceneAssetUrls } from '../services/campaignSerialize.js';
import { resolveBadgeImageProviderForUser } from '../services/badgeImageGen.js';
import { generateBadge, regenerateBadgeImage } from '../services/badgeGenerator.js';
import { ensureCharacterSprite } from '../services/characterSpriteService.js';
import {
  generateItemAttackModes,
  generateSpellCombatStats,
  inferDeterministicItemAttackModes,
} from '../services/itemAttackModesGenerator.js';

function cumulativeCharXpThreshold(targetLevel) {
  if (targetLevel <= 1) return 0;
  let sum = 0;
  for (let k = 2; k <= targetLevel; k++) sum += 5 * k * k;
  return sum;
}

async function aggregateDiceStats(prisma, campaignIds) {
  const empty = { totalRolls: 0, successes: 0, failures: 0, critSuccesses: 0, critFailures: 0, avgRoll: 0, bestSkill: null, worstSkill: null };
  if (!campaignIds.length) return empty;

  const allScenes = await prisma.campaignScene.findMany({
    where: { campaignId: { in: campaignIds }, diceRoll: { not: null } },
    select: { diceRoll: true },
  });

  const rolls = allScenes.flatMap((s) => {
    const d = s.diceRoll;
    return Array.isArray(d) ? d : d ? [d] : [];
  }).filter((r) => typeof r.roll === 'number');

  if (rolls.length === 0) return empty;

  let successes = 0;
  let failures = 0;
  let critSuccesses = 0;
  let critFailures = 0;
  let rollSum = 0;
  const skillSuccessMap = {};
  const skillTotalMap = {};

  for (const r of rolls) {
    rollSum += r.roll;
    if (r.success) successes++;
    else failures++;
    if (r.roll === 1) critSuccesses++;
    if (r.roll === 50) critFailures++;
    const sk = r.skill || 'unknown';
    skillTotalMap[sk] = (skillTotalMap[sk] || 0) + 1;
    if (r.success) skillSuccessMap[sk] = (skillSuccessMap[sk] || 0) + 1;
  }

  let bestSkill = null;
  let worstSkill = null;
  let bestRate = -1;
  let worstRate = 2;
  for (const [sk, total] of Object.entries(skillTotalMap)) {
    if (total < 2 || sk === 'unknown') continue;
    const rate = (skillSuccessMap[sk] || 0) / total;
    if (rate > bestRate) { bestRate = rate; bestSkill = sk; }
    if (rate < worstRate) { worstRate = rate; worstSkill = sk; }
  }

  return {
    totalRolls: rolls.length,
    successes,
    failures,
    critSuccesses,
    critFailures,
    avgRoll: Math.round((rollSum / rolls.length) * 10) / 10,
    bestSkill,
    worstSkill,
  };
}

function normalizeCharacterAge(age) {
  const parsed = Number(age);
  if (!Number.isFinite(parsed)) return 23;
  return Math.max(1, Math.round(parsed));
}

/**
 * Build the FE-shape snapshot bundle for create/update. The route accepts
 * the same body shape it always has — `{skills: {...}, inventory: [...],
 * equipped: {...}, materialBag: [...]}` — and createCharacterWithRelations
 * / persistCharacterSnapshot fan it out across the F4 child tables.
 */
function snapshotFromBody(body) {
  return {
    name: body.name || 'Adventurer',
    age: normalizeCharacterAge(body.age),
    gender: body.gender || '',
    species: body.species || 'Human',
    attributes: body.attributes || {
      sila: 10, inteligencja: 10, charyzma: 10, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5,
    },
    skills: body.skills || {},
    wounds: body.wounds ?? 0,
    maxWounds: body.maxWounds ?? 0,
    movement: body.movement ?? 4,
    characterLevel: body.characterLevel ?? 1,
    characterXp: body.characterXp ?? 0,
    attributePoints: body.attributePoints ?? 0,
    mana: body.mana || { current: 0, max: 0 },
    spells: body.spells || { known: [], usageCounts: {}, scrolls: [] },
    inventory: body.inventory || [],
    materialBag: body.materialBag || [],
    money: body.money || { gold: 0, silver: 0, copper: 0 },
    equipped: body.equipped || { mainHand: null, offHand: null, armour: null },
    statuses: body.statuses || [],
    needs: body.needs || { hunger: 100, thirst: 100, bladder: 100, rest: 100 },
    backstory: body.backstory || '',
    customAttackPresets: Array.isArray(body.customAttackPresets) ? body.customAttackPresets : [],
    portraitUrl: body.portraitUrl || '',
    spriteUrl: body.spriteUrl ?? '',
    voiceId: body.voiceId || '',
    voiceName: body.voiceName || '',
    campaignCount: body.campaignCount ?? 0,
    status: body.status ?? null,
    lockedCampaignId: body.lockedCampaignId ?? null,
    lockedCampaignName: body.lockedCampaignName ?? null,
    lockedLocation: body.lockedLocation ?? null,
  };
}

/**
 * Selective PUT update — merge body deltas onto the existing snapshot so
 * only relations the caller actually touched get rewritten.
 */
function mergeUpdateBody(existingSnapshot, body) {
  const merged = { ...existingSnapshot };
  const passthrough = [
    'name', 'gender', 'species',
    'wounds', 'maxWounds', 'movement',
    'characterLevel', 'characterXp', 'attributePoints',
    'backstory', 'portraitUrl', 'spriteUrl', 'voiceId', 'voiceName',
    'campaignCount', 'fame', 'infamy', 'status',
    'lockedCampaignId', 'lockedCampaignName', 'lockedLocation',
    'attributes', 'mana', 'spells', 'money', 'statuses', 'needs',
    'customAttackPresets', 'knownTitles', 'activeDungeonState',
    'skills', 'inventory', 'materialBag', 'equipped',
  ];
  for (const key of passthrough) {
    if (body[key] !== undefined) merged[key] = body[key];
  }
  if (body.age !== undefined) merged.age = normalizeCharacterAge(body.age);
  return merged;
}

const CHARACTER_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 200 },
    age: { type: ['number', 'string'] },
    gender: { type: 'string', maxLength: 40 },
    species: { type: 'string', maxLength: 100 },
    attributes: { type: 'object' },
    skills: { type: 'object' },
    wounds: { type: 'number' },
    maxWounds: { type: 'number' },
    movement: { type: 'number' },
    characterLevel: { type: 'number' },
    characterXp: { type: 'number' },
    attributePoints: { type: 'number' },
    mana: { type: 'object' },
    spells: { type: 'object' },
    inventory: { type: 'array', maxItems: 500 },
    materialBag: { type: 'array', maxItems: 500 },
    money: { type: 'object' },
    equipped: { type: 'object' },
    statuses: { type: 'array', maxItems: 100 },
    needs: { type: 'object' },
    backstory: { type: 'string', maxLength: 10000 },
    customAttackPresets: { type: 'array', maxItems: 50 },
    portraitUrl: { type: 'string', maxLength: 2000 },
    spriteUrl: { type: 'string', maxLength: 2000 },
    voiceId: { type: 'string', maxLength: 200 },
    voiceName: { type: 'string', maxLength: 200 },
    campaignCount: { type: 'number' },
    fame: { type: 'number' },
    infamy: { type: 'number' },
    status: { type: ['string', 'null'], maxLength: 50 },
    lockedCampaignId: { type: ['string', 'null'], maxLength: 100 },
    lockedCampaignName: { type: ['string', 'null'], maxLength: 200 },
    lockedLocation: { type: ['string', 'null'], maxLength: 200 },
  },
};

/** Rejects legacy Mongo ObjectIds (24 hex) before Prisma touches `@db.Uuid`. */
const CHARACTER_ID_PARAMS = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

const CHARACTER_FAVORITE_DELETE_PARAMS = {
  type: 'object',
  required: ['id', 'sceneId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    sceneId: { type: 'string', format: 'uuid' },
  },
};

const STATE_CHANGES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    woundsChange: { type: 'number' },
    xp: { type: 'number' },
    manaChange: { type: 'number' },
    manaMaxChange: { type: 'number' },
    attributeChanges: { type: 'object' },
    skillProgress: { type: 'object' },
    spellUsage: { type: 'object' },
    learnSpell: { type: ['string', 'object', 'null'] },
    learnSpellIcon: { type: ['string', 'null'], maxLength: 80 },
    consumeScroll: { type: ['string', 'object', 'null'] },
    addScroll: { type: ['string', 'object', 'null'] },
    newItems: { type: 'array', maxItems: 100 },
    newMaterials: { type: 'array', maxItems: 100 },
    removeItems: { type: 'array', maxItems: 100 },
    removeItemsByName: { type: 'array', maxItems: 100 },
    moneyChange: { type: 'object' },
    statuses: { type: ['array', 'object'] },
    needsChanges: { type: 'object' },
    equipChange: { type: 'object' },
    forceStatus: { type: 'string', maxLength: 100 },
  },
};

/**
 * Clear `lockedCampaignId`/`lockedCampaignName`/`lockedLocation` on any
 * character whose lock points at a campaign that no longer exists.
 *
 * `DELETE /v1/campaigns/:id` already unlocks in the same tx, but legacy
 * rows (pre-fix) or any non-route deletion path (Prisma Studio, manual
 * SQL, future MP lobby bugs) can strand a character with a dead lock —
 * the FE picker then grays it out forever. Scrubbing on read is cheap
 * and idempotent: one extra `findMany` per GET, and only writes when
 * there's actually something to fix.
 *
 * Mutates `characters` in place so callers don't have to re-query.
 */
async function scrubOrphanedLocks(userId, characters) {
  const lockedIds = new Set();
  for (const c of characters) {
    if (c.lockedCampaignId) lockedIds.add(c.lockedCampaignId);
  }
  if (lockedIds.size === 0) return;

  const allIds = Array.from(lockedIds);
  // Check both Campaign records and active MultiplayerSessions (guest lock
  // writes roomCode as the lockedCampaignId — see handleJoinRoom).
  const [liveCampaigns, liveSessions] = await Promise.all([
    prisma.campaign.findMany({
      where: { id: { in: allIds } },
      select: { id: true },
    }),
    prisma.multiplayerSession.findMany({
      where: { roomCode: { in: allIds } },
      select: { roomCode: true },
    }),
  ]);
  const liveIds = new Set([
    ...liveCampaigns.map((c) => c.id),
    ...liveSessions.map((s) => s.roomCode),
  ]);
  const orphanedIds = allIds.filter((id) => !liveIds.has(id));
  if (orphanedIds.length === 0) return;

  await prisma.character.updateMany({
    where: { userId, lockedCampaignId: { in: orphanedIds } },
    data: { lockedCampaignId: null, lockedCampaignName: null, lockedLocation: null },
  });
  for (const c of characters) {
    if (c.lockedCampaignId && orphanedIds.includes(c.lockedCampaignId)) {
      c.lockedCampaignId = null;
      c.lockedCampaignName = null;
      c.lockedLocation = null;
    }
  }
}

export async function characterRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request) => {
    // List view doesn't need relations — character library cards only use
    // scalar fields. Loading inventory/skills for every entry would be a
    // noticeable hit once the library has a couple dozen characters.
    const characters = await prisma.character.findMany({
      where: { userId: request.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    await scrubOrphanedLocks(request.user.id, characters);
    return characters.map((c) => ({
      ...c,
      // Legacy records may hold hydrated URLs (host + `?token=`); strip back
      // to canonical so the FE card picker renders with a fresh token.
      portraitUrl: c.portraitUrl ? toCanonicalStoragePath(c.portraitUrl) : c.portraitUrl,
      spriteUrl: c.spriteUrl ? toCanonicalStoragePath(c.spriteUrl) : c.spriteUrl,
      // Stub the FE-shape collections so list cards that read e.g.
      // `char.equipped.mainHand` don't trip on undefined.
      skills: {},
      inventory: [],
      materialBag: [],
      equipped: {
        mainHand: c.equippedMainHand ?? null,
        offHand: c.equippedOffHand ?? null,
        armour: c.equippedArmour ?? null,
      },
    }));
  });

  fastify.get('/:id', { schema: { params: CHARACTER_ID_PARAMS } }, async (request, reply) => {
    const snapshot = await loadCharacterSnapshot({ id: request.params.id, userId: request.user.id });
    if (!snapshot) return reply.code(404).send({ error: 'Character not found' });
    await scrubOrphanedLocks(request.user.id, [snapshot]);
    return snapshot;
  });

  fastify.post('/', { schema: { body: CHARACTER_BODY_SCHEMA } }, async (request) => {
    return createCharacterWithRelations(request.user.id, snapshotFromBody(request.body || {}));
  });

  fastify.put('/:id', { schema: { params: CHARACTER_ID_PARAMS, body: CHARACTER_BODY_SCHEMA } }, async (request, reply) => {
    const existing = await loadCharacterSnapshot({ id: request.params.id, userId: request.user.id });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });
    const merged = mergeUpdateBody(existing, request.body || {});
    return persistCharacterSnapshot(request.params.id, merged);
  });

  /**
   * PATCH /:id/state-changes — apply an AI/manual state-change delta atomically.
   * Returns the updated character snapshot.
   */
  fastify.patch('/:id/state-changes', { schema: { params: CHARACTER_ID_PARAMS, body: STATE_CHANGES_SCHEMA } }, async (request, reply) => {
    const existing = await loadCharacterSnapshot({ id: request.params.id, userId: request.user.id });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    const mutated = applyCharacterStateChanges(existing, request.body || {});
    return persistCharacterSnapshot(request.params.id, mutated);
  });

  fastify.delete('/:id', { schema: { params: CHARACTER_ID_PARAMS } }, async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    await prisma.character.delete({ where: { id: request.params.id } });
    return { success: true };
  });

  fastify.get('/:id/skill-gains', {
    schema: {
      params: CHARACTER_ID_PARAMS,
      querystring: {
        type: 'object',
        properties: {
          skillName: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const where = { characterId: character.id };
    if (request.query.skillName) where.skillName = request.query.skillName;

    const [gains, total] = await Promise.all([
      prisma.characterSkillGain.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: request.query.limit,
        skip: request.query.offset,
        select: {
          id: true,
          skillName: true,
          xpGained: true,
          oldLevel: true,
          newLevel: true,
          playerAction: true,
          narrative: true,
          diceRollInfo: true,
          sceneIndex: true,
          campaignId: true,
          createdAt: true,
        },
      }),
      prisma.characterSkillGain.count({ where }),
    ]);

    return { gains, total };
  });

  // ── Favorite scenes ────────────────────────────────────────────────────
  // Heart toggle in the gameplay UI bookmarks scenes for a character. The
  // list is surfaced in the character panel alongside skill gain history.

  fastify.get('/:id/favorite-scenes', {
    schema: {
      params: CHARACTER_ID_PARAMS,
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const rows = await prisma.favoriteScene.findMany({
      where: { characterId: character.id },
      orderBy: { createdAt: 'desc' },
      take: request.query.limit,
      skip: request.query.offset,
      select: {
        id: true,
        sceneId: true,
        campaignId: true,
        createdAt: true,
        scene: {
          select: {
            sceneIndex: true,
            narrative: true,
            chosenAction: true,
            imageUrl: true,
            scenePacing: true,
            createdAt: true,
          },
        },
        campaign: { select: { name: true } },
      },
    });

    const favorites = rows.map((row) => {
      const scene = row.scene ? normalizeSceneAssetUrls(row.scene) : null;
      return {
        id: row.id,
        sceneId: row.sceneId,
        campaignId: row.campaignId,
        campaignName: row.campaign?.name || '',
        createdAt: row.createdAt,
        sceneIndex: scene?.sceneIndex ?? null,
        narrative: scene?.narrative || '',
        chosenAction: scene?.chosenAction || null,
        imageUrl: scene?.imageUrl || null,
        scenePacing: scene?.scenePacing || null,
        sceneCreatedAt: scene?.createdAt || null,
      };
    });

    return { favorites };
  });

  fastify.post('/:id/favorite-scenes', {
    schema: {
      params: CHARACTER_ID_PARAMS,
      body: {
        type: 'object',
        required: ['sceneId', 'campaignId'],
        additionalProperties: false,
        properties: {
          sceneId: { type: 'string', format: 'uuid' },
          campaignId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const { sceneId, campaignId } = request.body;
    const scene = await prisma.campaignScene.findFirst({
      where: { id: sceneId, campaignId },
      select: { id: true, campaignId: true },
    });
    if (!scene) return reply.code(404).send({ error: 'Scene not found' });

    const favorite = await prisma.favoriteScene.upsert({
      where: { characterId_sceneId: { characterId: character.id, sceneId } },
      create: { characterId: character.id, sceneId, campaignId },
      update: {},
      select: { id: true, sceneId: true, campaignId: true, createdAt: true },
    });
    return reply.code(201).send(favorite);
  });

  fastify.delete('/:id/favorite-scenes/:sceneId', { schema: { params: CHARACTER_FAVORITE_DELETE_PARAMS } }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const result = await prisma.favoriteScene.deleteMany({
      where: { characterId: character.id, sceneId: request.params.sceneId },
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Favorite not found' });
    return reply.code(204).send();
  });

  fastify.post('/:id/badge', { schema: { params: CHARACTER_ID_PARAMS } }, async (request, reply) => {
    const force = request.body?.force === true;
    const char = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!char) return reply.code(404).send({ error: 'Character not found' });

    const campaigns = await prisma.campaignParticipant.findMany({
      where: { characterId: char.id },
      select: { campaignId: true },
    });
    const campaignIds = campaigns.map((c) => c.campaignId);

    const diceStats = await aggregateDiceStats(prisma, campaignIds);

    if (!force && char.badgeSummary && char.badgeUpdatedAt) {
      return {
        summary: char.badgeSummary,
        legend: char.badgeLegend,
        snark: char.badgeSnark,
        updatedAt: char.badgeUpdatedAt,
        diceStats,
        cached: true,
      };
    }

    const sceneFrom = typeof request.body?.sceneFrom === 'number' ? request.body.sceneFrom : null;
    const sceneTo = typeof request.body?.sceneTo === 'number' ? request.body.sceneTo : null;
    const hasRange = sceneFrom != null && sceneTo != null;

    let scenes = [];
    if (campaignIds.length > 0) {
      const where = { campaignId: { in: campaignIds } };
      if (hasRange) {
        where.sceneIndex = { gte: sceneFrom, lte: sceneTo };
      }
      scenes = await prisma.campaignScene.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...(hasRange ? {} : { take: 10 }),
        select: SCENE_CLIENT_SELECT,
      });
    }

    const sceneTexts = scenes
      .slice(0, hasRange ? scenes.length : 5)
      .map((s, i) => `Scene ${s.sceneIndex ?? i + 1}: ${(s.narrative || '').slice(0, 300)}`)
      .join('\n');

    const attrs = typeof char.attributes === 'object' ? char.attributes : {};
    const charContext = [
      `Name: ${char.name}`,
      `Species: ${char.species}`,
      `Level: ${char.characterLevel}`,
      `Backstory: ${(char.backstory || '').slice(0, 300)}`,
      `Attributes: ${JSON.stringify(attrs)}`,
    ].join('\n');

    const language = request.body?.language || 'pl';
    const provider = request.body?.provider || 'openai';
    const irritationLevel = Math.min(Math.max(parseInt(request.body?.irritationLevel, 10) || 0, 0), 10);

    let userApiKeys = null;
    try { userApiKeys = await loadUserApiKeys(prisma, request.user.id); } catch {}

    const isPolish = language === 'pl';

    const IRRITATION_TIERS = [
      '', // 0 — neutral (first auto-load)
      isPolish
        ? 'Gracz właśnie kliknął PONOWNIE żądając nowej odznaki. Jesteś lekko zniecierpliwiony. W "legend" dodaj subtelną nutę poirytowania wobec gracza (nie postaci). W "snark" wpleć uwagę, że gracz nie może się zdecydować.'
        : 'The player just clicked AGAIN demanding a new badge. You are slightly annoyed. In "legend" add a subtle note of irritation toward the player (not the character). In "snark" weave in a remark about the player being indecisive.',
      isPolish
        ? 'Gracz klika TRZECI RAZ. Jesteś wyraźnie poirytowany. "legend" powinna być sarkastyczna wobec gracza, który ciągle klika. "snark" powinien głównie dotyczyć obsesji gracza na punkcie klikania.'
        : 'The player clicked a THIRD TIME. You are clearly irritated. "legend" should be sarcastic about the player who keeps clicking. "snark" should mostly address the player\'s clicking obsession.',
      isPolish
        ? 'CZWARTY RAZ. Jesteś wkurzony. Zarówno "legend" jak i "snark" to atak na gracza — pytaj retorycznie czemu ciągle klika, sugeruj, że ma problem, wyśmiewaj desperacką potrzebę uwagi.'
        : 'FOURTH TIME. You are angry. Both "legend" and "snark" are attacks on the player — ask rhetorically why they keep clicking, suggest they have a problem, mock their desperate need for attention.',
      isPolish
        ? 'Gracz kliknął PIĄTY RAZ LUB WIĘCEJ. Jesteś WŚCIEKŁY. Krzycz wielkimi literami. "legend" i "snark" to czysta furia — groź że odmówisz współpracy, że narrator odchodzi na emeryturę, wyolbrzymiaj cierpienie narratora zmuszanego do pracy.'
        : 'The player clicked FIVE OR MORE TIMES. You are FURIOUS. Shout in CAPS. Both "legend" and "snark" are pure rage — threaten to quit, say the narrator is retiring, exaggerate the narrator\'s suffering from being forced to work.',
    ];
    const irritationInstruction = IRRITATION_TIERS[Math.min(irritationLevel, IRRITATION_TIERS.length - 1)];

    const systemPrompt = `You are a fantasy RPG narrator. Generate a player badge card for the character described below.
Return JSON with exactly three fields, all written in ${isPolish ? 'Polish' : 'English'}:
- "legend": ONE epic, reverent, hero-chronicle line. HARD LIMIT: maximum 30 words. Make every word count. Grounded in attributes / level / backstory. Poetic, evocative, worthy of a chronicle.
- "snark": A SHARP, mocking, tongue-in-cheek roast of this character's exploits and choices — Pratchett-style tavern shame. 3 to 5 short sentences. Be cutting but witty. Lean into pathetic attributes, stupid decisions, embarrassing scenes. If the character is heroic, mock their pretensions instead. NEVER kind, NEVER neutral.
- "summary": An array of exactly 5 strings, each a one-sentence summary of a recent scene/event. If fewer scenes are available, invent plausible ones fitting the character's backstory.${irritationInstruction ? `\n\nIMPORTANT TONE OVERRIDE (click #${irritationLevel}):\n${irritationInstruction}` : ''}`;

    const userPrompt = `CHARACTER:\n${charContext}\n\nRECENT SCENES:\n${sceneTexts || 'No scenes yet — invent brief backstory events.'}`;

    try {
      const { text } = await callAIJson({
        provider,
        modelTier: 'nano',
        taskCategory: 'characterBadge',
        systemPrompt,
        userPrompt,
        maxTokens: 1000,
        temperature: Math.min(0.9 + irritationLevel * 0.02, 1.2),
        userApiKeys,
        taskType: 'character-badge',
        taskLabel: 'Character badge generation',
      });

      const parsed = parseJsonOrNull(text);
      const legend = (parsed?.legend || '').trim();
      const snark = (parsed?.snark || '').trim();
      const summary = JSON.stringify(Array.isArray(parsed?.summary) ? parsed.summary : []);
      const now = new Date();

      await prisma.character.update({
        where: { id: char.id },
        data: {
          badgeSummary: summary,
          badgeLegend: legend,
          badgeSnark: snark,
          badgeUpdatedAt: now,
        },
      });

      return { summary, legend, snark, updatedAt: now, diceStats, cached: false };
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  // ── Badge collection ────────────────────────────────────────────────

  const BADGE_ID_PARAMS = {
    type: 'object',
    required: ['id', 'badgeId'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      badgeId: { type: 'string', format: 'uuid' },
    },
  };

  fastify.get('/:id/badges', { schema: { params: CHARACTER_ID_PARAMS } }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const badges = await prisma.characterBadge.findMany({
      where: { characterId: character.id },
      orderBy: { earnedAt: 'desc' },
    });
    return { badges };
  });

  fastify.post('/:id/badges/generate', {
    schema: {
      params: CHARACTER_ID_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          campaignId: { type: 'string', format: 'uuid' },
          sceneFrom: { type: 'integer', minimum: 0 },
          sceneTo: { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    let userApiKeys = null;
    try { userApiKeys = await loadUserApiKeys(prisma, request.user.id); } catch {}

    const badgeOwner = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { settings: true },
    });
    const imageProvider = resolveBadgeImageProviderForUser(
      badgeOwner?.settings,
      userApiKeys || '{}',
    );

    try {
      const badge = await generateBadge({
        characterId: character.id,
        userId: request.user.id,
        campaignId: request.body?.campaignId || null,
        sceneFrom: request.body?.sceneFrom ?? null,
        sceneTo: request.body?.sceneTo ?? null,
        userApiKeys,
        imageProvider,
      });
      return reply.code(201).send(badge);
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  fastify.post('/:id/badges/:badgeId/claim', { schema: { params: BADGE_ID_PARAMS } }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true, characterXp: true, characterLevel: true, attributePoints: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const badge = await prisma.characterBadge.findFirst({
      where: { id: request.params.badgeId, characterId: character.id },
    });
    if (!badge) return reply.code(404).send({ error: 'Badge not found' });
    if (badge.xpAwarded != null) return reply.code(409).send({ error: 'Badge already claimed' });

    const level = character.characterLevel || 1;
    const levelCost = 5 * (level + 1) * (level + 1);
    const maxReward = Math.max(1, Math.floor(levelCost / 2));
    const reward = Math.floor(Math.random() * (maxReward + 1));

    let charXp = (character.characterXp || 0) + reward;
    let charLevel = level;
    let attrPoints = character.attributePoints || 0;
    while (charXp >= cumulativeCharXpThreshold(charLevel + 1)) {
      charLevel++;
      attrPoints++;
    }

    await prisma.$transaction([
      prisma.characterBadge.update({
        where: { id: badge.id },
        data: { xpAwarded: reward },
      }),
      prisma.character.update({
        where: { id: character.id },
        data: { characterXp: charXp, characterLevel: charLevel, attributePoints: attrPoints },
      }),
    ]);

    return {
      xpAwarded: reward,
      newCharacterXp: charXp,
      newCharacterLevel: charLevel,
      leveledUp: charLevel > level,
    };
  });

  fastify.delete('/:id/badges/:badgeId', { schema: { params: BADGE_ID_PARAMS } }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const result = await prisma.characterBadge.deleteMany({
      where: { id: request.params.badgeId, characterId: character.id },
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Badge not found' });
    return reply.code(204).send();
  });

  fastify.post('/:id/badges/:badgeId/regenerate-image', {
    schema: {
      params: BADGE_ID_PARAMS,
      body: {
        type: 'object',
        properties: { imageUrl: { type: 'string', maxLength: 2000 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const badge = await prisma.characterBadge.findFirst({
      where: { id: request.params.badgeId, characterId: character.id },
    });
    if (!badge) return reply.code(404).send({ error: 'Badge not found' });

    const clientUrl = request.body?.imageUrl;
    if (clientUrl) {
      await prisma.characterBadge.update({
        where: { id: badge.id },
        data: { imageUrl: clientUrl },
      });
      return { ...badge, imageUrl: clientUrl };
    }

    try {
      const updated = await regenerateBadgeImage(badge.id, request.user.id);
      return updated;
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // ── Item attack modes backfill ───────────────────────────────────────
  fastify.post('/:id/items/:itemKey/attack-modes', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'itemKey'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          itemKey: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
      body: {
        type: 'object',
        properties: { force: { type: 'boolean', default: false } },
        additionalProperties: false,
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const force = request.body?.force === true;
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const itemRow = await prisma.characterInventoryItem.findUnique({
      where: { characterId_itemKey: { characterId: character.id, itemKey: request.params.itemKey } },
    });
    if (!itemRow) return reply.code(404).send({ error: 'Item not found' });

    const props = (typeof itemRow.props === 'object' && itemRow.props) || {};

    if (!force) {
      const deterministic = inferDeterministicItemAttackModes({ ...itemRow, props });
      if (deterministic.resolved) {
        const attackModes = deterministic.attackModes ?? null;
        const cached = props.attackModes ?? null;
        if (JSON.stringify(cached) !== JSON.stringify(attackModes)) {
          await prisma.characterInventoryItem.updateMany({
            where: { characterId: character.id, itemKey: request.params.itemKey },
            data: { props: { ...props, attackModes } },
          });
        }
        return { attackModes, explanation: props.attackModesExplanation || null };
      }
    }

    let userApiKeys = null;
    try { userApiKeys = await loadUserApiKeys(prisma, request.user.id); } catch {}

    const { attackModes, explanation } = await generateItemAttackModes(
      { ...itemRow, props },
      { userApiKeys, userId: request.user.id, force },
    );

    const updatedProps = {
      ...props,
      attackModes: attackModes ?? null,
      attackModesExplanation: explanation || null,
    };
    await prisma.characterInventoryItem.updateMany({
      where: { characterId: character.id, itemKey: request.params.itemKey },
      data: { props: updatedProps },
    });

    return { attackModes: attackModes ?? null, explanation: explanation || null };
  });

  // ── Spell combat stats backfill ──────────────────────────────────────
  fastify.post('/:id/spells/:spellName/combat-stats', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'spellName'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          spellName: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
      body: {
        type: 'object',
        properties: { force: { type: 'boolean', default: false } },
        additionalProperties: false,
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const force = request.body?.force === true;
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    const spellName = decodeURIComponent(request.params.spellName);
    const row = await prisma.customSpell.findUnique({ where: { name: spellName } });
    if (!row) return reply.code(404).send({ error: 'Custom spell not found' });

    if (!force && row.combatStats) {
      return {
        combatStats: row.combatStats,
        explanation: row.combatStats?.explanation || null,
      };
    }

    let userApiKeys = null;
    try { userApiKeys = await loadUserApiKeys(prisma, request.user.id); } catch {}

    const { combatStats, explanation } = await generateSpellCombatStats(
      row, { userApiKeys, userId: request.user.id },
    );

    if (combatStats) {
      const withExplanation = { ...combatStats, explanation: explanation || null };
      await prisma.customSpell.update({
        where: { id: row.id },
        data: { combatStats: withExplanation },
      });
    }

    return { combatStats: combatStats ?? null, explanation: explanation || null };
  });

  // ── Sprite sheet generation ────────────────────────────────────────
  fastify.post('/:id/sprite', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: { type: 'object', properties: { force: { type: 'boolean', default: false } }, additionalProperties: false },
    },
  }, async (request, reply) => {
    const char = await prisma.character.findUnique({
      where: { id: request.params.id },
      select: { id: true, userId: true },
    });
    if (!char || char.userId !== request.user.id) {
      return reply.code(404).send({ error: 'Character not found' });
    }

    const result = await ensureCharacterSprite({
      kind: 'character',
      id: char.id,
      userId: request.user.id,
      force: !!request.body?.force,
    });

    return {
      spriteSheetUrl: result?.spriteSheetUrl || null,
      chargenAppearance: result?.chargenAppearance || null,
    };
  });
}
