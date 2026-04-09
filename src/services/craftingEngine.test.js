import { describe, expect, it, vi } from 'vitest';

vi.mock('./gameState.js', async () => {
  const actual = await vi.importActual('./gameState.js');
  return {
    ...actual,
    rollD50: vi.fn(() => 25),
    rollPercentage: vi.fn(() => 99),
  };
});

import { rollD50 } from './gameState.js';
import { getAvailableRecipes, resolveCrafting, CRAFTING_TIERS } from './craftingEngine.js';

// ── Fixtures ──

const mockRecipe = {
  name: 'Forge Hand Weapon',
  requiredSkill: 'Rzemioslo',
  requiredMaterials: [
    { name: 'Iron ingot', quantity: 2 },
    { name: 'Charcoal', quantity: 3 },
    { name: 'Leather wrap', quantity: 1 },
  ],
  resultItem: { name: 'Hand Weapon', type: 'weapon', rarity: 'common' },
  difficulty: 'hard',
  time: 16,
};

function makeCharacter(inteligencja = 12, rzemiosloLevel = 5) {
  return {
    attributes: { sila: 10, inteligencja, charyzma: 10, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5 },
    skills: { Rzemioslo: { level: rzemiosloLevel, xp: 0, cap: 10 } },
    inventory: [
      { name: 'Iron ingot', quantity: 5 },
      { name: 'Charcoal', quantity: 10 },
      { name: 'Leather wrap', quantity: 2 },
    ],
  };
}

// ── Tests ──

describe('getAvailableRecipes', () => {
  it('marks recipe as craftable when materials are available', () => {
    const char = makeCharacter();
    const recipes = getAvailableRecipes(char.inventory, char.skills, [mockRecipe]);

    expect(recipes).toHaveLength(1);
    expect(recipes[0].canCraft).toBe(true);
    expect(recipes[0].missingMaterials).toHaveLength(0);
  });

  it('marks recipe as not craftable when materials are missing', () => {
    const char = makeCharacter();
    char.inventory = [{ name: 'Iron ingot', quantity: 1 }]; // only 1 of 2 needed
    const recipes = getAvailableRecipes(char.inventory, char.skills, [mockRecipe]);

    expect(recipes[0].canCraft).toBe(false);
    expect(recipes[0].missingMaterials.length).toBeGreaterThan(0);
  });

  it('marks recipe as not craftable when skill is 0', () => {
    const char = makeCharacter(12, 0);
    const recipes = getAvailableRecipes(char.inventory, char.skills, [mockRecipe]);
    expect(recipes[0].canCraft).toBe(false);
  });

  it('shows material status for each ingredient', () => {
    const char = makeCharacter();
    const recipes = getAvailableRecipes(char.inventory, char.skills, [mockRecipe]);
    const ironStatus = recipes[0].materialStatus.find((m) => m.name === 'Iron ingot');

    expect(ironStatus.need).toBe(2);
    expect(ironStatus.have).toBe(5);
    expect(ironStatus.satisfied).toBe(true);
  });
});

describe('resolveCrafting', () => {
  it('returns success with high roll', () => {
    rollD50.mockReturnValueOnce(40); // high roll
    const char = makeCharacter(15, 8);
    const result = resolveCrafting(char, mockRecipe, 5);

    expect(result.success).toBe(true);
    expect(result.resultItem).not.toBeNull();
    expect(result.resultItem.name).toBe('Hand Weapon');
    expect(result.stateChanges.newItems).toHaveLength(1);
    expect(result.stateChanges.skillProgress.Rzemioslo).toBeGreaterThan(0);
  });

  it('returns critical success with very high roll', () => {
    rollD50.mockReturnValueOnce(50); // max roll
    const char = makeCharacter(20, 15);
    const result = resolveCrafting(char, mockRecipe, 10);

    expect(result.tier).toBe(CRAFTING_TIERS.CRITICAL_SUCCESS);
    expect(result.resultItem.quality).toBe('superior');
  });

  it('returns failure with low roll', () => {
    rollD50.mockReturnValueOnce(1); // min roll
    const char = makeCharacter(5, 1);
    const result = resolveCrafting(char, mockRecipe, -5);

    expect(result.success).toBe(false);
    expect(result.resultItem).toBeNull();
  });

  it('partial failure consumes 50% materials (rounded up)', () => {
    rollD50.mockReturnValueOnce(10);
    const char = makeCharacter(8, 2);
    const result = resolveCrafting(char, mockRecipe, -5);

    if (result.tier === CRAFTING_TIERS.PARTIAL_FAILURE) {
      const ironConsumed = result.materialsConsumed.find((m) => m.name === 'Iron ingot');
      expect(ironConsumed.quantity).toBe(1); // ceil(2/2) = 1
      const charcoalConsumed = result.materialsConsumed.find((m) => m.name === 'Charcoal');
      expect(charcoalConsumed.quantity).toBe(2); // ceil(3/2) = 2
    }
  });

  it('critical failure consumes all materials', () => {
    rollD50.mockReturnValueOnce(1);
    const char = makeCharacter(3, 1);
    const result = resolveCrafting(char, mockRecipe, -10);

    if (result.tier === CRAFTING_TIERS.CRITICAL_FAILURE) {
      const ironConsumed = result.materialsConsumed.find((m) => m.name === 'Iron ingot');
      expect(ironConsumed.quantity).toBe(2);
    }
  });
});
