// Living World — Round B (Phase 3) campaign start binding.
//
// At campaign creation time we pick a concrete canonical {settlement,
// sublocation, NPC} trio and feed it into the campaign-generation prompt as
// a hard bind. The large model still writes the quest, characters, and
// opening narration — but the starting location + the quest-giver NPC are
// locked in by the picker so every campaign begins at a named, canonical
// place the player can later revisit across playthroughs.
//
// Weighting:
//   capital 40% / each village 30% (so for 2 villages, 40/30/30 = 100).
// Picker rolls inside the canonical world — it never references
// non-canonical runtime locations from prior campaigns.
//
// Returns `null` when the canonical world has not been seeded yet (new
// Atlas, fresh boot). Caller falls back to the free-form LLM path.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'startSpawnPicker' });

const TOP_LEVEL_TYPES = ['capital', 'city', 'town', 'village', 'hamlet'];

function weightedPick(items, weightFn) {
  if (!items.length) return null;
  const weighted = items.map((it) => ({ item: it, weight: Math.max(0, weightFn(it)) }));
  const total = weighted.reduce((a, b) => a + b.weight, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let roll = Math.random() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.item;
  }
  return weighted[weighted.length - 1].item;
}

/**
 * Pick a canonical start-spawn trio for a new campaign. Returns:
 *   {
 *     settlement: { id, canonicalName, locationType },
 *     sublocation: { id, canonicalName, category },
 *     npc: { id, name, role, personality, category, alignment, canonicalId }
 *   }
 * or `null` when the world isn't seeded / no suitable combo exists.
 */
export async function pickStartSpawn() {
  try {
    // 1. Pick a top-level canonical settlement. F5b — every WorldLocation row
    // is canonical (the isCanonical flag was dropped); no extra filter needed.
    const settlements = await prisma.worldLocation.findMany({
      where: {
        parentLocationId: null,
        locationType: { in: TOP_LEVEL_TYPES },
      },
      select: {
        id: true, canonicalName: true, locationType: true,
      },
    });
    if (!settlements.length) {
      log.warn('No canonical settlements found — returning null');
      return null;
    }

    const settlement = weightedPick(settlements, (s) => {
      if (s.locationType === 'capital') return 40;
      if (s.locationType === 'village') return 30;
      if (s.locationType === 'town') return 25;
      if (s.locationType === 'city') return 20;
      return 10;
    });
    if (!settlement) return null;

    // 2. Candidate sublocations — must have ≥1 canonical NPC. Query both
    //    sides in one pass so we can reject sublocations with no people in
    //    them (nothing to bind the starter quest to).
    const sublocations = await prisma.worldLocation.findMany({
      where: {
        parentLocationId: settlement.id,
      },
      select: {
        id: true, canonicalName: true, category: true, slotType: true,
      },
    });
    if (!sublocations.length) return null;

    const sublocIds = sublocations.map((s) => s.id);
    const npcs = await prisma.worldNPC.findMany({
      where: {
        alive: true,
        keyNpc: true,
        currentLocationId: { in: sublocIds },
      },
      select: {
        id: true, name: true, role: true, personality: true,
        alignment: true, canonicalId: true, category: true,
        currentLocationId: true,
      },
    });
    if (!npcs.length) {
      log.warn({ settlement: settlement.canonicalName }, 'Settlement has no canonical NPCs in any sublocation');
      return null;
    }

    // 3. Group NPCs by sublocation, then pick a sublocation with NPCs,
    //    then pick a random NPC from it. Uniform pick on both — we don't
    //    yet have a reason to bias by role / category.
    const npcsByLoc = new Map();
    for (const n of npcs) {
      if (!npcsByLoc.has(n.currentLocationId)) npcsByLoc.set(n.currentLocationId, []);
      npcsByLoc.get(n.currentLocationId).push(n);
    }
    const eligibleSublocs = sublocations.filter((s) => npcsByLoc.has(s.id));
    if (!eligibleSublocs.length) return null;
    const sublocation = eligibleSublocs[Math.floor(Math.random() * eligibleSublocs.length)];
    const pool = npcsByLoc.get(sublocation.id);
    const npc = pool[Math.floor(Math.random() * pool.length)];

    return { settlement, sublocation, npc };
  } catch (err) {
    log.warn({ err: err?.message }, 'pickStartSpawn failed — returning null');
    return null;
  }
}
