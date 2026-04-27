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
 * Sublocations are per-campaign (CampaignLocation sandbox), so there is no
 * global capacity to protect. Capacity caps (`maxSubLocations`,
 * `optionalCap`, `customCap`) are no longer enforced — sublokacje per
 * kampania mogą rosnąć dowolnie. We still classify the slotType so the
 * prompt + admin UI can group filled slots by required/optional/custom,
 * and we still reject obviously-bad emissions (empty name, generic name).
 *
 * Caller provides:
 *   parentLocationType — 'village' | 'town' | ...
 *   slotType           — what AI emitted (may be null/unknown)
 *   name               — AI-emitted display name (e.g. "Wieża Maga")
 *
 * Returns admission + slotType + slotKind (same meaning as schema).
 *
 * Reject reasons:
 *   'missing_name'          — empty name
 *   'generic_name'          — name failed narrative-distinctiveness check
 *   'duplicate_slot'        — required/optional slot already occupied
 *
 * `childrenBySlot` and the cap parameters (`maxSubLocations`, `customCap`)
 * are accepted for backwards compatibility but ignored — kept for tests
 * and call sites that haven't been re-flowed.
 */
export function decideSublocationAdmission({
  parentLocationType,
  childrenBySlot: _childrenBySlot = { required: [], optional: [], custom: [] },
  maxSubLocations: _maxSubLocations = 5,
  slotType,
  name,
  customCap: _customCap = null,
}) {
  const classified = classifySublocation({ slotType, name, parentLocationType });

  if (classified.kind === 'reject') {
    return { admission: 'reject', reason: classified.reason };
  }

  if (classified.kind === 'required') {
    return {
      admission: 'required',
      slotType: classified.slotType,
      slotKind: 'required',
      reason: 'ok',
    };
  }

  if (classified.kind === 'optional') {
    return {
      admission: 'optional',
      slotType: classified.slotType,
      slotKind: 'optional',
      reason: 'ok',
    };
  }

  return {
    admission: 'custom',
    slotType: classified.slotType || null,
    slotKind: 'custom',
    reason: 'ok',
  };
}

/**
 * Summarize sublocations of a parent for prompt injection.
 * Returns a small object the prompt-builder can stringify:
 *   {
 *     filled: { required: [...], optional: [...], custom: [...] },
 *     openOptional: [list of slotTypes still free, narrative hint only],
 *   }
 *
 * Capacity numbers (`capacityRemaining`, `optionalBudgetRemaining`,
 * `customBudgetRemaining`) intentionally dropped — sublocations are
 * per-campaign sandbox and unbounded. `openOptional` survives as a
 * narrative hint ("nie ma jeszcze tawerny tutaj — pasowałaby") without
 * any budget framing.
 */
export function computeSubLocationBudget({
  parentLocationType,
  childrenBySlot = { required: [], optional: [], custom: [] },
}) {
  const template = getTemplate(parentLocationType);
  const filledRequired = childrenBySlot.required || [];
  const filledOptional = childrenBySlot.optional || [];
  const filledCustom = childrenBySlot.custom || [];

  const filledOptionalSlots = new Set(filledOptional.map((sub) => sub.slotType).filter(Boolean));
  const openOptional = (template.optional || []).filter((s) => !filledOptionalSlots.has(s));

  return {
    filled: {
      required: filledRequired,
      optional: filledOptional,
      custom: filledCustom,
    },
    openOptional,
  };
}
