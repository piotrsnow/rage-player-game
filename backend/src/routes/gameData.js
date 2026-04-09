import {
  WEAPONS, ARMOUR, SHIELDS, BESTIARY, MANOEUVRES, HIT_LOCATIONS,
  MELEE_RANGE, BATTLEFIELD_MAX, DEFAULT_MOVEMENT,
  EQUIPMENT, EQUIPMENT_CATEGORIES, AVAILABILITY_MODIFIERS, CRAFTING_RECIPES,
  buildBaseTypeIndex,
} from '../data/equipment/index.js';

export async function gameDataRoutes(fastify) {
  // No auth required — static game rules data

  fastify.get('/combat', async () => {
    return {
      weapons: WEAPONS,
      armour: ARMOUR,
      shields: SHIELDS,
      manoeuvres: MANOEUVRES,
      hitLocations: HIT_LOCATIONS,
      constants: { MELEE_RANGE, BATTLEFIELD_MAX, DEFAULT_MOVEMENT },
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
      baseTypeIndex,
    };
  });
}
