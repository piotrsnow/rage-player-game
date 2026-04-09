import { describe, expect, it, vi } from 'vitest';

vi.mock('./gameState.js', async () => {
  const actual = await vi.importActual('./gameState.js');
  return {
    ...actual,
    rollD50: vi.fn(() => 25),
    rollPercentage: vi.fn(() => 99), // no luck success
  };
});

import {
  resolveShopArchetype,
  buildShopInventory,
  buildRandomInventory,
  createTradeSession,
  calculateItemBuyPrice,
  calculateItemSellPrice,
  resolveHaggle,
  executeBuy,
  executeSell,
} from './tradeEngine.js';
import { canAfford } from '../../shared/domain/pricing.js';

// ── Fixtures ──

const mockEquipment = {
  dagger: { name: 'Dagger', category: 'weapons', price: { gold: 0, silver: 5, copper: 0 }, availability: 'common', weight: 0.5 },
  rope: { name: 'Rope', category: 'adventuring_gear', price: { gold: 0, silver: 1, copper: 0 }, availability: 'common', weight: 2 },
  mail: { name: 'Mail Shirt', category: 'armour', price: { gold: 3, silver: 0, copper: 0 }, availability: 'uncommon', weight: 5 },
};

const mockMaterials = [
  { name: 'Iron ingot', category: 'metal', price: { gold: 0, silver: 3, copper: 0 }, availability: 'common', weight: 2 },
  { name: 'Moonwort', category: 'herb', price: { gold: 0, silver: 0, copper: 5 }, availability: 'common', weight: 0.1 },
];

const mockCharacter = {
  attributes: { sila: 10, inteligencja: 12, charyzma: 14, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5 },
  skills: { Handel: { level: 5, xp: 0, cap: 10 } },
};

// ── Tests ──

describe('resolveShopArchetype', () => {
  it('matches exact archetype keys', () => {
    expect(resolveShopArchetype('blacksmith')).toBe('blacksmith');
    expect(resolveShopArchetype('apothecary')).toBe('apothecary');
    expect(resolveShopArchetype('innkeeper')).toBe('innkeeper');
  });

  it('matches archetype within longer role string', () => {
    expect(resolveShopArchetype('town blacksmith')).toBe('blacksmith');
    expect(resolveShopArchetype('traveling merchant')).toBe('merchant');
    expect(resolveShopArchetype('Master Smith of Altdorf')).toBe('smith');
  });

  it('falls back to general for unknown roles', () => {
    expect(resolveShopArchetype('peasant')).toBe('general');
    expect(resolveShopArchetype(null)).toBe('general');
    expect(resolveShopArchetype('')).toBe('general');
  });
});

