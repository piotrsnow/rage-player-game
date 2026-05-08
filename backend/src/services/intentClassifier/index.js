/**
 * Intent Classifier for 2-Stage AI Pipeline.
 *
 * Stage 1: decides what context the premium model needs.
 * - Heuristic layer handles structured markers (~70% of actions) with zero latency.
 * - Nano model handles freeform player text.
 *
 * Output: a "selection result" telling `assembleContext()` which data to expand.
 */

import { classifyIntentHeuristic } from './heuristics.js';
import { buildAvailableSummary, selectContextWithNano } from './nanoSelector.js';

export { classifyIntentHeuristic, detectTravelIntent, detectDungeonNavigateIntent } from './heuristics.js';
export { buildAvailableSummary, selectContextWithNano } from './nanoSelector.js';

function formatEntityTagsForNano(entityTags) {
  if (!Array.isArray(entityTags) || entityTags.length === 0) return '';
  const lines = entityTags.map((t) => `${t.kind}:${t.name}`);
  return `\nEntity tags: ${lines.join(', ')}`;
}

/**
 * Classify intent and determine what context to expand.
 *
 * @param {string} playerAction - The player's action text
 * @param {object} coreState - Campaign core state
 * @param {object} availableData - { dbNpcs, dbQuests, dbCodex, prevScene }
 * @param {object} options - { isFirstScene, provider, timeoutMs, entityTags }
 * @returns {Promise<object>} Selection result for assembleContext()
 */
export async function classifyIntent(playerAction, coreState, availableData, options = {}) {
  const heuristicResult = classifyIntentHeuristic(playerAction, options);
  if (heuristicResult !== null) {
    return heuristicResult;
  }

  const availableSummary = buildAvailableSummary(coreState, availableData);
  const tagSuffix = formatEntityTagsForNano(options.entityTags);
  const enrichedAction = tagSuffix ? `${playerAction}${tagSuffix}` : playerAction;

  const nanoResult = await selectContextWithNano(enrichedAction, availableSummary, {
    provider: options.provider || 'openai',
    timeoutMs: options.timeoutMs,
  });

  const result = { ...nanoResult, _intent: 'freeform' };
  if (Array.isArray(options.entityTags) && options.entityTags.length > 0) {
    result._entityTags = options.entityTags;
  }
  return result;
}
