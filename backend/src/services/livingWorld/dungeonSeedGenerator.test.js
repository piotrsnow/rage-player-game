import { describe, it, expect } from 'vitest';
import {
  hashSeed, createRng, rngInt, rngPick, rngWeightedPick, rollDice,
  generateRoomGraph, populateRooms,
} from './dungeonSeedGenerator.js';

describe('dungeonSeedGenerator — RNG', () => {
  it('hashSeed is deterministic across calls', () => {
    expect(hashSeed('dungeon_42')).toBe(hashSeed('dungeon_42'));
    expect(hashSeed('dungeon_42')).not.toBe(hashSeed('dungeon_43'));
  });

  it('createRng produces same sequence from same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
  });

  it('rngInt respects bounds', () => {
    const rng = createRng(42);
    for (let i = 0; i < 50; i++) {
      const v = rngInt(rng, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('rngPick returns element from array', () => {
    const rng = createRng(99);
    const arr = ['a', 'b', 'c'];
    const picked = rngPick(rng, arr);
    expect(arr).toContain(picked);
  });

  it('rngPick returns null on empty array', () => {
    expect(rngPick(createRng(1), [])).toBeNull();
    expect(rngPick(createRng(1), null)).toBeNull();
  });

  it('rngWeightedPick respects weights (smoke test)', () => {
    const rng = createRng(7);
    const entries = [
      { name: 'rare', weight: 1 },
      { name: 'common', weight: 9 },
    ];
    const counts = { rare: 0, common: 0 };
    for (let i = 0; i < 1000; i++) {
      const r2 = createRng(i);
      counts[rngWeightedPick(r2, entries).name]++;
    }
    // common should dominate — expect > 70%, < 100%
    expect(counts.common).toBeGreaterThan(700);
    expect(counts.rare).toBeGreaterThan(50);
  });

  it('rollDice parses "2d6" correctly', () => {
    const rng = createRng(5);
    for (let i = 0; i < 20; i++) {
      const v = rollDice(rng, '2d6');
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(12);
    }
  });

  it('rollDice handles "1d4+2"', () => {
    const rng = createRng(5);
    for (let i = 0; i < 20; i++) {
      const v = rollDice(rng, '1d4+2');
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('rollDice falls back to 1 on garbage', () => {
    expect(rollDice(createRng(1), 'garbage')).toBe(1);
    expect(rollDice(createRng(1), null)).toBe(1);
  });

  it('rollDice preserves numbers', () => {
    expect(rollDice(createRng(1), 5)).toBe(5);
  });
});

describe('dungeonSeedGenerator — generateRoomGraph', () => {
  it('small size picks a template with boss + entrance', () => {
    const rooms = generateRoomGraph(createRng(1), 'small');
    expect(rooms.length).toBeGreaterThanOrEqual(4);
    expect(rooms[0].role).toBe('entrance');
    expect(rooms.some((r) => r.role === 'boss')).toBe(true);
  });

  it('medium produces chain within room count range', () => {
    const rooms = generateRoomGraph(createRng(2), 'medium');
    expect(rooms.length).toBeGreaterThanOrEqual(12);
    expect(rooms.length).toBeLessThanOrEqual(20);
    expect(rooms[0].role).toBe('entrance');
    expect(rooms[rooms.length - 1].role).toBe('boss');
  });

  it('same seed produces identical graph (determinism)', () => {
    const a = generateRoomGraph(createRng(42), 'medium');
    const b = generateRoomGraph(createRng(42), 'medium');
    expect(a).toEqual(b);
  });

  it('every room has at least one exit (no orphans)', () => {
    const rooms = generateRoomGraph(createRng(3), 'medium');
    for (const room of rooms) {
      expect(room.exits.length).toBeGreaterThan(0);
    }
  });
});

describe('dungeonSeedGenerator — populateRooms', () => {
  it('boss room always has enemies + loot', () => {
    const rooms = generateRoomGraph(createRng(10), 'small');
    populateRooms({ rooms, theme: 'catacomb', difficulty: 'medium', rng: createRng(10) });
    const boss = rooms.find((r) => r.role === 'boss');
    expect(boss.contents.enemies.length).toBeGreaterThan(0);
    expect(boss.contents.loot.length).toBeGreaterThanOrEqual(1);
  });

  it('treasure room always has loot', () => {
    const rooms = generateRoomGraph(createRng(11), 'small');
    populateRooms({ rooms, theme: 'catacomb', difficulty: 'medium', rng: createRng(11) });
    const treasure = rooms.find((r) => r.role === 'treasure');
    if (treasure) {
      expect(treasure.contents.loot.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('same seed produces identical populated rooms (determinism)', () => {
    const rooms1 = generateRoomGraph(createRng(100), 'small');
    populateRooms({ rooms: rooms1, theme: 'cave', difficulty: 'hard', rng: createRng(100) });

    const rooms2 = generateRoomGraph(createRng(100), 'small');
    populateRooms({ rooms: rooms2, theme: 'cave', difficulty: 'hard', rng: createRng(100) });

    expect(rooms1).toEqual(rooms2);
  });

  it('puzzle rooms have a puzzle populated', () => {
    const rooms = generateRoomGraph(createRng(200), 'small');
    populateRooms({ rooms, theme: 'catacomb', difficulty: 'medium', rng: createRng(200) });
    const puzzleRoom = rooms.find((r) => r.role === 'puzzle');
    if (puzzleRoom) {
      expect(puzzleRoom.contents.puzzle).toBeTruthy();
      expect(puzzleRoom.contents.puzzle.id).toBeTruthy();
    }
  });

  it('every room gets a flavorSeed (i18n map)', () => {
    const rooms = generateRoomGraph(createRng(300), 'small');
    populateRooms({ rooms, theme: 'cave', difficulty: 'easy', rng: createRng(300) });
    for (const room of rooms) {
      expect(room.contents.flavorSeed).toBeTruthy();
      expect(typeof room.contents.flavorSeed).toBe('object');
      expect(typeof room.contents.flavorSeed.pl).toBe('string');
      expect(room.contents.flavorSeed.pl.length).toBeGreaterThan(10);
      expect(typeof room.contents.flavorSeed.en).toBe('string');
      expect(room.contents.flavorSeed.en.length).toBeGreaterThan(10);
    }
  });

  it('state flags default to false', () => {
    const rooms = generateRoomGraph(createRng(400), 'small');
    populateRooms({ rooms, theme: 'catacomb', difficulty: 'easy', rng: createRng(400) });
    for (const room of rooms) {
      expect(room.contents.entryCleared).toBe(false);
      expect(room.contents.trapSprung).toBe(false);
      expect(room.contents.lootTaken).toBe(false);
    }
  });
});
