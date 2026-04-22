// Thin barrel — implementation lives in ./processStateChanges/ after the
// 1277-LOC split. Existing importers (postSceneWork.js, the shouldPromoteToGlobal
// unit tests) stay on this path unchanged.
export {
  processStateChanges,
  generateSceneEmbedding,
  shouldPromoteToGlobal,
} from './processStateChanges/index.js';
