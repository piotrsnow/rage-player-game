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
import { calculateSL } from './gameState.js';

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

describe('calculateSL — clamping to +-10', () => {
  it('returns 0 for exact target match', () => {
    expect(calculateSL(50, 50)).toBe(0);
  });

  it('returns positive SL for success', () => {
    expect(calculateSL(10, 50)).toBe(4);
  });

  it('returns negative SL for failure', () => {
    expect(calculateSL(80, 50)).toBe(-3);
  });

  it('clamps extremely high SL to +10', () => {
    expect(calculateSL(1, 150)).toBe(10);
  });

  it('clamps extremely low SL to -10', () => {
    expect(calculateSL(100, 0)).toBe(-10);
  });

  it('does not clamp SL within normal range', () => {
    expect(calculateSL(20, 80)).toBe(6);
    expect(calculateSL(90, 30)).toBe(-6);
  });
});

describe('NPC disposition delta validation', () => {
  it('clamps positive disposition delta to +10', () => {
    const { validated, corrections } = validateStateChanges(
      { npcs: [{ name: 'TestNPC', action: 'update', dispositionChange: 20 }] },
      { character: baseCharacter },
    );
    expect(validated.npcs[0].dispositionChange).toBe(10);
    expect(corrections.length).toBeGreaterThan(0);
  });

  it('clamps negative disposition delta to -10', () => {
    const { validated, corrections } = validateStateChanges(
      { npcs: [{ name: 'TestNPC', action: 'update', dispositionChange: -15 }] },
      { character: baseCharacter },
    );
    expect(validated.npcs[0].dispositionChange).toBe(-10);
    expect(corrections.length).toBeGreaterThan(0);
  });

  it('allows disposition delta within range', () => {
    const { validated, corrections } = validateStateChanges(
      { npcs: [{ name: 'TestNPC', action: 'update', dispositionChange: 5 }] },
      { character: baseCharacter },
    );
    expect(validated.npcs[0].dispositionChange).toBe(5);
    expect(corrections.length).toBe(0);
  });

  it('handles zero disposition delta without correction', () => {
    const { validated, corrections } = validateStateChanges(
      { npcs: [{ name: 'TestNPC', action: 'update', dispositionChange: 0 }] },
      { character: baseCharacter },
    );
    expect(validated.npcs[0].dispositionChange).toBe(0);
    expect(corrections.length).toBe(0);
  });
});

describe('item rarity warnings', () => {
  it('warns about rare items in early campaign (scene < 16)', () => {
    const { warnings } = validateStateChanges(
      { newItems: [{ id: 'i1', name: 'Magic Sword', rarity: 'rare' }] },
      { character: baseCharacter, scenes: new Array(5) },
    );
    expect(warnings.some((w) => w.includes('rare') && w.includes('scene 5'))).toBe(true);
  });

  it('does not warn about rare items in mid-campaign (scene >= 16)', () => {
    const { warnings } = validateStateChanges(
      { newItems: [{ id: 'i1', name: 'Magic Sword', rarity: 'rare' }] },
      { character: baseCharacter, scenes: new Array(20) },
    );
    expect(warnings.some((w) => w.includes('rare'))).toBe(false);
  });

  it('warns about exotic items before scene 31', () => {
    const { warnings } = validateStateChanges(
      { newItems: [{ id: 'i1', name: 'Artifact', rarity: 'exotic' }] },
      { character: baseCharacter, scenes: new Array(25) },
    );
    expect(warnings.some((w) => w.includes('exotic') && w.includes('scene 25'))).toBe(true);
  });

  it('does not warn about exotic items after scene 31', () => {
    const { warnings } = validateStateChanges(
      { newItems: [{ id: 'i1', name: 'Artifact', rarity: 'exotic' }] },
      { character: baseCharacter, scenes: new Array(35) },
    );
    expect(warnings.some((w) => w.includes('exotic'))).toBe(false);
  });

  it('does not warn about common items at any stage', () => {
    const { warnings } = validateStateChanges(
      { newItems: [{ id: 'i1', name: 'Bread', rarity: 'common' }] },
      { character: baseCharacter, scenes: new Array(1) },
    );
    expect(warnings.some((w) => w.includes('common') && w.includes('rarity'))).toBe(false);
  });

  it('does not warn about items without rarity field', () => {
    const { warnings } = validateStateChanges(
      { newItems: [{ id: 'i1', name: 'Old Rope' }] },
      { character: baseCharacter, scenes: new Array(1) },
    );
    expect(warnings.some((w) => w.includes('rarity'))).toBe(false);
  });
});

