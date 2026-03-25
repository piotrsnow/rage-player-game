import { buildSystemPrompt, buildSceneGenerationPrompt, buildCampaignCreationPrompt, buildRecapPrompt, buildObjectiveVerificationPrompt, buildCombatCommentaryPrompts } from './prompts';
import { apiClient } from './apiClient';
import { callLocalLLM, buildReducedSystemPrompt, buildReducedScenePrompt } from './localAI';
import {
  safeParseJSON, safeParseAIResponse, withRetry,
  SceneResponseSchema, CampaignResponseSchema, CompressionResponseSchema,
  RecapResponseSchema, StoryPromptResponseSchema, ObjectiveVerificationSchema, CombatCommentaryResponseSchema,
} from './aiResponseValidator';

export const AI_MODELS = [
  { id: 'gpt-5.4',                    provider: 'openai',    label: 'GPT-5.4',              cost: '~$2.50 / $15 per 1M tokens', tier: 'premium' },
  { id: 'gpt-5.4-mini',              provider: 'openai',    label: 'GPT-5.4 Mini',         cost: '~$0.75 / $4.50 per 1M tokens', tier: 'standard' },
  { id: 'gpt-5.4-nano',              provider: 'openai',    label: 'GPT-5.4 Nano',         cost: '~$0.20 / $1.25 per 1M tokens', tier: 'standard' },
  { id: 'gpt-4o',                     provider: 'openai',    label: 'GPT-4o',              cost: '~$2.50 / $10 per 1M tokens', tier: 'premium' },
  { id: 'gpt-4o-mini',                provider: 'openai',    label: 'GPT-4o Mini',          cost: '~$0.15 / $0.60 per 1M tokens', tier: 'standard' },
  { id: 'gpt-4.1',                    provider: 'openai',    label: 'GPT-4.1',              cost: '~$2.00 / $8.00 per 1M tokens', tier: 'premium' },
  { id: 'gpt-4.1-mini',              provider: 'openai',    label: 'GPT-4.1 Mini',         cost: '~$0.40 / $1.60 per 1M tokens', tier: 'standard' },
  { id: 'gpt-4.1-nano',              provider: 'openai',    label: 'GPT-4.1 Nano',         cost: '~$0.10 / $0.40 per 1M tokens', tier: 'standard' },
  { id: 'o4-mini',                    provider: 'openai',    label: 'o4-mini',               cost: '~$1.10 / $4.40 per 1M tokens', tier: 'premium' },
  { id: 'o3-mini',                    provider: 'openai',    label: 'o3-mini',               cost: '~$1.10 / $4.40 per 1M tokens', tier: 'premium' },
  { id: 'claude-sonnet-4-20250514',   provider: 'anthropic', label: 'Claude Sonnet 4',      cost: '~$3.00 / $15 per 1M tokens', tier: 'premium' },
  { id: 'claude-3-5-haiku-20241022',  provider: 'anthropic', label: 'Claude 3.5 Haiku',     cost: '~$0.80 / $4.00 per 1M tokens', tier: 'standard' },
  { id: 'claude-3-7-sonnet-20250219', provider: 'anthropic', label: 'Claude 3.7 Sonnet',    cost: '~$3.00 / $15 per 1M tokens', tier: 'premium' },
];

export const RECOMMENDED_MODELS = {
  openai: 'gpt-5.4',
  anthropic: 'claude-sonnet-4-20250514',
};

const MODEL_MAP = {
  openai:    { standard: 'gpt-5.4-mini',             premium: 'gpt-5.4' },
  anthropic: { standard: 'claude-3-5-haiku-20241022', premium: 'claude-sonnet-4-20250514' },
};

const TASK_TIER_OVERRIDE = {
  generateCampaign: 'premium',
  compressScenes:   'standard',
  generateRecap:    'standard',
  verifyObjective:  'standard',
  generateStoryPrompt: 'standard',
  generateCombatCommentary: 'standard',
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

function parseAIContent(content) {
  const result = safeParseJSON(content);
  if (!result.ok) throw new Error(result.error || 'Failed to parse AI response as JSON');
  return result.data;
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, maxTokens = 2000, model = 'gpt-5.4') {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  const usage = data.usage
    ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens, model }
    : null;
  return { result: parseAIContent(content), usage };
}

async function callAnthropic(apiKey, systemPrompt, userPrompt, maxTokens = 2000, model = 'claude-sonnet-4-20250514') {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;
  const usage = data.usage
    ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens, model }
    : null;
  return { result: parseAIContent(content), usage };
}

