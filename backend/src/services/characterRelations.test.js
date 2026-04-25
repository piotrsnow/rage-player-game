import { describe, it, expect } from 'vitest';
import {
  reconstructCharacterSnapshot,
  splitCharacterSnapshot,
  clearStaleEquipped,
} from './characterRelations.js';

// Pure-function tests for the F4 row ↔ snapshot bridge. Persistence helpers
// (loadCharacterSnapshot / persistCharacterSnapshot / createCharacterWithRelations)
// are exercised by integration tests in routes/characters and the scene
// generator end-to-end suite.

describe('reconstructCharacterSnapshot', () => {
  it('returns null for null/undefined input', () => {
    expect(reconstructCharacterSnapshot(null)).toBeNull();
    expect(reconstructCharacterSnapshot(undefined)).toBeNull();
  });

  it('folds skills relation into a name → {level, xp, cap} map', () => {
    const row = {
      id: 'c1',
      characterSkills: [
        { skillName: 'walka_mieczem', level: 3, xp: 10, cap: 10 },
        { skillName: 'percepcja', level: 1, xp: 0, cap: 10 },
      ],
      inventoryItems: [],
      materials: [],
    };
    const out = reconstructCharacterSnapshot(row);
    expect(out.skills).toEqual({
      walka_mieczem: { level: 3, xp: 10, cap: 10 },
      percepcja: { level: 1, xp: 0, cap: 10 },
    });
    expect(out.characterSkills).toBeUndefined();
  });

  it('folds inventory relation into items keyed by itemKey-as-id and spreads props back to flat fields', () => {
    const row = {
      id: 'c1',
      characterSkills: [],
      inventoryItems: [
        {
          itemKey: 'miecz',
          displayName: 'Miecz',
          baseType: 'weapon',
          quantity: 2,
          props: { damage: 5, weight: 3 },
          imageUrl: 'http://img/miecz.png',
          addedAt: new Date('2026-04-25'),
        },
      ],
      materials: [],
      equippedMainHand: null,
      equippedOffHand: null,
      equippedArmour: null,
    };
    const out = reconstructCharacterSnapshot(row);
    expect(out.inventory).toHaveLength(1);
    expect(out.inventory[0]).toMatchObject({
      id: 'miecz',
      name: 'Miecz',
      baseType: 'weapon',
      quantity: 2,
      damage: 5,
      weight: 3,
      imageUrl: 'http://img/miecz.png',
    });
    // props is preserved as a separate field for callers that want raw access
    expect(out.inventory[0].props).toEqual({ damage: 5, weight: 3 });
  });

  it('builds the {mainHand, offHand, armour} object from the three text columns', () => {
    const row = {
      id: 'c1',
      characterSkills: [],
      inventoryItems: [],
      materials: [],
      equippedMainHand: 'miecz',
      equippedOffHand: 'tarcza',
      equippedArmour: null,
    };
    const out = reconstructCharacterSnapshot(row);
    expect(out.equipped).toEqual({ mainHand: 'miecz', offHand: 'tarcza', armour: null });
    // The raw equippedFoo columns are stripped from the snapshot
    expect(out.equippedMainHand).toBeUndefined();
    expect(out.equippedOffHand).toBeUndefined();
    expect(out.equippedArmour).toBeUndefined();
  });

  it('folds materials into the FE-shape materialBag array', () => {
    const row = {
      id: 'c1',
      characterSkills: [],
      inventoryItems: [],
      materials: [
        { materialKey: 'skora', displayName: 'Skóra', quantity: 5 },
        { materialKey: 'drewno', displayName: 'Drewno', quantity: 12 },
      ],
    };
    const out = reconstructCharacterSnapshot(row);
    expect(out.materialBag).toEqual([
      { name: 'Skóra', quantity: 5 },
      { name: 'Drewno', quantity: 12 },
    ]);
  });
});

describe('splitCharacterSnapshot', () => {
  it('splits the FE-shape snapshot into Postgres rows ready for createMany', () => {
    const snapshot = {
      name: 'Hero',
      attributes: { sila: 10 },
      skills: {
        walka_mieczem: { level: 3, xp: 10, cap: 10 },
      },
      inventory: [
        { id: 'miecz', name: 'Miecz', baseType: 'weapon', quantity: 1, damage: 5 },
      ],
      materialBag: [{ name: 'Skóra', quantity: 5 }],
      equipped: { mainHand: 'miecz', offHand: null, armour: null },
    };
    const { scalars, skillRows, inventoryRows, materialRows } = splitCharacterSnapshot(snapshot);
    expect(scalars).toMatchObject({
      name: 'Hero',
      attributes: { sila: 10 },
      equippedMainHand: 'miecz',
      equippedOffHand: null,
      equippedArmour: null,
    });
    // skills/inventory/materialBag should NOT round-trip as scalar columns
    expect(scalars.skills).toBeUndefined();
    expect(scalars.inventory).toBeUndefined();
    expect(scalars.materialBag).toBeUndefined();
    expect(scalars.equipped).toBeUndefined();
    expect(skillRows).toEqual([{ skillName: 'walka_mieczem', level: 3, xp: 10, cap: 10 }]);
    expect(inventoryRows).toEqual([{
      itemKey: 'miecz',
      displayName: 'Miecz',
      baseType: 'weapon',
      quantity: 1,
      props: { damage: 5 },
      imageUrl: null,
    }]);
    expect(materialRows).toEqual([{ materialKey: 'skora', displayName: 'Skóra', quantity: 5 }]);
  });

  it('stacks duplicate-by-name inventory entries into one row with summed quantity', () => {
    const snapshot = {
      inventory: [
        { name: 'Mikstura Życia', quantity: 1 },
        { name: 'mikstura życia', quantity: 2 },
        { name: 'Mikstura Życia', quantity: 1 },
      ],
    };
    const { inventoryRows } = splitCharacterSnapshot(snapshot);
    expect(inventoryRows).toHaveLength(1);
    expect(inventoryRows[0]).toMatchObject({
      itemKey: 'mikstura_zycia',
      displayName: 'Mikstura Życia',
      quantity: 4,
    });
  });

  it('captures arbitrary AI-emitted fields into props JSONB', () => {
    const snapshot = {
      inventory: [
        { name: 'Talizman', quantity: 1, magic: true, lore: 'glows in the dark' },
      ],
    };
    const { inventoryRows } = splitCharacterSnapshot(snapshot);
    expect(inventoryRows[0].props).toEqual({ magic: true, lore: 'glows in the dark' });
  });
});

describe('clearStaleEquipped', () => {
  it('nulls equipped slot whose itemKey is not in inventory', () => {
    const snapshot = {
      equipped: { mainHand: 'ghost_sword', offHand: 'tarcza', armour: null },
      inventory: [{ id: 'tarcza', name: 'Tarcza', quantity: 1 }],
    };
    clearStaleEquipped(snapshot);
    expect(snapshot.equipped).toEqual({ mainHand: null, offHand: 'tarcza', armour: null });
  });

  it('leaves all slots intact when every reference is live', () => {
    const snapshot = {
      equipped: { mainHand: 'miecz', offHand: 'tarcza', armour: 'kolczuga' },
      inventory: [
        { id: 'miecz' }, { id: 'tarcza' }, { id: 'kolczuga' },
      ],
    };
    clearStaleEquipped(snapshot);
    expect(snapshot.equipped).toEqual({ mainHand: 'miecz', offHand: 'tarcza', armour: 'kolczuga' });
  });
});
