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
 * Build a Prisma create payload from a request body. Stringifies all JSON
 * fields and applies sane defaults for the RPGon shape.
 */
function buildCreatePayload(userId, body) {
  const payload = {
    userId,
    name: body.name || 'Adventurer',
    age: normalizeCharacterAge(body.age),
    gender: body.gender || '',
    species: body.species || 'Human',
    // RPGon stats
    attributes: JSON.stringify(body.attributes || {
      sila: 10, inteligencja: 10, charyzma: 10, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5,
    }),
    skills: JSON.stringify(body.skills || {}),
    wounds: body.wounds ?? 0,
    maxWounds: body.maxWounds ?? 0,
    movement: body.movement ?? 4,
    characterLevel: body.characterLevel ?? 1,
    characterXp: body.characterXp ?? 0,
    attributePoints: body.attributePoints ?? 0,
    // Magic
    mana: JSON.stringify(body.mana || { current: 0, max: 0 }),
    spells: JSON.stringify(body.spells || { known: [], usageCounts: {}, scrolls: [] }),
    // Inventory & equipment
    inventory: JSON.stringify(body.inventory || []),
    materialBag: JSON.stringify(body.materialBag || []),
    money: JSON.stringify(body.money || { gold: 0, silver: 0, copper: 0 }),
    equipped: JSON.stringify(body.equipped || { mainHand: null, offHand: null, armour: null }),
    // Status & needs
    statuses: JSON.stringify(body.statuses || []),
    needs: JSON.stringify(body.needs || { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 }),
    // Narrative
    backstory: body.backstory || '',
    customAttackPresets: JSON.stringify(Array.isArray(body.customAttackPresets) ? body.customAttackPresets : []),
    // Presentation
    portraitUrl: body.portraitUrl || '',
    voiceId: body.voiceId || '',
    voiceName: body.voiceName || '',
    campaignCount: body.campaignCount ?? 0,
    // Legacy WFRP fields (kept for CharacterCreationModal back-compat)
    careerData: JSON.stringify(body.careerData || {}),
    characteristics: JSON.stringify(body.characteristics || {}),
    advances: JSON.stringify(body.advances || {}),
    xp: body.xp ?? 0,
    xpSpent: body.xpSpent ?? 0,
  };
  return payload;
}

/**
 * Selective PUT update — only writes fields actually present in the body.
 * Stringifies JSON fields when provided.
 */
function buildUpdatePayload(body) {
  const data = {};
  const scalarPassthrough = [
    'name', 'gender', 'species',
    'wounds', 'maxWounds', 'movement',
    'characterLevel', 'characterXp', 'attributePoints',
    'backstory', 'portraitUrl', 'voiceId', 'voiceName',
    'campaignCount', 'xp', 'xpSpent',
  ];
  for (const key of scalarPassthrough) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.age !== undefined) data.age = normalizeCharacterAge(body.age);

  const jsonFields = [
    'attributes', 'skills', 'mana', 'spells', 'inventory', 'materialBag',
    'money', 'equipped', 'statuses', 'needs', 'customAttackPresets',
    'careerData', 'characteristics', 'advances',
  ];
  for (const key of jsonFields) {
    if (body[key] !== undefined) data[key] = JSON.stringify(body[key]);
  }
  return data;
}

export async function characterRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request) => {
    const characters = await prisma.character.findMany({
      where: { userId: request.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    return characters.map(deserializeCharacterRow);
  });

  fastify.get('/:id', async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });
    return deserializeCharacterRow(character);
  });

  fastify.post('/', async (request) => {
    const character = await prisma.character.create({
      data: buildCreatePayload(request.user.id, request.body || {}),
    });
    return deserializeCharacterRow(character);
  });

  fastify.put('/:id', async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    const character = await prisma.character.update({
      where: { id: request.params.id },
      data: buildUpdatePayload(request.body || {}),
    });
    return deserializeCharacterRow(character);
  });

  /**
   * PATCH /:id/state-changes — apply an AI/manual state-change delta atomically.
   *
   * Body shape matches the GameContext APPLY_STATE_CHANGES payload (and the
   * subset of AI stateChanges that affect a character):
   *   { woundsChange, xp, manaChange, manaMaxChange, attributeChanges,
   *     skillProgress, spellUsage, learnSpell, consumeScroll, addScroll,
   *     newItems, newMaterials, removeItems, removeItemsByName,
   *     moneyChange, statuses, needsChanges, equipChange, forceStatus }
   *
   * Returns the updated, deserialized Character snapshot.
   */
  fastify.patch('/:id/state-changes', async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    const snapshot = deserializeCharacterRow(existing);
    const mutated = applyCharacterStateChanges(snapshot, request.body || {});
    const updateData = characterToPrismaUpdate(mutated);

    const updated = await prisma.character.update({
      where: { id: request.params.id },
      data: updateData,
    });
    return deserializeCharacterRow(updated);
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
