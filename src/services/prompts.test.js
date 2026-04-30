import { describe, expect, it } from 'vitest';
import { buildImagePrompt, buildItemImagePrompt, buildPortraitPrompt, getModelPreset, SD_MODEL_PRESETS } from './imagePrompts';
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

describe('SDXL per-model presets', () => {
  it('exposes a preset for each of the three tracked checkpoints', () => {
    expect(Object.keys(SD_MODEL_PRESETS)).toEqual(
      expect.arrayContaining([
        'asgardSDXLHybrid_v12FP32MainModel',
        'starlightXLAnimated_v3',
        'paintersCheckpointOilPaint_v11',
      ])
    );
  });

  it('resolves A1111-style titles with extension + hash back to the preset', () => {
    const preset = getModelPreset('starlightXLAnimated_v3.safetensors [a1b2c3d4]');
    expect(preset).toBe(SD_MODEL_PRESETS.starlightXLAnimated_v3);
    expect(preset.sampler).toBe('DPM++ 3M SDE Karras');
    expect(preset.cfg).toBeCloseTo(3.6);
  });

  it('returns null for models without a tuned preset', () => {
    expect(getModelPreset('dreamshaperXL_turboV2')).toBeNull();
    expect(getModelPreset('')).toBeNull();
    expect(getModelPreset(null)).toBeNull();
  });

  it('wraps sd-webui scene prompts with model-specific quality tail', () => {
    const prompt = buildImagePrompt(
      'A knight at the ruined cathedral.',
      'Fantasy',
      'Dark',
      null,
      'sd-webui',
      'painting',
      false,
      null,
      null,
      null,
      false,
      'paintersCheckpointOilPaint_v11',
    );
    expect(prompt).toContain('alla prima');
    expect(prompt).toContain('impasto texture');
  });

  it('prepends Starlight quality head AND appends its tail', () => {
    const prompt = buildImagePrompt(
      'A rogue sneaking through a tavern.',
      'Fantasy',
      'Epic',
      null,
      'sd-webui',
      'anime',
      false,
      null,
      null,
      null,
      false,
      'starlightXLAnimated_v3',
    );
    expect(prompt.startsWith('masterpiece, best quality')).toBe(true);
    expect(prompt).toContain('2.5D anime illustration');
  });

  it('leaves non-sd-webui prompts free of quality-tag doping', () => {
    const prompt = buildImagePrompt(
      'A knight at the ruined cathedral.',
      'Fantasy',
      'Dark',
      null,
      'dalle',
      'painting',
      false,
      null,
      null,
      null,
      false,
      'paintersCheckpointOilPaint_v11',
    );
    expect(prompt).not.toContain('alla prima');
    expect(prompt).not.toContain('impasto texture');
  });

  it('wraps sd-webui portrait + item prompts too', () => {
    const portrait = buildPortraitPrompt(
      'Human', 'female', 28, 'Ranger', 'Fantasy',
      'sd-webui', 'painting', false, false, null, {},
      'asgardSDXLHybrid_v12FP32MainModel',
    );
    expect(portrait).toContain('volumetric light');

    const item = buildItemImagePrompt(
      { name: 'Rusted Dagger', type: 'weapon', rarity: 'common' },
      { provider: 'sd-webui', sdModel: 'starlightXLAnimated_v3' },
    );
    expect(item.startsWith('masterpiece, best quality')).toBe(true);
    expect(item).toContain('cel-shaded highlights');
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
