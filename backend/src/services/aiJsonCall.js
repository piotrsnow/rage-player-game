import { requireServerApiKey } from './apiKeyService.js';
import { parseProviderError } from './aiErrors.js';
import { config } from '../config.js';

// Small helper for non-streaming, single-shot AI JSON calls. Used by the
// "simple" AI endpoints (combat commentary, verify objective, recap stages)
// that don't need streaming UX but do need per-user key resolution.
//
// Returns { text, usage } where text is the raw string response (caller
// parses JSON if needed).

export async function callAIJson({
  provider = 'openai',
  modelTier = 'premium',
  model = null,
  systemPrompt,
  userPrompt,
  maxTokens = 1000,
  temperature = 0.7,
  userApiKeys = null,
}) {
  const resolvedProvider = provider === 'anthropic' ? 'anthropic' : 'openai';
  const apiKey = requireServerApiKey(
    resolvedProvider,
    userApiKeys,
    resolvedProvider === 'anthropic' ? 'Anthropic' : 'OpenAI',
  );
  const resolvedModel = model || config.aiModels[modelTier][resolvedProvider];

  if (resolvedProvider === 'openai') {
    return callOpenAI({ apiKey, model: resolvedModel, systemPrompt, userPrompt, maxTokens, temperature });
  }
  return callAnthropic({ apiKey, model: resolvedModel, systemPrompt, userPrompt, maxTokens, temperature });
}

async function callOpenAI({ apiKey, model, systemPrompt, userPrompt, maxTokens, temperature }) {
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
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) await parseProviderError(response, 'openai');
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    usage: data.usage || null,
  };
}

async function callAnthropic({ apiKey, model, systemPrompt, userPrompt, maxTokens, temperature }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
      temperature,
    }),
  });

  if (!response.ok) await parseProviderError(response, 'anthropic');
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return {
    text: jsonMatch ? jsonMatch[0] : text,
    usage: data.usage || null,
  };
}

export function parseJsonOrNull(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}
