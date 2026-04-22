import { prisma } from '../../../lib/prisma.js';
import { getTemplate, isGeneratedLocationType, effectiveCustomCap } from '../../livingWorld/settlementTemplates.js';
import { computeSubLocationBudget } from '../../livingWorld/topologyGuard.js';

// Phase 7 — background NPC label per location type (narration hint so premium
// talks collectively about villagers/townsfolk/guards instead of naming them).
export const BACKGROUND_LABEL = {
  hamlet:     'Wieśniak/Wieśniaczka',
  village:    'Wieśniak/Wieśniaczka',
  town:       'Mieszczanin/Mieszczanka',
  city:       'Mieszczanin/Mieszczanka',
  capital:    'Mieszczanin/Mieszczanka',
  wilderness: 'Podróżny/Podróżna',
};

/**
 * Build the Phase 7 settlement topology block. Resolves parent → loads
 * children → groups by slotKind → computes budget. Returns null for
 * dungeons (seed generator owns them) or when no parent context makes sense.
 */
export async function buildSettlementBlock(currentLocation, difficultyTier = null) {
  if (!currentLocation) return null;
  // If current is a sublocation, walk up to the parent settlement.
  let settlement = currentLocation;
  if (currentLocation.parentLocationId) {
    const parent = await prisma.worldLocation.findUnique({
      where: { id: currentLocation.parentLocationId },
    });
    if (parent) settlement = parent;
  }
  const type = settlement.locationType || 'generic';
  if (isGeneratedLocationType(type)) return null; // dungeons handled elsewhere
  const template = getTemplate(type);

  const children = await prisma.worldLocation.findMany({
    where: { parentLocationId: settlement.id },
    select: {
      id: true, canonicalName: true, slotType: true, slotKind: true, description: true,
    },
  });

  const childrenBySlot = {
    required: children.filter((c) => c.slotKind === 'required'),
    optional: children.filter((c) => c.slotKind === 'optional'),
    custom:   children.filter((c) => c.slotKind === 'custom'),
  };
  const customCap = effectiveCustomCap(type, difficultyTier);
  const budget = computeSubLocationBudget({
    parentLocationType: type,
    childrenBySlot,
    maxSubLocations: settlement.maxSubLocations || template.maxSubLocations || 5,
    customCap,
  });

  return {
    parentName: settlement.canonicalName,
    locationType: type,
    maxKeyNpcs: settlement.maxKeyNpcs || template.maxKeyNpcs || 10,
    children: childrenBySlot,
    budget,
    backgroundLabel: BACKGROUND_LABEL[type] || null,
  };
}
