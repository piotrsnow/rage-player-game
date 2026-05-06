// Layer z-ordering for LPC composites. See plan Phase 1.
//
// In LPC assets every item has at most two textures per body-type:
//   - `back`:  rendered behind the body (cape tails, sheathed weapons, long
//              hair pouring down behind shoulders)
//   - `front`: rendered at the slot's normal z position
//
// We process in two passes:
//   1. All `back` textures in slot order (so they stack correctly amongst
//      themselves behind the body).
//   2. All `front` textures in slot order.

export const Z_ORDER_BACK = [
  'shadow',
  'back',          // cloaks
  'tail',
  'wings',
  'hair',          // long hair back
  'offhand',       // shield/weapon behind body
  'mainhand',
  'ammo',          // quiver back
];

export const Z_ORDER_FRONT = [
  'shadow',
  'body',
  'ears',
  'nose',
  'eyes',
  'head',
  'facial',
  'tail',
  'wings',
  'pants',
  'shirt',
  'belt',
  'shoes',
  'gloves',
  'jacket',
  'suit',
  'mask',
  'hair',
  'glasses',
  'hat',
  'back',
  'offhand',
  'mainhand',
  'ammo',
  'add1',
  'add2',
  'add3',
];

// All possible slots (union of the two orderings) — used for manifest
// iteration and random actor generation.
export const ALL_SLOTS = [...new Set([...Z_ORDER_BACK, ...Z_ORDER_FRONT])];

// Slot categories — groups 20+ LPC slots into seven semantic buckets
// used by the CharGen sidebar. Each category gets its own accent colour
// from `sectionAccents.js`, so the whole slot grid becomes seven big
// colour-coded cards instead of a flat beige sea of ~25 identical
// selects.
//
// Ordering matters: this is the vertical order of SectionCards in the
// right pane. Body & hair at the top (the user usually tweaks these
// first) and add-ons at the bottom (rarely used).
export const SLOT_CATEGORIES = [
  { id: 'body',      label: 'Body',      accent: 'rose',    slots: ['shadow', 'body', 'head', 'ears', 'nose', 'eyes'] },
  { id: 'hair',      label: 'Hair / Face', accent: 'amber', slots: ['hair', 'facial'] },
  { id: 'features',  label: 'Features',  accent: 'fuchsia', slots: ['tail', 'wings'] },
  { id: 'clothing',  label: 'Clothing',  accent: 'emerald', slots: ['shirt', 'pants', 'belt', 'shoes', 'gloves', 'jacket', 'suit'] },
  { id: 'headgear',  label: 'Headgear',  accent: 'sky',     slots: ['mask', 'hat', 'glasses'] },
  { id: 'equipment', label: 'Equipment', accent: 'orange',  slots: ['back', 'mainhand', 'offhand', 'ammo'] },
  { id: 'addons',    label: 'Add-ons',   accent: 'violet',  slots: ['add1', 'add2', 'add3'] },
];

// Lookup table: slot id → category accent (used by SlotEditor to tint
// its border/state dot according to the enclosing category).
export const SLOT_ACCENTS = (() => {
  const out = {};
  for (const cat of SLOT_CATEGORIES) {
    for (const slot of cat.slots) out[slot] = cat.accent;
  }
  return out;
})();

