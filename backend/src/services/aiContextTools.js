// Thin barrel — implementation lives in ./aiContextTools/ after the
// 1358-LOC split. generateSceneStream.js imports `assembleContext` from
// this path unchanged.
export {
  assembleContext,
  buildWorldLorePreamble,
  CONTEXT_TOOLS_OPENAI,
  CONTEXT_TOOLS_ANTHROPIC,
  executeToolCall,
  handleSearchMemory,
  handleGetNPC,
  handleGetQuest,
  handleGetLocation,
  handleGetCodex,
  handleGetEquipmentCatalog,
  handleGetBestiary,
} from './aiContextTools/index.js';
