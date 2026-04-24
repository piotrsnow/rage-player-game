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

/**
 * Classify intent and determine what context to expand.
 *
 * @param {string} playerAction - The player's action text
 * @param {object} coreState - Campaign core state
 * @param {object} availableData - { dbNpcs, dbQuests, dbCodex, prevScene }
 * @param {object} options - { isFirstScene, provider, timeoutMs }
 * @returns {Promise<object>} Selection result for assembleContext()
 */
export async function classifyIntent(playerAction, coreState, availableData, options = {}) {
  const heuristicResult = classifyIntentHeuristic(playerAction, options);
  if (heuristicResult !== null) {
    return heuristicResult;
  }

  const availableSummary = buildAvailableSummary(coreState, availableData);
  const nanoResult = await selectContextWithNano(playerAction, availableSummary, {
    provider: options.provider || 'openai',
    timeoutMs: options.timeoutMs,
  });

  return { ...nanoResult, _intent: 'freeform' };
}
