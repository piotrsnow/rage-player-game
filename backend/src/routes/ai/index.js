import { singleShotRoutes } from './singleShots.js';
import { campaignStreamRoutes } from './campaignStream.js';
import { sceneStreamRoutes } from './sceneStream.js';
import { quickBeatStreamRoutes } from './quickBeatStream.js';
import { needsCommentaryStreamRoutes } from './needsCommentaryStream.js';
import { sceneRoutes } from './scenes.js';
import { keyTestRoutes } from './keyTest.js';
import { llmCallLogRoutes } from './llmCallLog.js';
import { incidentRoutes } from './incidents.js';
import { selfQuestRoutes } from './selfQuest.js';
import { inventSpellRoutes } from './inventSpell.js';
import { combineItemsRoutes } from './combineItems.js';
import { enchantItemRoutes } from './enchantItem.js';
import { classifySpellSchoolRoutes } from './classifySpellSchool.js';
import { generateLongDescriptionRoutes } from './generateLongDescription.js';
import { creatureEncounterStreamRoutes } from './creatureEncounterStream.js';
import { fieldMapRoutes } from './fieldMap.js';
import { locationBoardRoutes } from './locationBoard.js';
import { setLlmCallUserId } from '../../services/llmCallLogger.js';

/**
 * Registered in server.js via `app.register(aiRoutes, { prefix: '/ai' })`.
 *
 * Fastify encapsulation: the onRequest auth hook added here applies to
 * every handler inside this scope, including sub-plugins registered below.
 * Each sub-plugin is a thin async function that adds its own handlers to
 * the same scope — no second addHook call needed.
 */
export async function aiRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('onRequest', async (request) => {
    if (request.user?.id) setLlmCallUserId(request.user.id);
  });

  await fastify.register(singleShotRoutes);
  await fastify.register(campaignStreamRoutes);
  await fastify.register(sceneStreamRoutes);
  await fastify.register(quickBeatStreamRoutes);
  await fastify.register(needsCommentaryStreamRoutes);
  await fastify.register(sceneRoutes);
  await fastify.register(keyTestRoutes);
  await fastify.register(llmCallLogRoutes);
  await fastify.register(incidentRoutes);
  await fastify.register(selfQuestRoutes);
  await fastify.register(inventSpellRoutes);
  await fastify.register(combineItemsRoutes);
  await fastify.register(enchantItemRoutes);
  await fastify.register(classifySpellSchoolRoutes);
  await fastify.register(generateLongDescriptionRoutes);
  await fastify.register(creatureEncounterStreamRoutes);
  await fastify.register(fieldMapRoutes);
  await fastify.register(locationBoardRoutes);
}
