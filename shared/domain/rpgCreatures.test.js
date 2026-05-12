import { describe, it, expect } from 'vitest';
import {
  ANIMALS,
  MAGICAL_CREATURES,
  pickEncounterSubject,
} from './rpgCreatures.js';

const magicalIds = new Set(MAGICAL_CREATURES.map((c) => c.id));
const animalIds = new Set(ANIMALS.map((c) => c.id));

describe('pickEncounterSubject', () => {
  const loc = 'las';

  it('returns magical kind for typeRoll 1–3 and creature from magical catalog', () => {
    for (const typeRoll of [1, 2, 3]) {
      const { kind, creature } = pickEncounterSubject({ currentLocation: loc, typeRoll });
      expect(kind).toBe('magical');
      expect(magicalIds.has(creature.id)).toBe(true);
    }
  });

  it('returns animal kind for typeRoll 4–100 and creature from animals catalog', () => {
    for (const typeRoll of [4, 50, 100]) {
      const { kind, creature } = pickEncounterSubject({ currentLocation: loc, typeRoll });
      expect(kind).toBe('animal');
      expect(animalIds.has(creature.id)).toBe(true);
    }
  });
});
