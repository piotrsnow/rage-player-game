import { prisma } from '../lib/prisma.js';
import { applyCharacterStateChanges } from '../services/characterMutations.js';
import {
  loadCharacterSnapshot,
  persistCharacterSnapshot,
  createCharacterWithRelations,
} from '../services/characterRelations.js';

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
    needs: body.needs || { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
    backstory: body.backstory || '',
    customAttackPresets: Array.isArray(body.customAttackPresets) ? body.customAttackPresets : [],
    portraitUrl: body.portraitUrl || '',
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
    'backstory', 'portraitUrl', 'voiceId', 'voiceName',
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
    return characters.map((c) => ({
      ...c,
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

  fastify.get('/:id', async (request, reply) => {
    const snapshot = await loadCharacterSnapshot({ id: request.params.id, userId: request.user.id });
    if (!snapshot) return reply.code(404).send({ error: 'Character not found' });
    return snapshot;
  });

  fastify.post('/', { schema: { body: CHARACTER_BODY_SCHEMA } }, async (request) => {
    return createCharacterWithRelations(request.user.id, snapshotFromBody(request.body || {}));
  });

  fastify.put('/:id', { schema: { body: CHARACTER_BODY_SCHEMA } }, async (request, reply) => {
    const existing = await loadCharacterSnapshot({ id: request.params.id, userId: request.user.id });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });
    const merged = mergeUpdateBody(existing, request.body || {});
    return persistCharacterSnapshot(request.params.id, merged);
  });

  /**
   * PATCH /:id/state-changes — apply an AI/manual state-change delta atomically.
   * Returns the updated character snapshot.
   */
  fastify.patch('/:id/state-changes', { schema: { body: STATE_CHANGES_SCHEMA } }, async (request, reply) => {
    const existing = await loadCharacterSnapshot({ id: request.params.id, userId: request.user.id });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    const mutated = applyCharacterStateChanges(existing, request.body || {});
    return persistCharacterSnapshot(request.params.id, mutated);
  });

  fastify.delete('/:id', async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    await prisma.character.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}
