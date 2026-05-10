import { describe, it, expect } from 'vitest';
import { gameReducer } from '../gameReducer.js';
import { initialState } from './_shared.js';

const seed = (overrides = {}) => ({
  ...initialState,
  world: {
    ...initialState.world,
    timeState: { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' },
  },
  chatHistory: [],
  scenes: [],
  ...overrides,
});

describe('ADD_QUICK_BEAT reducer', () => {
  it('appends two quick_beat chat entries (player + dm)', () => {
    const next = gameReducer(seed(), {
      type: 'ADD_QUICK_BEAT',
      payload: {
        id: 'beat-1',
        playerAction: 'rozglądam się po karczmie',
        narration: 'Powietrze gęstnieje od dymu fajek.',
        timeAdvance: 0,
        consecutiveCount: 1,
      },
    });

    expect(next.chatHistory).toHaveLength(2);
    expect(next.chatHistory[0]).toMatchObject({
      role: 'player',
      subtype: 'quick_beat',
      content: 'rozglądam się po karczmie',
    });
    expect(next.chatHistory[1]).toMatchObject({
      role: 'dm',
      subtype: 'quick_beat',
      content: 'Powietrze gęstnieje od dymu fajek.',
    });
    expect(next.chatHistory[1].dialogueSegments).toBeUndefined();
  });

  it('attaches a dialogue segment when NPC reply is present', () => {
    const next = gameReducer(seed(), {
      type: 'ADD_QUICK_BEAT',
      payload: {
        id: 'beat-2',
        playerAction: 'pytam barmana',
        narration: 'Barman odrywa wzrok od kufla.',
        npcSpeaker: 'Geralt',
        npcSpeakerGender: 'male',
        npcReply: 'Słucham, podróżniku.',
        timeAdvance: 0.05,
        consecutiveCount: 1,
      },
    });

    const dm = next.chatHistory[1];
    expect(dm.dialogueSegments).toHaveLength(1);
    expect(dm.dialogueSegments[0]).toEqual({
      type: 'dialogue',
      character: 'Geralt',
      text: 'Słucham, podróżniku.',
      gender: 'male',
    });
  });

  it('uses female gender when explicitly provided', () => {
    const next = gameReducer(seed(), {
      type: 'ADD_QUICK_BEAT',
      payload: {
        id: 'beat-3',
        playerAction: 'pytam Mirkę',
        narration: 'Mirka uśmiecha się.',
        npcSpeaker: 'Mirka',
        npcSpeakerGender: 'female',
        npcReply: 'Co znowu?',
        consecutiveCount: 1,
      },
    });

    expect(next.chatHistory[1].dialogueSegments[0].gender).toBe('female');
  });

  it('advances world clock when timeAdvance > 0', () => {
    const next = gameReducer(seed(), {
      type: 'ADD_QUICK_BEAT',
      payload: {
        id: 'beat-4',
        playerAction: 'piję piwo',
        narration: 'Piwo jest gorzkie i ciepłe.',
        timeAdvance: 0.25,
        consecutiveCount: 1,
      },
    });

    // Starting hour is 6.0; +0.25h with 1-decimal rounding lands on 6.3.
    expect(next.world.timeState.hour).toBeCloseTo(6.3, 5);
    expect(next.world.timeState.day).toBe(1);
  });

  it('does not advance time when timeAdvance is 0 / missing / negative', () => {
    const baseState = seed();
    const cases = [
      { timeAdvance: 0 },
      { timeAdvance: -0.1 },
      { /* missing */ },
    ];
    for (const extra of cases) {
      const next = gameReducer(baseState, {
        type: 'ADD_QUICK_BEAT',
        payload: {
          id: 'beat-x',
          playerAction: 'x',
          narration: 'y',
          consecutiveCount: 1,
          ...extra,
        },
      });
      expect(next.world.timeState.hour).toBe(6);
      expect(next.world.timeState.day).toBe(1);
    }
  });

  it('uses BE-supplied consecutiveCount as the streak', () => {
    const next = gameReducer(seed({ quickBeatStreak: 0 }), {
      type: 'ADD_QUICK_BEAT',
      payload: { id: 'b', playerAction: 'a', narration: 'b', consecutiveCount: 3 },
    });
    expect(next.quickBeatStreak).toBe(3);
  });

  it('falls back to local increment when consecutiveCount missing', () => {
    const next = gameReducer(seed({ quickBeatStreak: 2 }), {
      type: 'ADD_QUICK_BEAT',
      payload: { id: 'b', playerAction: 'a', narration: 'b' },
    });
    expect(next.quickBeatStreak).toBe(3);
  });

  it('ADD_SCENE resets quickBeatStreak to 0', () => {
    const after = gameReducer(seed({ quickBeatStreak: 4 }), {
      type: 'ADD_SCENE',
      payload: { id: 'scene-1', narrative: 'x' },
    });
    expect(after.quickBeatStreak).toBe(0);
  });
});
