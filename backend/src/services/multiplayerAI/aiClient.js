import { config } from '../../config.js';
import { AIServiceError, AI_ERROR_CODES, parseProviderError } from '../aiErrors.js';
import { childLogger } from '../../lib/logger.js';

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

export async function callAI(messages) {
  const openaiKey = config.apiKeys.openai || '';
  const anthropicKey = config.apiKeys.anthropic || '';

  if (!openaiKey && !anthropicKey) {
    throw new AIServiceError(
      AI_ERROR_CODES.NO_SERVER_API_KEY,
      'Server AI keys are not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in backend environment variables.',
      { statusCode: 503, retryable: false },
    );
  }

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (openaiKey && (attempt < 2 || !anthropicKey)) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: config.aiModels.premium.openai,
            messages,
            temperature: 0.8,
            response_format: { type: 'json_object' },
          }),
        });
        if (!response.ok) {
          await parseProviderError(response, 'openai');
        }
        const data = await response.json();
        return safeParseJSONContent(data.choices[0].message.content);
      }

      if (anthropicKey) {
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
            model: config.aiModels.premium.anthropic,
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
        return safeParseJSONContent(data.content[0].text);
      }
    } catch (err) {
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
