import { requireServerApiKey } from '../../services/apiKeyService.js';
import { config } from '../../config.js';
import { AIServiceError, parseProviderError, toClientAiError } from '../../services/aiErrors.js';

const CHAT_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    messages: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          role: { type: 'string', maxLength: 40 },
          content: { type: ['string', 'array'] },
        },
      },
    },
    model: { type: 'string', maxLength: 200 },
    max_tokens: { type: 'number' },
    system: { type: 'string', maxLength: 40000 },
    temperature: { type: 'number' },
  },
  required: ['messages'],
};

export async function anthropicProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/chat', { schema: { body: CHAT_BODY_SCHEMA } }, async (request, reply) => {
    let apiKey;
    try {
      apiKey = requireServerApiKey('anthropic', 'Anthropic');
    } catch (err) {
      const clientErr = toClientAiError(err, 'Anthropic API key not configured');
      return reply.code(err instanceof AIServiceError ? err.statusCode : 503).send({
        error: clientErr.message,
        code: clientErr.code,
      });
    }

    const { messages, model, max_tokens, system, temperature } = request.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || config.aiModels.premium.anthropic,
        max_tokens: max_tokens || 4096,
        messages,
        ...(system ? { system } : {}),
        temperature: temperature ?? 0.8,
      }),
    });

    if (!response.ok) {
      try {
        await parseProviderError(response, 'anthropic');
      } catch (err) {
        const clientErr = toClientAiError(err, 'Anthropic request failed.');
        return reply.code(err instanceof AIServiceError ? err.statusCode : response.status).send({
          error: clientErr.message,
          code: clientErr.code,
        });
      }
    }

    const data = await response.json();
    return data;
  });
}
