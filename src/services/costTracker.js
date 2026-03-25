const PRICING = {
  ai: {
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'claude-sonnet-4-20250514': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
    'claude-3-5-haiku-20241022': { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 },
  },
  image: {
    'dall-e-3': 0.080,
    'sd3.5-large-turbo': 0.065,
    'gemini-2.5-flash-image': 0.039,
  },
  tts: { perChar: 0.30 / 1000 },
  sfx: { perGeneration: 0.10 },
};

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
      const model = provider === 'stability' ? 'sd3.5-large-turbo' : provider === 'gemini' ? 'gemini-2.5-flash-image' : 'dall-e-3';
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
    default:
      return { type, cost: 0, timestamp };
  }
}
