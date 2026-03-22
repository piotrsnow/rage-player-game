import { PrismaClient } from '@prisma/client';
import { resolveApiKey } from '../../services/apiKeyService.js';

const prisma = new PrismaClient();

export async function anthropicProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/chat', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'anthropic');
    if (!apiKey) return reply.code(400).send({ error: 'Anthropic API key not configured' });

    const { messages, model, max_tokens, system, temperature } = request.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 4096,
        messages,
        ...(system ? { system } : {}),
        temperature: temperature ?? 0.8,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.error?.message || `Anthropic API error: ${response.status}`,
      });
    }

    const data = await response.json();
    return data;
  });
}
