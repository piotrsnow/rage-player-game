// Thin barrel — implementation lives in ./aiContextTools/ after the
// 1358-LOC split. generateSceneStream.js imports `assembleContext` from
// this path unchanged.
//
// Legacy AI→tool→AI function-calling exports (CONTEXT_TOOLS_*, executeToolCall,
// handleGet* helpers) were removed together with the retired tool-use path;
// the only live path is `assembleContext` + `buildWorldLorePreamble` driven
// by the nano intent classifier.
export {
  assembleContext,
  buildWorldLorePreamble,
} from './aiContextTools/index.js';
