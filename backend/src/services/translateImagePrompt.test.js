import { describe, it, expect } from 'vitest';
import { buildTranslateSystemPrompt } from './translateImagePrompt.js';

describe('buildTranslateSystemPrompt', () => {
  it('asks to translate fantasy item names fully for item kind', () => {
    const prompt = buildTranslateSystemPrompt('item');
    expect(prompt).toContain('Do NOT leave Polish');
    expect(prompt).not.toContain('Preserve proper nouns');
  });

  it('preserves people/place names for general kind', () => {
    const prompt = buildTranslateSystemPrompt('general');
    expect(prompt).toContain('Preserve proper nouns');
  });
});