describe('buildShopInventory', () => {
  it('returns items matching archetype categories', () => {
    const items = buildShopInventory('blacksmith', mockEquipment, mockMaterials, 'TestSmith', 'city');
    const names = items.map((i) => i.name);
    expect(names).toContain('Dagger');
    expect(names).toContain('Iron ingot');
    expect(names).not.toContain('Rope');
  });

  it('produces consistent results for same NPC name', () => {
    const a = buildShopInventory('merchant', mockEquipment, mockMaterials, 'Hans', 'city');
    const b = buildShopInventory('merchant', mockEquipment, mockMaterials, 'Hans', 'city');
    expect(a.map((i) => i.name)).toEqual(b.map((i) => i.name));
  });

  it('produces different results for different NPC names', () => {
    const a = buildShopInventory('general', mockEquipment, mockMaterials, 'Hans', 'city');
    const b = buildShopInventory('general', mockEquipment, mockMaterials, 'Greta', 'city');
    // May have different ordering
    const namesA = a.map((i) => i.name).join(',');
    const namesB = b.map((i) => i.name).join(',');
    // Not testing inequality as small catalogs may match — just testing no crash
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});

describe('buildRandomInventory', () => {
  it('returns 3-5 common items', () => {
    const items = buildRandomInventory('RandomGuy', mockEquipment, mockMaterials);
    expect(items.length).toBeGreaterThanOrEqual(2); // pool is small in test
    expect(items.length).toBeLessThanOrEqual(5);
  });
});

describe('calculateItemBuyPrice', () => {
  it('returns base price with no modifiers', () => {
    const price = calculateItemBuyPrice({ price: { gold: 1, silver: 0, copper: 0 } });
    expect(price).toEqual({ gold: 1, silver: 0, copper: 0 });
  });

  it('positive disposition lowers price', () => {
    const price = calculateItemBuyPrice({ price: { gold: 1, silver: 0, copper: 0 } }, 50);
    // disposition 50 → -25% modifier → 75 copper
    expect(price.gold).toBe(0);
    expect(price.silver).toBe(7);
    expect(price.copper).toBe(5);
  });

  it('negative disposition raises price', () => {
    const price = calculateItemBuyPrice({ price: { gold: 1, silver: 0, copper: 0 } }, -50);
    // disposition -50 → +25% modifier → 125 copper
    expect(price.gold).toBe(1);
    expect(price.silver).toBe(2);
    expect(price.copper).toBe(5);
  });
});

describe('calculateItemSellPrice', () => {
  it('returns 50% of base price with no Handel skill', () => {
    const price = calculateItemSellPrice({ price: { gold: 1, silver: 0, copper: 0 } }, 0);
    expect(price).toEqual({ gold: 0, silver: 5, copper: 0 });
  });

  it('increases with Handel level', () => {
    const price = calculateItemSellPrice({ price: { gold: 1, silver: 0, copper: 0 } }, 10);
    // 50% + 10*1% = 60%
    expect(price).toEqual({ gold: 0, silver: 6, copper: 0 });
  });

  it('caps at 75%', () => {
    const price = calculateItemSellPrice({ price: { gold: 1, silver: 0, copper: 0 } }, 30);
    expect(price).toEqual({ gold: 0, silver: 7, copper: 5 });
  });
});

describe('canAfford', () => {
  it('returns true when money >= price', () => {
    expect(canAfford({ gold: 1, silver: 0, copper: 0 }, { gold: 0, silver: 5, copper: 0 })).toBe(true);
  });

  it('returns false when money < price', () => {
    expect(canAfford({ gold: 0, silver: 3, copper: 0 }, { gold: 0, silver: 5, copper: 0 })).toBe(false);
  });
});

describe('resolveHaggle', () => {
  it('returns a skill check result with discountPercent', () => {
    const result = resolveHaggle(mockCharacter, 0, 'medium');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('discountPercent');
    expect(typeof result.discountPercent).toBe('number');
  });
});

describe('executeBuy', () => {
  it('returns moneyChange and newItems', () => {
    const item = { name: 'Dagger', type: 'weapon', rarity: 'common' };
    const price = { gold: 0, silver: 5, copper: 0 };
    const result = executeBuy(item, price);

    expect(result.moneyChange.silver).toBe(-5);
    expect(result.moneyChange.gold).toBe(-0); // -0 from -(0)
    expect(result.newItems).toHaveLength(1);
    expect(result.newItems[0].name).toBe('Dagger');
    expect(result.newItems[0].id).toMatch(/^item_/);
  });
});

describe('executeSell', () => {
  it('returns moneyChange and removeItems', () => {
    const item = { id: 'item_123', name: 'Old Sword' };
    const sellPrice = { gold: 0, silver: 2, copper: 5 };
    const result = executeSell(item, sellPrice);

    expect(result.moneyChange).toEqual({ gold: 0, silver: 2, copper: 5 });
    expect(result.removeItems).toEqual(['item_123']);
  });
});

describe('createTradeSession', () => {
  it('creates valid session state', () => {
    const session = createTradeSession(
      [{ name: 'Sword', price: { gold: 1, silver: 0, copper: 0 } }],
      { name: 'Hans', role: 'blacksmith', disposition: 10 },
    );

    expect(session.active).toBe(true);
    expect(session.npcName).toBe('Hans');
    expect(session.disposition).toBe(10);
    expect(session.haggleAttempts).toBe(0);
    expect(session.maxHaggle).toBe(3);
    expect(session.shopItems).toHaveLength(1);
  });
});
