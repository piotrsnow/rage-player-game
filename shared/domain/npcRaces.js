/**
 * NPC race constants — shared between backend (sheet generation, Zod schema)
 * and frontend (World State UI, chat mini-card).
 *
 * Only four races are valid for regular NPCs. Story creatures (zjawy, sfinksy,
 * demony, itd.) use `creatureKind` instead of `race` — see npcCharacterSheet.js.
 *
 * Elf is intentionally absent: playable elves are disabled for now, and NPC
 * elves are likewise suppressed so the world feels consistent.
 */

export const NPC_RACES = ['Human', 'Dwarf', 'Halfling', 'Orc'];

export const NPC_RACE_LABELS_PL = {
  Human: 'Czlowiek',
  Dwarf: 'Krasnolud',
  Halfling: 'Niziolek',
  Orc: 'Ork',
};

/**
 * Attribute modifiers applied on top of a baseline. Mirrors SPECIES in
 * src/data/rpgSystem.js but kept here so the backend doesn't reach into
 * the FE bundle. Keep the two in sync by hand.
 */
export const RACE_MODIFIERS = {
  Human: { sila: 1, inteligencja: 1, charyzma: 1, zrecznosc: 1, wytrzymalosc: 1, szczescie: 0 },
  Halfling: { sila: 0, inteligencja: 0, charyzma: 2, zrecznosc: 3, wytrzymalosc: 0, szczescie: 0 },
  Dwarf: { sila: 2, inteligencja: 0, charyzma: 0, zrecznosc: 0, wytrzymalosc: 3, szczescie: 0 },
  Orc: { sila: 3, inteligencja: -1, charyzma: -1, zrecznosc: 0, wytrzymalosc: 2, szczescie: 0 },
};
