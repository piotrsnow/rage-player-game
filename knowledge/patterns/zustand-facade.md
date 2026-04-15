# Pattern — Zustand store behind a backward-compat facade

The primary campaign store uses **Zustand for granular selectors** but keeps the old `useGame()` API alive as a thin facade. This lets new code subscribe to narrow slices (fewer re-renders) while legacy components keep working without a migration.

## Shape

```
src/stores/gameStore.js        ← Zustand store: useGameStore, getGameState, gameDispatch, autoSave
src/stores/gameReducer.js      ← 59L dispatcher: merges handler maps, wraps in Immer produce()
src/stores/handlers/           ← per-domain action handlers (one file per slice)
src/stores/gameSelectors.js    ← granular hooks: useGameCombat, useGameCampaign, useGameSlice, ...
src/contexts/GameContext.jsx   ← 22L facade exporting useGame() for legacy call sites
```

## How to read state

```js
// Preferred — granular selector, re-renders only when this slice changes
const combat = useGameCombat();

// Custom derived slice
const activeQuest = useGameSlice((s) => s.quests.find((q) => q.id === id));

// Imperative snapshot — inside a handler or memo; does NOT subscribe
const state = getGameState();

// Legacy facade — still works, but triggers re-render on any state change
const { state, dispatch } = useGame();
```

### Granular deps + imperative read

When a `useMemo` needs narrow deps but full-state access inside the body:

```js
const stateHash = useGameSlice((s) => `${s.sceneIndex}:${s.chatHistory.length}`);
const result = useMemo(() => {
  const state = getGameState();
  return computeFromFullState(state);
}, [stateHash]);
```

Used in `SceneCanvas`, `useSceneCommands`, `useAutoPlayer` — components that legitimately need everything but must stay in hot-path shape.

## How to write state

```js
gameDispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg });
```

Write path: `gameDispatch` → `gameReducer.js` → matching handler in `handlers/*` → Immer `produce` → Zustand publishes new state.

## Handler rules

1. **Reducer is pure.** No side effects, no async, no network.
2. **Handlers either mutate the Immer draft OR return a fresh state.** Never both in one handler.
   - Incremental updates (add chat message, update field, append to array) → mutate `draft`.
   - Full-state transitions (`LOAD_CAMPAIGN`, `START_CAMPAIGN`, `RESET`) → `return newState`.
3. **One dispatch path.** AI output and user input both funnel through `gameDispatch` → validator → handler. Never mutate state directly outside a handler.

## When to keep Context vs migrate to Zustand

Stay on Context when:

- Low churn (settings change rarely)
- Heavy side effects in Provider lifecycle (auth bootstrap, debounced backend sync, WebSocket subscription)
- Closed subsystem that doesn't leak into the rest of the tree (multiplayer)

Move to Zustand when:

- High-frequency updates (game state, modals)
- Read granularly (not every consumer needs the whole blob)
- No heavy lifecycle side effects

Current non-Zustand contexts: `SettingsContext`, `MultiplayerContext`, `MusicContext`, `ModalContext`. All deliberate — don't migrate them without a concrete driver.

## Test strategy

Reducer handlers are pure functions and test directly via Vitest. No React needed. Example:

```js
import { gameReducer } from '../stores/gameReducer';
const before = buildCombatState();
const after = gameReducer(before, { type: 'UPDATE_COMBAT', payload: nextCombat });
expect(after.combat.round).toBe(2);
```

## Related

- [concepts/game-state.md](../concepts/game-state.md) — slice structure, selector inventory, debugging
- [pure-lift-refactoring.md](pure-lift-refactoring.md) — the lift pattern that sits on top of this store
- [hook-pure-factory-testing.md](hook-pure-factory-testing.md) — hooks built on top of the store
