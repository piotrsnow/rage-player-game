# Pattern — Testing hooks via pure-factory extraction

This project runs plain vitest with **no `@testing-library/react`** and no custom `renderHook` helper. Adding the dep for a handful of hook tests is overkill. The canonical pattern is: **refactor the hook to expose its pure logic as a named-export factory, then test the factory directly**.

## The pattern

A typical hook has two layers:

1. **Pure logic** — closures that compute results, dispatch actions, call back into injected services. No `useState`, no `useEffect`, no React — just plain functions over the hook's props.
2. **React plumbing** — `useMemo`, `useEffect`, `useRef`, `useEvent` wrappers around that pure logic.

Extract layer 1 as a named export. The hook becomes a thin wrapper that calls the factory from inside `useMemo`/`useEffect`. Tests import the factory and exercise it directly with vitest spies in place of real props.

## Worked example — handlers factory

```js
// Before — logic buried inside the hook
export function useCombatResolution({ dispatch, autoSave, generateScene, ... }) {
  return useMemo(() => {
    const handleEndCombat = (summary) => {
      dispatch({ type: 'END_COMBAT' });
      // ... 30 lines of closures
    };
    return { onEndCombat: handleEndCombat, ... };
  }, [dispatch, autoSave, generateScene, ...]);
}
```

```js
// After — pure factory + thin hook wrapper
export function buildCombatResolutionHandlers({ dispatch, autoSave, generateScene, ... }) {
  const handleEndCombat = (summary) => {
    dispatch({ type: 'END_COMBAT' });
    // ... same 30 lines
  };
  return { onEndCombat: handleEndCombat, ... };
}

export function useCombatResolution(deps) {
  return useMemo(
    () => buildCombatResolutionHandlers(deps),
    [deps.dispatch, deps.autoSave, deps.generateScene, /* ... */]
  );
}
```

### Test

```js
import { buildCombatResolutionHandlers } from './useCombatResolution.js';

function makeDeps(overrides = {}) {
  const dispatch = vi.fn();
  const autoSave = vi.fn();
  const generateScene = vi.fn(() => Promise.resolve());
  return {
    isMultiplayer: false,
    dispatch, autoSave, generateScene,
    narrator: { stop: vi.fn() },
    mp: { endMultiplayerCombat: vi.fn(), soloAction: vi.fn() },
    settings: { language: 'pl', dmSettings: {} },
    t: (key, fallback) => fallback || key,
    ...overrides,
  };
}

it('dispatches END_COMBAT + journal on victory', () => {
  const deps = makeDeps();
  const handlers = buildCombatResolutionHandlers(deps);
  handlers.onEndCombat({ playerSurvived: true, rounds: 3, enemiesDefeated: 2, totalEnemies: 2, woundsChange: -1 });
  expect(deps.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'END_COMBAT' }));
  expect(deps.generateScene).toHaveBeenCalledOnce();
});
```

No render, no `act`, no mount — synchronous function calls with spies.

## When the pure factory needs its own mocks

Some hooks import collaborators that can't run under vitest (e.g. `combatEngine` pulls `gameDataService`, which expects backend data loaded at runtime). Use vitest's module-level `vi.mock()`:

```js
vi.mock('../services/combatEngine', () => ({
  getCurrentTurnCombatant: vi.fn(),
  resolveEnemyTurns: vi.fn(),
}));

import { getCurrentTurnCombatant, resolveEnemyTurns } from '../services/combatEngine';

beforeEach(() => {
  vi.mocked(resolveEnemyTurns).mockReset();
});

it('dispatches UPDATE_COMBAT in solo mode', () => {
  vi.mocked(resolveEnemyTurns).mockReturnValue({
    combat: { /* fake state */ },
    results: [{ outcome: 'hit', damage: 3 }],
  });
  // ... exercise resolveEnemyTurnStep
});
```

Keeps the hook's own logic under test while isolating it from heavy dependencies.

## Splitting `useEffect` logic

When the hook's `useEffect` does real work (timers, side effects, computing whether to fire), split into **two** pure helpers:

- **Gate function** — returns `true/false/plan-object` from plain inputs. No side effects.
- **Step function** — performs side effects via injected callbacks.

