import { describe, expect, it } from 'vitest';
import { getGeneratedImageScale } from './imageGen.js';

describe('getGeneratedImageScale', () => {
  it('keeps default scale for non-gemini providers', () => {
    expect(getGeneratedImageScale('dalle')).toBe(0.75);
    expect(getGeneratedImageScale('stability')).toBe(0.75);
  });

  it('reduces gemini output by an extra 30 percent', () => {
    expect(getGeneratedImageScale('gemini')).toBeCloseTo(0.525);
  });
});
