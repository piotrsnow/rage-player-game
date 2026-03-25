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

function buildAutoPlayerPrompt(gameState, autoPlayerSettings, language) {
  const character = gameState.character;
  const scenes = gameState.scenes || [];
  const currentScene = scenes[scenes.length - 1];
  const suggestedActions = currentScene?.actions || currentScene?.suggestedActions || [];
  const style = STYLE_PROMPTS[autoPlayerSettings.style] || STYLE_PROMPTS.balanced;
  const shouldSpeak = Math.random() < (VERBOSITY_CHANCE[autoPlayerSettings.verbosity] || 0.45);
  const langNote = language === 'pl'
    ? 'Respond in Polish. The action text and chatMessage must be in Polish.'
    : 'Respond in English.';

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
    '',
    '## Suggested Actions',
    actionsList,
    '',
    shouldSpeak
      ? 'Also write a short in-character line of dialogue or thought your character would say/think right now.'
      : 'Do NOT include a chatMessage in your response.',
    '',
    langNote,
    '',
    'Respond with ONLY valid JSON in this exact format:',
    '{',
    '  "action": "the action text you choose or write",',
    '  "isCustom": true/false (false if picking a suggested action verbatim, true if custom),',
    '  "reasoning": "1 sentence why you chose this"',
    shouldSpeak ? '  ,"chatMessage": "short in-character dialogue or thought"' : '',
    '}',
  ].join('\n');

  return { systemPrompt, userPrompt };
}

async function callAutoPlayerAI(provider, apiKey, systemPrompt, userPrompt, model) {
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
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });
    const content = data.choices[0]?.message?.content;
    return safeParseJSON(content);
  }

  if (!apiKey) {
    throw new Error('No API key configured for auto-player. Please add your key in Settings.');
  }

  if (provider === 'anthropic') {
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
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
    }
    const data = await response.json();
    return safeParseJSON(data.content[0]?.text);
  }

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
      max_tokens: 300,
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }
  const data = await response.json();
  return safeParseJSON(data.choices[0]?.message?.content);
}

export async function decideAction(gameState, settings, autoPlayerSettings, apiKey, provider) {
  const language = settings.language || 'en';
  const { systemPrompt, userPrompt } = buildAutoPlayerPrompt(gameState, autoPlayerSettings, language);
  const model = autoPlayerSettings.model || resolveModel(provider, null);

  const result = await callAutoPlayerAI(provider, apiKey, systemPrompt, userPrompt, model);

  if (!result.ok || !result.data?.action) {
    const scenes = gameState.scenes || [];
    const currentScene = scenes[scenes.length - 1];
    const fallbackActions = currentScene?.actions || currentScene?.suggestedActions || [];
    const fallback = fallbackActions[Math.floor(Math.random() * fallbackActions.length)] || 'Look around';
    console.warn('[autoPlayer] Failed to parse AI decision, using fallback action:', fallback);
    return { action: fallback, isCustom: false, chatMessage: null };
  }

  return {
    action: result.data.action,
    isCustom: !!result.data.isCustom,
    chatMessage: result.data.chatMessage || null,
  };
}
