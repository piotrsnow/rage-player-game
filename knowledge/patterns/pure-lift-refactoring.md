# Pattern — Pure lift refactoring (moving code without changing behavior)

When a god-component or monolith needs to be broken up, the operating rule is **move code before changing behavior**. Each PR is a pure lift — same React tree, same state, same callbacks, same runtime behavior — just different file boundaries. No combined "refactor + fix" PRs.

## Why pure lifts

- **Small diff = small review surface.** Reviewers (and future you) can verify "this just moved" in seconds.
- **No hidden logic changes.** If something breaks after a pure lift, the problem is almost certainly "something got renamed wrong," not a subtle behavior change.
- **Tests stay valid.** If the lift is really pure, the existing test suite stays green without edits.
- **Separable improvement.** Once the file boundary is clean, behavior-change PRs can land on top of a clean baseline with their own review.

## Lift ladder (order to apply)

Apply in order — each step sits on the previous one's stable baseline.

1. **Pure rendering helpers.** Self-contained sub-components that use no parent-scope state. Example: `AnimatedCombatLogText`, `DialogueSegments`, `OverlayDiceCard`. Lowest regression risk, biggest line wins.
2. **Narrow effects with clear boundaries.** Isolated `useEffect` blocks that fence off their own refs. Example: `useImageRepairQueue`, `useViewerMode`, `useCombatResultSync`. Extract each with its own hook file; receive callbacks from parent when they need to reach into parent scope.
3. **Domain handlers.** Groups of similar callbacks — e.g. 6 near-duplicate combat handlers → `useCombatResolution`. Use a `useMemo` return object so handler identities stay stable per-render.
4. **JSX sub-components.** Large button rows / modal layers / sections — e.g. `GameplayHeader`, `GameplayModals`. Accept 20-30 props when needed; refuse the temptation to invent new state.
5. **Context shape changes.** Only after 1-4 land. Moving to granular selectors, splitting stores, etc. goes on top of a clean baseline.

## Backend analogue — thin facade + submodule folder

For Fastify routes or monolithic services, the same pattern applies with a different shape:

```
routes/thing.js               ← thin facade (5-20L): pure re-exports or registers sub-plugins
routes/thing/
├── schemas.js                ← shared JSON Schema objects
├── http.js / public.js       ← unauth'd routes
├── crud.js / handlers/*.js   ← authed route groups, one file per topic
└── connection.js             ← lifecycle setup (WS/SSE): heartbeat, rate limit, dispatcher

services/thing.js             ← thin facade (1-20L) re-exporting public API
services/thing/
├── <orchestratorName>.js     ← main entry function (matches facade's export name)
├── phase1.js / phase2.js     ← one file per extractable phase
└── helpers.js                ← shared helper leaves
```

### Rules

- **Thin facade, always.** The file at the original path becomes a pure re-export. Preserves external import paths and test imports with zero churn.
- **Match file name to export name.** If the orchestrator exports `generateSceneStream`, the file is `generateSceneStream.js` — not `orchestrator.js` or `flow.js`. Grepping by export name should land on the right file on the first try.
- **Route facades register sub-plugins; service facades re-export.** Preserve Fastify scoping (public routes top-level, authed routes in a child scope with `addHook('onRequest', app.authenticate)`).
- **Pure leaves first, orchestrator last.** Leaves → helpers → prompts → streaming client → orchestrator. Each layer compiles independently.

### Message dispatcher (WS)

When a switch statement has 15+ cases, lift each case into a handler function and use a `Map` lookup:

```js
const HANDLERS = {
  CREATE_ROOM: lobby.handleCreateRoom,
  JOIN_ROOM: lobby.handleJoinRoom,
  APPROVE_ACTIONS: gameplay.handleApproveActions,
  // ... 20+ total
};

async function dispatchMessage(ctx, session, msg) {
  const handler = HANDLERS[msg.type];
  if (!handler) {
    ctx.sendWs(ctx.ws, WS_SERVER_TYPES.ERROR, { message: 'Unknown message type' });
    return;
  }
  await handler(ctx, session, msg);
}
```

Keep the dispatcher inline in `connection.js` — a separate `dispatcher.js` file would be noise at ~15 lines.

### Session object for mutable per-connection state

When handlers need to mutate per-connection state (e.g. `odId`, `roomCode` as join/leave happens), don't pass them as return values — wrap them in a plain object that handlers mutate in place:

```js
// connection.js — one per WS connection
const session = { odId: null, roomCode: null };
const ctx = { fastify, ws, uid, sendWs, log };

socket.on('message', async (raw) => {
  await dispatchMessage(ctx, session, msg);
});
```

