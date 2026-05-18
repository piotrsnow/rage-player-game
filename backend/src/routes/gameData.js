import {
  WEAPONS, ARMOUR, SHIELDS, BESTIARY, MANOEUVRES, HIT_LOCATIONS,
  MELEE_RANGE, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, DEFAULT_MOVEMENT,
  TERRAIN_TILES, TERRAIN_SPAWN_CONFIG,
  EQUIPMENT, EQUIPMENT_CATEGORIES, AVAILABILITY_MODIFIERS, CRAFTING_RECIPES,
  ALCHEMY_RECIPES, MATERIALS, MATERIAL_CATEGORIES_BY_ARCHETYPE,
  buildBaseTypeIndex,
} from '../data/equipment/index.js';
import { prisma } from '../lib/prisma.js';

export async function gameDataRoutes(fastify) {
  // No auth required — static game rules data

  fastify.get('/combat', async () => {
    return {
      weapons: WEAPONS,
      armour: ARMOUR,
      shields: SHIELDS,
      manoeuvres: MANOEUVRES,
      hitLocations: HIT_LOCATIONS,
      terrainTiles: TERRAIN_TILES,
      terrainSpawnConfig: TERRAIN_SPAWN_CONFIG,
      constants: { MELEE_RANGE, BATTLEFIELD_WIDTH, BATTLEFIELD_HEIGHT, DEFAULT_MOVEMENT },
    };
  });

  fastify.get('/bestiary', async () => {
    return { bestiary: BESTIARY };
  });

  const baseTypeIndex = buildBaseTypeIndex();

  fastify.get('/equipment', async () => {
    return {
      equipment: EQUIPMENT,
      categories: EQUIPMENT_CATEGORIES,
      availability: AVAILABILITY_MODIFIERS,
      crafting: CRAFTING_RECIPES,
      alchemy: ALCHEMY_RECIPES,
      materials: MATERIALS,
      materialArchetypes: MATERIAL_CATEGORIES_BY_ARCHETYPE,
      baseTypeIndex,
    };
  });

  // ── Global spell catalog + images ──

  fastify.get('/custom-spells', async (request) => {
    const campaignId = request.query?.campaignId || null;
    const where = { softDeletedAt: null };
    if (campaignId) {
      where.OR = [{ globallyActive: true }, { originCampaignId: campaignId }];
    } else {
      where.globallyActive = true;
    }
    const rows = await prisma.customSpell.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, school: true, description: true, longDescription: true, icon: true, manaCost: true, combatStats: true },
    });
    return rows;
  });

  fastify.get('/spell-images', async () => {
    const rows = await prisma.spellImage.findMany({
      select: { name: true, imageUrl: true },
    });
    const map = {};
    for (const row of rows) map[row.name] = row.imageUrl;
    return map;
  });

  fastify.post('/spell-image', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'imageUrl'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          imageUrl: { type: 'string', minLength: 1, maxLength: 2000 },
          imagePrompt: { type: 'string', maxLength: 5000 },
        },
      },
    },
  }, async (request) => {
    const { name, imageUrl, imagePrompt } = request.body;
    const row = await prisma.spellImage.upsert({
      where: { name },
      create: { name, imageUrl, imagePrompt: imagePrompt || null },
      update: { imageUrl, imagePrompt: imagePrompt || null },
    });
    return { name: row.name, imageUrl: row.imageUrl };
  });
}