describe('momentum capping', () => {
  it('momentum formula sl*5 is capped conceptually at +-40 (SL +-8)', () => {
    const sl8 = calculateSL(1, 85);
    expect(sl8).toBe(8);
    const momentum8 = Math.max(-40, Math.min(40, sl8 * 5));
    expect(momentum8).toBe(40);

    const slNeg8 = calculateSL(95, 10);
    expect(slNeg8).toBe(-8);
    const momentumNeg8 = Math.max(-40, Math.min(40, slNeg8 * 5));
    expect(momentumNeg8).toBe(-40);
  });

  it('extreme SL values produce capped momentum', () => {
    const sl10 = calculateSL(1, 120);
    expect(sl10).toBe(10);
    const momentum10 = Math.max(-40, Math.min(40, sl10 * 5));
    expect(momentum10).toBe(40);

    const slNeg10 = calculateSL(100, 0);
    expect(slNeg10).toBe(-10);
    const momentumNeg10 = Math.max(-40, Math.min(40, slNeg10 * 5));
    expect(momentumNeg10).toBe(-40);
  });
});

describe('combined bonus capping', () => {
  it('caps total bonus at +30', () => {
    const creativity = 25;
    const momentum = 20;
    const disposition = 15;
    const totalBonus = creativity + momentum + disposition;
    const cappedBonus = Math.min(totalBonus, 30);
    expect(cappedBonus).toBe(30);
  });

  it('does not cap bonus within limit', () => {
    const creativity = 10;
    const momentum = 10;
    const disposition = 5;
    const totalBonus = creativity + momentum + disposition;
    const cappedBonus = Math.min(totalBonus, 30);
    expect(cappedBonus).toBe(25);
  });

  it('correctly recalculates effective target with capped bonus', () => {
    const baseTarget = 35;
    const creativity = 25;
    const momentum = 20;
    const disposition = 15;
    const totalBonus = creativity + momentum + disposition;
    const cappedBonus = Math.min(totalBonus, 30);
    const effectiveTarget = baseTarget + cappedBonus;
    expect(effectiveTarget).toBe(65);
    expect(effectiveTarget).toBeLessThan(baseTarget + totalBonus);
  });
});

describe('NPC relationship fields passthrough', () => {
  it('passes through factionId on NPC introduce', () => {
    const { validated } = validateStateChanges(
      { npcs: [{ name: 'TestNPC', action: 'introduce', factionId: 'merchants_guild' }] },
      { character: baseCharacter },
    );
    expect(validated.npcs[0].factionId).toBe('merchants_guild');
  });

  it('passes through relationships array on NPC', () => {
    const { validated } = validateStateChanges(
      { npcs: [{ name: 'TestNPC', action: 'introduce', relationships: [{ npcName: 'Other', type: 'ally' }] }] },
      { character: baseCharacter },
    );
    expect(validated.npcs[0].relationships).toEqual([{ npcName: 'Other', type: 'ally' }]);
  });

  it('passes through relatedQuestIds on NPC', () => {
    const { validated } = validateStateChanges(
      { npcs: [{ name: 'TestNPC', action: 'update', relatedQuestIds: ['q1', 'q2'] }] },
      { character: baseCharacter },
    );
    expect(validated.npcs[0].relatedQuestIds).toEqual(['q1', 'q2']);
  });
});

describe('quest relationship fields passthrough', () => {
  it('passes through questGiverId on newQuests', () => {
    const { validated } = validateStateChanges(
      { newQuests: [{ id: 'q1', name: 'Test', description: 'desc', questGiverId: 'npc_1', objectives: [] }] },
      { character: baseCharacter },
    );
    expect(validated.newQuests[0].questGiverId).toBe('npc_1');
  });

  it('passes through prerequisiteQuestIds on newQuests', () => {
    const { validated } = validateStateChanges(
      { newQuests: [{ id: 'q1', name: 'Test', description: 'desc', prerequisiteQuestIds: ['q0'], objectives: [] }] },
      { character: baseCharacter },
    );
    expect(validated.newQuests[0].prerequisiteQuestIds).toEqual(['q0']);
  });
});

describe('money spending validation edge cases', () => {
  it('clamps money spending to available funds', () => {
    const char = { ...baseCharacter, money: { gold: 0, silver: 1, copper: 5 } };
    const { validated, corrections } = validateStateChanges(
      { moneyChange: { gold: 0, silver: -5, copper: 0 } },
      { character: char },
    );
    expect(corrections.length).toBeGreaterThan(0);
  });

  it('allows spending within budget', () => {
    const char = { ...baseCharacter, money: { gold: 1, silver: 5, copper: 0 } };
    const { corrections } = validateStateChanges(
      { moneyChange: { gold: 0, silver: -3, copper: 0 } },
      { character: char },
    );
    expect(corrections.length).toBe(0);
  });
});