Handlers read and write `session.odId` / `session.roomCode`. Identical runtime behavior to a `let` in the enclosing closure — just passed as a plain object so sub-modules can write to it.

### Shortcut early-return protocol

When an orchestrator has N shortcut paths (e.g. trade intent, combat fast-path) that short-circuit the main pipeline, extract each shortcut as a pure function returning `{ handled, result }`:

```js
// shortcuts.js
export function tryTradeShortcut(intentResult, coreState, dbNpcs) {
  if (!intentResult._tradeOnly) return { handled: false };
  // ... match NPC ...
  if (!matchedNpc) return { handled: false };
  return { handled: true, result: { /* ... */ } };
}

// orchestrator.js
const trade = tryTradeShortcut(intentResult, coreState, dbNpcs);
if (trade.handled) {
  onEvent({ type: 'complete', data: { scene: trade.result, sceneIndex: -1 } });
  return;
}
```

The `{ handled, result }` contract makes the orchestrator's short-circuit logic one line per shortcut.

## Naming conventions

- Hooks: `useX.js` in `src/hooks/` — single responsibility, narrow input API, returns either a handler object or `{ onX, onY }` bag.
- Sub-components: live alongside parent unless the split produced 3+ files — then bucket into a subfolder (`gameplay/chat/`, `gameplay/scene/`).
- Pure utility functions: `src/services/*.js` (e.g. `summaryBlockBuilder.js`). Takes plain arguments, returns plain values. No React.
- Settings sections: `src/components/settings/sections/*Section.jsx` — one section per file, owns its own label computation.
- Backend submodules: match file name to export name; skip "routes" suffix in file names under `routes/*/` (`public.js`, not `publicRoutes.js`).

## Shadowing gotcha

If you lift a handler that takes a parameter named `summary` or `combat`, and then consume it via a hook returning a value with the same name, **rename the hook return at the call site**:

```js
// Bad — `summary` param in handleEndCombat(summary) shadows the hook
const summary = useSummary(...);
const handleEndCombat = (summary) => { ... };

// Good — rename the hook consumer
const recap = useSummary(...);
const handleEndCombat = (summary) => { ... };
```

## Dead code removal during lifts

Pure lifts are a natural moment to kill dead code. Grep `src/` for the symbol before deleting:

```
grep -rn SymbolName src/
```

If there are zero call sites, it's safe to delete. If in doubt, leave the export visible from its new home.

## Dedup while you split

Every split surfaces duplication that was invisible before. Address it in the same commit — not later. Examples from past splits:

- `rollD50` — multiple modules had their own 3-line copy. One `export` added to `diceResolver.js`, imports added, copies deleted.
- `detectCombatIntent` — FE/BE copies unified into `shared/domain/combatIntent.js`.
- Two ~90L blocks differing only in one parameter → extracted a shared flow helper with the differing param threaded through.

**Identical 5+ line blocks → extract immediately**, even on the second copy. The split is your excuse to look at the same code twice — that's when dedup is cheapest.

## Fix broken code during a lift, don't preserve it

If you notice something is broken, incomplete, or references something that doesn't exist (undefined vars, missing imports, dead refs, handlers that can't work), **fix the minimum to make it functional** and flag it in the PR description. Don't silently preserve ReferenceErrors to "stay pure-lift."

## Validation cadence

- **Per cohesive unit, not per file.** One commit = one split = one validation pass.
- Run build + tests once at the end of the PR, not between every edit. Pure lifts should have zero test changes.
- Backend imports can be smoke-tested with `node -e "import('./backend/src/services/thing.js').then(m => console.log(Object.keys(m).sort()))"` to confirm the facade exports what consumers expect.

## Callback-via-ref for late-bound handlers

When a hook needs a handler that's defined **later** in the same component (forward reference), wrap via a ref so the hook doesn't capture a stale `undefined`:

```js
const handleSceneNavRef = useRef(null);
useViewerMode({ handleSceneNavigation: (idx) => handleSceneNavRef.current?.(idx) });
// ... later in the component body ...
const handleSceneNavigation = (idx) => { ... };
handleSceneNavRef.current = handleSceneNavigation;
```

## Related

- [hook-pure-factory-testing.md](hook-pure-factory-testing.md) — testing the extracted hooks
- [zustand-facade.md](zustand-facade.md) — the state layer that hooks read from
- [concepts/frontend-structure.md](../concepts/frontend-structure.md) — where things live after lifting
- [concepts/backend-structure.md](../concepts/backend-structure.md) — where things live after splitting
