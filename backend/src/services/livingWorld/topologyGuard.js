// Living World Phase 7 — topology guard.
//
// Pure decision logic for enforcing capacity caps + sublocation classification
// when scene-gen emits new WorldLocations / WorldNPCs. Counts in / counts out:
//
//   decideNpcAdmission({ currentKeyNpcCount, maxKeyNpcs, name })
//     → { admission: 'key' | 'background', reason }
//
//   decideSublocationAdmission({ parentLocationType, childrenBySlot,
//                                maxSubLocations, slotType, name })
//     → { admission: 'required' | 'optional' | 'custom' | 'reject', reason, slotType? }
//
// The caller (processStateChanges hook) materializes the decisions: writes
// CampaignNPC.keyNpc=false instead of promoting to WorldNPC, or drops a
// sublocation with a log warn, etc.
//
// Pure — no DB. Side effects happen in the hook that wires this to Prisma.

import { classifySublocation, getTemplate } from './settlementTemplates.js';

/**
 * Decide whether a new NPC fits as a key character or should be stored as
 * background (no WorldNPC, no tick). Key NPC cap is enforced per parent
 * settlement (top-level location), not per sublocation — visitor churn at
 * the tavern doesn't eat into the tavern's sublocation budget.
 */
export function decideNpcAdmission({ currentKeyNpcCount = 0, maxKeyNpcs = 10 }) {
  if (currentKeyNpcCount < maxKeyNpcs) {
    return { admission: 'key', reason: 'under_cap' };
  }
  return { admission: 'background', reason: 'over_cap' };
}

/**
 * Decide whether a new sublocation fits into a parent settlement's slot system.
 *
 * Caller provides:
 *   parentLocationType — 'village' | 'town' | ...
 *   childrenBySlot = { required: [name...], optional: [name...], custom: [name...] }
 *   slotType        — what AI emitted (may be null/unknown)
 *   name            — AI-emitted display name (e.g. "Wieża Maga")
 *
 * Returns admission + slotType + slotKind (same meaning as schema).
 *
 * Reject reasons:
 *   'missing_name'          — empty name
 *   'generic_name'          — name failed narrative-distinctiveness check
 *   'hard_cap_exceeded'     — maxSubLocations reached
 *   'optional_cap_exceeded' — too many optional slots filled
 *   'duplicate_slot'        — required/optional slot already occupied
 */
export function decideSublocationAdmission({
  parentLocationType,
  childrenBySlot = { required: [], optional: [], custom: [] },
  maxSubLocations = 5,
  slotType,
  name,
}) {
  const classified = classifySublocation({ slotType, name, parentLocationType });

  if (classified.kind === 'reject') {
    return { admission: 'reject', reason: classified.reason };
  }

  const totalFilled =
    (childrenBySlot.required?.length || 0) +
    (childrenBySlot.optional?.length || 0) +
    (childrenBySlot.custom?.length || 0);

  if (totalFilled >= maxSubLocations) {
    return { admission: 'reject', reason: 'hard_cap_exceeded' };
  }

  const template = getTemplate(parentLocationType);

  if (classified.kind === 'required') {
    return {
      admission: 'required',
      slotType: classified.slotType,
      slotKind: 'required',
      reason: 'ok',
    };
  }

  if (classified.kind === 'optional') {
    if ((childrenBySlot.optional?.length || 0) >= (template.optionalCap || 0)) {
      return { admission: 'reject', reason: 'optional_cap_exceeded' };
    }
    return {
      admission: 'optional',
      slotType: classified.slotType,
      slotKind: 'optional',
      reason: 'ok',
    };
  }

  // custom — no numeric cap per user spec; name distinctiveness already verified
  return {
    admission: 'custom',
    slotType: classified.slotType || null,
    slotKind: 'custom',
    reason: 'ok',
  };
}

/**
 * Summarize the remaining-slot budget of a parent for prompt injection.
 * Returns a small object the prompt-builder can stringify:
 *   {
 *     filled: { required: [...], optional: [...], custom: [...] },
 *     openOptional: [list of slotTypes still free],
 *     capacityRemaining: N,
 *   }
 */
export function computeSubLocationBudget({
  parentLocationType,
  childrenBySlot = { required: [], optional: [], custom: [] },
  maxSubLocations = 5,
}) {
  const template = getTemplate(parentLocationType);
  const filledRequired = childrenBySlot.required || [];
  const filledOptional = childrenBySlot.optional || [];
  const filledCustom = childrenBySlot.custom || [];

  const filledOptionalSlots = new Set(filledOptional.map((sub) => sub.slotType).filter(Boolean));
  const openOptional = (template.optional || []).filter((s) => !filledOptionalSlots.has(s));

  const totalFilled = filledRequired.length + filledOptional.length + filledCustom.length;
  const capacityRemaining = Math.max(0, maxSubLocations - totalFilled);

  return {
    filled: {
      required: filledRequired,
      optional: filledOptional,
      custom: filledCustom,
    },
    openOptional,
    capacityRemaining,
    optionalBudgetRemaining: Math.max(0, (template.optionalCap || 0) - filledOptional.length),
  };
}
