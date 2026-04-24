import { describe, it, expect } from 'vitest';
import { computeInteractionDelta, initialInteractionFields } from './npcs.js';

describe('computeInteractionDelta (Phase 12b)', () => {
  const NOW = new Date('2026-04-23T12:00:00.000Z');

  it('increments interactionCount and stamps timestamp on first interaction (no prior sceneIndex)', () => {
    const existing = { lastInteractionSceneIndex: null };
    const delta = computeInteractionDelta(existing, 5, NOW);
    expect(delta).toEqual({
      interactionCount: { increment: 1 },
      lastInteractionAt: NOW,
      lastInteractionSceneIndex: 5,
    });
    expect(delta.questInvolvementCount).toBeUndefined();
  });

  it('flags a return visit when sceneIndex gap >= 2', () => {
    const existing = { lastInteractionSceneIndex: 3 };
    const delta = computeInteractionDelta(existing, 5, NOW);
    expect(delta.questInvolvementCount).toEqual({ increment: 1 });
    expect(delta.lastInteractionSceneIndex).toBe(5);
  });

  it('does NOT flag a return visit for consecutive scenes (gap = 1)', () => {
    const existing = { lastInteractionSceneIndex: 3 };
    const delta = computeInteractionDelta(existing, 4, NOW);
    expect(delta.questInvolvementCount).toBeUndefined();
  });

  it('does NOT flag when sceneIndex equals previous (same-scene re-entry)', () => {
    const existing = { lastInteractionSceneIndex: 5 };
    const delta = computeInteractionDelta(existing, 5, NOW);
    expect(delta.questInvolvementCount).toBeUndefined();
  });

  it('omits sceneIndex fields entirely when sceneIndex is null', () => {
    const existing = { lastInteractionSceneIndex: 3 };
    const delta = computeInteractionDelta(existing, null, NOW);
    expect(delta).toEqual({
      interactionCount: { increment: 1 },
      lastInteractionAt: NOW,
    });
  });

  it('tolerates missing existing row (new NPC path never hits this, but safe)', () => {
    const delta = computeInteractionDelta(null, 3, NOW);
    expect(delta).toEqual({
      interactionCount: { increment: 1 },
      lastInteractionAt: NOW,
      lastInteractionSceneIndex: 3,
    });
  });

  it('ignores negative sceneIndex (defensive)', () => {
    const delta = computeInteractionDelta({ lastInteractionSceneIndex: 0 }, -1, NOW);
    expect(delta.lastInteractionSceneIndex).toBeUndefined();
    expect(delta.questInvolvementCount).toBeUndefined();
  });
});

describe('initialInteractionFields (Phase 12b)', () => {
  const NOW = new Date('2026-04-23T12:00:00.000Z');

  it('stamps interactionCount=1 and sceneIndex when provided', () => {
    expect(initialInteractionFields(5, NOW)).toEqual({
      interactionCount: 1,
      lastInteractionAt: NOW,
      lastInteractionSceneIndex: 5,
    });
  });

  it('sets lastInteractionSceneIndex to null when sceneIndex is missing', () => {
    expect(initialInteractionFields(null, NOW)).toMatchObject({
      interactionCount: 1,
      lastInteractionSceneIndex: null,
    });
  });

  it('nulls sceneIndex for negative values (defensive)', () => {
    expect(initialInteractionFields(-5, NOW).lastInteractionSceneIndex).toBeNull();
  });
});
