import { describe, it, expect } from 'vitest';
import { inferForcedRollSkill } from './diceResolver.js';

const charWith = (skills) => ({
  attributes: { sila: 5, zrecznosc: 4, charyzma: 3, inteligencja: 6, wytrzymalosc: 4, szczescie: 2 },
  skills: skills || {},
});

describe('inferForcedRollSkill', () => {
  it('picks a sila skill for attack action', () => {
    const skill = inferForcedRollSkill('atakuję goblina mieczem', charWith({ 'Walka wrecz': 3, 'Atletyka': 1 }));
    expect(skill).toBe('Walka wrecz');
  });

  it('picks the highest-level skill for the matched attribute', () => {
    const skill = inferForcedRollSkill('atakuję', charWith({ 'Walka wrecz': 1, 'Atletyka': 5, 'Zastraszanie': 2 }));
    expect(skill).toBe('Atletyka');
  });

  it('picks a zrecznosc skill for stealth action', () => {
    const skill = inferForcedRollSkill('skradam się za strażnikami', charWith({ 'Skradanie': 4 }));
    expect(skill).toBe('Skradanie');
  });

  it('picks a charyzma skill for social action', () => {
    const skill = inferForcedRollSkill('przekonuję kupca do zniżki', charWith({ 'Perswazja': 2, 'Blef': 5 }));
    expect(skill).toBe('Blef');
  });

  it('picks an inteligencja skill for investigation', () => {
    const skill = inferForcedRollSkill('badam ruiny', charWith({ 'Spostrzegawczosc': 3 }));
    expect(skill).toBe('Spostrzegawczosc');
  });

  it('picks a wytrzymalosc skill for endurance action', () => {
    const skill = inferForcedRollSkill('wytrzymuję ból', charWith({ 'Odpornosc': 2 }));
    expect(skill).toBe('Odpornosc');
  });

  it('returns the first canonical skill when character has none trained in the attribute', () => {
    const skill = inferForcedRollSkill('atakuję goblina', charWith({}));
    expect(skill).toBe('Walka wrecz');
  });

  it('falls back to Przeczucie for unclassifiable text', () => {
    const skill = inferForcedRollSkill('siedzę i myślę o życiu', charWith({}));
    expect(skill).toBe('Przeczucie');
  });

  it('falls back to Przeczucie for empty input', () => {
    expect(inferForcedRollSkill('', charWith({}))).toBe('Przeczucie');
    expect(inferForcedRollSkill(null, charWith({}))).toBe('Przeczucie');
  });

  it('handles English action text', () => {
    const skill = inferForcedRollSkill('I search the room carefully', charWith({ 'Spostrzegawczosc': 2 }));
    expect(skill).toBe('Spostrzegawczosc');
  });
});
