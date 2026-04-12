import { describe, expect, it, vi } from 'vitest';

// Mock the autoPlayer service to break the circular import chain
// (autoPlayer -> ai -> ... -> mechanics/restRecovery -> autoPlayer)
vi.mock('../services/autoPlayer', () => ({
  decideAction: vi.fn(),
  NEED_KEYWORD_HINTS: {
    hunger: ['eat', 'food'],
    thirst: ['drink', 'water'],
    rest: ['rest', 'sleep'],
  },
}));

import { getAutoPlayerAdvanceDelay } from './useAutoPlayer.js';

describe('getAutoPlayerAdvanceDelay', () => {
  it('keeps waiting while narration is actively playing', () => {
    expect(getAutoPlayerAdvanceDelay({
      shouldWaitForNarration: true,
      narratorPlaybackState: 'playing',
      narrationSeenForPendingScene: true,
      pendingSceneAgeMs: 5000,
    })).toBeNull();
  });

  it('forces immediate next turn after 3 seconds of silence', () => {
    expect(getAutoPlayerAdvanceDelay({
      shouldWaitForNarration: true,
      narratorPlaybackState: 'loading',
      narrationSeenForPendingScene: false,
      pendingSceneAgeMs: 3000,
    })).toBe(0);
  });

  it('uses short delay after narration already finished', () => {
    expect(getAutoPlayerAdvanceDelay({
      shouldWaitForNarration: true,
      narratorPlaybackState: 'idle',
      narrationSeenForPendingScene: true,
      pendingSceneAgeMs: 1000,
    })).toBe(500);
  });

  it('uses default delay when narration waiting is disabled', () => {
    expect(getAutoPlayerAdvanceDelay({
      shouldWaitForNarration: false,
      narratorPlaybackState: 'idle',
      narrationSeenForPendingScene: false,
      pendingSceneAgeMs: 10000,
    })).toBe(1500);
  });
});
