import { describe, it, expect, vi } from 'vitest';

vi.mock('../data/wfrp', () => ({
  SKILLS: { basic: [], advanced: [] },
  TALENTS: [],
  getAdvancementCost: () => 25,
  ADVANCEMENT_COSTS: {},
  isCharacteristicInCareer: () => false,
  isSkillInCareer: () => false,
  isTalentInCareer: () => false,
  getCareerByName: () => null,
  canAdvanceTier: () => false,
}));

import { validateStateChanges } from './stateValidator.js';

const baseCharacter = {
  wounds: 10,
  maxWounds: 12,
};

describe('validateStateChanges', () => {
  it('caps XP to max per scene', () => {
    const { validated } = validateStateChanges({ xp: 200 }, { character: baseCharacter });
    expect(validated.xp).toBe(50);
  });

  it('clamps negative XP to 0', () => {
    const { validated } = validateStateChanges({ xp: -10 }, { character: baseCharacter });
    expect(validated.xp).toBe(0);
  });

  it('clamps wounds delta so wounds do not go below 0', () => {
    const { validated } = validateStateChanges(
      { woundsChange: -20 },
      { character: { ...baseCharacter, wounds: 10, maxWounds: 12 } },
    );
    expect(validated.woundsChange).toBe(-10);
  });

  it('clamps wounds delta so wounds do not exceed max', () => {
    const { validated } = validateStateChanges(
      { woundsChange: 10 },
      { character: { ...baseCharacter, wounds: 10, maxWounds: 12 } },
    );
    expect(validated.woundsChange).toBe(2);
  });

  it('caps new items per scene', () => {
    const { validated } = validateStateChanges(
      { newItems: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] },
      { character: baseCharacter },
    );
    expect(validated.newItems.length).toBe(3);
  });

  it('returns empty warnings and corrections for valid XP change', () => {
    const { warnings, corrections } = validateStateChanges({ xp: 10 }, { character: baseCharacter });
    expect(warnings.length).toBe(0);
    expect(corrections.length).toBe(0);
  });

  it('passes through null stateChanges', () => {
    const { validated } = validateStateChanges(null, { character: baseCharacter });
    expect(validated).toBeNull();
  });

  it('clamps needs delta to default max', () => {
    const { validated } = validateStateChanges(
      { needsChanges: { hunger: 150 } },
      { character: baseCharacter },
    );
    expect(validated.needsChanges.hunger).toBe(100);
  });
});
