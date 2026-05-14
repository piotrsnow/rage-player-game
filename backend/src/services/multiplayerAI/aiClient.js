import { config } from '../../config.js';
import { AIServiceError, AI_ERROR_CODES, parseProviderError } from '../aiErrors.js';
import { childLogger } from '../../lib/logger.js';
import { logLlmCallStart, logLlmCallFinish, logLlmCallFail } from '../llmCallLogger.js';
import { resolveModelForTask } from '../serverConfig.js';

const log = childLogger({ module: 'multiplayerAI' });

const RETRY_DELAYS = [1000, 3000];

function safeParseJSONContent(raw) {
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Streaming variant of callAI. Calls the AI provider with streaming enabled
 * and yields raw text chunks via onChunk callback. Returns the full parsed
 * JSON when complete.
 */
export async function callAIStreaming(messages, onChunk) {
  const openaiKey = config.apiKeys.openai || '';
  const anthropicKey = config.apiKeys.anthropic || '';
  const openaiModel = await resolveModelForTask('multiplayerScene', 'openai') || config.aiModels.premium.openai;
  const anthropicModel = await resolveModelForTask('multiplayerScene', 'anthropic') || config.aiModels.premium.anthropic;

  if (!openaiKey && !anthropicKey) {
    throw new AIServiceError(
      AI_ERROR_CODES.NO_SERVER_API_KEY,
      'Server AI keys are not configured.',
      { statusCode: 503, retryable: false },
    );
  }

  let accumulated = '';
  const attemptLogId = await logLlmCallStart({
    type: 'multiplayerScene',
    label: 'Multiplayer AI (streaming)',
    provider: openaiKey ? 'openai' : 'anthropic',
    model: openaiKey ? openaiModel : anthropicModel,
    request: { messages },
  });
  const t0 = Date.now();

  try {
    if (openaiKey) {
      accumulated = await _streamOpenAI(messages, openaiKey, openaiModel, onChunk);
    } else {
      accumulated = await _streamAnthropic(messages, anthropicKey, anthropicModel, onChunk);
    }
    await logLlmCallFinish(attemptLogId, { durationMs: Date.now() - t0, response: { text: accumulated } });
    return safeParseJSONContent(accumulated);
  } catch (err) {
    await logLlmCallFail(attemptLogId, err);
    throw err instanceof AIServiceError ? err : new AIServiceError(
      AI_ERROR_CODES.AI_REQUEST_FAILED, err?.message || 'Streaming AI request failed.',
      { statusCode: 502, retryable: true, cause: err },
    );
  }
}

async function _streamOpenAI(messages, apiKey, model, onChunk) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, messages, temperature: 0.8,
      response_format: { type: 'json_object' },
      stream: true, stream_options: { include_usage: true },
    }),
  });
  if (!response.ok) await parseProviderError(response, 'openai');

  let accumulated = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line.startsWith('data: ') || line.slice(6) === '[DONE]') continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        const text = parsed.choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text) {
          accumulated += text;
          onChunk?.(text);
        }
      } catch { /* skip */ }
    }
  }
  return accumulated;
}

async function _streamAnthropic(messages, apiKey, model, onChunk) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const userMsgs = messages.filter((m) => m.role !== 'system');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: 4096, system: systemMsg?.content || '',
      messages: userMsgs, temperature: 0.8, stream: true,
    }),
  });
  if (!response.ok) await parseProviderError(response, 'anthropic');

  let accumulated = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          accumulated += parsed.delta.text;
          onChunk?.(parsed.delta.text);
        }
      } catch { /* skip */ }
    }
  }
  return accumulated;
}

export async function callAI(messages) {
  const openaiKey = config.apiKeys.openai || '';
  const anthropicKey = config.apiKeys.anthropic || '';
  const openaiModel = await resolveModelForTask('multiplayerScene', 'openai') || config.aiModels.premium.openai;
  const anthropicModel = await resolveModelForTask('multiplayerScene', 'anthropic') || config.aiModels.premium.anthropic;

  if (!openaiKey && !anthropicKey) {
    throw new AIServiceError(
      AI_ERROR_CODES.NO_SERVER_API_KEY,
      'Server AI keys are not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in backend environment variables.',
      { statusCode: 503, retryable: false },
    );
  }

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    let attemptLogId = null;
    try {
      if (openaiKey && (attempt < 2 || !anthropicKey)) {
        attemptLogId = await logLlmCallStart({
          type: 'multiplayerScene',
          label: 'Multiplayer AI',
          provider: 'openai',
          model: openaiModel,
          request: { messages },
        });
        const t0 = Date.now();
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: openaiModel,
            messages,
            temperature: 0.8,
            response_format: { type: 'json_object' },
          }),
        });
        if (!response.ok) {
          await parseProviderError(response, 'openai');
        }
        const data = await response.json();
        await logLlmCallFinish(attemptLogId, { durationMs: Date.now() - t0, response: { text: data.choices?.[0]?.message?.content || '' } });
        return safeParseJSONContent(data.choices[0].message.content);
      }

      if (anthropicKey) {
        attemptLogId = await logLlmCallStart({
          type: 'multiplayerScene',
          label: 'Multiplayer AI',
          provider: 'anthropic',
          model: anthropicModel,
          request: { messages },
        });
        const t0 = Date.now();
        const systemMsg = messages.find((m) => m.role === 'system');
        const userMsgs = messages.filter((m) => m.role !== 'system');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: anthropicModel,
            max_tokens: 4096,
            system: systemMsg?.content || '',
            messages: userMsgs,
            temperature: 0.8,
          }),
        });
        if (!response.ok) {
          await parseProviderError(response, 'anthropic');
        }
        const data = await response.json();
        await logLlmCallFinish(attemptLogId, { durationMs: Date.now() - t0, response: { text: data.content?.[0]?.text || '' } });
        return safeParseJSONContent(data.content[0].text);
      }
    } catch (err) {
      await logLlmCallFail(attemptLogId, err);
      lastError = err;
      if (attempt < 2) {
        const delay = RETRY_DELAYS[attempt] || 3000;
        log.warn({ err, attempt: attempt + 1, delayMs: delay }, 'Retry scheduled');
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  if (lastError instanceof AIServiceError) throw lastError;
  throw new AIServiceError(
    AI_ERROR_CODES.AI_REQUEST_FAILED,
    lastError?.message || 'AI request failed.',
    { statusCode: 502, retryable: true, cause: lastError },
  );
}
