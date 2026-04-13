import { apiClient } from '../apiClient';
import { callLocalLLM } from '../localAI';
import { safeParseJSON } from '../aiResponse';
import { withRetry } from '../../utils/retry';
import { selectModel } from './models';

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
      max_completion_tokens: maxTokens,
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

export async function callAI(provider, apiKey, systemPrompt, userPrompt, maxTokens, { localLLMConfig = null, model = null, modelTier = 'premium', taskType = null, alternateApiKey = null } = {}) {
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
