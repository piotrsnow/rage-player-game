import { describe, expect, it } from 'vitest';

import {
  findSkillAttributeKey,
  inferAttributeFromAction,
  normalizeAttributeKey,
  pickBestSkill,
  resolveDiceRollAttribute,
} from './diceRollInference.js';

describe('diceRollInference', () => {
  it('normalizes charyzma aliases to charyzma', () => {
    expect(normalizeAttributeKey('charisma')).toBe('charyzma');
    expect(normalizeAttributeKey('charyzma')).toBe('charyzma');
    expect(normalizeAttributeKey('cha')).toBe('charyzma');
    expect(normalizeAttributeKey('fellowship')).toBe('charyzma');
  });

  it('normalizes strength aliases to sila', () => {
    expect(normalizeAttributeKey('strength')).toBe('sila');
    expect(normalizeAttributeKey('str')).toBe('sila');
    expect(normalizeAttributeKey('sila')).toBe('sila');
    expect(normalizeAttributeKey('sil')).toBe('sila');
  });

  it('normalizes other attribute aliases', () => {
    expect(normalizeAttributeKey('intelligence')).toBe('inteligencja');
    expect(normalizeAttributeKey('dexterity')).toBe('zrecznosc');
    expect(normalizeAttributeKey('agility')).toBe('zrecznosc');
    expect(normalizeAttributeKey('toughness')).toBe('wytrzymalosc');
    expect(normalizeAttributeKey('endurance')).toBe('wytrzymalosc');
    expect(normalizeAttributeKey('luck')).toBe('szczescie');
  });

  it('infers attribute from a known skill', () => {
    expect(findSkillAttributeKey('Perswazja')).toBe('charyzma');
    expect(findSkillAttributeKey('Walka bronia jednoręczna')).toBe('sila');
    expect(findSkillAttributeKey('Atletyka')).toBe('sila');
    expect(findSkillAttributeKey('Handel')).toBe('charyzma');
  });

  it('infers charyzma from social dialogue actions', () => {
    expect(inferAttributeFromAction('Mowie do kupca: "Opowiedz mi o tej relikwii."')).toBe('charyzma');
    expect(inferAttributeFromAction('I ask the guard about the forest road.')).toBe('charyzma');
  });

  it('returns null for non-social actions', () => {
    expect(inferAttributeFromAction('I look at the sky.')).toBeNull();
  });

  it('prefers explicit attribute when resolving dice roll', () => {
    const resolved = resolveDiceRollAttribute(
      { attribute: 'charisma', skill: 'Zastraszanie' },
      'I threaten the thug.',
    );
    expect(resolved).toBe('charyzma');
  });

  it('falls back to skill mapping when no explicit attribute', () => {
    const resolved = resolveDiceRollAttribute(
      { skill: 'Handel' },
      'Rozmawiam z handlarzem',
    );
    expect(resolved).toBe('charyzma');
  });

  it('falls back to skill default attribute for unknown skill name', () => {
    // getSkillAttribute returns 'inteligencja' as default when skill not found
    const resolved = resolveDiceRollAttribute(
      { skill: 'Unknown Skill' },
      'I say to the merchant: "How much?"',
    );
    // Unknown skill normalizes to null, but getSkillAttribute defaults to inteligencja
    expect(resolved).toBe('inteligencja');
  });

  it('returns inteligencja default when nothing matches', () => {
    // getSkillAttribute defaults to 'inteligencja' for unknown skills
    expect(resolveDiceRollAttribute(
      { attribute: 'bogus', skill: 'Unknown Skill' },
      'I look at the sky.',
    )).toBe('inteligencja');
  });
});

describe('pickBestSkill', () => {
  it('picks the skill with highest level', () => {
    const skills = { Perswazja: 5, Handel: 15, Wystepy: 0 };
    const result = pickBestSkill(['Perswazja', 'Handel', 'Wystepy'], skills);
    expect(result).toEqual({ skill: 'Handel', level: 15, attribute: 'charyzma' });
  });

  it('picks across different attributes based on level', () => {
    const skills = { Perswazja: 0, Zastraszanie: 15 };
    const result = pickBestSkill(['Perswazja', 'Zastraszanie'], skills);
    expect(result).toEqual({ skill: 'Zastraszanie', level: 15, attribute: 'sila' });
  });

  it('returns null for empty or invalid input', () => {
    expect(pickBestSkill([], {})).toBeNull();
    expect(pickBestSkill(null, {})).toBeNull();
    expect(pickBestSkill(['Unknown Skill'], {})).toBeNull();
  });

  it('defaults level to 0 for skills not in character sheet', () => {
    const skills = {};
    const result = pickBestSkill(['Perswazja', 'Atletyka'], skills);
    // Both have level 0, picks first valid one
    expect(result).not.toBeNull();
    expect(result.level).toBe(0);
    expect(result.attribute).toBeDefined();
  });

  it('handles object-style skill entries with level property', () => {
    const skills = { Perswazja: { level: 8 }, Handel: { level: 3 } };
    const result = pickBestSkill(['Perswazja', 'Handel'], skills);
    expect(result).toEqual({ skill: 'Perswazja', level: 8, attribute: 'charyzma' });
  });
});
