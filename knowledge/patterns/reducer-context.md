# Pattern — Reducer State (Context + Zustand Facade)

Long-lived frontend state goes through reducer actions. Never mutate directly. The primary campaign store migrated from `useReducer`+Context to **Zustand behind a backward-compat facade** in April 2026 ([[../concepts/frontend-refactor-2026-04]]); sibling contexts still use the original Context+Reducer shape.

## Two variants in the codebase

### Variant A — Classic `useReducer` + Context
Used by:
- `SettingsContext.jsx`
- `MultiplayerContext.jsx` with `slices/multiplayerSlice.js`
- `MusicContext.jsx`, `ModalContext.jsx`

```jsx
const [state, dispatch] = useReducer(reducer, initial);
return <Ctx.Provider value={{ state, dispatch }}>...</Ctx.Provider>;
```

### Variant B — Zustand store + `useGame()` facade
Used by the campaign store only. See [[../concepts/game-context]] for file layout.

- `gameReducer.js` still holds the 1790-line switch.
- `gameStore.js` wires the reducer into Zustand + exports `getGameState()` for imperative reads and `gameDispatch()` for writes.
- `gameSelectors.js` exports granular hooks (`useGameCombat`, `useGameChatHistory`, …) backed by Zustand's selector API.
- `GameContext.jsx` shrunk to a 22-line facade so legacy `useGame()` call sites keep working during incremental migration.

```js
// Granular selector — only re-renders when combat slice changes
const combat = useGameCombat();

// Imperative snapshot — read once, don't subscribe
const state = getGameState();

// Write path — unchanged from reducer days
gameDispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg });
```

## Why the migration
- `useGame()` full-state subscription caused re-renders of 28 consumers on every tick/chat append/autosave flag flip.
- Granular selectors drop re-renders to only components that care about a given slice.
- Reducer semantics kept — same actions, same tests, same validator pipeline ([[zod-validation]] → [[state-change-validation]]).
- Zustand chosen over Redux Toolkit (smaller runtime, no provider tree, cleaner selectors) and over native Context split (too many providers).

## Why not migrate every context
Sibling contexts (Settings, Multiplayer, Music, Modal) are low-churn and have few consumers. The cost/benefit of migrating them to Zustand doesn't justify the risk. Settings in particular has sync with backend account that would need reworking.

## Rules for both variants
- One dispatch path so AI output + user input converge into the same validator→reducer pipeline.
- Reducer is pure — no side effects, no async. Side effects live in hooks or services.
- Easy Vitest coverage for reducers — tests should stay valid through the Zustand wrap.

## Related
- [[zod-validation]]
- [[state-change-validation]]
- [[component-decomposition]] — the pattern that drove the PRs splitting god-components on top of this store
- [[../concepts/game-context]]
- [[../concepts/frontend-refactor-2026-04]]
