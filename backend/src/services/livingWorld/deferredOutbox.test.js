import { describe, it, expect } from 'vitest';
import { replay } from './deferredOutbox.js';

// Pure-function tests for the deferredOutbox.replay projector. The DB-touching
// helpers (appendDeferred/flushDeferred) are covered by integration tests
// against Atlas (manual playtest Phase 2 verification).

function evt(eventType, payload = {}, gameTime = '2026-01-01T00:00:00Z') {
  return { eventType, payload: JSON.stringify(payload), gameTime };
}

describe('deferredOutbox.replay', () => {
  it('empty event list → baseSnapshot fields passed through', () => {
    const base = { currentLocationId: 'loc1', alive: true, companionLoyalty: 60 };
    const out = replay(base, []);
    expect(out.currentLocationId).toBe('loc1');
    expect(out.alive).toBe(true);
    expect(out.companionLoyalty).toBe(60);
  });

  it('accepts legacy `locationId` field on snapshot', () => {
    const base = { locationId: 'oldKey', alive: true };
    const out = replay(base, []);
    expect(out.currentLocationId).toBe('oldKey');
  });

  it('companion_moved updates currentLocationId + locationName', () => {
    const out = replay(
      { currentLocationId: 'vey', alive: true },
      [evt('companion_moved', { toLocationId: 'altdorf', toLocationName: 'Altdorf' })],
    );
    expect(out.currentLocationId).toBe('altdorf');
    expect(out.locationName).toBe('Altdorf');
  });

  it('died → alive=false (irreversible during trip)', () => {
    const out = replay({ alive: true }, [evt('died', { reason: 'combat' })]);
    expect(out.alive).toBe(false);
  });

  it('loyalty_change delta clamps within 0..100', () => {
    const out = replay(
      { companionLoyalty: 50, alive: true },
      [
        evt('loyalty_change', { delta: -60 }),
        evt('loyalty_change', { delta: +10 }),
      ],
    );
    // 50 - 60 → clamp to 0; +10 → 10
    expect(out.companionLoyalty).toBe(10);
  });

  it('loyalty_change absolute overrides delta semantics', () => {
    const out = replay(
      { companionLoyalty: 50, alive: true },
      [evt('loyalty_change', { absolute: 80 })],
    );
    expect(out.companionLoyalty).toBe(80);
  });

  it('events ordered chronologically by caller → final state reflects last state', () => {
    const out = replay(
      { currentLocationId: 'vey', alive: true, companionLoyalty: 50 },
      [
        evt('companion_moved', { toLocationId: 'altdorf', toLocationName: 'Altdorf' }, '2026-01-01T00:00:00Z'),
        evt('companion_moved', { toLocationId: 'forest', toLocationName: 'Forest' }, '2026-01-02T00:00:00Z'),
        evt('loyalty_change', { delta: -5 }, '2026-01-03T00:00:00Z'),
      ],
    );
    expect(out.currentLocationId).toBe('forest');
    expect(out.locationName).toBe('Forest');
    expect(out.companionLoyalty).toBe(45);
  });

  it('non-mutating events (spoke, joined_party) do not touch state', () => {
    const out = replay(
      { currentLocationId: 'vey', alive: true, companionLoyalty: 50 },
      [
        evt('spoke', { excerpt: 'Tak, pójdę z tobą' }),
        evt('joined_party', {}),
      ],
    );
    expect(out.currentLocationId).toBe('vey');
    expect(out.companionLoyalty).toBe(50);
    expect(out.alive).toBe(true);
  });

  it('malformed payload does not crash replay (missing fields ignored)', () => {
    const out = replay(
      { currentLocationId: 'vey', alive: true, companionLoyalty: 50 },
      [
        evt('loyalty_change', {}),          // no delta, no absolute
        evt('companion_moved', {}),         // no toLocationId
      ],
    );
    expect(out.currentLocationId).toBe('vey');
    expect(out.companionLoyalty).toBe(50);
  });
});