```js
// Gate — pure, returns boolean
export function shouldScheduleEnemyTurn({ combat, combatOver, isMultiplayer, isHost }) {
  if (combatOver) return false;
  if (isMultiplayer && !isHost) return false;
  const current = getCurrentTurnCombatant(combat);
  if (!current || current.type === 'player') return false;
  return true;
}

// Step — impure, routes side effects through callbacks
export function resolveEnemyTurnStep({ combat, isMultiplayer, dispatch, addResultToLog, onHostResolve }) {
  const { combat: after, results } = resolveEnemyTurns(combat);
  for (const r of results) addResultToLog(r);
  if (isMultiplayer) onHostResolve?.(after);
  else dispatch({ type: 'UPDATE_COMBAT', payload: after });
  return { afterEnemies: after, enemyResults: results };
}

// The hook glues them together with useEffect
export function useEnemyTurnResolver(deps) {
  useEffect(() => {
    if (!shouldScheduleEnemyTurn(deps)) return;
    const timer = setTimeout(() => resolveEnemyTurnStep(deps), AI_TURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [/* ... */]);
}
```

Tests can now cover gating (6 cases) and side-effect routing (solo vs MP) in total isolation. The hook wrapper is two lines of `useEffect` plumbing — trivial enough that a smoke playwright test covers it.

## Refs with the `planX` pattern

When the hook relies on a `useRef` for state persisting across renders (e.g. "last processed timestamp"), the factory should **accept the current ref value as a plain prop** and **return the next value** instead of mutating the ref. The hook itself owns reading/writing the ref.

```js
// Pure — takes current processed-ts as input, returns what to do next
export function planCombatResultDrain({ combat, lastProcessedTs, isMultiplayer, isHost }) {
  if (!combat?.lastResults?.length) return { shouldApply: false, nextTs: lastProcessedTs, results: [] };
  if (combat.lastResultsTs === lastProcessedTs) return { shouldApply: false, nextTs: lastProcessedTs, results: [] };
  if (!isMultiplayer || isHost) return { shouldApply: false, nextTs: lastProcessedTs, results: [] };
  return { shouldApply: true, nextTs: combat.lastResultsTs, results: combat.lastResults };
}

// Hook owns the ref, calls planX, applies the plan
export function useCombatResultSync({ combat, isMultiplayer, isHost, addResultToLog }) {
  const lastTsRef = useRef(null);
  useEffect(() => {
    const plan = planCombatResultDrain({
      combat, lastProcessedTs: lastTsRef.current, isMultiplayer, isHost,
    });
    if (!plan.shouldApply) return;
    lastTsRef.current = plan.nextTs;
    for (const r of plan.results) addResultToLog(r);
  }, [/* ... */]);
}
```

The pure plan function can be tested for every combination of `(combat.lastResultsTs, lastProcessedTs, isMultiplayer, isHost)` without touching React.

## Naming conventions

- **Handler factory:** `buildXHandlers(deps)` → returns `{ onA, onB, onC }`. Used when the hook produces a callback object.
- **Gate function:** `shouldDoX(inputs)` → returns boolean.
- **Plan function:** `planX(inputs)` → returns `{ shouldApply, ...nextState, ...payload }`. Preferred when the decision carries data the hook needs to apply.
- **Step function:** `resolveXStep(deps)` → runs side effects via callbacks, returns introspection data.

## When NOT to apply this pattern

- **Hooks that only call other hooks** with no branching logic (e.g. a composition of selectors). Nothing to test — the only behavior is "it re-renders when the store changes," which is Zustand's contract.
- **Hooks that deeply use `useLayoutEffect` + DOM measurements.** These need a real render to test. If such a hook needs coverage, install `@testing-library/react` for that one case — don't contort the factory.
- **Existing hooks with no tests.** Don't refactor pre-emptively. Extract the factory only when you're writing the test.

## Prior art in this codebase

- `getAutoPlayerAdvanceDelay` — pure function inside [src/hooks/useAutoPlayer.js](../../src/hooks/useAutoPlayer.js), tested in `useAutoPlayer.test.js`
- `buildCombatResolutionHandlers` — [src/hooks/useCombatResolution.js](../../src/hooks/useCombatResolution.js), 11 tests
- `resolveEnemyTurnStep` + `shouldScheduleEnemyTurn` — [src/hooks/useEnemyTurnResolver.js](../../src/hooks/useEnemyTurnResolver.js), 9 tests
- `planCombatResultDrain` — [src/hooks/useCombatResultSync.js](../../src/hooks/useCombatResultSync.js), 9 tests

Shared fixtures: [src/test-fixtures/combatState.js](../../src/test-fixtures/combatState.js) — `buildCombatState({overrides})` + `buildCombatSummary({overrides})`. Default combatant is the RPGon baseline character (all attrs 1, szczęście 0).

## Related

- [pure-lift-refactoring.md](pure-lift-refactoring.md) — the lift pattern that produces testable boundaries
- [concepts/combat-system.md](../concepts/combat-system.md) — the subsystem most covered by this pattern today
- [e2e-campaign-seeding.md](e2e-campaign-seeding.md) — the companion Playwright pattern
