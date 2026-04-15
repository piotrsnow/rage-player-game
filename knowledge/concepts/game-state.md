# Game State (Zustand store + facade)

Single source of truth for active-play state on the frontend. Campaign, character, scenes, combat, chat, world, ephemeral UI — all live in one Zustand store fronted by a backward-compat `useGame()` facade so old call sites keep working while new code uses granular selectors.

## Files

- [src/stores/gameStore.js](../../src/stores/gameStore.js) — Zustand store: `useGameStore`, `autoSave`, `flushPendingSave`, `getGameState`, `gameDispatch`
- [src/stores/gameReducer.js](../../src/stores/gameReducer.js) — 59-line dispatcher that merges all handler maps under one `produce()` (Immer) call
- [src/stores/handlers/](../../src/stores/handlers/) — one file per domain, each exports an action→fn map:
  - `campaignHandlers.js` — LOAD_CAMPAIGN, START_CAMPAIGN, UPDATE_CAMPAIGN, RESET
  - `characterHandlers.js` — character mutations, XP/level, attribute points, titles
  - `combatHandlers.js` — combat lifecycle (START_COMBAT, UPDATE_COMBAT, END_COMBAT)
  - `sceneHandlers.js` — scene array mutations, scene index navigation
  - `questHandlers.js` — quest accept/decline/objective/completion
  - `worldHandlers.js` — NPCs, factions, location, time, weather, facts
  - `inventoryHandlers.js`, `partyHandlers.js`, `tradeCraftAlchemyHandlers.js`, `fieldMapHandlers.js`, `uiHandlers.js`
  - `applyStateChangesHandler.js` — the big one (~720L). Applies validated AI `stateChanges` to every slice in one action.
  - `_shared.js` — helpers used by multiple handlers (clamp, money conversion, etc.)
- [src/stores/gameSelectors.js](../../src/stores/gameSelectors.js) — granular selector hooks: `useGameCampaign`, `useGameCharacter`, `useGameCombat`, `useGameChatHistory`, `useGameWorld`, `useGameSlice(selector)`, ~15 more
- [src/contexts/GameContext.jsx](../../src/contexts/GameContext.jsx) — 22-line backward-compat facade. Old code can still `const { state, dispatch } = useGame()`.

## Read patterns (pick one)

```js
// Granular selector — only re-renders when combat slice changes. Preferred in hot-path components.
const combat = useGameCombat();

// Custom slice — when you need a derived subset.
const activeQuest = useGameSlice((s) => s.quests.find((q) => q.id === activeQuestId));

// Imperative snapshot — read once inside a handler or useEffect, don't subscribe.
const state = getGameState();

// Legacy facade — fine for slow paths, but causes full-store re-renders. Don't use in hot paths.
const { state, dispatch } = useGame();
```

### Granular deps + imperative read

When a memo needs fine-grained deps but the full state in the body:

```js
const stateHash = useGameSlice((s) => `${s.sceneIndex}:${s.chatHistory.length}`);
const result = useMemo(() => {
  const state = getGameState();
  return computeFromFullState(state);
}, [stateHash]);
```

Used in `SceneCanvas`, `useSceneCommands`, `useAutoPlayer`.

## Write path

```js
gameDispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg });
```

Dispatch flow:

1. Call reaches `gameReducer.js` → one `produce()` wrapper around all handler maps.
2. Handler matches action type, mutates the Immer `draft` OR returns a fresh state (for full-state transitions like `LOAD_CAMPAIGN`, `START_CAMPAIGN`, `RESET` — never both in the same handler).
3. Zustand publishes the new state to subscribers.
4. `autoSave()` is called separately by high-level flows (not from the reducer, which must stay pure).

## AI output path

```
AI SSE response
  → parseAIResponseLean (backend)
  → validated scene payload
  → applySceneStateChanges (src/hooks/sceneGeneration/)
  → stateValidator (src/services/stateValidator.js + shared/domain/stateValidation.js)
  → gameDispatch({type: 'APPLY_SCENE_STATE_CHANGES', payload: validated})
  → applyStateChangesHandler.js
```

Never mutate state directly. All AI output goes through the validator before dispatch — **`stateValidator.js` is the last line of defense against malformed AI responses**.

## Rules

1. **Reducer is pure.** No side effects, no async, no network calls. Side effects live in hooks or services.
2. **One dispatch path.** AI output + user input both funnel through `gameDispatch` → validator → handler.
3. **Handlers either mutate the draft OR return a new state.** Never both in the same handler. Full-state transitions return; incremental updates mutate.
4. **Zustand over Redux.** Chosen for smaller runtime, no provider tree, cleaner selectors API. Reducer semantics preserved so tests stay valid.

## Sibling contexts (NOT migrated — deliberate)

- **SettingsContext** (352L, 28+ consumers) — user prefs, API keys, DM settings, i18n. Stays on `useReducer` + Context. Low churn, heavy Provider lifecycle (auth bootstrap, debounced backend sync). Migration cost doesn't pay back.
- **MultiplayerContext** — WebSocket state machine, rejoin logic, action queueing. Split into `src/contexts/multiplayer/` (reducer + useMpActions + useMpWsSubscription). Zamknięty subsystem, migrating it would have real regression risk.
- **MusicContext**, **ModalContext** — small, low churn. Leave them until they actually become a bottleneck.

## When debugging state issues

1. **"Component doesn't re-render on state change."** It's using a selector that doesn't hit the changed slice. Add an explicit `useGameSlice` for the field you care about, or fall back to `useGame()` temporarily.
2. **"State update missed."** The handler mutated a local variable instead of the draft, or returned a new state without spreading everything. Check `applyStateChangesHandler.js` — the biggest footgun.
3. **"Race between dispatch and autoSave."** `autoSave()` reads `getGameState()` synchronously after dispatch; it's safe. If you're calling autoSave during render, stop.
4. **"AI stateChanges look wrong after applying."** The validator clamped or dropped something. Check `STATE_CHANGE_LIMITS` in `rpgSystem.js` and the `shared/domain/stateValidation.js` helpers.

## Related

- [scene-generation.md](scene-generation.md) — the main dispatch driver
- [persistence.md](persistence.md) — how the store is saved back to the backend
- [patterns/zustand-facade.md](../patterns/zustand-facade.md) — facade + selector patterns in more detail
