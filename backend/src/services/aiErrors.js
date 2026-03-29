export const AI_ERROR_CODES = Object.freeze({
  NO_SERVER_API_KEY: 'NO_SERVER_API_KEY',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_RATE_LIMIT: 'AI_RATE_LIMIT',
  AI_INVALID_RESPONSE: 'AI_INVALID_RESPONSE',
  AI_REQUEST_FAILED: 'AI_REQUEST_FAILED',
});

export class AIServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code || AI_ERROR_CODES.AI_REQUEST_FAILED;
    this.statusCode = options.statusCode || 502;
    this.retryable = options.retryable !== false;
    this.provider = options.provider || null;
    this.cause = options.cause;
  }
}

export function toClientAiError(error, fallbackMessage = 'AI request failed.') {
  if (error instanceof AIServiceError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }
  return {
    code: AI_ERROR_CODES.AI_REQUEST_FAILED,
    message: fallbackMessage,
    retryable: true,
  };
}

function inferRateLimit(statusCode, message) {
  if (statusCode === 429) return true;
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('rate limit') || normalized.includes('too many requests');
}

export async function parseProviderError(response, providerName) {
  const body = await response.json().catch(() => ({}));
  const errorMessage = body.error?.message
    || body.error?.detail
    || body.detail?.message
    || body.message
    || `${providerName} API error: ${response.status}`;
  const isRateLimit = inferRateLimit(response.status, errorMessage);
  throw new AIServiceError(
    isRateLimit ? AI_ERROR_CODES.AI_RATE_LIMIT : AI_ERROR_CODES.AI_PROVIDER_ERROR,
    errorMessage,
    {
      statusCode: response.status,
      retryable: isRateLimit || response.status >= 500,
      provider: providerName,
    },
  );
}
