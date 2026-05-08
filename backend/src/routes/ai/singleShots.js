import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { config } from '../../config.js';
import { getModelOverrides, TASK_CATEGORIES } from '../../services/serverConfig.js';
import { generateStoryPrompt } from '../../services/storyPromptGenerator.js';
import { generateCharacterLegend } from '../../services/characterLegendGenerator.js';
import { enhanceImagePrompt } from '../../services/imagePromptEnhancer.js';
import { generateImagePrompt } from '../../services/imagePromptGenerator.js';
import { translateImagePromptToEnglish } from '../../services/translateImagePrompt.js';
import { generateCombatCommentary } from '../../services/combatCommentary.js';
import { resolveCombatTurn } from '../../services/combatTurnResolver.js';
import { verifyObjective } from '../../services/objectiveVerifier.js';
import { generateRecap } from '../../services/recapGenerator.js';
import {
  STORY_PROMPT_SCHEMA,
  CHARACTER_LEGEND_SCHEMA,
  ENHANCE_IMAGE_PROMPT_SCHEMA,
  GENERATE_IMAGE_PROMPT_SCHEMA,
  TRANSLATE_IMAGE_PROMPT_SCHEMA,
  COMBAT_COMMENTARY_SCHEMA,
  COMBAT_TURN_RESOLVE_SCHEMA,
  VERIFY_OBJECTIVE_SCHEMA,
  RECAP_SCHEMA,
} from './schemas.js';

/**
 * Non-streaming AI endpoints. Each forwards the request body to a service
 * that wraps one single-shot LLM call and returns JSON synchronously.
 */
export async function singleShotRoutes(fastify) {
  /**
   * GET /ai/model-config — resolved model per task category + provider.
   * Available to all authenticated users so the FE can send explicit models.
   */
  fastify.get('/model-config', async () => {
    const overrides = await getModelOverrides();
    const resolved = {};
    for (const cat of TASK_CATEGORIES) {
      resolved[cat] = {
        openai: overrides[cat]?.openai || null,
        anthropic: overrides[cat]?.anthropic || null,
      };
    }
    return { models: resolved, defaults: config.aiModels };
  });

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
   * POST /ai/generate-character-legend — short epic-or-mocking bio blurb
   * for a saved character shown in the campaign creator.
   */
  fastify.post('/generate-character-legend', { schema: { body: CHARACTER_LEGEND_SCHEMA } }, async (request, reply) => {
    const { character, language, provider, model } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await generateCharacterLegend({ character, language, provider, model, userApiKeys });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/enhance-image-prompt — expand user keywords into a vivid
   * scene description for image generation. Returns { description }.
   */
  fastify.post('/enhance-image-prompt', { schema: { body: ENHANCE_IMAGE_PROMPT_SCHEMA } }, async (request, reply) => {
    const {
      keywords,
      imageStyle,
      darkPalette,
      seriousness,
      genre,
      tone,
      language,
      provider,
      model,
    } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await enhanceImagePrompt({
        keywords,
        imageStyle,
        darkPalette,
        seriousness,
        genre,
        tone,
        language,
        provider,
        model,
        userApiKeys,
      });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/generate-image-prompt — use a smaller LLM to compose the final
   * image-generation prompt from scene tags + config + optional custom style.
   */
  fastify.post('/generate-image-prompt', { schema: { body: GENERATE_IMAGE_PROMPT_SCHEMA } }, async (request, reply) => {
    const {
      imagePromptTags,
      narrative,
      imageProvider,
      imageStyle,
      darkPalette,
      seriousness,
      genre,
      tone,
      characterAge,
      characterGender,
      customStyleEnabled,
      customStyle,
      provider,
      model,
    } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await generateImagePrompt({
        imagePromptTags,
        narrative,
        imageProvider,
        imageStyle,
        darkPalette,
        seriousness,
        genre,
        tone,
        characterAge,
        characterGender,
        customStyleEnabled,
        customStyle,
        provider,
        model,
        userApiKeys,
      });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/translate-image-prompt — nano-tier translator that converts short
   * user-content fragments (item names, narrative snippets, player actions)
   * into English before they get embedded into image-gen templates. Callers
   * gracefully fall back to the original text on failure, so we keep the
   * response shape dead simple and let errors bubble up as 502/504.
   */
  fastify.post('/translate-image-prompt', { schema: { body: TRANSLATE_IMAGE_PROMPT_SCHEMA } }, async (request, reply) => {
    const { text } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await translateImagePromptToEnglish({ text, userApiKeys });
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

  /**
   * POST /ai/combat-turn-resolve — AI resolves a mid-combat player turn (item use / custom action).
   */
  fastify.post('/combat-turn-resolve', { schema: { body: COMBAT_TURN_RESOLVE_SCHEMA } }, async (request, reply) => {
    const {
      combatSnapshot,
      playerAction = '',
      language = 'pl',
      provider = 'openai',
      model,
      modelTier = 'standard',
    } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await resolveCombatTurn({
        combatSnapshot, playerAction, language, provider, model, modelTier, userApiKeys,
      });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });
}
