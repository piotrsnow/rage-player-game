import { resolveModel } from './ai';
import { apiClient } from './apiClient';
import { safeParseJSON } from './aiResponseValidator';

const STYLE_PROMPTS = {
  cautious: 'You are cautious and careful. Prefer safe options, avoid unnecessary risks, gather information before acting, and retreat from danger when wounded.',
  balanced: 'You are a balanced adventurer. Mix exploration, social interaction, and combat. Take reasonable risks and pursue quests actively.',
  aggressive: 'You are bold and aggressive. Charge into action, confront enemies head-on, take risks for glory, and never back down from a challenge.',
  chaotic: 'You are unpredictable and chaotic. Make surprising choices, follow whims, provoke NPCs, explore unlikely paths, and create dramatic situations.',
};

const VERBOSITY_CHANCE = {
  low: 0.15,
  medium: 0.45,
  high: 0.8,
};

export const NEED_KEYWORD_HINTS = {
  hunger: ['eat', 'food', 'meal', 'ration', 'zje', 'jedz', 'posilek', 'jedzenie'],
  thirst: ['drink', 'water', 'ale', 'wine', 'wody', 'pije', 'napoj'],
  rest: ['rest', 'sleep', 'camp', 'nap', 'odpoc', 'spac', 'drzem'],
};

