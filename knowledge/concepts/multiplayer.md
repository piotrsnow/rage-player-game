# Multiplayer Architecture

WebSocket-based multiplayer for 2-6 players sharing one campaign. Host's browser runs the authoritative game state; guests send actions through WS and receive the host's computed results. Backend is a relay + persistence layer, not a game engine.

## Design principle

**Host runs the game.** The backend does not simulate combat, resolve dice, or own the canonical `gameState`. It relays WS messages, persists rooms for crash recovery, and (via shared scene-flow helpers) runs AI scene generation on behalf of the host's party. This keeps multiplayer close to solo: same reducer, same engines, same validators.

## Files

### Backend

- [backend/src/routes/multiplayer.js](../../backend/src/routes/multiplayer.js) — 7L thin facade
- [backend/src/routes/multiplayer/http.js](../../backend/src/routes/multiplayer/http.js) — HTTP endpoints: `GET /rooms`, `GET /my-sessions`
- [backend/src/routes/multiplayer/connection.js](../../backend/src/routes/multiplayer/connection.js) — WS authentication, heartbeat (30s), rate limiting (30/s normal, 60/s hard-close), sequential message queue per socket, close handler, inline dispatcher (`Map<type, handler>` lookup)
- [backend/src/routes/multiplayer/handlers/](../../backend/src/routes/multiplayer/handlers/) — one file per message group, all tested:
  - `lobby.js` — CREATE_ROOM, CONVERT_TO_MULTIPLAYER, JOIN_ROOM, LEAVE_ROOM, REJOIN_ROOM, KICK_PLAYER
  - `roomState.js` — UPDATE_CHARACTER, UPDATE_SETTINGS, SYNC_CHARACTER, UPDATE_SCENE_IMAGE, TYPING, PING
  - `gameplay.js` — START_GAME, SUBMIT_ACTION, WITHDRAW_ACTION, APPROVE_ACTIONS, SOLO_ACTION
  - `quests.js` — ACCEPT_QUEST_OFFER, DECLINE_QUEST_OFFER, VERIFY_QUEST_OBJECTIVE
  - `combat.js` — COMBAT_SYNC, COMBAT_MANOEUVRE, COMBAT_ENDED
  - `webrtc.js` — WEBRTC_OFFER/ANSWER/ICE/TRACK_STATE (signal forwarding for voice chat)

All handlers share:

- `session = { odId, roomCode }` — mutated in place as the socket joins/leaves rooms
- `ctx = { fastify, ws, uid, sendWs, log }` — set up once per connection

### Services

- [backend/src/services/roomManager.js](../../backend/src/services/roomManager.js) — in-memory `Map<roomCode, room>` + Prisma persistence. Room lifecycle (create/join/leave/restore/disconnect), state mutation (updateCharacter, updateSettings, submitAction, approveActions, executeSoloAction, setPhase, setGameState), query (getRoom, listJoinableRooms, listUserRooms, findSessionInDB, sanitizeRoom), IO (broadcast, sendTo, saveRoomToDB, closeAllRoomSockets)
- [backend/src/services/multiplayerSceneFlow.js](../../backend/src/services/multiplayerSceneFlow.js) — shared flow reused by APPROVE_ACTIONS and SOLO_ACTION: `runMultiplayerSceneFlow`, `persistMultiplayerCharactersToDB`, `fetchOwnedCharacter`, `computeNewMomentum`, `applySceneStateChanges`, `buildArrivalNarrative`. The same code path serves both "all players submitted, resolve round" and "one player took a solo action during downtime."
- [backend/src/services/multiplayerAI/](../../backend/src/services/multiplayerAI/) — MP-specific AI pipeline (different from the solo scene generator):
  - `aiClient.js` — `callAI` with OpenAI → Anthropic fallback + retry + `safeParseJSONContent`
  - `systemPrompt.js` — `buildMultiplayerSystemPrompt` + `NEEDS_LABELS` + `buildMultiplayerUnmetNeedsBlock`
  - `scenePrompt.js` — `buildMultiplayerScenePrompt`
  - `sceneGeneration.js` — `generateMultiplayerScene` orchestrator
  - `campaignGeneration.js` — `generateMultiplayerCampaign` orchestrator
  - `compression.js` — `needsCompression`, `compressOldScenes`, `verifyMultiplayerQuestObjective`
  - `diceNormalization.js` — `normalizeDiceRoll`, `recalcDiceRoll`, `computeNewMomentum`

### Frontend

- [src/contexts/MultiplayerContext.jsx](../../src/contexts/MultiplayerContext.jsx) — ~40L composition shell
- [src/contexts/multiplayer/](../../src/contexts/multiplayer/) — split subsystem:
  - `mpReducer.js` — MP state: `rooms`, `currentRoom`, `players`, `pendingActions`, `typing`, connection state
  - `useMpWsSubscription.js` — WebSocket subscription + onMessage dispatcher
  - `useMpActions.js` — action builders: createRoom, joinRoom, submitAction, combatSync, soloAction, etc.
