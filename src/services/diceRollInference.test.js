import { describe, expect, it } from 'vitest';

import {
  findSkillCharacteristicKey,
  inferCharacteristicFromAction,
  normalizeCharacteristicKey,
  resolveDiceRollCharacteristic,
} from './diceRollInference.js';

describe('diceRollInference', () => {
  it('normalizes fellowship aliases to fel', () => {
    expect(normalizeCharacteristicKey('charisma')).toBe('fel');
    expect(normalizeCharacteristicKey('charyzma')).toBe('fel');
    expect(normalizeCharacteristicKey('Fellowship')).toBe('fel');
  });

  it('infers a characteristic from a known WFRP skill', () => {
    expect(findSkillCharacteristicKey('Charm')).toBe('fel');
    expect(findSkillCharacteristicKey('Melee (Basic)')).toBe('ws');
  });

  it('infers fellowship from social dialogue actions', () => {
    expect(inferCharacteristicFromAction('Mowie do kupca: "Opowiedz mi o tej relikwii."')).toBe('fel');
    expect(inferCharacteristicFromAction('I ask the guard about the forest road.')).toBe('fel');
  });

  it('prefers skill mapping before generic social heuristics', () => {
    const resolved = resolveDiceRollCharacteristic(
      { characteristic: 'charisma', skill: 'Intimidate' },
      'I threaten the thug and demand answers.',
    );
    expect(resolved).toBe('fel');
  });

  it('returns null when neither characteristic, skill, nor action are trustworthy', () => {
    expect(resolveDiceRollCharacteristic({ characteristic: 'luck', skill: 'Unknown Skill' }, 'I look at the sky.')).toBeNull();
  });
});