function normalizeAutoPlayerChatMessage(message) {
  if (typeof message !== 'string') return null;

  const trimmed = message.trim();
  if (!trimmed) return null;

  let normalized = trimmed
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  if (/^".*"$/.test(normalized)) {
    return normalized;
  }

  if (/^[^"]+$/.test(normalized)) {
    return `"${normalized}"`;
  }

  return normalized;
}

function formatCharacterSummary(character) {
  if (!character) return 'No character data.';
  const lines = [];
  lines.push(`Name: ${character.name} | Species: ${character.species} | Career: ${character.career?.name || 'Unknown'} (Tier ${character.career?.tier || 1})`);
  lines.push(`Wounds: ${character.wounds}/${character.maxWounds} | Fortune: ${character.fortune}/${character.fate} | Resolve: ${character.resolve}/${character.resilience}`);

  if (character.backstory) {
    lines.push(`Backstory: ${character.backstory.slice(0, 200)}`);
  }

  const skillList = Object.entries(character.skills || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}(${v})`)
    .join(', ');
  if (skillList) lines.push(`Skills: ${skillList}`);

  const talents = (character.talents || []).join(', ');
  if (talents) lines.push(`Talents: ${talents}`);

  const items = (character.inventory || []).map((i) => typeof i === 'string' ? i : i.name).join(', ');
  if (items) lines.push(`Inventory: ${items}`);

  if (character.needs) {
    const needsStr = Object.entries(character.needs)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `${k}: ${v}%`)
      .join(', ');
    if (needsStr) lines.push(`Needs: ${needsStr}`);
  }

  return lines.join('\n');
}

function formatRecentScenes(scenes, count = 3) {
  if (!scenes || scenes.length === 0) return 'No scenes yet.';
  const recent = scenes.slice(-count);
  return recent.map((s, i) => {
    const num = scenes.length - count + i + 1;
    const text = (s.narrative || '').slice(0, 400);
    return `[Scene ${num}]: ${text}`;
  }).join('\n\n');
}

function normalizeActionForCompare(action = '') {
  return String(action || '')
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toWordSet(text = '') {
  const words = normalizeActionForCompare(text).split(' ').filter(Boolean);
  return new Set(words);
}

function actionSimilarity(a = '', b = '') {
  const aSet = toWordSet(a);
  const bSet = toWordSet(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union > 0 ? intersection / union : 0;
}

function isActionTooSimilar(action, recentActions = []) {
  const normalized = normalizeActionForCompare(action);
  if (!normalized) return true;
  return recentActions.some((prev) => {
    const prevNorm = normalizeActionForCompare(prev);
    return prevNorm === normalized || actionSimilarity(prevNorm, normalized) >= 0.72;
  });
}

function styleScore(action = '', style = 'balanced') {
  const a = normalizeActionForCompare(action);
  if (!a) return 0;
  const cautiousWords = ['careful', 'observe', 'retreat', 'safe', 'wait', 'ostroz', 'bezpiecz', 'obserw', 'wycof'];
  const aggressiveWords = ['attack', 'strike', 'charge', 'confront', 'atak', 'uderz', 'szturm', 'nacier'];
  const chaoticWords = ['bluff', 'gamble', 'provoke', 'taunt', 'blef', 'ryzyko', 'prowok', 'dramat'];
  const containsAny = (list) => list.some((w) => a.includes(w));
  if (style === 'cautious') return containsAny(cautiousWords) ? 2 : 0;
  if (style === 'aggressive') return containsAny(aggressiveWords) ? 2 : 0;
  if (style === 'chaotic') return containsAny(chaoticWords) ? 2 : 0;
  return 1;
}

function needsUrgencyScore(action = '', characterNeeds = null) {
  if (!characterNeeds || typeof characterNeeds !== 'object') return 0;
  const a = normalizeActionForCompare(action);
  if (!a) return 0;
  let score = 0;
  for (const [need, terms] of Object.entries(NEED_KEYWORD_HINTS)) {
    const value = Number(characterNeeds?.[need]);
    if (!Number.isFinite(value) || value > 35) continue;
    if (terms.some((term) => a.includes(term))) {
      score += value <= 15 ? 3 : 1;
    }
  }
  return score;
}

function pickAlternativeAction({
  currentAction = '',
  suggestedActions = [],
  recentAutoActions = [],
  style = 'balanced',
  characterNeeds = null,
} = {}) {
  const candidates = (Array.isArray(suggestedActions) ? suggestedActions : [])
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter(Boolean);
  if (candidates.length === 0) return null;

  const scored = candidates.map((action, idx) => {
    const duplicatePenalty = isActionTooSimilar(action, recentAutoActions) ? -5 : 2;
    const sameAsCurrentPenalty = normalizeActionForCompare(action) === normalizeActionForCompare(currentAction) ? -4 : 0;
    const score = duplicatePenalty + sameAsCurrentPenalty + styleScore(action, style) + needsUrgencyScore(action, characterNeeds) - (idx * 0.05);
    return { action, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.action || null;
}

function formatQuests(quests) {
  if (!quests) return '';
  const list = Array.isArray(quests) ? quests : (quests.active || []);
  if (list.length === 0) return '';
  const active = list.filter((q) => q.status === 'active' || !q.status);
  if (active.length === 0) return '';
  return 'Active quests:\n' + active.map((q) => {
    const objectives = (q.objectives || [])
      .map((o) => `  ${o.completed ? '[X]' : '[ ]'} ${o.description}`)
      .join('\n');
    return `- ${q.name}: ${q.description}${objectives ? '\n' + objectives : ''}`;
  }).join('\n');
}

function buildAutoPlayerPrompt(gameState, autoPlayerSettings, language, recentAutoActions = []) {
  const character = gameState.character;
  const scenes = gameState.scenes || [];
  const currentScene = scenes[scenes.length - 1];
  const suggestedActions = currentScene?.actions || currentScene?.suggestedActions || [];
  const style = STYLE_PROMPTS[autoPlayerSettings.style] || STYLE_PROMPTS.balanced;
  const shouldSpeak = Math.random() < (VERBOSITY_CHANCE[autoPlayerSettings.verbosity] || 0.45);
  const langNote = language === 'pl'
    ? 'Respond in Polish. The action text and chatMessage must be in Polish.'
    : 'Respond in English. The action text and chatMessage must be in English.';

  const systemPrompt = [
    'You are an AI playing as a character in a tabletop RPG. You must choose what action to take next, staying fully in character.',
    '',
    style,
    autoPlayerSettings.customInstructions ? `Additional instructions: ${autoPlayerSettings.customInstructions}` : '',
    '',
    '## Your Character',
    formatCharacterSummary(character),
    '',
    '## Current Location',
    gameState.world?.currentLocation || 'Unknown',
    '',
    '## Recent Story',
    formatRecentScenes(scenes),
    '',
    formatQuests(gameState.quests),
  ].filter(Boolean).join('\n');

  const actionsList = suggestedActions.length > 0
    ? suggestedActions.map((a, i) => `${i + 1}. ${a}`).join('\n')
    : 'No suggested actions available.';

  const userPrompt = [
    'Choose your next action. You can pick one of the suggested actions OR write your own custom action that fits the situation and your character.',
    'If you pick a suggested action, use its wording EXACTLY so it matches the on-screen buttons (they are already phrased in your character\'s voice).',
    '',
    '## Suggested Actions',
    actionsList,
    '',
    recentAutoActions.length > 0
      ? `Avoid repeating these recent decisions unless there is no meaningful alternative:\n${recentAutoActions.map((a) => `- ${a}`).join('\n')}`
      : '',
    '',
    shouldSpeak
      ? 'Also write a short in-character spoken line your character says aloud right now.'
      : 'Do NOT include a chatMessage in your response.',
    '',
    langNote,
    shouldSpeak
      ? 'If you include chatMessage, it MUST be direct speech wrapped in straight double quotes like "Example line". Do not use Polish quotes, smart quotes, guillemets, or narration outside the quotes.'
      : '',
    '',
    'Respond with ONLY valid JSON in this exact format:',
    '{',
    '  "action": "the action text you choose or write",',
    '  "isCustom": true/false (false if picking a suggested action verbatim, true if custom),',
    '  "reasoning": "1 sentence why you chose this"',
    shouldSpeak ? '  ,"chatMessage": "\\"short in-character spoken dialogue in straight double quotes\\""' : '',
    '}',
  ].join('\n');

  return { systemPrompt, userPrompt };
}

async function callAutoPlayerAI(provider, _apiKey, systemPrompt, userPrompt, model) {
  if (apiClient.isConnected()) {
    if (provider === 'anthropic') {
      const data = await apiClient.post('/proxy/anthropic/chat', {
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
        max_tokens: 300,
        model,
      });
      const content = data.content[0]?.text;
      return safeParseJSON(content);
    }
    const data = await apiClient.post('/proxy/openai/chat', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model,
      temperature: 0.9,
      max_completion_tokens: 300,
      response_format: { type: 'json_object' },
    });
    const content = data.choices[0]?.message?.content;
    return safeParseJSON(content);
  }
  throw new Error('Auto-player requires backend connection with server AI keys configured in environment variables.');
}

export async function decideAction(gameState, settings, autoPlayerSettings, apiKey, provider, { recentAutoActions = [] } = {}) {
  const language = settings.language || 'en';
  const { systemPrompt, userPrompt } = buildAutoPlayerPrompt(gameState, autoPlayerSettings, language, recentAutoActions);
  const model = autoPlayerSettings.model || resolveModel(provider, null);
  const currentScene = (gameState.scenes || [])[Math.max(0, (gameState.scenes || []).length - 1)] || null;
  const suggestedActions = currentScene?.actions || currentScene?.suggestedActions || [];

  const result = await callAutoPlayerAI(provider, apiKey, systemPrompt, userPrompt, model);

  if (!result.ok || !result.data?.action) {
    const scenes = gameState.scenes || [];
    const currentScene = scenes[scenes.length - 1];
    const fallbackActions = currentScene?.actions || currentScene?.suggestedActions || [];
    const fallback = fallbackActions[Math.floor(Math.random() * fallbackActions.length)] || 'Look around';
    console.warn('[autoPlayer] Failed to parse AI decision, using fallback action:', fallback);
    return { action: fallback, isCustom: false, chatMessage: null };
  }

  const chosenAction = String(result.data.action || '').trim();
  const allowVariety = autoPlayerSettings?.decisionVariety !== false;
  if (allowVariety && isActionTooSimilar(chosenAction, recentAutoActions)) {
    const alternative = pickAlternativeAction({
      currentAction: chosenAction,
      suggestedActions,
      recentAutoActions,
      style: autoPlayerSettings.style || 'balanced',
      characterNeeds: gameState?.character?.needs || null,
    });
    if (alternative && normalizeActionForCompare(alternative) !== normalizeActionForCompare(chosenAction)) {
      return {
        action: alternative,
        isCustom: false,
        chatMessage: normalizeAutoPlayerChatMessage(result.data.chatMessage),
      };
    }
  }

  return {
    action: chosenAction,
    isCustom: !!result.data.isCustom,
    chatMessage: normalizeAutoPlayerChatMessage(result.data.chatMessage),
  };
}

export { normalizeAutoPlayerChatMessage };
