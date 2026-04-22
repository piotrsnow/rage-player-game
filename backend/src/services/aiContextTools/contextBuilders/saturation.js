import { prisma } from '../../../lib/prisma.js';

/**
 * Phase C — compute saturation budgets for the current campaign + location.
 *
 * Settlement budget: (cap - existing) / cap across the campaign's worldBounds.
 *   Capital excluded (global, shared across campaigns).
 *
 * NPC budget: (cap - occupants) / cap for the CURRENT top-level settlement.
 *   Uses parent settlement when the player is in a sublocation.
 *
 * Returns null when neither can be computed (missing caps / bounds / location
 * cap). Otherwise returns { settlementBudget, npcBudget, level: 'tight'|'watch'|null }.
 * `level` is the thresholded tier — 'tight' at <0.2, 'watch' at <0.5 on
 * whichever ratio is lower. null means no hint needed.
 */
export async function buildSaturationHint({ campaign, location, ambientNpcCount = 0 }) {
  let caps = null;
  let bounds = null;
  try { caps = campaign?.settlementCaps ? JSON.parse(campaign.settlementCaps) : null; } catch { caps = null; }
  try { bounds = campaign?.worldBounds ? JSON.parse(campaign.worldBounds) : null; } catch { bounds = null; }

  let settlementBudget = null;
  if (caps && bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)) {
    const capTotal = ['hamlet', 'village', 'town', 'city']
      .reduce((a, t) => a + (Number(caps[t]) || 0), 0);
    if (capTotal > 0) {
      const existing = await prisma.worldLocation.count({
        where: {
          parentLocationId: null,
          locationType: { in: ['hamlet', 'village', 'town', 'city'] },
          regionX: { gte: bounds.minX, lte: bounds.maxX },
          regionY: { gte: bounds.minY, lte: bounds.maxY },
        },
      });
      settlementBudget = Math.max(0, Math.min(1, (capTotal - existing) / capTotal));
    }
  }

  // Resolve parent settlement for NPC budget (sublocation → walk up).
  let settlementForNpcs = location;
  if (location.parentLocationId) {
    const parent = await prisma.worldLocation.findUnique({
      where: { id: location.parentLocationId },
      select: { id: true, maxKeyNpcs: true, locationType: true },
    });
    if (parent) settlementForNpcs = parent;
  }
  let npcBudget = null;
  const npcCap = Number(settlementForNpcs?.maxKeyNpcs) || 0;
  if (npcCap > 0) {
    const keyNpcCount = await prisma.worldNPC.count({
      where: { currentLocationId: settlementForNpcs.id, keyNpc: true, alive: true },
    }).catch(() => ambientNpcCount);
    npcBudget = Math.max(0, Math.min(1, (npcCap - keyNpcCount) / npcCap));
  }

  if (settlementBudget === null && npcBudget === null) return null;

  const lowest = Math.min(
    settlementBudget ?? 1,
    npcBudget ?? 1,
  );
  let level = null;
  if (lowest < 0.2) level = 'tight';
  else if (lowest < 0.5) level = 'watch';

  return {
    settlementBudget,
    npcBudget,
    level,
  };
}