async function callOpenAIViaProxy(systemPrompt, userPrompt, maxTokens = 2000, model = 'gpt-5.4') {
  const data = await apiClient.post('/proxy/openai/chat', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model,
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });
  const content = data.choices[0]?.message?.content;
  const usage = data.usage
    ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens, model }
    : null;
  return { result: parseAIContent(content), usage };
}

async function callAnthropicViaProxy(systemPrompt, userPrompt, maxTokens = 2000, model = 'claude-sonnet-4-20250514') {
  const data = await apiClient.post('/proxy/anthropic/chat', {
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
    max_tokens: maxTokens,
    model,
  });
  const content = data.content[0]?.text;
  const usage = data.usage
    ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens, model }
    : null;
  return { result: parseAIContent(content), usage };
}

function getAlternateProvider(provider) {
  return provider === 'openai' ? 'anthropic' : 'openai';
}

async function callAI(provider, apiKey, systemPrompt, userPrompt, maxTokens, { localLLMConfig = null, model = null, modelTier = 'premium', taskType = null, alternateApiKey = null } = {}) {
  if (localLLMConfig?.enabled && localLLMConfig.endpoint) {
    return callLocalLLM(
      localLLMConfig.endpoint,
      localLLMConfig.model || '',
      systemPrompt,
      userPrompt,
      maxTokens,
    );
  }

  return withRetry(async (attempt) => {
    const useProvider = attempt < 2 ? provider : getAlternateProvider(provider);
    const useModel = (attempt < 2 && model)
      ? model
      : selectModel(useProvider, modelTier, taskType);

    if (apiClient.isConnected()) {
      if (useProvider === 'anthropic') {
        return callAnthropicViaProxy(systemPrompt, userPrompt, maxTokens, useModel);
      }
      return callOpenAIViaProxy(systemPrompt, userPrompt, maxTokens, useModel);
    }

    const useKey = attempt < 2 ? apiKey : alternateApiKey;
    if (!useKey) {
      throw new Error(`No API key configured for ${useProvider}. Please add your key in Settings.`);
    }

    if (useProvider === 'anthropic') {
      return callAnthropic(useKey, systemPrompt, userPrompt, maxTokens, useModel);
    }
    return callOpenAI(useKey, systemPrompt, userPrompt, maxTokens, useModel);
  }, {
    retries: 2,
    onRetry: (attempt, err, delay) => {
      console.warn(`[ai] Retry ${attempt + 1} after ${delay}ms:`, err.message);
    },
  });
}

