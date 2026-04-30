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
  it('exposes a preset for each tracked checkpoint', () => {
    expect(Object.keys(SD_MODEL_PRESETS)).toEqual(
      expect.arrayContaining([
        'asgardSDXLHybrid_v12FP32MainModel',
        'starlightXLAnimated_v3',
        'paintersCheckpointOilPaint_v11',
        'illustriousXL_v01',
        'bigaspV25_v25',
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
});

describe('sd-webui compact prompts — scene-first, style tail ≤6 words', () => {
  it('puts the scene text at the very start and a compact painting tag at the very end', () => {
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
    expect(prompt.startsWith('A knight at the ruined cathedral')).toBe(true);
    expect(prompt.endsWith('oil painting, impasto, painterly')).toBe(true);
    // No verbose qualityTail from the old preset-injection path.
    expect(prompt).not.toContain('alla prima');
    expect(prompt).not.toContain('impasto texture');
  });

  it('ends an anime-style sd-webui scene with the compact anime tag', () => {
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
    expect(prompt.startsWith('A rogue sneaking through a tavern')).toBe(true);
    expect(prompt.endsWith('anime style, cel-shaded, vivid')).toBe(true);
    // No Danbooru quality-head doping anymore — scene leads.
    expect(prompt.startsWith('masterpiece, best quality')).toBe(false);
  });

  it('leaves non-sd-webui (cloud) prompts on the verbose template', () => {
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
    expect(prompt.startsWith('ART STYLE:')).toBe(true);
    expect(prompt).toContain('classical oil painting');
    // Cloud branch doesn't get the compact sdTag either — it keeps the
    // natural-language `prompt` scaffold the safety/instruction layers read.
    expect(prompt.endsWith('oil painting, impasto, painterly')).toBe(false);
  });

  it('builds a compact sd-webui portrait prompt with subject first and style tail at the end', () => {
    const portrait = buildPortraitPrompt(
      'Human', 'female', 28, 'Ranger', 'Fantasy',
      'sd-webui', 'painting', false, false, null, {},
      'asgardSDXLHybrid_v12FP32MainModel',
    );
    expect(portrait.startsWith('close-up portrait of a female human')).toBe(true);
    expect(portrait.endsWith('oil painting, impasto, painterly')).toBe(true);
    // The old "ART STYLE:" prefix and "Highly detailed facial features: ..."
    // boilerplate are gone from the SD branch.
    expect(portrait).not.toContain('ART STYLE:');
    expect(portrait).not.toContain('Highly detailed facial features');
  });

  it('prefixes weighted fantasy anchors on img2img portraits (bleed-guard stays)', () => {
    const portrait = buildPortraitPrompt(
      'Human', 'female', 28, 'Ranger', 'Fantasy',
      'sd-webui', 'painting', true /* hasReferenceImage */, false, null, { likeness: 70 },
      'asgardSDXLHybrid_v12FP32MainModel',
    );
    expect(portrait.startsWith('(fantasy character:1.3), (fantasy armor:1.2),')).toBe(true);
    expect(portrait).toContain('same face, fantasy look');
    expect(portrait.endsWith('oil painting, impasto, painterly')).toBe(true);
  });

  it('builds a compact sd-webui item prompt: "inventory artwork of …" then tag', () => {
    const item = buildItemImagePrompt(
      { name: 'Rusted Dagger', type: 'weapon', rarity: 'common' },
      { provider: 'sd-webui', sdModel: 'starlightXLAnimated_v3', imageStyle: 'anime' },
    );
    expect(item.startsWith('inventory artwork of Rusted Dagger')).toBe(true);
    expect(item.endsWith('anime style, cel-shaded, vivid')).toBe(true);
    expect(item.startsWith('masterpiece, best quality')).toBe(false);
  });

  it('emits compact attribute tags between subject and style tail (age, gender, tone, seriousness, darkPalette)', () => {
    const prompt = buildImagePrompt(
      'A knight kneels at a ruined cathedral.',
      'Fantasy',
      'Dark',
      null,
      'sd-webui',
      'painting',
      true /* darkPalette */,
      23,
      'female',
      90 /* grave */,
      false,
      'paintersCheckpointOilPaint_v11',
    );
    expect(prompt).toMatch(/23yo/);
    expect(prompt).toContain('female');
    expect(prompt).toContain('moody');
    expect(prompt).toContain('grim');
    expect(prompt).toContain('dark palette');
    // Verbose legacy equivalents must NOT be there.
    expect(prompt).not.toContain('Featured character age:');
    expect(prompt).not.toContain('Mood/tone:');
    expect(prompt).not.toContain('gravely somber atmosphere');
  });

  it('keeps sd-webui scene prompts under a sane word cap (was ~120 words, now well below 60)', () => {
    const prompt = buildImagePrompt(
      'A knight kneels at a ruined cathedral, mist rising from shattered pews.',
      'Fantasy',
      'Dark',
      null,
      'sd-webui',
      'painting',
      true,
      23,
      'female',
      90,
      true,
      'paintersCheckpointOilPaint_v11',
    );
    const words = prompt.split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(60);
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
