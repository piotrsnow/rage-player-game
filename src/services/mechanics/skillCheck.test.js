import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSkillCheck, inferActionContext, clamp } from './skillCheck.js';

vi.mock('../gameState.js', () => ({
  rollD50: vi.fn(() => 25),
  rollPercentage: vi.fn(() => 99),
}));

import { rollD50, rollPercentage } from '../gameState.js';

const baseCharacter = {
  attributes: { sila: 12, inteligencja: 14, charyzma: 10, zrecznosc: 15, wytrzymalosc: 11, szczescie: 5 },
  skills: {
    'Walka bronia jednoręczna': { level: 8 },
    'Skradanie': { level: 5 },
    'Perswazja': { level: 3 },
  },
};

describe('clamp', () => {
  it('clamps within range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('inferActionContext', () => {
  it('returns null for empty input', () => {
    expect(inferActionContext('')).toBeNull();
    expect(inferActionContext(null)).toBeNull();
  });

  it('detects sila for attack actions', () => {
    const ctx = inferActionContext('atakuję goblina mieczem');
    expect(ctx.attribute).toBe('sila');
  });

  it('detects zrecznosc for stealth', () => {
    const ctx = inferActionContext('skradam się za strażnikiem');
    expect(ctx.attribute).toBe('zrecznosc');
  });

  it('detects charyzma for social', () => {
    const ctx = inferActionContext('przekonuję kupca do zniżki');
    expect(ctx.attribute).toBe('charyzma');
  });

  it('detects inteligencja for investigation', () => {
    const ctx = inferActionContext('badam ruiny szukając wskazówek');
    expect(ctx.attribute).toBe('inteligencja');
  });

  it('detects wytrzymalosc for endurance', () => {
    const ctx = inferActionContext('wytrzymuję ból i idę dalej');
    expect(ctx.attribute).toBe('wytrzymalosc');
  });
});

describe('resolveSkillCheck', () => {
  beforeEach(() => {
    rollD50.mockReturnValue(25);
    rollPercentage.mockReturnValue(99);
  });

  it('resolves basic d50 check', () => {
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 20,
    });
    expect(result).not.toBeNull();
    expect(result.attribute).toBe('sila');
    expect(result.roll).toBe(20);
    expect(result.attributeValue).toBe(12);
    expect(result.total).toBe(20 + 12 + 8); // roll + sila + skill
    expect(result.margin).toBe(result.total - result.threshold);
  });

  it('returns null for unrecognized action', () => {
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'siedzę i myślę o życiu',
    });
    expect(result).toBeNull();
  });

  it('luck auto-success when luckRoll <= szczescie', () => {
    rollPercentage.mockReturnValue(3); // <= szczescie (5)
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 1, // terrible roll
    });
    expect(result.luckySuccess).toBe(true);
    expect(result.success).toBe(true);
  });

  it('no luck when luckRoll > szczescie', () => {
    rollPercentage.mockReturnValue(50);
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 1,
    });
    expect(result.luckySuccess).toBe(false);
  });

  it('applies momentum bonus', () => {
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 20,
      currentMomentum: 5,
    });
    expect(result.momentumBonus).toBe(5);
    expect(result.total).toBe(20 + 12 + 8 + 5);
  });

  it('clamps momentum to ±10', () => {
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 20,
      currentMomentum: 15,
    });
    expect(result.momentumBonus).toBe(10);
  });

  it('applies creativity bonus', () => {
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 20,
      creativityBonus: 7,
    });
    expect(result.creativityBonus).toBe(7);
  });

  it('clamps creativity bonus to max 10', () => {
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 20,
      creativityBonus: 15,
    });
    expect(result.creativityBonus).toBe(10);
  });

  it('applies difficulty override', () => {
    const easy = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 20,
      difficultyOverride: 'easy',
    });
    const hard = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'atakuję goblina',
      roll: 20,
      difficultyOverride: 'hard',
    });
    expect(easy.threshold).toBeLessThan(hard.threshold);
  });

  it('applies disposition bonus for charyzma checks', () => {
    const mockDisp = vi.fn(() => ({ npcName: 'Kupiec', bonus: 3 }));
    const result = resolveSkillCheck({
      character: baseCharacter,
      actionText: 'przekonuję Kupca',
      roll: 20,
      resolveDisposition: mockDisp,
      worldNpcs: [{ name: 'Kupiec', disposition: 20 }],
    });
    expect(result.dispositionBonus).toBe(3);
    expect(result.dispositionNpc).toBe('Kupiec');
    expect(mockDisp).toHaveBeenCalled();
  });

  it('returns null if character has no attributes', () => {
    const result = resolveSkillCheck({
      character: {},
      actionText: 'atakuję goblina',
    });
    expect(result).toBeNull();
  });
});
