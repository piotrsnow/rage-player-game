import { callAIJson } from '../../services/aiJsonCall.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'generateLongDescription' });

const BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['entityType', 'name'],
  properties: {
    entityType: { type: 'string', enum: ['spell', 'item'] },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 500 },
    school: { type: 'string', maxLength: 100 },
    itemType: { type: 'string', maxLength: 60 },
    rarity: { type: 'string', maxLength: 30 },
    context: { type: 'string', maxLength: 500 },
  },
};

function buildSpellPrompt(name, description, school) {
  return `Jesteś ekspertem od świata RPGon — mrocznego, niskomagicznego fantasy.

Twoim zadaniem jest napisać "longDescription" dla zaklęcia: 2-4 zdania po polsku — mistyczna, zadziwiająca, mroczna lub fascynująca historia powstania tego czaru. Kto go stworzył, w jakich okolicznościach, jaka legenda się z nim wiąże, jak został odkryty.
NIE powtarzaj opisu efektu mechanicznego — to jest osobna fabularno-historyczna miniatura.
Pisz immersyjnie, w duchu dark fantasy.

Zaklęcie: "${name}"
${school ? `Szkoła: ${school}` : ''}
${description ? `Krótki opis efektu: ${description}` : ''}

Zwróć WYŁĄCZNIE poprawny JSON:
{"longDescription": "..."}`;
}

function buildItemPrompt(name, description, itemType, rarity, context) {
  return `Jesteś ekspertem od świata RPGon — mrocznego, niskomagicznego fantasy.

Twoim zadaniem jest napisać "longDescription" dla przedmiotu: 2-4 zdania po polsku — historia, pochodzenie, legenda, kto go wykuł/stworzył/znalazł, co czyni go wyjątkowym albo interesującym.
NIE powtarzaj krótkiego opisu — to jest osobna fabularno-historyczna miniatura.
Pisz immersyjnie, w duchu dark fantasy.

Przedmiot: "${name}"
${itemType ? `Typ: ${itemType}` : ''}
${rarity ? `Rzadkość: ${rarity}` : ''}
${description ? `Krótki opis: ${description}` : ''}
${context ? `Kontekst: ${context}` : ''}

Zwróć WYŁĄCZNIE poprawny JSON:
{"longDescription": "..."}`;
}

export async function generateLongDescriptionRoutes(fastify) {
  fastify.post(
    '/generate-long-description',
    {
      schema: { body: BODY_SCHEMA },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { entityType, name, description, school, itemType, rarity, context } = request.body;
      const userId = request.user.id;
      const userApiKeys = await loadUserApiKeys(prisma, userId);

      const prompt = entityType === 'spell'
        ? buildSpellPrompt(name, description, school)
        : buildItemPrompt(name, description, itemType, rarity, context);

      let longDescription = null;
      try {
        const { text } = await callAIJson({
          modelTier: 'nano',
          taskCategory: 'spellClassification',
          systemPrompt: prompt,
          userPrompt: `Wygeneruj longDescription dla: ${name}`,
          maxTokens: 500,
          temperature: 0.7,
          userApiKeys,
          userId,
          taskType: 'generate-long-description',
          taskLabel: `Long description: ${name}`,
        });
        const parsed = JSON.parse(text);
        longDescription = typeof parsed?.longDescription === 'string'
          ? parsed.longDescription.trim().slice(0, 1000)
          : null;
      } catch (err) {
        log.warn({ err: err?.message, entityType, name }, 'Long description generation failed');
        return reply.code(502).send({ error: 'AI generation failed', code: 'AI_REQUEST_FAILED' });
      }

      if (!longDescription) {
        return reply.code(502).send({ error: 'AI returned empty description', code: 'AI_EMPTY_RESPONSE' });
      }

      if (entityType === 'spell') {
        try {
          await prisma.customSpell.updateMany({
            where: { name },
            data: { longDescription },
          });
        } catch (err) {
          log.warn({ err: err?.message, name }, 'CustomSpell longDescription persist failed — returning result anyway');
        }
      }

      return { longDescription };
    },
  );
}
