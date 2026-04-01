import { buildSystemPrompt, buildSceneGenerationPrompt, buildCampaignCreationPrompt, buildRecapPrompt, buildRecapMergePrompt, buildObjectiveVerificationPrompt, buildCombatCommentaryPrompts } from './prompts';
import { apiClient } from './apiClient';
import { callLocalLLM, buildReducedSystemPrompt, buildReducedScenePrompt } from './localAI';
import {
  safeParseJSON, safeParseAIResponse, withRetry,
  SceneResponseSchema, CampaignResponseSchema, CompressionResponseSchema,
  RecapResponseSchema, StoryPromptResponseSchema, ObjectiveVerificationSchema, CombatCommentaryResponseSchema,
} from './aiResponseValidator';
import { enforcePromptTokenBudget, getSceneAIGovernance, resolvePromptProfile } from './promptGovernance';

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
  { id: 'claude-haiku-4-5-20251001',   provider: 'anthropic', label: 'Claude 4.5 Haiku',     cost: '~$0.80 / $4.00 per 1M tokens', tier: 'standard' },
  { id: 'claude-3-7-sonnet-20250219', provider: 'anthropic', label: 'Claude 3.7 Sonnet',    cost: '~$3.00 / $15 per 1M tokens', tier: 'premium' },
];

export const RECOMMENDED_MODELS = {
  openai: 'gpt-5.4',
  anthropic: 'claude-sonnet-4-20250514',
};

const MODEL_MAP = {
  openai:    { standard: 'gpt-5.4-mini',             premium: 'gpt-5.4' },
  anthropic: { standard: 'claude-haiku-4-5-20251001', premium: 'claude-sonnet-4-20250514' },
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

function normalizeRecapNarrative(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return '';

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const listPattern = /^([-*•]|\d+[.)])\s+/;
  const headingPattern = /^#{1,6}\s+/;
  const listLines = lines.filter((line) => listPattern.test(line)).length;
  const hasListFormatting = listLines > 0 || lines.some((line) => headingPattern.test(line));
  if (!hasListFormatting) return raw;

  return lines
    .map((line) => line.replace(headingPattern, '').replace(listPattern, '').trim())
    .filter(Boolean)
    .join(' ');
}

const RECAP_SCENE_CHUNK_SIZE = 50;
const RECAP_COMPLETION_TOKENS = 500;

function chunkArray(items, size) {
  const chunkSize = Math.max(1, Number(size) || 1);
  if (!Array.isArray(items) || items.length === 0) return [];
  const chunks = [];
  for (let idx = 0; idx < items.length; idx += chunkSize) {
    chunks.push(items.slice(idx, idx + chunkSize));
  }
  return chunks;
}

function filterChatHistoryByScenes(chatHistory, sceneChunk, { includeMessagesWithoutSceneId = false } = {}) {
  const messages = Array.isArray(chatHistory) ? chatHistory : [];
  const chunkSceneIds = new Set((Array.isArray(sceneChunk) ? sceneChunk : []).map((scene) => scene?.id).filter(Boolean));
  return messages.filter((msg) => {
    if (!msg?.sceneId) return includeMessagesWithoutSceneId;
    return chunkSceneIds.has(msg.sceneId);
  });
}

function mergeUsageTotals(totalUsage, nextUsage) {
  if (!nextUsage) return totalUsage;
  const current = totalUsage
    ? { ...totalUsage }
    : { prompt_tokens: 0, completion_tokens: 0, model: nextUsage.model || null };
  current.prompt_tokens += Number(nextUsage.prompt_tokens) || 0;
  current.completion_tokens += Number(nextUsage.completion_tokens) || 0;
  if (!current.model && nextUsage.model) current.model = nextUsage.model;
  return current;
}

function normalizeActionForComparison(action) {
  return String(action || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:()[\]{}"']/g, '')
    .replace(/\s+/g, ' ');
}

function hashTextSeed(text = '') {
  if (!text) return 0;
  return [...String(text)].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) % 1000003, 17);
}

function pickVariant(variants, seed, offset = 0) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  return variants[(seed + offset) % variants.length];
}

function collectRecentActionSet(gameState, sceneWindow = 3) {
  return (gameState?.scenes || [])
    .slice(-Math.max(1, sceneWindow))
    .flatMap((scene) => (Array.isArray(scene?.actions) ? scene.actions : []))
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter(Boolean);
}

