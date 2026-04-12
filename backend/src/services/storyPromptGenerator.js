import { requireServerApiKey } from './apiKeyService.js';
import { parseProviderError, AIServiceError } from './aiErrors.js';

const MODEL_MAP = {
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

export async function generateStoryPrompt({ genre, tone, style, seedText = '', language = 'en', provider = 'openai', model = null } = {}) {
  const resolvedProvider = provider === 'anthropic' ? 'anthropic' : 'openai';
  const apiKey = requireServerApiKey(resolvedProvider === 'anthropic' ? 'anthropic' : 'openai');
  const resolvedModel = model || MODEL_MAP[resolvedProvider];

  const systemPrompt = 'You are a creative RPG story idea generator. Invent original, evocative adventure premises. Always respond with valid JSON only.';

  const humorousGuidance = tone === 'Humorous'
    ? ' The humor must NOT be random absurdity or slapstick nonsense. Instead, ground the premise in a believable world and weave in 1-2 genuinely controversial, provocative, or morally ambiguous elements (e.g. corrupt religious authorities, morally grey freedom fighters, taboo social customs, ethically questionable magical practices, politically charged factions). The comedy should emerge naturally from how characters navigate these uncomfortable realities — dark irony, social satire, awkward moral dilemmas, and characters who take absurd stances on serious issues. Think Terry Pratchett or Monty Python: sharp wit wrapped around real-world controversies, not random zaniness.'
    : '';

  const trimmedSeedText = (seedText || '').trim();
  const userPrompt = [
    `Generate ONE unique, creative RPG story premise for a ${genre} campaign with a ${tone} tone and ${style} play style.`,
    `The premise should be 1-2 sentences, intriguing, and specific enough to spark a full campaign.${humorousGuidance}`,
    trimmedSeedText
      ? `Use the following user-provided words, phrases, or notes as core inspiration. Rework them into a polished adventure premise, but keep the important ideas and explicitly incorporate the provided concepts: "${trimmedSeedText}".`
      : 'Invent the premise from scratch.',
    `Write the premise in ${language === 'pl' ? 'Polish' : 'English'}.`,
    'Respond with JSON: { "prompt": "<the story premise>" }',
  ].join('\n');

  const content = resolvedProvider === 'anthropic'
    ? await callAnthropic(apiKey, systemPrompt, userPrompt, resolvedModel)
    : await callOpenAI(apiKey, systemPrompt, userPrompt, resolvedModel);

  try {
    const parsed = JSON.parse(content);
    if (typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
      return { prompt: parsed.prompt.trim() };
    }
    return { prompt: content.trim(), meta: { degraded: true, reason: 'missing_prompt_field' } };
  } catch {
    return { prompt: content.trim(), meta: { degraded: true, reason: 'json_parse_failed' } };
  }
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, model) {
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
      max_completion_tokens: 300,
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) await parseProviderError(response, 'openai');
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
    }),
  });

  if (!response.ok) await parseProviderError(response, 'anthropic');
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : text;
}
