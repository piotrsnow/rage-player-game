// sceneBadge marks models appropriate for scene generation in the FE picker.
//   'budget'   — cheap non-reasoner, good for high-volume play
//   'balanced' — non-reasoner, recommended default for scenes
//   'reasoner' — reasoning-family; use when you want extra planning at cost + latency
// Untagged models (nano, older mini, o-series mini) don't appear in the scene picker.
export const AI_MODELS = [
  { id: 'gpt-5.4',                    provider: 'openai',    label: 'GPT-5.4',              cost: '~$2.50 / $15 per 1M tokens', tier: 'premium', sceneBadge: 'reasoner' },
  { id: 'gpt-5.4-mini',              provider: 'openai',    label: 'GPT-5.4 Mini',         cost: '~$0.75 / $4.50 per 1M tokens', tier: 'standard' },
  { id: 'gpt-5.4-nano',              provider: 'openai',    label: 'GPT-5.4 Nano',         cost: '~$0.20 / $1.25 per 1M tokens', tier: 'standard' },
  { id: 'gpt-4o',                     provider: 'openai',    label: 'GPT-4o',              cost: '~$2.50 / $10 per 1M tokens', tier: 'premium' },
  { id: 'gpt-4o-mini',                provider: 'openai',    label: 'GPT-4o Mini',          cost: '~$0.15 / $0.60 per 1M tokens', tier: 'standard' },
  { id: 'gpt-4.1',                    provider: 'openai',    label: 'GPT-4.1',              cost: '~$2.00 / $8.00 per 1M tokens', tier: 'premium', sceneBadge: 'balanced' },
  { id: 'gpt-4.1-mini',              provider: 'openai',    label: 'GPT-4.1 Mini',         cost: '~$0.40 / $1.60 per 1M tokens', tier: 'standard', sceneBadge: 'budget' },
  { id: 'gpt-4.1-nano',              provider: 'openai',    label: 'GPT-4.1 Nano',         cost: '~$0.10 / $0.40 per 1M tokens', tier: 'standard' },
  { id: 'o4-mini',                    provider: 'openai',    label: 'o4-mini',               cost: '~$1.10 / $4.40 per 1M tokens', tier: 'premium' },
  { id: 'o3-mini',                    provider: 'openai',    label: 'o3-mini',               cost: '~$1.10 / $4.40 per 1M tokens', tier: 'premium' },
  { id: 'claude-sonnet-4-20250514',   provider: 'anthropic', label: 'Claude Sonnet 4',      cost: '~$3.00 / $15 per 1M tokens', tier: 'premium', sceneBadge: 'balanced' },
  { id: 'claude-haiku-4-5-20251001',   provider: 'anthropic', label: 'Claude 4.5 Haiku',     cost: '~$0.80 / $4.00 per 1M tokens', tier: 'standard', sceneBadge: 'budget' },
  { id: 'claude-3-7-sonnet-20250219', provider: 'anthropic', label: 'Claude 3.7 Sonnet',    cost: '~$3.00 / $15 per 1M tokens', tier: 'premium' },
];

// Shown as "Polecany" badge on the recommended model in the scene picker.
// gpt-4.1 (not gpt-5.4) because our two-stage pipeline offloads reasoning to
// nano + code; premium's job is creative writing + streaming JSON, where
// reasoning tokens are wasted latency/cost and inflate dialogue length.
export const RECOMMENDED_MODELS = {
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-20250514',
};

// Mirrors backend/src/config.js `aiModels`. Backend has a 4th `nanoReasoning`
// tier (gpt-5.4-nano) for memory compression, not exposed here — it's an
// internal backend concern and has no FE picker.
const MODEL_MAP = {
  openai:    { nano: 'gpt-4.1-nano', standard: 'gpt-4.1-mini',             premium: 'gpt-4.1' },
  anthropic: { nano: 'claude-haiku-4-5-20251001', standard: 'claude-haiku-4-5-20251001', premium: 'claude-sonnet-4-20250514' },
};

const TASK_TIER_OVERRIDE = {
  generateCampaign: 'premium',
  compressScenes:   'standard',
  generateRecap:    'standard',
  verifyObjective:  'standard',
  generateStoryPrompt: 'standard',
  generateCombatCommentary: 'standard',
  inferSkillCheck:  'nano',
};

export function selectModel(provider, tier, taskType) {
  const effectiveTier = TASK_TIER_OVERRIDE[taskType] || tier || 'premium';
  const providerModels = MODEL_MAP[provider] || MODEL_MAP.openai;
  return providerModels[effectiveTier] || providerModels.premium;
}

export function resolveModel(provider, explicitModelId) {
  if (explicitModelId) return explicitModelId;
  return RECOMMENDED_MODELS[provider] || RECOMMENDED_MODELS.openai;
}
