const PROFILE_IDS = ['starter', 'balanced', 'deep'];

const PROFILE_CONFIG = {
  starter: {
    id: 'starter',
    sceneTokenBudget: 850,
    promptTokenBudget: 2800,
    contextDepthCap: { standard: 35, premium: 50 },
    guidance: 'Prefer concise narration, one major beat, minimal digressions.',
  },
  balanced: {
    id: 'balanced',
    sceneTokenBudget: 1300,
    promptTokenBudget: 4200,
    contextDepthCap: { standard: 60, premium: 80 },
    guidance: 'Balance pacing, flavor, and mechanics with moderate detail.',
  },
  deep: {
    id: 'deep',
    sceneTokenBudget: 1800,
    promptTokenBudget: 6000,
    contextDepthCap: { standard: 75, premium: 100 },
    guidance: 'Allow richer detail and callbacks while keeping strict JSON compliance.',
  },
};

function sanitizeTier(modelTier) {
  return modelTier === 'standard' ? 'standard' : 'premium';
}

function sanitizeProfile(profileId) {
  return PROFILE_IDS.includes(profileId) ? profileId : null;
}

function getDefaultProfileId(modelTier, localLLMEnabled = false) {
  if (localLLMEnabled) return 'starter';
  return sanitizeTier(modelTier) === 'standard' ? 'starter' : 'balanced';
}

export function resolvePromptProfile(dmSettings = {}, modelTier = 'premium', localLLMEnabled = false) {
  const explicit = sanitizeProfile(dmSettings?.promptProfile);
  return explicit || getDefaultProfileId(modelTier, localLLMEnabled);
}

export function resolveContextDepthForProfile(requestedDepth = 100, profileId = 'balanced', modelTier = 'premium') {
  const profile = PROFILE_CONFIG[sanitizeProfile(profileId) || 'balanced'];
  const tier = sanitizeTier(modelTier);
  const cap = profile.contextDepthCap[tier] ?? 100;
  const safeRequested = Number.isFinite(requestedDepth) ? requestedDepth : 100;
  return Math.max(0, Math.min(safeRequested, cap));
}

export function getSceneAIGovernance({
  profileId = 'balanced',
  modelTier = 'premium',
  isFirstScene = false,
  localLLMEnabled = false,
} = {}) {
  const profile = PROFILE_CONFIG[sanitizeProfile(profileId) || getDefaultProfileId(modelTier, localLLMEnabled)];
  const contextDepthCap = profile.contextDepthCap[sanitizeTier(modelTier)] ?? 100;
  const sceneTokenBudget = isFirstScene
    ? Math.min(profile.sceneTokenBudget + 200, 2200)
    : profile.sceneTokenBudget;

  return {
    profile,
    sceneTokenBudget,
    promptTokenBudget: profile.promptTokenBudget,
    contextDepthCap,
    knowledgeMinContextDepth: Math.min(75, contextDepthCap),
    mediumContextMinDepth: Math.min(50, contextDepthCap),
  };
}

export function estimateTokenCount(text) {
  return Math.ceil((text?.length || 0) / 4);
}

export function enforcePromptTokenBudget(systemPrompt, userPrompt, promptTokenBudget) {
  const budgetTokens = Number(promptTokenBudget);
  if (!Number.isFinite(budgetTokens) || budgetTokens <= 0) {
    return { systemPrompt, userPrompt, truncated: false };
  }

  const maxChars = Math.floor(budgetTokens * 4);
  const totalChars = (systemPrompt?.length || 0) + (userPrompt?.length || 0);
  if (totalChars <= maxChars) {
    return { systemPrompt, userPrompt, truncated: false };
  }

  const marker = '\n...[PROMPT TRUNCATED FOR TOKEN BUDGET]';
  const systemShare = Math.floor(maxChars * 0.62);
  const userShare = Math.max(400, maxChars - systemShare);

  const truncate = (text, maxLen) => {
    if (!text || text.length <= maxLen) return text || '';
    const target = Math.max(0, maxLen - marker.length);
    return `${text.slice(0, target)}${marker}`;
  };

  return {
    systemPrompt: truncate(systemPrompt, systemShare),
    userPrompt: truncate(userPrompt, userShare),
    truncated: true,
  };
}

