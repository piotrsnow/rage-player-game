import { describe, expect, it } from 'vitest';
import { buildImagePrompt, buildPortraitPrompt } from './prompts';

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
