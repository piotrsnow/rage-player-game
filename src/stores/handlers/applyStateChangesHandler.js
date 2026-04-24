// Thin barrel — implementation split into ./applyStateChangesHandler/*.js
// after the 845-LOC known-debt. gameReducer.js imports `applyStateChangesHandler`
// from this path unchanged.
export { applyStateChangesHandler } from './applyStateChangesHandler/index.js';
