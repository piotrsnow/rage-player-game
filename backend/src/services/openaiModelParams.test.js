import { describe, it, expect } from 'vitest';
import { isOpenAiFixedTemperatureModel, applyOpenAiTemperature } from './openaiModelParams.js';

describe('isOpenAiFixedTemperatureModel', () => {
  it('detects o-series and gpt-5.5 / gpt-5.4-nano', () => {
    expect(isOpenAiFixedTemperatureModel('o4-mini')).toBe(true);
    expect(isOpenAiFixedTemperatureModel('o3-mini-2025-01-31')).toBe(true);
    expect(isOpenAiFixedTemperatureModel('gpt-5.5')).toBe(true);
    expect(isOpenAiFixedTemperatureModel('gpt-5.4-nano')).toBe(true);
  });

  it('allows custom temperature on standard chat models', () => {
    expect(isOpenAiFixedTemperatureModel('gpt-4.1')).toBe(false);
    expect(isOpenAiFixedTemperatureModel('gpt-5.4')).toBe(false);
    expect(isOpenAiFixedTemperatureModel('gpt-5.4-mini')).toBe(false);
  });
});

describe('applyOpenAiTemperature', () => {
  it('omits temperature for fixed-temperature models', () => {
    const body = { model: 'o4-mini' };
    applyOpenAiTemperature(body, 'o4-mini', 0.8);
    expect(body.temperature).toBeUndefined();
  });

  it('sets temperature for models that support it', () => {
    const body = { model: 'gpt-4.1' };
    applyOpenAiTemperature(body, 'gpt-4.1', 0.8);
    expect(body.temperature).toBe(0.8);
  });
});
