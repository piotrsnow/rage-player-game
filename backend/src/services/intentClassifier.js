// Thin barrel — implementation split into ./intentClassifier/*.js after the
// 588-LOC known-debt. generateSceneStream.js and the test file import
// `classifyIntent` / `classifyIntentHeuristic` / `detectTravelIntent` /
// `detectDungeonNavigateIntent` from this path unchanged.
export {
  classifyIntent,
  classifyIntentHeuristic,
  detectTravelIntent,
  detectDungeonNavigateIntent,
  buildAvailableSummary,
  selectContextWithNano,
} from './intentClassifier/index.js';
