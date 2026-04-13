# Plan B.2 — Split backend/src/routes/multiplayer.js

**Status:** in progress (session 6, 2026-04-13)
**Source:** [backend/src/routes/multiplayer.js](../backend/src/routes/multiplayer.js) 1291L

## Goal

Rozbić 1291L Fastify route (2 HTTP + 1 WS z 21 typami wiadomości) na:
- thin entrypoint
- `http.js` + `connection.js` sub-plugin
- 6 tematycznych handler-files
- 1 shared service-layer moduł z deduplikowanym flow generacji sceny

Zero HTTP/WS contract change. Side-benefit: dedup ~90L duplikacji między `APPROVE_ACTIONS` i `SOLO_ACTION`.

## Approved decisions (session 6)

1. **Dedup `APPROVE_ACTIONS` ↔ `SOLO_ACTION`** w tym samym commicie → `runMultiplayerSceneFlow()` w `multiplayerSceneFlow.js`.
2. **Handler signature:** mutable `session` object (`{ odId, roomCode }`) + `ctx` (`{ fastify, ws, uid, sendWs, log }`). Handlery mutują `session.*` w miejscu.
3. **Dispatcher inline** w `connection.js` — nie osobny plik.
4. **Naming:** bez suffixu `Routes` — folder `routes/multiplayer/` zawiera `http.js`, `connection.js`, `handlers/*.js`. Nie powtarzamy "routes" w nazwach.
5. **`http.js` jako osobny plik** (spójność z B.1).
6. **Walidacja:** `npm test` + smoke import. Bez manual WS smoke — user playtest out-of-band.

## Target structure

```
backend/src/routes/multiplayer.js                 — thin entrypoint (~25L)
backend/src/routes/multiplayer/
├── http.js                      (~65L)  — GET /rooms, GET /my-sessions
├── connection.js                (~180L) — WS: JWT, heartbeat, rate-limit, message queue,
│                                          close handler, inline dispatcher
└── handlers/
    ├── lobby.js                 (~260L) — CREATE_ROOM, CONVERT_TO_MULTIPLAYER, JOIN_ROOM,
    │                                      LEAVE_ROOM, REJOIN_ROOM, KICK_PLAYER
    ├── roomState.js             (~130L) — UPDATE_CHARACTER, UPDATE_SETTINGS, SYNC_CHARACTER,
    │                                      UPDATE_SCENE_IMAGE, TYPING, PING
    ├── gameplay.js               (~170L) — START_GAME, SUBMIT_ACTION, WITHDRAW_ACTION,
    │                                      APPROVE_ACTIONS, SOLO_ACTION (dedup'd via flow)
    ├── quests.js                (~210L) — ACCEPT_QUEST_OFFER, DECLINE_QUEST_OFFER,
    │                                      VERIFY_QUEST_OBJECTIVE
    ├── combat.js                (~110L) — COMBAT_SYNC, COMBAT_MANOEUVRE, COMBAT_ENDED
    └── webrtc.js                (~55L)  — WEBRTC_OFFER / ANSWER / ICE / TRACK_STATE

backend/src/services/multiplayerSceneFlow.js      (~220L) — flow helpers
  • calcNextMomentum                    (pure)
  • computeNewMomentum(scene, prev, soloActionName?)  (pure, new — encapsulates the
                                         APPROVE/SOLO fork)
  • applySceneStateChanges              (wrapper over shared/domain)
  • persistMultiplayerCharactersToDB    (DB side-effect, moved as-is)
  • fetchOwnedCharacter                 (DB read + deserialize)
  • buildArrivalNarrative               (pure)
  • runMultiplayerSceneFlow(args)       (the deduped APPROVE/SOLO pipeline)
```

All under senior_baseline soft limits (400L routes, 300L services).

## runMultiplayerSceneFlow contract

```js
async function runMultiplayerSceneFlow({
  ctx,               // { fastify, log }
  room,              // current room snapshot (already fetched)
  roomCode,
  actions,           // array of pending actions (single for solo)
  msg,               // incoming WS msg — for language, dmSettings
  soloActionName,    // nullable — triggers single-action momentum fallback
}) {
  // 1. build players array from room.players
  // 2. call generateMultiplayerScene(...)
  // 3. validateMultiplayerStateChanges + normalizeMultiplayerStateChanges
  // 4. computeNewMomentum(sceneResult.scene, room.gameState.characterMomentum || {}, soloActionName)
  // 5. applySceneStateChanges
  // 6. build updatedGameState + setGameState
  // 7. persistMultiplayerCharactersToDB (fire-and-forget)
  // 8. broadcast SCENE_UPDATE
  // 9. saveRoomToDB (fire-and-forget)
  // 10. if needsCompression: compressOldScenes (fire-and-forget + save)
}
```

Error path is handled by the **caller** — it catches, calls `restorePendingActions(roomCode, actions)` and broadcasts `GENERATION_FAILED`. This keeps the flow function single-responsibility (happy path) and lets each caller pick its own user-facing error copy.

## Dispatcher shape (inline in connection.js)

```js
import * as lobby from './handlers/lobby.js';
import * as roomState from './handlers/roomState.js';
// ...

const HANDLERS = {
  CREATE_ROOM: lobby.handleCreateRoom,
  CONVERT_TO_MULTIPLAYER: lobby.handleConvertToMultiplayer,
  JOIN_ROOM: lobby.handleJoinRoom,
  // ... 21 total
};

async function handleMessage(ctx, session, msg) {
  if (session.roomCode) touchRoom(session.roomCode);
  const handler = HANDLERS[msg.type];
  if (!handler) {
    ctx.sendWs(ctx.ws, WS_SERVER_TYPES.ERROR, { message: 'Unknown message type' });
    return;
  }
  await handler(ctx, session, msg);
}
```

## Risks

- **Session mutation drift** — handlers MUST mutate `session.odId` / `session.roomCode`, not local let-shadows. Audit every handler that today writes to `odId`/`roomCode`: `CREATE_ROOM`, `CONVERT_TO_MULTIPLAYER`, `JOIN_ROOM`, `LEAVE_ROOM`, `REJOIN_ROOM`.
- **`close` handler in connection.js** — reads `session.roomCode` + `session.odId` via closure. After-split still works because `session` is captured in the ws-scope closure, same lifetime as today's `let` vars.
- **`fastify` shadowing** — current code has `async function handleMessage(fastify, ws, uid, msg)` which shadows the outer `fastify`. Post-split `fastify` comes via `ctx.fastify` — no shadowing.
- **Dedup gameplay.js** — APPROVE_ACTIONS and SOLO_ACTION share ~90% of a 90-line block. Subtle diff: momentum computation. Parametrized via `soloActionName`. Must side-by-side every branch before commit.
- **Message queue sequential ordering** — `messageQueueTail` chain preserved 1:1 in `connection.js`.
- **Error allow-list** (`safeMessages` array, 15 items) — stays in `connection.js` as the top-level catch.

## Test impact

- No existing `.test.js` file imports from `routes/multiplayer.js`. ✓
- `shared/contracts/multiplayer.test.js` (untracked) tests WS message schemas, not route. Unaffected. ✓

## Git strategy

One cohesive commit: `refactor: split multiplayer.js into handlers + extract scene flow`. Validation: `npm test` + `node -e "import('./backend/src/routes/multiplayer.js').then(...)"` smoke. No manual WS smoke (user playtest out-of-band).
