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
    sceneTokenBudget: 1450,
    promptTokenBudget: 4800,
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
  sceneCount = 0,
} = {}) {
  const profile = PROFILE_CONFIG[sanitizeProfile(profileId) || getDefaultProfileId(modelTier, localLLMEnabled)];
  const contextDepthCap = profile.contextDepthCap[sanitizeTier(modelTier)] ?? 100;
  const safeSceneCount = Number.isFinite(sceneCount) ? Math.max(0, sceneCount) : 0;
  const longSessionPromptBoost = safeSceneCount >= 30 ? 1200 : safeSceneCount >= 20 ? 800 : safeSceneCount >= 12 ? 400 : 0;
  const longSessionSceneBoost = safeSceneCount >= 30 ? 250 : safeSceneCount >= 20 ? 180 : safeSceneCount >= 12 ? 120 : 0;
  const sceneTokenBudget = isFirstScene
    ? Math.min(profile.sceneTokenBudget + 200, 2200)
    : profile.sceneTokenBudget + longSessionSceneBoost;
  const promptTokenBudget = profile.promptTokenBudget + longSessionPromptBoost;

  return {
    profile,
    sceneTokenBudget,
    promptTokenBudget,
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
  let safeSystemPrompt = systemPrompt || '';
  const safeUserPrompt = userPrompt || '';
  const totalChars = safeSystemPrompt.length + safeUserPrompt.length;
  if (totalChars <= maxChars) {
    return { systemPrompt: safeSystemPrompt, userPrompt: safeUserPrompt, truncated: false };
  }

  const marker = '\n...[PROMPT TRUNCATED FOR TOKEN BUDGET]';
  const systemShare = Math.floor(maxChars * 0.66);
  const userShare = Math.max(500, maxChars - systemShare);
  const safeRemoveSection = (text, sectionHeader) => {
    const escaped = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rgx = new RegExp(`\\n${escaped}[\\s\\S]*?(?=\\n[A-Z][A-Z _()'\\-]{5,}:|$)`, 'g');
    return text.replace(rgx, '\n');
  };

  if (safeSystemPrompt.length > systemShare) {
    const optionalHeaders = [
      'BESTIARY REFERENCE',
      'MAGIC SYSTEM',
      'CHARACTER SPEECH & LINGUISTIC IDENTITY',
      'SOUND EFFECTS',
      'BACKGROUND MUSIC',
      'MAP STATE (explored locations)',
      'REFERENCE PRICE LIST',
      'LOOT RARITY GATING',
    ];
    for (const header of optionalHeaders) {
      if (safeSystemPrompt.length <= systemShare) break;
      safeSystemPrompt = safeRemoveSection(safeSystemPrompt, header);
    }
  }

  const truncate = (text, maxLen) => {
    if (!text || text.length <= maxLen) return text || '';
    const target = Math.max(0, maxLen - marker.length);
    return `${text.slice(0, target)}${marker}`;
  };

  return {
    systemPrompt: truncate(safeSystemPrompt, systemShare),
    userPrompt: truncate(safeUserPrompt, userShare),
    truncated: true,
  };
}

