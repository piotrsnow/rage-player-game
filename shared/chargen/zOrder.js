// Layer z-ordering for LPC composites.
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

export const ALL_SLOTS = [...new Set([...Z_ORDER_BACK, ...Z_ORDER_FRONT])];
