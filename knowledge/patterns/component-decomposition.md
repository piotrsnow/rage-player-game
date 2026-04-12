# Pattern — Component Decomposition (Pure Lift First)

Incremental split of god-components. The operating rule during the April 2026 refactor ([[../concepts/frontend-refactor-2026-04]]):

**Move code before changing behavior.** Each PR is a pure lift — same React tree, same state, same callbacks, just different file boundaries. No combined "refactor + fix" PRs.

## Lift ladder (order to apply)

1. **Pure rendering helpers** first — self-contained sub-components that use no parent-scope state (e.g. `AnimatedCombatLogText`, `DialogueSegments`, `OverlayDiceCard`). Lowest regression risk, biggest line wins.
2. **Narrow effects with clear boundaries** — isolated `useEffect` blocks that fence off their own refs (e.g. `useImageRepairQueue`, `useViewerMode`, `useCombatResultSync`). Extract each with its own hook file; receive callbacks from parent when they need to reach into parent scope.
3. **Domain handlers** — groups of similar callbacks (e.g. 6 near-duplicate combat handlers → `useCombatResolution`). Use a `useMemo` return object so the handler identities are stable per-render.
4. **JSX sub-components** — large button rows / modal layers / sections (e.g. `GameplayHeader`, `GameplayModals`). Accept ~20-30 props when needed; refuse the temptation to invent new state.
5. **Context shape changes** — only after 1-4 land. Moving to granular selectors, splitting stores, etc. happens on top of a clean baseline.

## Naming conventions settled by the refactor

- Hooks: `useX.js` in `src/hooks/` — single responsibility, narrow input API, returns either a handler object or `{ onX, onY }` bag.
- Sub-components: live alongside parent (`GameplayHeader.jsx` next to `GameplayPage.jsx`) unless the split produced 3+ files — then bucket into a subfolder (`gameplay/chat/`, `gameplay/scene/`).
- Pure utility functions: `src/services/*.js` (e.g. `summaryBlockBuilder.js`). Takes plain arguments, returns plain values. No React.
- Settings sections: `src/components/settings/sections/*Section.jsx` — one section per file, owns its own label computation.

## Shadowing gotcha

If you lift a handler that takes a parameter named `summary` or `combat`, and then consume it via a hook returning a value with the same name, rename the hook return at the call site:

```js
// Bad — `summary` param in handleEndCombat(summary) shadows the hook
const summary = useSummary(...);
const handleEndCombat = (summary) => { ... };

// Good — rename the hook consumer
const recap = useSummary(...);
const handleEndCombat = (summary) => { ... };
```

Caught this during PR #6 when `useSummary` collided with combat handler parameters.

## Build verification cadence

After each lift: `npx vite build 2>&1 | tail -20`. Don't batch multiple lifts before building — when something breaks, you want a small diff to bisect. `npm test -- --run` only when logic actually changed (pure lifts should have 345/345 unchanged).

## Callback-via-ref pattern for late-bound handlers

When a hook needs a handler that's defined **later** in the same component (forward reference), wrap via a ref so the hook doesn't capture a stale `undefined`:

```js
const handleSceneNavRef = useRef(null);
// ... hook call reads via ref
useViewerMode({ handleSceneNavigation: (idx) => handleSceneNavRef.current?.(idx) });
// ... later in component body
const handleSceneNavigation = (idx) => { ... };
handleSceneNavRef.current = handleSceneNavigation;
```

Used in `useViewerMode` consumer because the effect fires in mount order but `handleSceneNavigation` is declared after all hook calls for readability.

## Dead code removal during lifts

Pure lifts are a natural moment to kill dead code. Grep the whole `src/` for the symbol before deleting — `grep -rn SymbolName src/`. Removed during the April refactor:
- `CompactBonusTags`, `OverlayOutcomeTarget` (ScenePanel) — defined but never called.
- `combatPanelRef` (GameplayPage) — leftover after `useMultiplayerCombatHost` extraction.

If in doubt, leave the export visible from its new home and check git blame for the original introduction reason.

## Related
- [[../concepts/frontend-refactor-2026-04]]
- [[../concepts/frontend-refactor-regressions]]
- [[reducer-context]] — the state-shape pattern this decomposition builds on
