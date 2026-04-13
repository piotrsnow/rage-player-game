# Pattern — Backend Monolith Split (Thin Facade + Submodule Folder)

Applied four times in one session (April 2026, session 6) to split growing Fastify routes and AI services:

| Source | LOC before | LOC after (facade) | Submodule count |
|---|---|---|---|
| `routes/campaigns.js` | 935 | 20 | 8 files (4 routes + 3 services + 1 schemas) |
| `routes/multiplayer.js` | 1291 | 7 | 9 files (2 route + 6 handlers + 1 shared service) |
| `services/multiplayerAI.js` | 1615 | 7 | 9 files |
| `services/sceneGenerator.js` | 1901 | 1 | 12 files |

Total: 4 monoliths (5742L) → 43 cohesive modules. Zero HTTP/WS contract changes.

## When to apply

Trigger conditions (any one is enough):
- **File over 800L** — the size budget in [senior_baseline §1](../../skills/senior_baseline.md#1-size-budgets-hard-limits) is 600L hard. 800L means it's been above that for a while; split now.
- **Function over 200L** — orchestrators this long carry too many independent phases. Each phase wants its own file.
- **Clear phase boundaries** — if you can describe the file as "load → validate → transform → persist → notify", every arrow is a potential split.
- **Two copies of the same logic** — APPROVE_ACTIONS vs SOLO_ACTION in multiplayer.js were ~90L duplicates differing only in momentum fallback. Same pattern: lift the shared flow to a service helper and parametrize the diff.

## Structure

```
routes/thing.js                 — thin facade (5-20L)
  • re-exports anything external consumers import
  • registers sub-plugins / re-exports orchestrator functions

routes/thing/
├── schemas.js                  — JSON Schema objects (if used by multiple sub-plugins)
├── http.js / public.js         — unauth'd routes
├── crud.js / handlers/*.js     — authed route groups, one file per topic
└── connection.js               — lifecycle setup (WS, SSE) — heartbeat, rate limit, dispatch

services/thing.js               — thin facade (1-20L) re-exporting public API
services/thing/
├── orchestrator.js             — the main entry function (matches the facade's export name)
├── phase1.js / phase2.js / ...  — one file per extractable phase
├── prompts/ helpers             — grouped by concern (system / user / context)
└── shared helpers               — pure functions leaves — labels, inlineKeys, diceNormalization
```

## The rules

### 1. Thin facade, always

The file at the original path becomes a **pure re-export** — no logic, no wiring beyond registering sub-plugins. This preserves:
- External import paths (`routes/ai.js` can still `import { generateSceneStream } from '../services/sceneGenerator.js'`)
- Test imports (`campaigns.saveState.test.js` still imports `extractTotalCost` from `./campaigns.js` — the facade re-exports it from `../services/campaignSerialize.js`)
- Diff surface (reviewers see one entry point, not a forest of new paths)

### 2. Match file name to export name

If the orchestrator exports `generateSceneStream`, the file is `generateSceneStream.js` — not `orchestrator.js` or `flow.js`. Grepping by export name lands on the right file on the first try.

### 3. Route facades register sub-plugins; service facades re-export

```js
// route facade
export async function campaignRoutes(fastify) {
  fastify.register(publicCampaignRoutes);
  fastify.register(async function authedCampaignRoutes(app) {
    app.addHook('onRequest', app.authenticate);
    app.register(crudCampaignRoutes);
    app.register(sharingCampaignRoutes);
    app.register(recapCampaignRoutes);
  });
}

// service facade
export { generateSceneStream } from './sceneGenerator/generateSceneStream.js';
```

**Preserve Fastify scoping** — public routes register at the top level, authed routes inside a child scope with `addHook('onRequest', app.authenticate)`. Sub-plugin order matters.

### 4. Pure leaves first, orchestrator last

Write the dependency tree from leaves up: labels → helpers → prompts → streaming client → orchestrator. Each leaf compiles independently and you can sanity-check it with `node -e 'import(...)'` before stacking the next layer.

## Handler wiring patterns

### Message dispatcher (WS)

`multiplayer.js` had 21 message types in one switch. After split:

```js
// routes/multiplayer/connection.js
import * as lobby from './handlers/lobby.js';
import * as gameplay from './handlers/gameplay.js';
// ...

const HANDLERS = {
  CREATE_ROOM: lobby.handleCreateRoom,
  JOIN_ROOM: lobby.handleJoinRoom,
  APPROVE_ACTIONS: gameplay.handleApproveActions,
  // ... 21 total
};

async function dispatchMessage(ctx, session, msg) {
  if (session.roomCode) touchRoom(session.roomCode);
  const handler = HANDLERS[msg.type];
  if (!handler) {
    ctx.sendWs(ctx.ws, WS_SERVER_TYPES.ERROR, { message: 'Unknown message type' });
    return;
  }
  await handler(ctx, session, msg);
}
```

The dispatcher stays **inline in `connection.js`** — it's ~15 lines. A separate `dispatcher.js` file would be noise.

### Session object for mutable per-connection state

WebSocket handlers needed to mutate `odId` and `roomCode` across messages (JOIN_ROOM sets them, LEAVE_ROOM clears them). Solution:

```js
// connection.js — one per WS connection
const session = { odId: null, roomCode: null };
const ctx = { fastify, ws: socket, uid: userId, sendWs, log };

socket.on('message', async (raw) => {
  // ...
  await dispatchMessage(ctx, session, msg);
});
```

Handlers mutate `session.odId` / `session.roomCode` in place. Identical runtime behavior to the original `let odId, roomCode` in the enclosing closure — just passed as a plain object so sub-modules can write to them.

### Shortcut early-return protocol

`sceneGenerator.js` had two early-return shortcuts: trade intent and combat fast-path. Each skipped the large model entirely and emitted a `complete` event. After split:

```js
// shortcuts.js
export function tryTradeShortcut(intentResult, coreState, dbNpcs) {
  if (!intentResult._tradeOnly) return { handled: false };
  // ... match NPC ...
  if (!matchedNpc) return { handled: false };
  return { handled: true, result: { /* ... */ } };
}

// generateSceneStream.js
const trade = tryTradeShortcut(intentResult, coreState, dbNpcs);
if (trade.handled) {
  onEvent({ type: 'complete', data: { scene: trade.result, sceneIndex: -1 } });
  return;
}
```

The `{ handled, result }` contract makes the orchestrator's short-circuit logic one line per shortcut.

## Dedup while you split

Every split surfaces duplication that was invisible before. Address it in the same commit — not later.

### Within backend

- `rollD50` — sceneGenerator and multiplayerAI each had their own 3-line copy. One `export` added to `diceResolver.js`, two imports added, two copies deleted.
- `clamp` — already exported from `diceResolver.js`, but multiplayerAI had a local copy. Swap the import.
- `detectCombatIntent` — 3 copies across backend + frontend. Moved to `shared/domain/combatIntent.js` with the richer frontend version as canonical (strict superset: more Polish conjugations, weapon-draw patterns, system-tag early-returns).

### Same-file dedup (APPROVE_ACTIONS / SOLO_ACTION)

Two ~90L blocks in `multiplayer.js` differing only in momentum computation. Extracted `runMultiplayerSceneFlow({ room, actions, msg, soloActionName })` in `services/multiplayerSceneFlow.js`. The one branch (single diceRoll vs diceRolls array) is parameterized via `soloActionName`.

This is senior_baseline §7 "Identical 5+ line blocks → extract immediately, even on the second copy". Don't defer to a follow-up PR — the split is your excuse to look at the same code twice, and that's exactly when dedup is cheapest.

### Error path stays in the caller

The flow helper handles the happy path only. The caller catches exceptions and picks its own user-facing copy:

```js
// handlers/gameplay.js
try {
  await runMultiplayerSceneFlow({ ... });
} catch (genErr) {
  restorePendingActions(session.roomCode, actions);
  const aiError = toClientAiError(genErr, 'Scene generation failed. Your actions have been restored — please try again.');
  broadcast(room, { type: 'GENERATION_FAILED', /* ... */ });
}
```

Error message differs between APPROVE and SOLO paths — keeping it in the caller lets each path stay self-explanatory without flag parameters.

## Pre-split audit checklist

Before writing any new file, run this sweep against the monolith:

1. **Grep consumers** — who imports from the source file? (`from.*sceneGenerator|import.*sceneGenerator`). Only `routes/ai.js` imports from sceneGenerator → one consumer → thin facade re-export is safe.
2. **Grep for duplicates within backend** — look for the top 5-10 helper function names in the rest of `backend/src/`. `detectCombatIntent`, `rollD50`, `clamp`, `formatMoney` all had parallels.
3. **Grep for dead code** — exported symbols with zero importers. `generateMidGameCharacter` (94L) was dead code in multiplayerAI.js — deleted during the split.
4. **Map the dependency tree** — write the submodule list with incoming imports. Cycles are easier to avoid before they exist.
5. **Flag BE/FE parallels you won't touch** — move them to `post_merge_infra.md` or similar. Don't let scope creep into a different refactor.

## Validation cadence

- **Per cohesive unit, not per file.** One commit = one split = one validation pass.
- `npm test` — backend vitest suite must be green. Frontend suite too if you touched `shared/domain/`.
- Smoke import — `node -e "import('./backend/src/services/thing.js').then(m => console.log(Object.keys(m).sort()))"` confirms the facade exports what consumers expect. Set `JWT_SECRET` + `API_KEY_ENCRYPTION_SECRET` env vars if any transitive import pulls `config.js`.
- **Do not** attempt full e2e through the split — too expensive and playtest catches the nuances anyway.

## Naming conventions settled during the sweep

- Facade files keep the original path and name — `sceneGenerator.js` stays `sceneGenerator.js`.
- Submodule folders match the facade name — `sceneGenerator/`, `multiplayerAI/`, `campaigns/`, `multiplayer/`.
- Inside route folders, **don't repeat "routes"** in file names — `public.js` not `publicRoutes.js`, `crud.js` not `crudRoutes.js`. Consistent with `routes/proxy/openai.js` convention.
- Inside service folders, **match file name to export name** where practical — `generateSceneStream.js` exports `generateSceneStream`, `sceneGeneration.js` exports `generateMultiplayerScene`.
- Prompt template files are allowed to exceed the 300L services soft-limit — they're single cohesive templates and splitting them fragments the prompt's logic.

## Related
- [[../concepts/backend-structure]] — current post-split file map
- [[component-decomposition]] — frontend analogue (pure-lift ladder for god components)
- [senior_baseline §1 size budgets](../../skills/senior_baseline.md#1-size-budgets-hard-limits)
- [senior_baseline §7 duplication rules](../../skills/senior_baseline.md#7-duplication-rules)
