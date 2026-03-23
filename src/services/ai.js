import { buildSystemPrompt, buildSceneGenerationPrompt, buildCampaignCreationPrompt, buildRecapPrompt } from './prompts';
import { apiClient } from './apiClient';

async function callOpenAI(apiKey, systemPrompt, userPrompt, maxTokens = 2000) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
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
    ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens, model: 'gpt-4o' }
    : null;
  return { result: JSON.parse(content), usage };
}

async function callAnthropic(apiKey, systemPrompt, userPrompt, maxTokens = 2000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
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
    ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens, model: 'claude-sonnet-4-20250514' }
    : null;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI response as JSON');
  return { result: JSON.parse(jsonMatch[0]), usage };
}

async function callOpenAIViaProxy(systemPrompt, userPrompt, maxTokens = 2000) {
  const data = await apiClient.post('/proxy/openai/chat', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: 'gpt-4o',
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });
  const content = data.choices[0]?.message?.content;
  const usage = data.usage
    ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens, model: 'gpt-4o' }
    : null;
  return { result: JSON.parse(content), usage };
}

async function callAnthropicViaProxy(systemPrompt, userPrompt, maxTokens = 2000) {
  const data = await apiClient.post('/proxy/anthropic/chat', {
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
    max_tokens: maxTokens,
  });
  const content = data.content[0]?.text;
  const usage = data.usage
    ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens, model: 'claude-sonnet-4-20250514' }
    : null;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI response as JSON');
  return { result: JSON.parse(jsonMatch[0]), usage };
}

async function callAI(provider, apiKey, systemPrompt, userPrompt, maxTokens) {
  if (apiClient.isConnected()) {
    if (provider === 'anthropic') {
      return callAnthropicViaProxy(systemPrompt, userPrompt, maxTokens);
    }
    return callOpenAIViaProxy(systemPrompt, userPrompt, maxTokens);
  }

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Please add your key in Settings.`);
  }

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, systemPrompt, userPrompt, maxTokens);
  }
  return callOpenAI(apiKey, systemPrompt, userPrompt, maxTokens);
}

export const aiService = {
  async generateCampaign(settings, provider, apiKey, language = 'en') {
    const systemPrompt = 'You are a master RPG campaign designer. Create rich, immersive campaign foundations that draw players into the story. Always respond with valid JSON only.';
    const userPrompt = buildCampaignCreationPrompt(settings, language);
    return callAI(provider, apiKey, systemPrompt, userPrompt, 3000);
  },

  async generateScene(gameState, dmSettings, playerAction, isFirstScene, provider, apiKey, language = 'en', enhancedContext = null, { needsSystemEnabled = false, isCustomAction = false, preRolledDice = null } = {}) {
    const promptOpts = { needsSystemEnabled, characterNeeds: gameState.character?.needs || null, isCustomAction, preRolledDice };
    const systemPrompt = buildSystemPrompt(gameState, dmSettings, language, enhancedContext, promptOpts);
    const userPrompt = buildSceneGenerationPrompt(playerAction, isFirstScene, language, promptOpts, dmSettings);
    return callAI(provider, apiKey, systemPrompt, userPrompt, 2000);
  },

  async generateRecap(gameState, dmSettings, provider, apiKey, language = 'en') {
    const systemPrompt = buildSystemPrompt(gameState, dmSettings, language);
    const userPrompt = buildRecapPrompt(language);
    return callAI(provider, apiKey, systemPrompt, userPrompt, 500);
  },

  async compressScenes(scenesText, provider, apiKey, language = 'en') {
    const langNote = language === 'pl' ? ' Write the summary in Polish, matching the language of the source scenes.' : '';
    const systemPrompt = `You are a narrative summarizer for an RPG game. Compress scene histories into concise but complete summaries that preserve all important details: NPC names, locations, player decisions, consequences, combat outcomes, items found, and plot developments. Always respond with valid JSON only.${langNote}`;
    const userPrompt = `Summarize the following RPG scene history into a concise narrative summary (max 1500 characters). Preserve key facts: NPC names and fates, locations visited, items acquired/lost, major decisions and their consequences, combat outcomes, and unresolved plot threads.\n\nSCENES:\n${scenesText}\n\nRespond with JSON: {"summary": "Your compressed summary here..."}`;
    return callAI(provider, apiKey, systemPrompt, userPrompt, 800);
  },

  async generateStoryPrompt({ genre, tone, style }, provider, apiKey, language = 'en') {
    const systemPrompt = 'You are a creative RPG story idea generator. Invent original, evocative adventure premises. Always respond with valid JSON only.';
    const userPrompt = [
      `Generate ONE unique, creative RPG story premise for a ${genre} campaign with a ${tone} tone and ${style} play style.`,
      `The premise should be 1-2 sentences, intriguing, and specific enough to spark a full campaign.`,
      `Write the premise in ${language === 'pl' ? 'Polish' : 'English'}.`,
      `Respond with JSON: { "prompt": "<the story premise>" }`,
    ].join('\n');
    return callAI(provider, apiKey, systemPrompt, userPrompt, 300);
  },
};
