import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();

vi.mock('./apiClient', () => ({
  apiClient: {
    isConnected: () => true,
    post: (...args) => postMock(...args),
  },
}));

vi.mock('./ai', () => ({
  resolveModel: () => 'gpt-4.1',
}));

import { decideAction, normalizeAutoPlayerChatMessage } from './autoPlayer.js';

describe('normalizeAutoPlayerChatMessage', () => {
  it('returns null for empty values', () => {
    expect(normalizeAutoPlayerChatMessage()).toBeNull();
    expect(normalizeAutoPlayerChatMessage('')).toBeNull();
    expect(normalizeAutoPlayerChatMessage('   ')).toBeNull();
  });

  it('wraps plain text in straight double quotes', () => {
    expect(normalizeAutoPlayerChatMessage('Powinniśmy wejść do środka.')).toBe('"Powinniśmy wejść do środka."');
  });

  it('keeps already quoted text unchanged', () => {
    expect(normalizeAutoPlayerChatMessage('"Stój tam!"')).toBe('"Stój tam!"');
  });

  it('normalizes smart quotes to straight double quotes', () => {
    expect(normalizeAutoPlayerChatMessage('„Nie podoba mi się to.”')).toBe('"Nie podoba mi się to."');
    expect(normalizeAutoPlayerChatMessage('«Uciekaj!»')).toBe('"Uciekaj!"');
  });
});

describe('decideAction variety safeguards', () => {
  const baseState = {
    character: { needs: { hunger: 20, thirst: 70, rest: 60 } },
    scenes: [{
      actions: [
        'I ask the guard for details',
        'I inspect the gate for clues',
        'I head to the tavern to ask around',
      ],
      narrative: 'The gate remains tense and crowded.',
    }],
  };

  const baseSettings = { language: 'en', aiProvider: 'openai' };
  const baseAuto = { style: 'balanced', verbosity: 'low', model: '', decisionVariety: true };

  beforeEach(() => {
    postMock.mockReset();
  });

  it('switches to an alternative when AI repeats a recent action', async () => {
    postMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            action: 'I ask the guard for details',
            isCustom: false,
            reasoning: 'Most direct',
          }),
        },
      }],
    });

    const result = await decideAction(
      baseState,
      baseSettings,
      baseAuto,
      'dummy-key',
      'openai',
      { recentAutoActions: ['I ask the guard for details'] }
    );

    expect(result.action).not.toBe('I ask the guard for details');
    expect(baseState.scenes[0].actions).toContain(result.action);
    expect(result.isCustom).toBe(false);
  });

  it('keeps repeated action when decision variety is disabled', async () => {
    postMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            action: 'I ask the guard for details',
            isCustom: false,
            reasoning: 'Most direct',
          }),
        },
      }],
    });

    const result = await decideAction(
      baseState,
      baseSettings,
      { ...baseAuto, decisionVariety: false },
      'dummy-key',
      'openai',
      { recentAutoActions: ['I ask the guard for details'] }
    );

    expect(result.action).toBe('I ask the guard for details');
  });
});
