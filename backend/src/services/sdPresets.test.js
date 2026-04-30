import { describe, it, expect } from 'vitest';
import { getModelPreset, SD_MODEL_PRESETS } from './sdPresets.js';

describe('getModelPreset', () => {
  it('exposes presets for the three tracked SDXL checkpoints', () => {
    expect(Object.keys(SD_MODEL_PRESETS)).toEqual(
      expect.arrayContaining([
        'asgardSDXLHybrid_v12FP32MainModel',
        'starlightXLAnimated_v3',
        'paintersCheckpointOilPaint_v11',
      ]),
    );
  });

  it('resolves raw model_name to the matching preset', () => {
    const preset = getModelPreset('asgardSDXLHybrid_v12FP32MainModel');
    expect(preset).toBe(SD_MODEL_PRESETS.asgardSDXLHybrid_v12FP32MainModel);
    expect(preset.sampler).toBe('DPM++ 2M Karras');
    expect(preset.cfg).toBe(6);
  });

  it('strips A1111 file extension + hash suffix before matching', () => {
    const preset = getModelPreset('paintersCheckpointOilPaint_v11.safetensors [ab12cd34]');
    expect(preset).toBe(SD_MODEL_PRESETS.paintersCheckpointOilPaint_v11);
  });

  it('falls back to substring containment for close-but-not-exact titles', () => {
    const preset = getModelPreset('my-forks/starlightXLAnimated_v3-merged.ckpt');
    expect(preset).toBe(SD_MODEL_PRESETS.starlightXLAnimated_v3);
  });

  it('returns null for unknown or empty model titles', () => {
    expect(getModelPreset('dreamshaperXL_turboV2')).toBeNull();
    expect(getModelPreset('')).toBeNull();
    expect(getModelPreset(null)).toBeNull();
    expect(getModelPreset(undefined)).toBeNull();
  });

  it('pins Starlight to its low-CFG sweet spot', () => {
    const preset = getModelPreset('starlightXLAnimated_v3');
    expect(preset.cfg).toBeCloseTo(3.6);
    expect(preset.sampler).toBe('DPM++ 3M SDE Karras');
    expect(preset.steps).toBe(40);
  });

  it('uses SDXL-native portrait bucket (832x1216) for every preset', () => {
    for (const preset of Object.values(SD_MODEL_PRESETS)) {
      expect(preset.portraitWidth).toBe(832);
      expect(preset.portraitHeight).toBe(1216);
    }
  });
});
