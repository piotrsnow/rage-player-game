import {
  WEAPONS, ARMOUR, BESTIARY, MANOEUVRES, HIT_LOCATIONS,
  MELEE_RANGE, BATTLEFIELD_MAX, DEFAULT_MOVEMENT,
} from '../data/wfrpEquipment.js';

export async function gameDataRoutes(fastify) {
  // No auth required — static game rules data

  fastify.get('/combat', async () => {
    return {
      weapons: WEAPONS,
      armour: ARMOUR,
      manoeuvres: MANOEUVRES,
      hitLocations: HIT_LOCATIONS,
      constants: { MELEE_RANGE, BATTLEFIELD_MAX, DEFAULT_MOVEMENT },
    };
  });

  fastify.get('/bestiary', async () => {
    return { bestiary: BESTIARY };
  });
}
