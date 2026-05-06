// Unit tests for npcMatcher.js — matchActorsToPlaces + findPlayerStart.

import { describe, it, expect } from 'vitest';
import { matchActorsToPlaces, findPlayerStart } from './npcMatcher.js';

// Deterministic RNG — cycles through provided values, then defaults to 0.
function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe('matchActorsToPlaces', () => {
  const actorA = { id: 'a', tags: ['merchant', 'friendly'] };
  const actorB = { id: 'b', tags: ['guard'] };
  const actorC = { id: 'c', tags: ['wolf', 'hostile'] };

  it('returns [] for bad input', () => {
    expect(matchActorsToPlaces({})).toEqual([]);
    expect(matchActorsToPlaces({ objects: null, mapNpcs: [], actors: [] })).toEqual([]);
    expect(matchActorsToPlaces({ objects: [], mapNpcs: null, actors: [] })).toEqual([]);
    expect(matchActorsToPlaces({ objects: [], mapNpcs: [], actors: null })).toEqual([]);
  });

  it('returns [] when there are no npc_place markers', () => {
    const result = matchActorsToPlaces({
      objects: [{ kind: 'player_start', x: 0, y: 0 }],
      mapNpcs: [{ actorId: 'a' }],
      actors: [actorA],
    });
    expect(result).toEqual([]);
  });

  it('spawns an actor whose tags match the place tags', () => {
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 4, y: 5,
        data: { tags: ['merchant'], minCount: 1, maxCount: 1 },
      }],
      mapNpcs: [{ actorId: 'a' }, { actorId: 'b' }],
      actors: [actorA, actorB],
      rng: () => 0, // picks first in pool
    });
    expect(result).toHaveLength(1);
    expect(result[0].actor.id).toBe('a');
    expect(result[0].x).toBe(4);
    expect(result[0].y).toBe(5);
    expect(result[0].dir).toBe('down');
  });

  it('skips places with an empty pool (no tag intersection)', () => {
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 0, y: 0,
        data: { tags: ['wizard'], minCount: 1, maxCount: 1 },
      }],
      mapNpcs: [{ actorId: 'a' }, { actorId: 'b' }],
      actors: [actorA, actorB],
      rng: () => 0,
    });
    expect(result).toEqual([]);
  });

  it('admits all actors when the place has no tag filter', () => {
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 0, y: 0,
        data: { tags: [], minCount: 1, maxCount: 1 },
      }],
      mapNpcs: [{ actorId: 'a' }, { actorId: 'b' }, { actorId: 'c' }],
      actors: [actorA, actorB, actorC],
      rng: () => 0,
    });
    expect(result).toHaveLength(1);
  });

  it('honours mapNpc.tagsRequired against place tags', () => {
    // NPC a requires 'special', which the place lacks → excluded.
    // NPC b's tagsRequired matches 'merchant' → included.
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 0, y: 0,
        data: { tags: ['merchant'], minCount: 1, maxCount: 1 },
      }],
      mapNpcs: [
        { actorId: 'a', tagsRequired: ['special'] },
        { actorId: 'b', tagsRequired: ['merchant'] },
      ],
      actors: [
        { id: 'a', tags: ['merchant'] },
        { id: 'b', tags: ['merchant'] },
      ],
      rng: () => 0,
    });
    expect(result).toHaveLength(1);
    expect(result[0].actor.id).toBe('b');
  });

  it('always spawns exactly minCount when spawnChance is 0', () => {
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 2, y: 2,
        data: { tags: ['merchant'], minCount: 2, maxCount: 5, spawnChance: 0 },
      }],
      mapNpcs: [{ actorId: 'a' }],
      actors: [actorA],
      rng: () => 0.99, // would block any extra spawn
    });
    expect(result).toHaveLength(2);
  });

  it('reaches maxCount when spawnChance is 1', () => {
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 0, y: 0,
        data: { tags: ['merchant'], minCount: 0, maxCount: 3, spawnChance: 1 },
      }],
      mapNpcs: [{ actorId: 'a' }],
      actors: [actorA],
      rng: () => 0, // always < 1
    });
    expect(result).toHaveLength(3);
  });

  it('maxCount is clamped to at least minCount', () => {
    // maxCount below minCount should not cause fewer than minCount spawns.
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 0, y: 0,
        data: { tags: ['merchant'], minCount: 3, maxCount: 1, spawnChance: 0 },
      }],
      mapNpcs: [{ actorId: 'a' }],
      actors: [actorA],
      rng: () => 0.99,
    });
    expect(result).toHaveLength(3);
  });

  it('skips place when the combined count is zero', () => {
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 0, y: 0,
        data: { tags: ['merchant'], minCount: 0, maxCount: 2, spawnChance: 0 },
      }],
      mapNpcs: [{ actorId: 'a' }],
      actors: [actorA],
      rng: () => 0.99, // none of the optional slots fire
    });
    expect(result).toEqual([]);
  });

  it('ignores assignments whose actor is missing from the actors list', () => {
    const result = matchActorsToPlaces({
      objects: [{
        kind: 'npc_place',
        x: 0, y: 0,
        data: { tags: ['merchant'], minCount: 1, maxCount: 1 },
      }],
      mapNpcs: [{ actorId: 'ghost' }, { actorId: 'a' }],
      actors: [actorA],
      rng: () => 0,
    });
    expect(result).toHaveLength(1);
    expect(result[0].actor.id).toBe('a');
  });

  it('processes multiple places independently', () => {
    const result = matchActorsToPlaces({
      objects: [
        { kind: 'npc_place', x: 1, y: 1, data: { tags: ['merchant'], minCount: 1, maxCount: 1 } },
        { kind: 'npc_place', x: 5, y: 5, data: { tags: ['guard'], minCount: 1, maxCount: 1 } },
      ],
      mapNpcs: [{ actorId: 'a' }, { actorId: 'b' }],
      actors: [actorA, actorB],
      rng: () => 0,
    });
    expect(result).toHaveLength(2);
    const spots = new Set(result.map((r) => `${r.x},${r.y}`));
    expect(spots.has('1,1')).toBe(true);
    expect(spots.has('5,5')).toBe(true);
  });

  it('samples from the pool using the provided rng', () => {
    // Pool has 2 actors; with rng always 0 we'd get index 0, with rng
    // cycling 0.9 we'd get index 1.
    const objects = [{
      kind: 'npc_place',
      x: 0, y: 0,
      data: { tags: [], minCount: 1, maxCount: 1 },
    }];
    const mapNpcs = [{ actorId: 'a' }, { actorId: 'b' }];
    const actors = [actorA, actorB];
    const first = matchActorsToPlaces({
      objects, mapNpcs, actors, rng: seqRng([0]),
    });
    const second = matchActorsToPlaces({
      objects, mapNpcs, actors, rng: seqRng([0.9]),
    });
    expect(first[0].actor.id).toBe('a');
    expect(second[0].actor.id).toBe('b');
  });
});

describe('findPlayerStart', () => {
  it('returns the first player_start object', () => {
    const start = findPlayerStart([
      { kind: 'npc_place', x: 1, y: 1 },
      { kind: 'player_start', x: 7, y: 8 },
    ]);
    expect(start).toEqual({ x: 7, y: 8 });
  });

  it('returns null when no player_start exists', () => {
    expect(findPlayerStart([{ kind: 'npc_place', x: 1, y: 1 }])).toBeNull();
  });

  it('tolerates nullish / undefined input', () => {
    expect(findPlayerStart(null)).toBeNull();
    expect(findPlayerStart(undefined)).toBeNull();
    expect(findPlayerStart([])).toBeNull();
  });
});
