import { describe, it, expect, vi } from 'vitest';

// The campaigns.js module imports prisma, media store, etc. at top level,
// which reach for env config and DB connections. Mock them out so we can
// unit-test the pure save-state helpers in isolation.
vi.mock('../config.js', () => ({
  config: {
    mediaBackend: 'local',
    mediaLocalDir: '/tmp/test-media',
    apiKeys: {},
    apiKeyEncryptionSecret: 'test-secret-long-enough-for-aes-256',
  },
}));
vi.mock('../lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../lib/logger.js', () => ({
  childLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../services/hashService.js', () => ({ generateKey: vi.fn(() => 'mock-key') }));
vi.mock('../services/mediaStore.js', () => ({
  createMediaStore: () => ({ put: vi.fn(), get: vi.fn(), getUrl: vi.fn(), delete: vi.fn() }),
}));
vi.mock('../services/characterRelations.js', () => ({
  reconstructCharacterSnapshot: vi.fn((row) => row),
}));

import { extractTotalCost, stripNormalizedFromCoreState } from './campaigns.js';

describe('extractTotalCost', () => {
  it('returns 0 when coreState is null/undefined', () => {
    expect(extractTotalCost(null)).toBe(0);
    expect(extractTotalCost(undefined)).toBe(0);
  });

  it('reads aiCosts.total from an object', () => {
    expect(extractTotalCost({ aiCosts: { total: 12.5 } })).toBe(12.5);
  });

  it('parses a JSON string coreState', () => {
    expect(extractTotalCost('{"aiCosts":{"total":7}}')).toBe(7);
  });

  it('returns 0 when aiCosts is missing', () => {
    expect(extractTotalCost({ scenes: [] })).toBe(0);
    expect(extractTotalCost({ aiCosts: {} })).toBe(0);
  });

  it('throws on malformed JSON (caller is responsible for valid input)', () => {
    expect(() => extractTotalCost('{not json')).toThrow();
  });
});

describe('stripNormalizedFromCoreState', () => {
  it('strips embedded character from legacy payloads', () => {
    const input = { character: { name: 'Hero' }, scenes: [] };
    const { slim } = stripNormalizedFromCoreState(input);
    expect(slim.character).toBeUndefined();
    expect(slim.scenes).toEqual([]);
  });

  it('extracts world.npcs and removes them from slim world', () => {
    const npcs = [{ name: 'Tavernkeeper' }, { name: 'Guard' }];
    const input = { world: { npcs, weather: 'sunny' } };
    const result = stripNormalizedFromCoreState(input);
    expect(result.npcs).toEqual(npcs);
    expect(result.slim.world.npcs).toBeUndefined();
    expect(result.slim.world.weather).toBe('sunny');
  });

  it('extracts knowledgeBase.events and knowledgeBase.decisions', () => {
    const events = [{ summary: 'Dragon slain' }];
    const decisions = [{ choice: 'help', consequence: 'blessing' }];
    const input = {
      world: {
        knowledgeBase: { events, decisions, plotThreads: [{ id: 'p1' }] },
      },
    };
    const result = stripNormalizedFromCoreState(input);
    expect(result.knowledgeEvents).toEqual(events);
    expect(result.knowledgeDecisions).toEqual(decisions);
    // plotThreads stay inside the knowledgeBase (not normalized out)
    expect(result.slim.world.knowledgeBase.plotThreads).toEqual([{ id: 'p1' }]);
    expect(result.slim.world.knowledgeBase.events).toBeUndefined();
    expect(result.slim.world.knowledgeBase.decisions).toBeUndefined();
  });

  it('extracts quests (both active and completed) and removes them from slim', () => {
    const quests = {
      active: [{ id: 'q1', name: 'Find the sword' }],
      completed: [{ id: 'q0', name: 'Tutorial', completedAt: '2026-01-01' }],
    };
    const input = { quests, scenes: [] };
    const result = stripNormalizedFromCoreState(input);
    expect(result.quests).toEqual(quests);
    expect(result.slim.quests).toBeUndefined();
    expect(result.slim.scenes).toEqual([]);
  });

  it('provides empty quests default when input has no quests field', () => {
    const { quests } = stripNormalizedFromCoreState({ scenes: [] });
    expect(quests).toEqual({ active: [], completed: [] });
  });

  it('does not mutate the input object', () => {
    const input = {
      character: { name: 'Hero' },
      world: {
        npcs: [{ name: 'NPC' }],
        knowledgeBase: { events: [{ summary: 'event' }], decisions: [] },
      },
      quests: { active: [], completed: [] },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    stripNormalizedFromCoreState(input);
    expect(input).toEqual(snapshot);
  });

  it('handles minimal input with no world', () => {
    const result = stripNormalizedFromCoreState({});
    expect(result.npcs).toEqual([]);
    expect(result.knowledgeEvents).toEqual([]);
    expect(result.knowledgeDecisions).toEqual([]);
    expect(result.quests).toEqual({ active: [], completed: [] });
    expect(result.slim).toEqual({});
    expect(result.currentLocationName).toBeNull();
  });

  // F5 — currentLocation lift onto its own field for the dedicated column.
  it('lifts world.currentLocation onto its own field and strips from slim', () => {
    const input = { world: { currentLocation: 'Krynsk', weather: 'sunny' } };
    const result = stripNormalizedFromCoreState(input);
    expect(result.currentLocationName).toBe('Krynsk');
    expect(result.slim.world.currentLocation).toBeUndefined();
    expect(result.slim.world.weather).toBe('sunny');
  });

  it('trims whitespace from lifted currentLocation', () => {
    const result = stripNormalizedFromCoreState({ world: { currentLocation: '  Lasy Drakwald  ' } });
    expect(result.currentLocationName).toBe('Lasy Drakwald');
  });

  it('treats empty/whitespace currentLocation as null', () => {
    expect(stripNormalizedFromCoreState({ world: { currentLocation: '' } }).currentLocationName).toBeNull();
    expect(stripNormalizedFromCoreState({ world: { currentLocation: '   ' } }).currentLocationName).toBeNull();
  });

  it('returns null currentLocationName when world has no currentLocation field', () => {
    const result = stripNormalizedFromCoreState({ world: { weather: 'rain' } });
    expect(result.currentLocationName).toBeNull();
    expect(result.slim.world.weather).toBe('rain');
  });
});
