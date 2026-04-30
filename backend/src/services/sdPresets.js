// Backend mirror of the SDXL per-model presets defined in
// src/services/imagePrompts.js on the FE. Kept as a separate module (rather
// than imported from FE) because Node ESM + frontend tooling (Vite) don't
// share resolution, and the full FE module pulls in a lot of unrelated
// prompt-building logic. Keep BOTH copies in sync when tuning a preset.
//
// Values here are research-backed recommendations from each model's Civitai
// card + community consensus:
//
//   asgardSDXLHybrid_v12FP32MainModel — https://civitai.com/models/273751
//     Turbo-ish "Hybrid"; DPM++ 2M Karras @ 24–28 steps, CFG 5–7. Most
//     versatile of the trio — safe default for scenes.
//
//   starlightXLAnimated_v3 — https://civitai.com/models/143043
//     2.5D anime. DPM++ 3M SDE Karras, CFG 3–5 (sweet spot ~3.6), 25–40
//     steps. HIGH CFG ruins output (artifacts, overcooked colors).
//
//   paintersCheckpointOilPaint_v11 — https://civitai.com/models/240154
//     Alla prima oil painting. v1.1 has SAI's Offset LoRA built in — do NOT
//     stack an external Offset LoRA. DPM++ 2M Karras @ 25–35 steps, CFG 5–6.
export const SD_MODEL_PRESETS = {
  asgardSDXLHybrid_v12FP32MainModel: {
    sampler: 'DPM++ 2M Karras',
    steps: 26,
    cfg: 6,
    width: 1216,
    height: 832,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, blurry, pixelated, distorted, extra limbs, watermark, text, deformed hands, illustration, cartoon, anime, sketch',
  },
  starlightXLAnimated_v3: {
    sampler: 'DPM++ 3M SDE Karras',
    steps: 40,
    cfg: 3.6,
    width: 1216,
    height: 832,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, worst quality, blurry, bad anatomy, extra limbs, deformed hands, watermark, text, photorealistic, 3d render, realistic photo, overexposed, noisy, oversaturated',
  },
  paintersCheckpointOilPaint_v11: {
    sampler: 'DPM++ 2M Karras',
    steps: 30,
    cfg: 5.5,
    width: 1216,
    height: 832,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, blurry, pixelated, distorted, extra limbs, watermark, text, deformed hands, photograph, photorealistic, 3d render, cartoon, anime, flat colors, digital art, smooth plastic shading',
  },
};

// A1111 titles look like "asgardSDXLHybrid_v12FP32MainModel.safetensors [a1b2c3d4]".
// Strip extension + trailing hash, exact-match, then substring fallback.
function normalizeModelKey(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .replace(/\s*\[[0-9a-f]{4,}\]\s*$/i, '')
    .replace(/\.(safetensors|ckpt|pt|bin)$/i, '')
    .trim();
}

export function getModelPreset(modelTitle) {
  const normalized = normalizeModelKey(modelTitle);
  if (!normalized) return null;
  if (SD_MODEL_PRESETS[normalized]) return SD_MODEL_PRESETS[normalized];
  const lower = normalized.toLowerCase();
  for (const key of Object.keys(SD_MODEL_PRESETS)) {
    if (lower.includes(key.toLowerCase())) return SD_MODEL_PRESETS[key];
  }
  return null;
}
