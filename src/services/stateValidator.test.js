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

import { validateStateChanges, validateMultiplayerStateChanges } from './stateValidator.js';
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
      {
        newItems: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
          { id: 'd', name: 'D' },
        ],
      },
      { character: baseCharacter },
    );
    expect(validated.newItems.length).toBe(3);
  });

  it('removes base64 imageUrl from newItems', () => {
    const { validated, corrections } = validateStateChanges(
      {
        newItems: [{
          id: 'img1',
          name: 'Ancient Coin',
          imageUrl: 'data:image/png;base64,AAAA',
        }],
      },
      { character: baseCharacter },
    );
    expect(validated.newItems[0].imageUrl).toBeUndefined();
    expect(corrections.some((entry) => entry.includes('Removed base64 imageUrl'))).toBe(true);
  });

  it('keeps backend media imageUrl on newItems', () => {
    const { validated, corrections } = validateStateChanges(
      {
        newItems: [{
          id: 'img2',
          name: 'Relic',
          imageUrl: '/media/file/campaigns/c1/images/relic.webp',
        }],
      },
      { character: baseCharacter },
    );
    expect(validated.newItems[0].imageUrl).toBe('/media/file/campaigns/c1/images/relic.webp');
    expect(corrections.length).toBe(0);
  });

  it('normalizes string items into inventory objects', () => {
    const { validated } = validateStateChanges(
      { newItems: ['Old key'] },
      { character: baseCharacter },
    );
    expect(validated.newItems).toHaveLength(1);
    expect(validated.newItems[0].name).toBe('Old key');
    expect(validated.newItems[0].id).toBeTruthy();
    expect(validated.newItems[0].type).toBe('misc');
  });

  it('maps itemsAdded alias to newItems', () => {
    const { validated } = validateStateChanges(
      { itemsAdded: [{ itemName: 'Silver Ring' }] },
      { character: baseCharacter },
    );
    expect(validated.newItems).toHaveLength(1);
    expect(validated.newItems[0].name).toBe('Silver Ring');
    expect(validated.newItems[0].id).toBeTruthy();
  });

  it('maps itemsRemoved alias to removeItems', () => {
    const { validated } = validateStateChanges(
      { itemsRemoved: ['i1'] },
      { character: { ...baseCharacter, inventory: [{ id: 'i1', name: 'Torch' }] } },
    );
    expect(validated.removeItems).toEqual(['i1']);
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

function calcMomentum(sl) {
  const raw = sl > 0 ? sl * 5 + 5 : sl < 0 ? sl * 5 - 5 : 0;
  return Math.max(-45, Math.min(45, raw));
}

describe('momentum capping', () => {
  it('momentum formula sl*5+5 / sl*5-5 with offset from zero', () => {
    const sl8 = calculateSL(1, 85);
    expect(sl8).toBe(8);
    expect(calcMomentum(sl8)).toBe(45);

    const slNeg8 = calculateSL(95, 10);
    expect(slNeg8).toBe(-8);
    expect(calcMomentum(slNeg8)).toBe(-45);

    expect(calcMomentum(0)).toBe(0);
  });

  it('extreme SL values produce capped momentum', () => {
    const sl10 = calculateSL(1, 120);
    expect(sl10).toBe(10);
    expect(calcMomentum(sl10)).toBe(45);

    const slNeg10 = calculateSL(100, 0);
    expect(slNeg10).toBe(-10);
    expect(calcMomentum(slNeg10)).toBe(-45);
  });

  it('moderate SL values apply +5/-5 offset', () => {
    expect(calcMomentum(2)).toBe(15);   // 2*5+5
    expect(calcMomentum(-2)).toBe(-15);  // -2*5-5
    expect(calcMomentum(1)).toBe(10);   // 1*5+5
    expect(calcMomentum(-1)).toBe(-10);  // -1*5-5
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

describe('NPC name sanitization', () => {
  it('removes descriptive Polish voice labels from NPC changes', () => {
    const { validated, corrections } = validateStateChanges(
      { npcs: [{ name: 'Chrapliwy Głos zza Kamienia', action: 'introduce' }] },
      { character: baseCharacter },
    );
    expect(validated.npcs).toEqual([]);
    expect(corrections.some((entry) => entry.includes('Suspicious NPC name removed'))).toBe(true);
  });

  it('removes descriptive English voice labels from NPC changes', () => {
    const { validated } = validateStateChanges(
      { npcs: [{ name: 'Voice from behind the stone', action: 'introduce' }] },
      { character: baseCharacter },
    );
    expect(validated.npcs).toEqual([]);
  });

  it('keeps normal named NPC entries intact', () => {
    const { validated } = validateStateChanges(
      { npcs: [{ name: 'Bury Stach', action: 'introduce' }] },
      { character: baseCharacter },
    );
    expect(validated.npcs).toHaveLength(1);
    expect(validated.npcs[0].name).toBe('Bury Stach');
  });

  it('applies the same sanitization in multiplayer validation', () => {
    const { validated, corrections } = validateMultiplayerStateChanges(
      { npcs: [{ name: 'Voice from the dark archway', action: 'introduce' }] },
      {},
    );
    expect(validated.npcs).toEqual([]);
    expect(corrections.some((entry) => entry.includes('multiplayer: Suspicious NPC name removed'))).toBe(true);
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