function isGenericFillerAction(action, language = 'en') {
  const normalized = normalizeActionForComparison(action);
  if (!normalized) return true;
  const enPatterns = [
    /^i look around$/,
    /^look around$/,
    /^i move on$/,
    /^move on$/,
    /^i continue$/,
    /^continue$/,
    /^i wait$/,
    /^wait$/,
    /^i observe$/,
    /^observe$/,
    /^i talk to someone$/,
    /^talk to someone$/,
    /^i investigate$/,
    /^investigate$/,
    /^i proceed$/,
    /^proceed$/,
    /^i press forward$/,
    /^press forward$/,
  ];
  const plPatterns = [
    /^rozgladam sie$/,
    /^rozgladam sie uwaznie po okolicy$/,
    /^idę dalej$/,
    /^ide dalej$/,
    /^ruszam dalej$/,
    /^kontynuuje$/,
    /^czekam$/,
    /^obserwuje$/,
    /^obserwuję$/,
    /^rozmawiam z kims$/,
    /^rozmawiam z kimś$/,
    /^badam sytuacje$/,
    /^badam sytuację$/,
    /^idziemy dalej$/,
    /^idzmy dalej$/,
    /^idźmy dalej$/,
  ];
  const patterns = language === 'pl' ? plPatterns : enPatterns;
  return patterns.some((pattern) => pattern.test(normalized));
}

function isDialogueStyleAction(action, language = 'en') {
  const text = String(action || '').trim();
  if (!text) return false;
  if (/["“„].+["”]/.test(text)) return true;
  if (language === 'pl') {
    return /^(mówię|pytam|szepczę|krzyczę|wołam|mowie|pytam)\b/i.test(text);
  }
  return /^(i say|i ask|i whisper|i shout|i call out|i tell)\b/i.test(text);
}

function buildDialogueFallbackActions(language = 'en', { npcs = [] } = {}) {
  const npcName = npcs[0]?.name || npcs[0] || null;
  if (language === 'pl') {
    return [
      npcName
        ? `Mówię do ${npcName}: "Spokojnie, opowiedz mi po kolei, co tu zaszło."`
        : 'Mówię: "Spokojnie, opowiedzcie mi po kolei, co tu zaszło."',
      npcName
        ? `Krzyczę do ${npcName}: "Na Sigmara, bez gierek - chcę prawdy, teraz!"`
        : 'Krzyczę: "Na Sigmara, bez gierek - chcę prawdy, teraz!"',
    ];
  }
  return [
    npcName
      ? `I tell ${npcName}: "Easy now. Start from the beginning and tell me exactly what happened."`
      : 'I say: "Easy now. Start from the beginning and tell me exactly what happened."',
    npcName
      ? `I shout to ${npcName}: "By Sigmar, no games - I want the truth, now!"`
      : 'I shout: "By Sigmar, no games - I want the truth, now!"',
  ];
}

