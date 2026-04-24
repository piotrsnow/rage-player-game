// Thin barrel — implementation split into ./systemPrompt/*.js after the
// 550-LOC known-debt. generateSceneStream.js and streamingClient.js import
// `buildLeanSystemPrompt` / `buildAnthropicSystemBlocks` from this path
// unchanged.
export {
  buildLeanSystemPrompt,
  buildAnthropicSystemBlocks,
} from './systemPrompt/index.js';