export const aiService = {
  async generateCampaign(settings, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null, explicitModel = null } = {}) {
    const model = explicitModel || selectModel(provider, modelTier, 'generateCampaign');
    const systemPrompt = 'You are a master RPG campaign designer. Create rich, immersive campaign foundations that draw players into the story. Always respond with valid JSON only.';
    const userPrompt = buildCampaignCreationPrompt(settings, language);
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 4000, { model, modelTier, taskType: 'generateCampaign', alternateApiKey });
    const validated = safeParseAIResponse(result, CampaignResponseSchema);
    return { result: validated.ok ? validated.data : result, usage };
  },

  async generateScene(gameState, dmSettings, playerAction, isFirstScene, provider, apiKey, language = 'en', enhancedContext = null, { needsSystemEnabled = false, isCustomAction = false, preRolledDice = null, skipDiceRoll = false, momentumBonus = 0, localLLMConfig = null, modelTier = 'premium', alternateApiKey = null, explicitModel = null } = {}) {
    const model = explicitModel || selectModel(provider, modelTier, 'generateScene');
    const promptOpts = { needsSystemEnabled, characterNeeds: gameState.character?.needs || null, isCustomAction, preRolledDice, skipDiceRoll, momentumBonus, dialogue: gameState.dialogue || null, dialogueCooldown: gameState.dialogueCooldown || 0 };

    let systemPrompt, userPrompt;
    if (localLLMConfig?.enabled && localLLMConfig?.reducedPrompt) {
      systemPrompt = buildReducedSystemPrompt(gameState, dmSettings, language, enhancedContext, promptOpts);
      userPrompt = buildReducedScenePrompt(playerAction, isFirstScene, language, promptOpts, dmSettings);
    } else {
      systemPrompt = buildSystemPrompt(gameState, dmSettings, language, enhancedContext, promptOpts);
      userPrompt = buildSceneGenerationPrompt(playerAction, isFirstScene, language, promptOpts, dmSettings);
    }

    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 2000, { localLLMConfig, model, modelTier, taskType: 'generateScene', alternateApiKey });
    const validated = safeParseAIResponse(result, SceneResponseSchema);
    return { result: validated.ok ? validated.data : result, usage };
  },

  async generateRecap(gameState, dmSettings, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    const model = selectModel(provider, modelTier, 'generateRecap');
    const systemPrompt = buildSystemPrompt(gameState, dmSettings, language);
    const userPrompt = buildRecapPrompt(language);
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 500, { model, modelTier, taskType: 'generateRecap', alternateApiKey });
    const validated = safeParseAIResponse(result, RecapResponseSchema);
    return { result: validated.ok ? validated.data : result, usage };
  },

  async compressScenes(scenesText, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    const model = selectModel(provider, modelTier, 'compressScenes');
    const langNote = language === 'pl' ? ' Write the summary in Polish, matching the language of the source scenes.' : '';
    const systemPrompt = `You are a narrative summarizer for an RPG game. Compress scene histories into concise but complete summaries that preserve all important details: NPC names, locations, player decisions, consequences, combat outcomes, items found, and plot developments. Always respond with valid JSON only.${langNote}`;
    const userPrompt = `Summarize the following RPG scene history into a concise narrative summary (max 1500 characters). Preserve key facts: NPC names and fates, locations visited, items acquired/lost, major decisions and their consequences, combat outcomes, and unresolved plot threads.\n\nSCENES:\n${scenesText}\n\nRespond with JSON: {"summary": "Your compressed summary here..."}`;
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 800, { model, modelTier, taskType: 'compressScenes', alternateApiKey });
    const validated = safeParseAIResponse(result, CompressionResponseSchema);
    return { result: validated.ok ? validated.data : result, usage };
  },

  async generateStoryPrompt({ genre, tone, style, seedText = '' }, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    const model = selectModel(provider, modelTier, 'generateStoryPrompt');
    const systemPrompt = 'You are a creative RPG story idea generator. Invent original, evocative adventure premises. Always respond with valid JSON only.';
    const humorousGuidance = tone === 'Humorous'
      ? ` The humor must NOT be random absurdity or slapstick nonsense. Instead, ground the premise in a believable world and weave in 1-2 genuinely controversial, provocative, or morally ambiguous elements (e.g. corrupt religious authorities, morally grey freedom fighters, taboo social customs, ethically questionable magical practices, politically charged factions). The comedy should emerge naturally from how characters navigate these uncomfortable realities — dark irony, social satire, awkward moral dilemmas, and characters who take absurd stances on serious issues. Think Terry Pratchett or Monty Python: sharp wit wrapped around real-world controversies, not random zaniness.`
      : '';
    const trimmedSeedText = seedText.trim();
    const userPrompt = [
      `Generate ONE unique, creative RPG story premise for a ${genre} campaign with a ${tone} tone and ${style} play style.`,
      `The premise should be 1-2 sentences, intriguing, and specific enough to spark a full campaign.${humorousGuidance}`,
      trimmedSeedText
        ? `Use the following user-provided words, phrases, or notes as core inspiration. Rework them into a polished adventure premise, but keep the important ideas and explicitly incorporate the provided concepts: "${trimmedSeedText}".`
        : 'Invent the premise from scratch.',
      `Write the premise in ${language === 'pl' ? 'Polish' : 'English'}.`,
      `Respond with JSON: { "prompt": "<the story premise>" }`,
    ].join('\n');
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 300, { model, modelTier, taskType: 'generateStoryPrompt', alternateApiKey });
    const validated = safeParseAIResponse(result, StoryPromptResponseSchema);
    return { result: validated.ok ? validated.data : result, usage };
  },

  async generateCombatCommentary(gameState, combatSnapshot, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null, explicitModel = null } = {}) {
    const model = explicitModel || selectModel(provider, modelTier, 'generateCombatCommentary');
    const prompts = buildCombatCommentaryPrompts(gameState, combatSnapshot, language);
    const { result, usage } = await callAI(provider, apiKey, prompts.system, prompts.user, 700, {
      model,
      modelTier,
      taskType: 'generateCombatCommentary',
      alternateApiKey,
    });
    const validated = safeParseAIResponse(result, CombatCommentaryResponseSchema);
    return { result: validated.ok ? validated.data : result, usage };
  },

  async verifyObjective(storyContext, questName, questDescription, objectiveDescription, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    const model = selectModel(provider, modelTier, 'verifyObjective');
    const prompts = buildObjectiveVerificationPrompt(storyContext, questName, questDescription, objectiveDescription, language);
    const { result, usage } = await callAI(provider, apiKey, prompts.system, prompts.user, 500, { model, modelTier, taskType: 'verifyObjective', alternateApiKey });
    const validated = safeParseAIResponse(result, ObjectiveVerificationSchema);
    return { result: validated.ok ? validated.data : result, usage };
  },
};