function buildFallbackActions(language = 'en', { narrative = '', currentLocation = '', npcs = [] } = {}, { sceneIndex = 0 } = {}) {
  const npcName = npcs[0]?.name || npcs[0] || null;
  const location = typeof currentLocation === 'string' ? currentLocation.trim() : '';
  const narrativeHint = typeof narrative === 'string' ? narrative.trim() : '';
  const safeSceneIndex = Math.max(0, Number.isFinite(sceneIndex) ? sceneIndex : 0);
  const seed = hashTextSeed(`${narrativeHint}|${location}|${npcName || ''}|${safeSceneIndex}`);
  if (language === 'pl') {
    const investigateVariants = [
      'Analizuję świeże tropy z tej sytuacji, zanim ruszę dalej',
      'Składam fakty w całość i szukam luki w tym, co widzę',
      'Badam najważniejsze szczegóły, żeby nie przegapić zagrożenia',
      'Odtwarzam w myślach przebieg zdarzeń i szukam słabego punktu',
    ];
    const tacticalVariants = [
      'Sprawdzam, który ruch da mi teraz najbezpieczniejszą przewagę',
      'Ustawiam się tak, by mieć osłonę i dobry ogląd sytuacji',
      'Wybieram pozycję, z której łatwo zareaguję na nagłą zmianę',
      'Oceniam drogę odwrotu i miejsca, gdzie mogę zyskać przewagę',
    ];
    return [
      npcName
        ? pickVariant([
          `Podchodzę do ${npcName} i pytam o szczegóły`,
          `Zagaduję ${npcName}, żeby wydobyć konkrety`,
          `Próbuję wyciągnąć od ${npcName} najważniejsze informacje`,
          `Prowokuję ${npcName} do szczerej odpowiedzi`,
        ], seed, 0)
        : pickVariant([
          'Pytam najbliższą osobę o to, co właśnie się wydarzyło',
          'Wypytuję świadków, kto i dlaczego wywołał zamieszanie',
          'Zbieram krótkie relacje od ludzi wokół',
          'Szukam kogoś, kto widział najwięcej i pytam o fakty',
        ], seed, 0),
      location
        ? pickVariant([
          `Sprawdzam dokładnie okolice ${location}`,
          `Przeszukuję ${location} w poszukiwaniu świeżych śladów`,
          `Obchodzę ${location}, szukając czegoś podejrzanego`,
          `Badam ${location} punkt po punkcie`,
        ], seed, 1)
        : pickVariant([
          'Przeszukuję najbliższą okolicę w poszukiwaniu śladów',
          'Rozpoznaję teren i szukam punktów zaczepienia',
          'Sprawdzam otoczenie, czy coś nie pasuje do sytuacji',
          'Badam najbliższe miejsce, gdzie mogło dojść do zdarzenia',
        ], seed, 1),
      narrativeHint ? pickVariant(investigateVariants, seed, 2) : 'Wybieram ostrożniejszą pozycję i obserwuję reakcje otoczenia',
      pickVariant(tacticalVariants, seed, 3),
      ...(buildDialogueFallbackActions(language, { npcs })),
    ];
  }
  const investigateVariants = [
    'I analyze the latest development before committing to a direction',
    'I piece together what just happened and look for weak points',
    'I inspect the most relevant details before moving',
    'I mentally reconstruct the sequence of events for clues',
  ];
  const tacticalVariants = [
    'I pick the move that gives me the safest immediate advantage',
    'I reposition where I can react quickly if this escalates',
    'I secure a better vantage point before acting',
    'I check my fallback route and likely threat angles',
  ];
  return [
    npcName
      ? pickVariant([
        `I approach ${npcName} and ask for concrete details`,
        `I question ${npcName} directly about what triggered this`,
        `I press ${npcName} for the most important facts`,
        `I challenge ${npcName} to clarify what is being hidden`,
      ], seed, 0)
      : pickVariant([
        'I ask the nearest person what exactly just happened',
        'I question the witnesses about who started this and why',
        'I gather quick statements from people nearby',
        'I find the most informed witness and ask for facts',
      ], seed, 0),
    location
      ? pickVariant([
        `I inspect ${location} for immediate clues`,
        `I sweep ${location} for fresh signs of trouble`,
        `I examine ${location} step by step`,
        `I search around ${location} for anything out of place`,
      ], seed, 1)
      : pickVariant([
        'I search the nearby area for concrete clues',
        'I scout the immediate surroundings for points of interest',
        'I check the area for anything that does not fit',
        'I examine the closest likely scene for evidence',
      ], seed, 1),
    narrativeHint ? pickVariant(investigateVariants, seed, 2) : 'I shift to a safer position and watch how others react',
    pickVariant(tacticalVariants, seed, 3),
    ...(buildDialogueFallbackActions(language, { npcs })),
  ];
}

function pickContextualNpcs(gameState = null, stateChanges = null) {
  const currentLocation = stateChanges?.currentLocation || gameState?.world?.currentLocation || '';
  const npcsInWorld = Array.isArray(gameState?.world?.npcs) ? gameState.world.npcs : [];
  const npcsChanged = Array.isArray(stateChanges?.npcs) ? stateChanges.npcs : [];
  const merged = [...npcsChanged, ...npcsInWorld].filter(Boolean);
  if (!currentLocation) return merged;
  const normalizedCurrent = String(currentLocation).trim().toLowerCase();
  const atCurrentLocation = merged.filter((npc) => {
    const lastLoc = npc?.lastLocation;
    if (!lastLoc || typeof lastLoc !== 'string') return false;
    return lastLoc.trim().toLowerCase() === normalizedCurrent;
  });
  return atCurrentLocation.length > 0 ? atCurrentLocation : merged;
}

function buildFallbackNarrative(language = 'en') {
  if (language === 'pl') {
    return 'Sytuacja wokół ciebie pozostaje napięta, ale czytelna. Zbierasz myśli, oceniasz zagrożenia i możliwości, a świat reaguje na twoją obecność subtelnymi sygnałami. To dobry moment, by świadomie wybrać kolejny krok.';
  }
  return 'The situation around you stays tense but readable. You gather your thoughts, assess risks and opportunities, and notice subtle reactions in the world around you. This is a good moment to choose your next move deliberately.';
}

