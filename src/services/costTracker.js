const PRICING = {
  ai: {
    'gpt-5.4-nano': { input: 0.20 / 1_000_000, output: 1.25 / 1_000_000 },
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4.1': { input: 2.00 / 1_000_000, output: 8.00 / 1_000_000 },
    'gpt-4.1-mini': { input: 0.40 / 1_000_000, output: 1.60 / 1_000_000 },
    'gpt-4.1-nano': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
    'claude-opus-4-7': { input: 5.00 / 1_000_000, output: 25.00 / 1_000_000 },
    'claude-sonnet-4-6': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
    'claude-opus-4-6': { input: 5.00 / 1_000_000, output: 25.00 / 1_000_000 },
    'claude-sonnet-4-5-20250929': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
    'claude-haiku-4-5-20251001': { input: 1.00 / 1_000_000, output: 5.00 / 1_000_000 },
  },
  image: {
    'dall-e-3': 0.080,
    'gpt-image-1.5': 0.080,
    'sd3.5-large-turbo': 0.065,
    'gemini-3.1-flash-image-preview': 0.039,
  },
  tts: { perChar: 0.30 / 1000 },
  sfx: { perGeneration: 0.10 },
  meshy: { perGeneration: 0.10 },
};

const SCENE_BASE_COST = 0.05;

// Legacy fallback costs for old tier IDs (before admin-configurable pricing).
const LEGACY_TTS_COST = { local: 0.02, best: 0.10 };
const LEGACY_IMAGE_COST = { good: 0.10, local: 0.02 };

export function calculateSceneCost(settings, sceneModelConfig) {
  const base = SCENE_BASE_COST;
  const ttsTier = settings.sceneTtsTier || 'none';
  const imageTier = settings.sceneImageTier || 'none';

  let tts = 0;
  if (ttsTier !== 'none') {
    tts = sceneModelConfig?.tts?.[ttsTier]?.pricePerScene
      ?? LEGACY_TTS_COST[ttsTier]
      ?? 0;
  }

  let image = 0;
  if (imageTier !== 'none') {
    image = sceneModelConfig?.image?.[imageTier]?.pricePerScene
      ?? LEGACY_IMAGE_COST[imageTier]
      ?? 0;
  }

  return { type: 'scene', cost: base + tts + image, base, tts, image, timestamp: Date.now() };
}

export function calculateCost(type, metadata = {}) {
  const timestamp = Date.now();

  switch (type) {
    case 'ai': {
      const { model, prompt_tokens = 0, completion_tokens = 0 } = metadata;
      const pricing = PRICING.ai[model];
      if (!pricing) {
        if (model) console.warn(`[CostTracker] Unknown AI model "${model}" — cost recorded as 0`);
        return { type, model, cost: 0, tokens: { prompt_tokens, completion_tokens }, timestamp };
      }
      const cost = prompt_tokens * pricing.input + completion_tokens * pricing.output;
      return { type, model, cost, tokens: { prompt_tokens, completion_tokens }, timestamp };
    }
    case 'image': {
      const { provider } = metadata;
      const model = provider === 'stability' ? 'sd3.5-large-turbo' : provider === 'gemini' ? 'gemini-3.1-flash-image-preview' : provider === 'gpt-image' ? 'gpt-image-1.5' : 'dall-e-3';
      const cost = PRICING.image[model] || 0;
      return { type, model, cost, timestamp };
    }
    case 'tts': {
      const { charCount = 0 } = metadata;
      const cost = charCount * PRICING.tts.perChar;
      return { type, model: 'elevenlabs', cost, charCount, timestamp };
    }
    case 'sfx': {
      return { type, model: 'elevenlabs', cost: PRICING.sfx.perGeneration, timestamp };
    }
    case 'meshy': {
      return { type, model: 'meshy-text-to-3d', cost: PRICING.meshy.perGeneration, timestamp };
    }
    default:
      return { type, cost: 0, timestamp };
  }
}