- [src/services/websocket.js](../../src/services/websocket.js) — raw WS client with reconnect logic
- [shared/contracts/multiplayer.js](../../shared/contracts/multiplayer.js) — `createWsMessage`, `normalizeClientWsType`, `normalizeMultiplayerStateChanges`, `TYPING_DRAFT_MAX_LENGTH`, `WS_SERVER_TYPES`. Single source of truth for message shapes + validation.

## Room state shape

```js
{
  roomCode: 'ABCD',
  hostId: 'user-uuid',
  phase: 'lobby' | 'playing' | 'paused',
  settings: { ...dmSettings, visibility: 'public'|'private' },
  players: [
    { id, odId, name, characterId, character, ws, connected, isHost }
  ],
  gameState: { ...fullCampaignState },   // authoritative state (mirrors host's Zustand)
  pendingActions: Map<playerId, action>, // awaiting APPROVE_ACTIONS
  lastActivity: Date,
}
```

`player.ws` is a **runtime WebSocket reference**, never serialized. When the room is persisted to DB via `saveRoomToDB`, `player.ws` is stripped out.

## Scene generation flow (APPROVE_ACTIONS)

1. All players submit actions via `SUBMIT_ACTION` → stored in `room.pendingActions`
2. Host calls `APPROVE_ACTIONS` → handler enters `runMultiplayerSceneFlow`
3. Flow combines all player actions into one multi-action prompt
4. Calls `generateMultiplayerScene` (streaming or non-streaming depending on config)
5. Parses the response, validates via `validateMultiplayerStateChanges`
6. Applies state changes to `room.gameState` via shared `applySceneStateChanges`
7. Persists character deltas to DB via `persistMultiplayerCharactersToDB`
8. Broadcasts the new scene to all players via `broadcast(room, {type: 'SCENE_GENERATED', ...})`

SOLO_ACTION follows the same helper with `soloActionName` param, differing only in that it carries one player's action instead of all pending actions.

## Crash recovery

- **Room persistence.** On every major mutation (convert, join, leave, start, post-scene-gen), room manager calls `saveRoomToDB`. On SIGTERM, `saveAllActiveRooms()` flushes all active rooms. On boot, `loadActiveSessionsFromDB()` restores them.
- **Re-join flow.** When a disconnected player reconnects, they send `REJOIN_ROOM` with their `odId`. Handler re-attaches their socket to the stored player slot, marks them connected, sends them a full state snapshot.
- **What doesn't survive a hard crash.** Pending actions, typing indicators, mid-stream scene generation. Acceptable for pre-prod — playtest feedback will drive further Redis-backed persistence if it becomes a problem.

## WebRTC voice chat

Signaling goes through the same WebSocket — `WEBRTC_OFFER/ANSWER/ICE/TRACK_STATE` messages are forwarded host-to-peer by `webrtc.js` handler. Actual media streams are peer-to-peer. [src/hooks/useWebRTC.js](../../src/hooks/useWebRTC.js) owns the RTCPeerConnection lifecycle.

## Combat in MP

See [combat-system.md](combat-system.md) — host runs `combatEngine` locally and broadcasts `COMBAT_SYNC` messages with `combat.lastResults` diffs; guests consume them via `useCombatResultSync.planCombatResultDrain`.

**Host migration is NOT implemented.** If the host disconnects during combat, the combat state is frozen until they reconnect or the session times out.

## When debugging multiplayer

1. **"Player joined but sees stale state."** `roomState.js` SYNC_CHARACTER handler vs `lobby.js` JOIN_ROOM handler — check which snapshot they received.
2. **"Action got dropped."** WS message queue in `connection.js` — sequential queue means one slow handler blocks the next message on the same socket. Check for handler awaits that never resolve.
3. **"Room disappeared after backend restart."** Check `loadActiveSessionsFromDB()` on boot. The room persists but player sockets don't — all players must re-join via REJOIN_ROOM.
4. **"Combat desync between host and guest."** `COMBAT_SYNC` broadcast from host → guest's `planCombatResultDrain`. The `lastResultsTs` must advance; stale timestamps cause drain to no-op.
5. **"Rate limit hit on legit traffic."** `connection.js` has a 30/s normal, 60/s hard-close. Check if typing indicators are flooding.

## Related

- [combat-system.md](combat-system.md) — MP combat sync specifically
- [scene-generation.md](scene-generation.md) — the solo scene-gen pipeline (MP uses a parallel `multiplayerAI/` pipeline)
- [patterns/bullmq-queues.md](../patterns/bullmq-queues.md) — scene gen jobs go through the same queue
