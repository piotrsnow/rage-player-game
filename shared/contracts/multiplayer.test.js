import { describe, it, expect } from 'vitest';
import {
  normalizeClientWsType,
  normalizeServerWsType,
  normalizeMultiplayerStateChanges,
  createWsMessage,
  WS_CLIENT_TYPES,
  WS_SERVER_TYPES,
  TYPING_DRAFT_MAX_LENGTH,
} from './multiplayer.js';

describe('normalizeClientWsType', () => {
  it('returns known client types unchanged', () => {
    expect(normalizeClientWsType('JOIN_ROOM')).toBe('JOIN_ROOM');
    expect(normalizeClientWsType('SUBMIT_ACTION')).toBe('SUBMIT_ACTION');
    expect(normalizeClientWsType('COMBAT_MANOEUVRE')).toBe('COMBAT_MANOEUVRE');
  });

  it('rejects unknown types with null', () => {
    expect(normalizeClientWsType('HACK_ROOM')).toBeNull();
    expect(normalizeClientWsType('ROOM_CREATED')).toBeNull(); // server-only type
  });

  it('rejects non-strings and empty values', () => {
    expect(normalizeClientWsType(null)).toBeNull();
    expect(normalizeClientWsType(undefined)).toBeNull();
    expect(normalizeClientWsType('')).toBeNull();
    expect(normalizeClientWsType(42)).toBeNull();
    expect(normalizeClientWsType({})).toBeNull();
  });
});

describe('normalizeServerWsType', () => {
  it('returns known server types unchanged', () => {
    expect(normalizeServerWsType('ROOM_CREATED')).toBe('ROOM_CREATED');
    expect(normalizeServerWsType('SCENE_UPDATE')).toBe('SCENE_UPDATE');
  });

  it('rejects client-only types', () => {
    expect(normalizeServerWsType('JOIN_ROOM')).toBeNull();
  });

  it('rejects invalid input', () => {
    expect(normalizeServerWsType(null)).toBeNull();
    expect(normalizeServerWsType('GARBAGE')).toBeNull();
  });
});

describe('normalizeMultiplayerStateChanges', () => {
  it('returns non-object input unchanged', () => {
    expect(normalizeMultiplayerStateChanges(null)).toBeNull();
    expect(normalizeMultiplayerStateChanges(undefined)).toBeUndefined();
    expect(normalizeMultiplayerStateChanges('not an object')).toBe('not an object');
  });

  it('returns empty state changes unchanged', () => {
    const input = { currentLocation: 'Tavern' };
    const result = normalizeMultiplayerStateChanges(input);
    expect(result).toEqual({ currentLocation: 'Tavern' });
  });

  it('migrates per-character woundsChange → wounds', () => {
    const input = {
      perCharacter: {
        Alice: { woundsChange: -3, xpGain: 10 },
        Bob: { woundsChange: 5 },
      },
    };
    const result = normalizeMultiplayerStateChanges(input);
    expect(result.perCharacter.Alice).toEqual({ wounds: -3, xpGain: 10 });
    expect(result.perCharacter.Bob).toEqual({ wounds: 5 });
    // Original input must not be mutated
    expect(input.perCharacter.Alice.woundsChange).toBe(-3);
  });

  it('preserves existing wounds when both wounds and woundsChange are set', () => {
    const input = {
      perCharacter: {
        Alice: { wounds: -2, woundsChange: -10 },
      },
    };
    const result = normalizeMultiplayerStateChanges(input);
    // Existing `wounds` wins; woundsChange is stripped
    expect(result.perCharacter.Alice).toEqual({ wounds: -2 });
  });

  it('handles perCharacter with non-object delta gracefully', () => {
    const input = {
      perCharacter: {
        Alice: null,
        Bob: 'garbage',
      },
    };
    const result = normalizeMultiplayerStateChanges(input);
    expect(result.perCharacter.Alice).toBeNull();
    expect(result.perCharacter.Bob).toBe('garbage');
  });

  it('preserves non-perCharacter fields intact', () => {
    const input = {
      currentLocation: 'Dungeon',
      currentHour: 14,
      perCharacter: { Alice: { woundsChange: -1 } },
      inventoryUpdates: [{ name: 'sword' }],
    };
    const result = normalizeMultiplayerStateChanges(input);
    expect(result.currentLocation).toBe('Dungeon');
    expect(result.currentHour).toBe(14);
    expect(result.inventoryUpdates).toEqual([{ name: 'sword' }]);
  });
});

describe('createWsMessage', () => {
  it('builds a message with type + payload fields', () => {
    const msg = createWsMessage('JOIN_ROOM', { roomCode: 'ABCD', userId: 'u1' });
    expect(msg).toEqual({ type: 'JOIN_ROOM', roomCode: 'ABCD', userId: 'u1' });
  });

  it('defaults payload to an empty object', () => {
    expect(createWsMessage('PING')).toEqual({ type: 'PING' });
  });

  it('lets payload override keys other than type', () => {
    const msg = createWsMessage('ERROR', { error: 'nope', extra: true });
    expect(msg.error).toBe('nope');
    expect(msg.extra).toBe(true);
  });
});

describe('WS type registries', () => {
  it('exposes client + server type maps without overlap in role', () => {
    // Sanity: CLIENT has CREATE_ROOM, SERVER has ROOM_CREATED — different roles
    expect(WS_CLIENT_TYPES.CREATE_ROOM).toBe('CREATE_ROOM');
    expect(WS_SERVER_TYPES.ROOM_CREATED).toBe('ROOM_CREATED');
    // COMBAT_SYNC / COMBAT_MANOEUVRE are intentionally in BOTH registries
    // (bidirectional) — regression guard against accidental removal
    expect(WS_CLIENT_TYPES.COMBAT_SYNC).toBe('COMBAT_SYNC');
    expect(WS_SERVER_TYPES.COMBAT_SYNC).toBe('COMBAT_SYNC');
  });

  it('TYPING_DRAFT_MAX_LENGTH is a sane positive integer', () => {
    expect(typeof TYPING_DRAFT_MAX_LENGTH).toBe('number');
    expect(TYPING_DRAFT_MAX_LENGTH).toBeGreaterThan(0);
    expect(TYPING_DRAFT_MAX_LENGTH).toBeLessThan(2000);
  });
});
