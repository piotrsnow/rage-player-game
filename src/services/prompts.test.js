import { describe, expect, it } from 'vitest';
import { buildImagePrompt, buildPortraitPrompt } from './prompts';
import { enforcePromptTokenBudget, getSceneAIGovernance } from './promptGovernance';

describe('image prompt age integration', () => {
  it('injects character age and gender into scene image prompt when provided', () => {
    const prompt = buildImagePrompt(
      'A hero enters a ruined keep.',
      'Fantasy',
      'Dark',
      null,
      'dalle',
      'painting',
      false,
      23,
      'female'
    );

    expect(prompt).toContain('Featured character age: 23.');
    expect(prompt).toContain('Featured character gender: female.');
  });

  it('injects age into portrait prompt when provided', () => {
    const prompt = buildPortraitPrompt(
      'Human',
      'male',
      23,
      'Soldier',
      'Fantasy',
      'stability',
      'painting',
      false,
      false
    );

    expect(prompt).toContain('approximately 23 years old');
  });
});

describe('prompt governance budget guards', () => {
  it('boosts prompt budget for long-running campaigns', () => {
    const shortRun = getSceneAIGovernance({ profileId: 'balanced', modelTier: 'premium', sceneCount: 5 });
    const longRun = getSceneAIGovernance({ profileId: 'balanced', modelTier: 'premium', sceneCount: 35 });
    expect(longRun.promptTokenBudget).toBeGreaterThan(shortRun.promptTokenBudget);
    expect(longRun.sceneTokenBudget).toBeGreaterThan(shortRun.sceneTokenBudget);
  });

  it('trims optional sections before hard truncation marker', () => {
    const systemPrompt = [
      'INSTRUCTIONS:\nKeep consistency.',
      'BESTIARY REFERENCE:\n' + 'wolf stats '.repeat(800),
      'MAGIC SYSTEM:\n' + 'arcane details '.repeat(700),
      'SCENE HISTORY:\nKeep this critical.',
    ].join('\n\n');
    const userPrompt = 'Generate scene JSON.';
    const result = enforcePromptTokenBudget(systemPrompt, userPrompt, 500);
    expect(result.truncated).toBe(true);
    expect(result.systemPrompt).toContain('SCENE HISTORY');
    expect(result.systemPrompt).not.toContain('BESTIARY REFERENCE');
  });
});