function postProcessSuggestedActions({
  suggestedActions,
  language = 'en',
  gameState = null,
  narrative = '',
  stateChanges = {},
} = {}) {
  const seen = new Set();
  const aiCandidates = (Array.isArray(suggestedActions) ? suggestedActions : [])
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter(Boolean);

  const normalizedAiActions = [];
  for (const action of aiCandidates) {
    const normalized = normalizeActionForComparison(action);
    if (!normalized || seen.has(normalized)) continue;
    normalizedAiActions.push(action);
    seen.add(normalized);
  }
  if (normalizedAiActions.length > 0) return normalizedAiActions.slice(0, 6);

  const currentLocation = stateChanges?.currentLocation || gameState?.world?.currentLocation || '';
  const npcs = pickContextualNpcs(gameState, stateChanges);
  const sceneIndex = (gameState?.scenes?.length || 0) + 1;
  const contextualFallback = buildFallbackActions(language, { narrative, currentLocation, npcs }, { sceneIndex });
  return contextualFallback.slice(0, 6);
}

function buildDegradedSceneResponse({ language = 'en', reason = 'validation_failed', rawResult = null, gameState = null, degradeType = 'schema_validation' } = {}) {
  const narrative = typeof rawResult?.narrative === 'string' && rawResult.narrative.trim()
    ? rawResult.narrative.trim()
    : buildFallbackNarrative(language);
  const stateChanges = rawResult?.stateChanges && typeof rawResult.stateChanges === 'object'
    ? rawResult.stateChanges
    : { journalEntries: [], worldFacts: [], timeAdvance: { hoursElapsed: 0.5, newDay: false } };
  const suggestedActions = postProcessSuggestedActions({
    suggestedActions: Array.isArray(rawResult?.suggestedActions) && rawResult.suggestedActions.length > 0
      ? rawResult.suggestedActions
      : buildFallbackActions(language, {
          narrative,
          currentLocation: stateChanges?.currentLocation || gameState?.world?.currentLocation || '',
          npcs: [...(stateChanges?.npcs || []), ...(gameState?.world?.npcs || [])],
        }),
    language,
    gameState,
    narrative,
    stateChanges,
  });
  const dialogueSegments = Array.isArray(rawResult?.dialogueSegments) && rawResult.dialogueSegments.length > 0
    ? rawResult.dialogueSegments
    : [{ type: 'narration', text: narrative }];

  return {
    narrative,
    scenePacing: rawResult?.scenePacing || 'exploration',
    dialogueSegments,
    soundEffect: rawResult?.soundEffect ?? null,
    musicPrompt: rawResult?.musicPrompt ?? null,
    imagePrompt: rawResult?.imagePrompt ?? null,
    atmosphere: rawResult?.atmosphere || {},
    suggestedActions,
    questOffers: Array.isArray(rawResult?.questOffers) ? rawResult.questOffers : [],
    stateChanges,
    diceRoll: rawResult?.diceRoll ?? null,
    cutscene: rawResult?.cutscene ?? null,
    dilemma: rawResult?.dilemma ?? null,
    meta: { degraded: true, reason, contextQuality: 'degraded', degradeType },
  };
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

    throw new Error('AI requests require a connected backend with server API keys configured in environment variables.');
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
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 8000, { model, modelTier, taskType: 'generateCampaign', alternateApiKey });
    const validated = safeParseAIResponse(result, CampaignResponseSchema);
    if (validated.ok) return { result: validated.data, usage };

    const raw = validated.data || {};
    const rawScene = raw.firstScene && typeof raw.firstScene === 'object' ? raw.firstScene : {};
    const fallbackNarrative = buildFallbackNarrative(language);
    const narrative = typeof rawScene.narrative === 'string' && rawScene.narrative.trim()
      ? rawScene.narrative.trim()
      : typeof raw.hook === 'string' && raw.hook.trim()
        ? raw.hook.trim()
        : fallbackNarrative;

    const suggestedActions = postProcessSuggestedActions({
      suggestedActions: Array.isArray(rawScene.suggestedActions) && rawScene.suggestedActions.length > 0
        ? rawScene.suggestedActions.filter((a) => typeof a === 'string' && a.trim())
        : buildFallbackActions(language, { narrative }),
      language,
      gameState: null,
      narrative,
      stateChanges: rawScene?.stateChanges || {},
    });

    const dialogueSegments = Array.isArray(rawScene.dialogueSegments) && rawScene.dialogueSegments.length > 0
      ? rawScene.dialogueSegments
      : [{ type: 'narration', text: narrative }];

    console.warn('[ai] Campaign schema validation failed, using raw AI data with fallbacks:', validated.error);
    return {
      result: {
        name: typeof raw.name === 'string' && raw.name.trim()
          ? raw.name.trim()
          : settings?.storyPrompt ? `Campaign: ${String(settings.storyPrompt).slice(0, 40)}` : 'Unnamed Campaign',
        worldDescription: typeof raw.worldDescription === 'string' && raw.worldDescription.trim()
          ? raw.worldDescription.trim()
          : language === 'pl'
            ? 'Świat jest pełen napięć, konfliktów frakcji i ukrytych zagrożeń.'
            : 'The world is full of tension, faction conflict, and hidden threats.',
        hook: typeof raw.hook === 'string' && raw.hook.trim()
          ? raw.hook.trim()
          : language === 'pl'
            ? 'Twoja historia zaczyna się od niepozornego tropu, który prowadzi do większej intrygi.'
            : 'Your story begins with a small clue that opens into a larger conspiracy.',
        characterSuggestion: raw.characterSuggestion || undefined,
        firstScene: {
          narrative,
          dialogueSegments,
          suggestedActions,
          soundEffect: rawScene.soundEffect ?? null,
          musicPrompt: rawScene.musicPrompt ?? null,
          imagePrompt: rawScene.imagePrompt ?? null,
          sceneGrid: rawScene.sceneGrid ?? null,
          atmosphere: rawScene.atmosphere && typeof rawScene.atmosphere === 'object' ? rawScene.atmosphere : {},
          journalEntries: Array.isArray(rawScene.journalEntries) ? rawScene.journalEntries : [],
        },
        initialQuest: raw.initialQuest || undefined,
        initialNPCs: Array.isArray(raw.initialNPCs) ? raw.initialNPCs : [],
        initialWorldFacts: Array.isArray(raw.initialWorldFacts) ? raw.initialWorldFacts : [],
        meta: { degraded: true, reason: validated.error || 'campaign_schema_validation_failed' },
      },
      usage,
    };
  },

  async generateScene(gameState, dmSettings, playerAction, isFirstScene, provider, apiKey, language = 'en', enhancedContext = null, {
    needsSystemEnabled = false,
    isCustomAction = false,
    fromAutoPlayer = false,
    resolvedMechanics = null,
    localLLMConfig = null,
    modelTier = 'premium',
    alternateApiKey = null,
    explicitModel = null,
    promptProfile = null,
    sceneTokenBudget = null,
    promptTokenBudget = null,
  } = {}) {
    const model = explicitModel || selectModel(provider, modelTier, 'generateScene');
    const resolvedPromptProfile = resolvePromptProfile(dmSettings, modelTier, Boolean(localLLMConfig?.enabled) || false);
    const governance = getSceneAIGovernance({
      profileId: promptProfile || resolvedPromptProfile,
      modelTier,
      isFirstScene,
      localLLMEnabled: Boolean(localLLMConfig?.enabled),
      sceneCount: gameState?.scenes?.length || 0,
    });
    const completionBudget = Number.isFinite(sceneTokenBudget) ? sceneTokenBudget : governance.sceneTokenBudget;
    const promptBudget = Number.isFinite(promptTokenBudget) ? promptTokenBudget : governance.promptTokenBudget;
    const promptOpts = { needsSystemEnabled, characterNeeds: gameState.character?.needs || null, isCustomAction, fromAutoPlayer, resolvedMechanics, dialogue: gameState.dialogue || null, dialogueCooldown: gameState.dialogueCooldown || 0, scenes: gameState.scenes || null };

    let systemPrompt, userPrompt;
    if (localLLMConfig?.enabled && localLLMConfig?.reducedPrompt) {
      systemPrompt = buildReducedSystemPrompt(gameState, dmSettings, language, enhancedContext, promptOpts);
      userPrompt = buildReducedScenePrompt(playerAction, isFirstScene, language, promptOpts, dmSettings);
    } else {
      systemPrompt = buildSystemPrompt(gameState, dmSettings, language, enhancedContext, {
        ...promptOpts,
        promptProfile: governance.profile.id,
        sceneTokenBudget: completionBudget,
        promptTokenBudget: promptBudget,
      });
      userPrompt = buildSceneGenerationPrompt(
        playerAction,
        isFirstScene,
        language,
        {
          ...promptOpts,
          promptProfile: governance.profile.id,
          sceneTokenBudget: completionBudget,
          promptTokenBudget: promptBudget,
        },
        dmSettings
      );
    }

    const budgetedPrompts = enforcePromptTokenBudget(systemPrompt, userPrompt, promptBudget);
    const { result, usage } = await callAI(
      provider,
      apiKey,
      budgetedPrompts.systemPrompt,
      budgetedPrompts.userPrompt,
      completionBudget,
      { localLLMConfig, model, modelTier, taskType: 'generateScene', alternateApiKey }
    );
    const validated = safeParseAIResponse(result, SceneResponseSchema);
    if (validated.ok) {
      validated.data.suggestedActions = postProcessSuggestedActions({
        suggestedActions: validated.data.suggestedActions,
        language,
        gameState,
        narrative: validated.data.narrative,
        stateChanges: validated.data.stateChanges,
      });
      validated.data.meta = {
        ...(validated.data.meta || {}),
        contextQuality: budgetedPrompts.truncated ? 'reduced' : 'full',
      };
      if (budgetedPrompts.truncated) {
        validated.data.meta = {
          ...(validated.data.meta || {}),
          promptTruncated: true,
          degradeType: 'context_truncate',
          diagnostics: {
            message: 'Prompt was truncated to fit token budget; optional sections were reduced first.',
          },
        };
      }
      return { result: validated.data, usage };
    }

    return {
      result: buildDegradedSceneResponse({
        language,
        reason: budgetedPrompts.truncated
          ? `context_truncate_schema_validation_failed: ${validated.error || 'scene_schema_validation_failed'}`
          : (validated.error || 'scene_schema_validation_failed'),
        degradeType: budgetedPrompts.truncated ? 'context_truncate' : 'schema_validation',
        rawResult: validated.data || result,
        gameState,
      }),
      usage,
    };
  },

  /**
   * Generate a scene via backend tool-use endpoint.
   * Backend builds lean prompts and AI can dynamically fetch context via tools.
   */
  async generateSceneViaBackend(campaignId, playerAction, {
    provider = 'openai',
    model = null,
    language = 'pl',
    dmSettings = {},
    resolvedMechanics = null,
    needsSystemEnabled = false,
    characterNeeds = null,
    dialogue = null,
    dialogueCooldown = 0,
    isFirstScene = false,
    isCustomAction = false,
    fromAutoPlayer = false,
    sceneCount = 0,
    gameState = null,
  } = {}) {
    const data = await apiClient.post(`/ai/campaigns/${campaignId}/generate-scene`, {
      playerAction: playerAction || '',
      provider,
      model,
      language,
      dmSettings,
      resolvedMechanics,
      needsSystemEnabled,
      characterNeeds,
      dialogue,
      dialogueCooldown,
      isFirstScene,
      isCustomAction,
      fromAutoPlayer,
      sceneCount,
    });

    const scene = data.scene || {};

    // Post-process suggested actions (same as frontend flow)
    if (scene.suggestedActions && gameState) {
      scene.suggestedActions = postProcessSuggestedActions({
        suggestedActions: scene.suggestedActions,
        language,
        gameState,
        narrative: scene.narrative,
        stateChanges: scene.stateChanges,
      });
    }

    scene.meta = { ...(scene.meta || {}), contextQuality: 'full', backendToolUse: true };

    return { result: scene, usage: data.usage || null };
  },

  async generateRecap(
    gameState,
    dmSettings,
    provider,
    apiKey,
    language = 'en',
    modelTier = 'premium',
    {
      alternateApiKey = null,
      sentencesPerScene = 1,
      summaryStyle = null,
      onPartial = null,
      onProgress = null,
    } = {}
  ) {
    const model = selectModel(provider, modelTier, 'generateRecap');
    const allScenes = Array.isArray(gameState?.scenes) ? gameState.scenes : [];
    const totalSceneCount = allScenes.length;
    const requestedMode = summaryStyle && typeof summaryStyle === 'object' ? summaryStyle.mode : null;
    const recapMode = ['story', 'dialogue', 'poem', 'report'].includes(requestedMode) ? requestedMode : 'story';
    const useChunking = totalSceneCount > RECAP_SCENE_CHUNK_SIZE;
    const emitProgress = (payload) => {
      if (typeof onProgress === 'function') onProgress(payload);
    };
    const emitPartial = (payload) => {
      if (typeof onPartial === 'function') onPartial(payload);
    };

    const runRecapCall = async (stateForPrompt, userPrompt, validationErrorCode = 'recap_schema_validation_failed') => {
      const systemPrompt = buildSystemPrompt(stateForPrompt, dmSettings, language, null, { fullSceneHistory: true });
      const { result, usage } = await callAI(
        provider,
        apiKey,
        systemPrompt,
        userPrompt,
        RECAP_COMPLETION_TOKENS,
        { model, modelTier, taskType: 'generateRecap', alternateApiKey }
      );
      const validated = safeParseAIResponse(result, RecapResponseSchema);
      if (!validated.ok) {
        return {
          ok: false,
          usage,
          error: validated.error || validationErrorCode,
        };
      }
      return {
        ok: true,
        usage,
        recap: normalizeRecapNarrative(validated.data.recap),
      };
    };

    if (!useChunking) {
      emitProgress({
        phase: 'chunking',
        currentBatch: 1,
        totalBatches: 1,
        recapMode,
      });
      const userPrompt = buildRecapPrompt(language, {
        sceneCount: totalSceneCount,
        sentencesPerScene,
        summaryStyle,
      });
      const single = await runRecapCall(gameState, userPrompt);
      if (single.ok) {
        emitPartial({
          text: single.recap,
          currentBatch: 1,
          totalBatches: 1,
          recapMode,
        });
        emitProgress({
          phase: 'done',
          currentBatch: 1,
          totalBatches: 1,
          recapMode,
        });
        return {
          result: {
            recap: single.recap,
          },
          usage: single.usage,
        };
      }
      return {
        result: {
          recap: language === 'pl'
            ? 'Dotąd: bohater przemierza niebezpieczny świat, a konsekwencje decyzji zaczynają się kumulować.'
            : 'So far: the hero moves through a dangerous world, and consequences of prior choices are mounting.',
          meta: { degraded: true, reason: single.error || 'recap_schema_validation_failed' },
        },
        usage: single.usage,
      };
    }

    const sceneChunks = chunkArray(allScenes, RECAP_SCENE_CHUNK_SIZE);
    const partialRecaps = [];
    let combinedUsage = null;
    for (let chunkIndex = 0; chunkIndex < sceneChunks.length; chunkIndex += 1) {
      const sceneChunk = sceneChunks[chunkIndex];
      const chunkState = {
        ...gameState,
        scenes: sceneChunk,
        chatHistory: filterChatHistoryByScenes(gameState?.chatHistory, sceneChunk, {
          includeMessagesWithoutSceneId: chunkIndex === 0,
        }),
      };
      const chunkPrompt = buildRecapPrompt(language, {
        sceneCount: sceneChunk.length,
        sentencesPerScene,
        summaryStyle,
      });
      const chunkResult = await runRecapCall(
        chunkState,
        chunkPrompt,
        `recap_chunk_${chunkIndex + 1}_schema_validation_failed`
      );
      combinedUsage = mergeUsageTotals(combinedUsage, chunkResult.usage);
      if (!chunkResult.ok) {
        const chunkNumber = chunkIndex + 1;
        throw new Error(
          language === 'pl'
            ? `Nie udało się wygenerować streszczenia dla paczki scen ${chunkNumber}/${sceneChunks.length}.`
            : `Failed to generate recap for scene chunk ${chunkNumber}/${sceneChunks.length}.`
        );
      }
      partialRecaps.push(chunkResult.recap);
      emitPartial({
        text: partialRecaps.join('\n\n'),
        currentBatch: chunkIndex + 1,
        totalBatches: sceneChunks.length,
        recapMode,
      });
      emitProgress({
        phase: 'chunking',
        currentBatch: chunkIndex + 1,
        totalBatches: sceneChunks.length,
        recapMode,
      });
    }

    if (partialRecaps.length === 1) {
      emitProgress({
        phase: 'done',
        currentBatch: 1,
        totalBatches: 1,
        recapMode,
      });
      return {
        result: {
          recap: partialRecaps[0],
        },
        usage: combinedUsage,
      };
    }

    emitProgress({
      phase: 'merging',
      currentBatch: sceneChunks.length,
      totalBatches: sceneChunks.length,
      recapMode,
    });
    const mergePrompt = buildRecapMergePrompt(language, partialRecaps, {
      sceneCount: totalSceneCount,
      sentencesPerScene,
      summaryStyle,
    });
    const mergeState = {
      ...gameState,
      scenes: allScenes.slice(-Math.min(RECAP_SCENE_CHUNK_SIZE, allScenes.length)),
      chatHistory: filterChatHistoryByScenes(gameState?.chatHistory, allScenes.slice(-Math.min(RECAP_SCENE_CHUNK_SIZE, allScenes.length))),
    };
    const merged = await runRecapCall(mergeState, mergePrompt, 'recap_merge_schema_validation_failed');
    combinedUsage = mergeUsageTotals(combinedUsage, merged.usage);
    if (!merged.ok) {
      return {
        result: {
          recap: language === 'pl'
            ? 'Dotąd: bohater przemierza niebezpieczny świat, a konsekwencje decyzji zaczynają się kumulować.'
            : 'So far: the hero moves through a dangerous world, and consequences of prior choices are mounting.',
          meta: { degraded: true, reason: merged.error || 'recap_merge_schema_validation_failed' },
        },
        usage: combinedUsage,
      };
    }

    emitProgress({
      phase: 'done',
      currentBatch: sceneChunks.length,
      totalBatches: sceneChunks.length,
      recapMode,
    });
    return {
      result: {
        recap: merged.recap,
      },
      usage: combinedUsage,
    };
  },

  async compressScenes(scenesText, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    const model = selectModel(provider, modelTier, 'compressScenes');
    const langNote = language === 'pl' ? ' Write the summary in Polish, matching the language of the source scenes.' : '';
    const systemPrompt = `You are a narrative summarizer for an RPG game. Compress scene histories into concise but complete summaries that preserve all important details: NPC names, locations, player decisions, consequences, combat outcomes, items found, and plot developments. Always respond with valid JSON only.${langNote}`;
    const userPrompt = `Summarize the following RPG scene history into a concise narrative summary (max 1500 characters). Preserve key facts: NPC names and fates, locations visited, items acquired/lost, major decisions and their consequences, combat outcomes, and unresolved plot threads.\n\nSCENES:\n${scenesText}\n\nRespond with JSON: {"summary": "Your compressed summary here..."}`;
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 800, { model, modelTier, taskType: 'compressScenes', alternateApiKey });
    const validated = safeParseAIResponse(result, CompressionResponseSchema);
    if (validated.ok) return { result: validated.data, usage };
    return {
      result: {
        summary: String(scenesText || '').slice(0, 1400),
        meta: { degraded: true, reason: validated.error || 'compression_schema_validation_failed' },
      },
      usage,
    };
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
    if (validated.ok) return { result: validated.data, usage };
    return {
      result: {
        prompt: seedText?.trim()
          ? seedText.trim()
          : (language === 'pl'
            ? `Mroczna przygoda ${genre || 'fantasy'} o tonie ${tone || 'epickim'} i stylu ${style || 'hybrydowym'}.`
            : `A dark ${genre || 'fantasy'} adventure with a ${tone || 'epic'} tone and ${style || 'hybrid'} style.`),
        meta: { degraded: true, reason: validated.error || 'story_prompt_schema_validation_failed' },
      },
      usage,
    };
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
    if (validated.ok) return { result: validated.data, usage };
    return {
      result: {
        narration: language === 'pl'
          ? 'Walka trwa, obie strony szukają przewagi, a napięcie rośnie z każdym ciosem.'
          : 'The fight continues, both sides look for an edge, and tension rises with every blow.',
        battleCries: [],
        meta: { degraded: true, reason: validated.error || 'combat_commentary_schema_validation_failed' },
      },
      usage,
    };
  },

  async verifyObjective(storyContext, questName, questDescription, objectiveDescription, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    const model = selectModel(provider, modelTier, 'verifyObjective');
    const prompts = buildObjectiveVerificationPrompt(storyContext, questName, questDescription, objectiveDescription, language);
    const { result, usage } = await callAI(provider, apiKey, prompts.system, prompts.user, 500, { model, modelTier, taskType: 'verifyObjective', alternateApiKey });
    const validated = safeParseAIResponse(result, ObjectiveVerificationSchema);
    if (validated.ok) return { result: validated.data, usage };
    return {
      result: {
        fulfilled: false,
        reasoning: language === 'pl'
          ? 'Tryb degradacji: nie udało się bezpiecznie zweryfikować celu.'
          : 'Degraded mode: objective could not be safely verified.',
        meta: { degraded: true, reason: validated.error || 'objective_schema_validation_failed' },
      },
      usage,
    };
  },
};
