import { describe, expect, it } from 'vitest';

import {
  findSkillCharacteristicKey,
  inferCharacteristicFromAction,
  normalizeCharacteristicKey,
  pickBestSkill,
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

  it('normalizes Polish WFRP stat names with diacritics', () => {
    expect(normalizeCharacteristicKey('Ogłada')).toBe('fel');
    expect(normalizeCharacteristicKey('Ogd')).toBe('fel');
    expect(normalizeCharacteristicKey('Siła')).toBe('s');
    expect(normalizeCharacteristicKey('Wytrzymałość')).toBe('t');
    expect(normalizeCharacteristicKey('Zwinność')).toBe('ag');
    expect(normalizeCharacteristicKey('Zręczność')).toBe('dex');
    expect(normalizeCharacteristicKey('Siła Woli')).toBe('wp');
    expect(normalizeCharacteristicKey('Walka Wręcz')).toBe('ws');
  });

  it('resolves characteristic from Polish skill names', () => {
    expect(findSkillCharacteristicKey('Charyzma')).toBe('fel');
    expect(findSkillCharacteristicKey('Targowanie')).toBe('fel');
    expect(findSkillCharacteristicKey('Zastraszanie')).toBe('s');
    expect(findSkillCharacteristicKey('Atletyka')).toBe('ag');
  });

  it('resolves full dice roll with Polish Ogłada characteristic', () => {
    const resolved = resolveDiceRollCharacteristic(
      { characteristic: 'Ogłada', skill: 'Charyzma' },
      'Mówię do kupca',
    );
    expect(resolved).toBe('fel');
  });

  it('resolves dice roll from Polish skill when no characteristic given', () => {
    const resolved = resolveDiceRollCharacteristic(
      { skill: 'Charyzma' },
      'Rozmawiam z handlarzem',
    );
    expect(resolved).toBe('fel');
  });
});

describe('pickBestSkill', () => {
  const characteristics = { ws: 35, bs: 30, s: 40, t: 30, i: 35, ag: 30, dex: 25, int: 35, wp: 30, fel: 40 };

  it('picks the skill with highest effective target (charValue + advances)', () => {
    const skills = { Charm: 5, Haggle: 15, Gossip: 0 };
    const result = pickBestSkill(['Charm', 'Haggle', 'Gossip'], skills, characteristics);
    expect(result).toEqual({ skill: 'Haggle', advances: 15, characteristic: 'fel' });
  });

  it('handles Polish skill names in suggestions', () => {
    const skills = { Charm: 0, Haggle: 10 };
    const result = pickBestSkill(['Charyzma', 'Targowanie'], skills, characteristics);
    expect(result).toEqual({ skill: 'Haggle', advances: 10, characteristic: 'fel' });
  });

  it('picks across different characteristics based on effective total', () => {
    const skills = { Charm: 0, Intimidate: 15 };
    const result = pickBestSkill(['Charm', 'Intimidate'], skills, characteristics);
    // Charm: fel(40) + 0 = 40, Intimidate: s(40) + 15 = 55
    expect(result).toEqual({ skill: 'Intimidate', advances: 15, characteristic: 's' });
  });

  it('returns null for empty or invalid input', () => {
    expect(pickBestSkill([], {}, {})).toBeNull();
    expect(pickBestSkill(null, {}, {})).toBeNull();
    expect(pickBestSkill(['Unknown Skill'], {}, {})).toBeNull();
  });

  it('defaults advances to 0 for skills not in character sheet', () => {
    const skills = {};
    const result = pickBestSkill(['Charm', 'Athletics'], skills, characteristics);
    // Charm: fel(40) + 0 = 40, Athletics: ag(30) + 0 = 30
    expect(result).toEqual({ skill: 'Charm', advances: 0, characteristic: 'fel' });
  });
});
