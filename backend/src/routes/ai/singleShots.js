import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { generateStoryPrompt } from '../../services/storyPromptGenerator.js';
import { generateCombatCommentary } from '../../services/combatCommentary.js';
import { verifyObjective } from '../../services/objectiveVerifier.js';
import { generateRecap } from '../../services/recapGenerator.js';
import {
  STORY_PROMPT_SCHEMA,
  COMBAT_COMMENTARY_SCHEMA,
  VERIFY_OBJECTIVE_SCHEMA,
  RECAP_SCHEMA,
} from './schemas.js';

/**
 * Non-streaming AI endpoints. Each forwards the request body to a service
 * that wraps one single-shot LLM call and returns JSON synchronously.
 */
export async function singleShotRoutes(fastify) {
  /**
   * POST /ai/generate-story-prompt — random story premise for campaign creator.
   */
  fastify.post('/generate-story-prompt', { schema: { body: STORY_PROMPT_SCHEMA } }, async (request, reply) => {
    const { genre, tone, style, seedText, language, provider, model } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await generateStoryPrompt({ genre, tone, style, seedText, language, provider, model, userApiKeys });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/combat-commentary — mid-combat narration + battle cries.
   */
  fastify.post('/combat-commentary', { schema: { body: COMBAT_COMMENTARY_SCHEMA } }, async (request, reply) => {
    const { gameState = {}, combatSnapshot, language = 'en', provider = 'openai', model, modelTier = 'premium' } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await generateCombatCommentary({ gameState, combatSnapshot, language, provider, model, modelTier, userApiKeys });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/verify-objective — classify whether a quest objective fulfilled.
   */
  fastify.post('/verify-objective', { schema: { body: VERIFY_OBJECTIVE_SCHEMA } }, async (request, reply) => {
    const {
      storyContext = '',
      questName = '',
      questDescription = '',
      objectiveDescription = '',
      language = 'en',
      provider = 'openai',
      model,
      modelTier = 'premium',
    } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await verifyObjective({
        storyContext, questName, questDescription, objectiveDescription,
        language, provider, model, modelTier, userApiKeys,
      });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/generate-recap — "Previously on..." campaign recap.
   */
  fastify.post('/generate-recap', { schema: { body: RECAP_SCHEMA } }, async (request, reply) => {
    const {
      scenes = [],
      language = 'en',
      provider = 'openai',
      model,
      modelTier = 'premium',
      sentencesPerScene = 1,
      summaryStyle = null,
    } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await generateRecap({
        scenes, language, provider, model, modelTier, sentencesPerScene, summaryStyle, userApiKeys,
      });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });
}
