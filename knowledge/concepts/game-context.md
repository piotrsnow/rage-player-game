# GameContext — Central State

The single source of truth for active-play state on the frontend. As of April 2026 ([[frontend-refactor-2026-04]]) this is a **Zustand store fronted by a backward-compat `useGame()` facade** — the reducer logic still exists, just moved behind the store.

## Files
- `src/contexts/GameContext.jsx` — 22-line thin facade preserving the old `useGame()` hook API.
- `src/stores/gameStore.js` — Zustand store: `autoSave`, `flushPendingSave`, `getGameState`, `gameDispatch`.
- `src/stores/gameReducer.js` — 1790-line reducer extracted from the old `GameContext`.
- `src/stores/gameSelectors.js` — granular selectors (`useGameCampaign`, `useGameCharacter`, `useGameChatHistory`, `useGameCombat`, `useGameSlice(selector)`, plus ~15 others).

## Sibling contexts
- `SettingsContext.jsx` — prefs, API keys, DM settings, i18n (still useReducer + Context). Stays as Context — see [[context-migration-plan]].
- `MultiplayerContext.jsx` + `slices/multiplayerSlice.js` — see [[multiplayer]]. Stays as Context.
- `MusicContext.jsx`, `ModalContext.jsx` — migration candidates to Zustand, see [[context-migration-plan]].

## Dispatch path
AI responses → [[../patterns/zod-validation]] → [[../patterns/state-change-validation]] → `gameDispatch` into the store's reducer. Never mutate state directly — see [[../patterns/reducer-context]] (now documents the Zustand facade pattern).

## Imperative snapshot
When a handler or memo needs the full state once (not as reactive dep), use `getGameState()` from `gameStore.js` — avoids subscribing to the whole store. Pattern used in `SceneCanvas`, `useSceneCommands`, `useAutoPlayer`.

## Consumed by
- `src/components/gameplay/GameplayPage.jsx` — still consumes full state via `useGame()` facade. Granular-selector migration pending.
- Most hooks and hot-path components have migrated to granular selectors.
- `useGameState.js`, `useSceneGeneration.js`, `useGameContent.js`, `useImageGeneration.js`, `useNarrator.js` — large hooks still on `useGame()`, future migration candidates.

## Related
- [[../patterns/reducer-context]] — now documents the Zustand facade
- [[frontend-refactor-2026-04]] — the decomposition work
- [[two-stage-pipeline]]
