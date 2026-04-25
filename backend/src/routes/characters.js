import { prisma } from '../lib/prisma.js';
import {
  applyCharacterStateChanges,
  characterToPrismaUpdate,
  deserializeCharacterRow,
} from '../services/characterMutations.js';

function normalizeCharacterAge(age) {
  const parsed = Number(age);
  if (!Number.isFinite(parsed)) return 23;
  return Math.max(1, Math.round(parsed));
}

/**
 * Build a Prisma create payload from a request body. Json columns get
 * pass-through values (Prisma serializes to JSONB).
 */
function buildCreatePayload(userId, body) {
  return {
    userId,
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
 * Selective PUT update — only writes fields actually present in the body.
 */
function buildUpdatePayload(body) {
  const data = {};
  const scalarPassthrough = [
    'name', 'gender', 'species',
    'wounds', 'maxWounds', 'movement',
    'characterLevel', 'characterXp', 'attributePoints',
    'backstory', 'portraitUrl', 'voiceId', 'voiceName',
    'campaignCount', 'fame', 'infamy', 'status',
    'lockedCampaignId', 'lockedCampaignName', 'lockedLocation',
  ];
  for (const key of scalarPassthrough) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.age !== undefined) data.age = normalizeCharacterAge(body.age);

  const jsonFields = [
    'attributes', 'skills', 'mana', 'spells', 'inventory', 'materialBag',
    'money', 'equipped', 'statuses', 'needs', 'customAttackPresets',
    'knownTitles', 'clearedDungeonIds', 'activeDungeonState',
  ];
  for (const key of jsonFields) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
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
    const characters = await prisma.character.findMany({
      where: { userId: request.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    return characters;
  });

  fastify.get('/:id', async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });
    return character;
  });

  fastify.post('/', { schema: { body: CHARACTER_BODY_SCHEMA } }, async (request) => {
    const character = await prisma.character.create({
      data: buildCreatePayload(request.user.id, request.body || {}),
    });
    return character;
  });

  fastify.put('/:id', { schema: { body: CHARACTER_BODY_SCHEMA } }, async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    const character = await prisma.character.update({
      where: { id: request.params.id },
      data: buildUpdatePayload(request.body || {}),
    });
    return character;
  });

  /**
   * PATCH /:id/state-changes — apply an AI/manual state-change delta atomically.
   * Returns the updated Character row.
   */
  fastify.patch('/:id/state-changes', { schema: { body: STATE_CHANGES_SCHEMA } }, async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    const mutated = applyCharacterStateChanges(deserializeCharacterRow(existing), request.body || {});
    const updateData = characterToPrismaUpdate(mutated);

    const updated = await prisma.character.update({
      where: { id: request.params.id },
      data: updateData,
    });
    return updated;
  });

  fastify.delete('/:id', async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    await prisma.character.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}
