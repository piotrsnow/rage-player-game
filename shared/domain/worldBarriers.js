/**
 * Hand-authored, world-level barriers gating movement past the canonical
 * worldBounds. Used by the [WORLD BOUNDS] prompt block to tell the AI WHAT
 * blocks the player when they try to walk off the edge of the heartland.
 *
 * Each direction has a distinct narrative obstacle. None are crossable.
 * The AI surfaces the barrier when the player's vector would push them
 * past the boundary.
 */

export const WORLD_BARRIERS = {
  north: {
    name: 'Robak Pożeracz Pól',
    desc: 'gigantyczny kopiący robak na północnej granicy heartlandu — wynurza się z ziemi, gdy ktoś próbuje przejść; nikt nie zdołał go ominąć',
  },
  south: {
    name: 'Robak Strażnik Trzewi',
    desc: 'bliźniak Pożeracza Pól, gdy zbliżasz się do granicy południowej widzisz jak coś ryje ziemię w Twoją stronę — granica południowa to jego polowisko',
  },
  west: {
    name: 'Pradawny Smok',
    desc: 'starodawny smok pilnujący zachodnich rubieży — nikt nie przeszedł obok niego żywy',
  },
  east: {
    name: 'Bezkresny Ocean',
    desc: 'wody bez końca; brak portów ani statków — wschodnia granica jest naturalna',
  },
};
