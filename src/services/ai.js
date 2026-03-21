import { buildSystemPrompt, buildSceneGenerationPrompt, buildCampaignCreationPrompt, buildRecapPrompt } from './prompts';

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
  return JSON.parse(content);
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
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI response as JSON');
  return JSON.parse(jsonMatch[0]);
}

async function callAI(provider, apiKey, systemPrompt, userPrompt, maxTokens) {
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

  async generateScene(gameState, dmSettings, playerAction, isFirstScene, provider, apiKey, language = 'en') {
    const systemPrompt = buildSystemPrompt(gameState, dmSettings, language);
    const userPrompt = buildSceneGenerationPrompt(playerAction, isFirstScene);
    return callAI(provider, apiKey, systemPrompt, userPrompt, 2000);
  },

  async generateRecap(gameState, dmSettings, provider, apiKey, language = 'en') {
    const systemPrompt = buildSystemPrompt(gameState, dmSettings, language);
    const userPrompt = buildRecapPrompt();
    return callAI(provider, apiKey, systemPrompt, userPrompt, 500);
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
