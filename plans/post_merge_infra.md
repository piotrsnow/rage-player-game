# Post-Merge Infra Backlog

**Extracted from:** `plans/merge_status.md` (session 5, 2026-04-13)
**Status (2026-04-14 night):** All small/medium items closed. Redis plumbing + 5 consumers live (embedding cache, rate-limit, idempotency, BullMQ queues, refresh tokens). **Item 2 FULLY DONE** (BullMQ for campaign + scene gen with pub/sub streaming bridge). **Item 3 FULLY DONE** (refresh tokens via httpOnly cookie + double-submit CSRF + FE apiClient 401 retry, `/v2/auth/*` routes alongside `/v1/auth/*`). **No-BYOK cleanup DONE** — FE direct-dispatch removed, BE now resolves per-user keys properly, 3 new BE endpoints for recap/combat/verify. **Item 1 Stage 2 (roomManager → Redis) — DEFERRED INDEFINITELY** (2026-04-14 night): DB fallback already covers clean shutdowns, pub/sub is dead code on single-VM Prod-A, remaining gap (crash-survival for pending actions/typing state) has no concrete driver. Revisit only when (a) second backend instance is planned or (b) a bug report surfaces lost mid-scene state after a hard crash. Plus item 6 (proxy middleware) needs a dedicated design session, item 4 (CSP enable) needs staging playtest, item 12 (JWT rotation + OpenAI model verify) is ops-only.

## Progress snapshot

| # | Item | Status |
|---|---|---|
| — | **Redis decision + plumbing (Stage 1)** | **✅ DONE 2026-04-14** — Prod-A (self-hosted Valkey in docker-compose on single VM), `redisClient.js` singleton with optional mode, `/health` reports redis status, graceful shutdown wired |
| 1 | Redis room state | **DEFERRED INDEFINITELY 2026-04-14** — Stage 1 plumbing done, Stage 2 migration judged not worth the cost on single-VM Prod-A. DB fallback + clean-shutdown persist already covers the main failure mode; remaining gap needs a concrete driver before we pay the 2-3 session cost. See section 1. |
| 2 | BullMQ for AI generation | **✅ DONE 2026-04-14** — Stage 1: bullmq + bull-board, per-provider queues, worker, /generate-campaign via queue, /ai/jobs/:id poller. Stage 2: /generate-scene-stream via queue + Redis pub/sub bridge to SSE, pre-generated jobId removes subscribe-after-publish race, FE unchanged (transparent migration). |
| 3 | Refresh tokens + revocation | **✅ DONE 2026-04-14** — `/v2/auth/*` cookie-based refresh flow. refreshTokenService (Redis-backed, O(1) revoke), csrf plugin (double-submit cookie + constant-time compare), FE apiClient rewrite (credentials: include, in-memory access token, bootstrapAuth, auto-refresh on 401). 34 new tests. `/v1/auth/*` left alive for rollback. |
| 4 | Basic CSP | **AUDIT DONE** — enable deferred pending staging playtest |
| 5 | API versioning (`/v1/`) | **✅ DONE 2026-04-14** |
| 6 | Proxy route middleware extraction | **TODO** — standalone, needs design session |
| 7 | Idempotency keys | **✅ DONE 2026-04-14** — backend plugin (9 tests) + FE apiClient extension (8 tests) + opt-in on 5 mutation call sites |
| 8 | Per-user rate limiting | **✅ DONE 2026-04-14** — custom keyGenerator (userId when authed, IP fallback), Redis store when enabled, 6 tests |
| 9a | Embedding LRU short-term TTL | **✅ DONE 2026-04-14** |
| 9b | Embedding LRU Redis migration | **✅ DONE 2026-04-14** — two-tier L1+L2 cache, SHA256 keys, EX TTL, fallback on Redis errors, 6 new tests |
| 10 | FE↔BE AI helper consolidation | **✅ DONE 2026-04-14** (fallbackActions + aiResponseParser + dialogueRepair → `shared/domain/`) |
| 11 | WS message handler tests | **✅ DONE 2026-04-14** (64 tests across 6 handler files) |
| 12 | Pre-merge deployment checklist | **TODO** — not Claude-implementable (JWT rotation, OpenAI model ID verify) |
| — | **No-BYOK cleanup** | **✅ DONE 2026-04-14 night** — BE `resolveApiKey` now decrypts user keys; user keys threaded through scene/campaign/story-prompt; 3 new BE services + routes (combat commentary, verify objective, recap with chunking); FE `service.js` / `imageGen.js` / `meshyClient.js` rewritten to BE-only; `providers.js` + `aiStream.js` + `compressScenes` + `inferSkillCheck` deleted; `apiClient.isConnected()` simplified to token check. See `project_no_byok` memory. |

**Test suite after all 2026-04-14 work:** 44 files 505 tests passing, production build green. See `project_post_merge_progress` memory for the detailed handoff.

---

## Handoff for the remaining heavy tasks

The only remaining heavy item (**1 Stage 2** — roomManager) is self-contained enough to start a **fresh chat** with just its section of this doc plus the deployment context below. The intended flow is: open a new chat, point it at the specific section in this plan, and let it plan + execute against a clean working tree.

**Shared context every new chat needs to know:**

- **Redis is live and optional.** `backend/src/services/redisClient.js` exposes `getRedisClient()` / `isRedisEnabled()` / `pingRedis()` / `closeRedis()`. Every consumer so far uses the pattern *"check `isRedisEnabled()`, call Redis, catch errors, fall back gracefully"*. Four production consumers already follow this pattern as reference: [backend/src/services/embeddingService.js](../backend/src/services/embeddingService.js) (L1+L2 cache), [backend/src/plugins/rateLimitKey.js](../backend/src/plugins/rateLimitKey.js) (keyGenerator), [backend/src/plugins/idempotency.js](../backend/src/plugins/idempotency.js) (full plugin), [backend/src/services/queues/aiQueue.js](../backend/src/services/queues/aiQueue.js) + [backend/src/workers/aiWorker.js](../backend/src/workers/aiWorker.js) (BullMQ queue + worker + pub/sub bridge for scene-gen). A new consumer should copy this pattern, not invent a new one.
- **BullMQ is live.** Per-provider queues (`ai-openai`, `ai-anthropic`, `ai-gemini`, `ai-stability`, `ai-meshy`), in-process workers by default, standalone mode via `WORKER_MODE=1` + `docker compose --profile workers up`. `enqueueJob(name, data, { provider, userId, jobId? })` supports pre-generated jobIds for subscribe-before-publish patterns. Bull-board UI at `/v1/admin/queues` (admin JWT claim required). For scene-gen, the handler publishes stream events to `scene-job:<jobId>:events` and the route handler subscribes + bridges to SSE — see [backend/src/routes/ai.js](../backend/src/routes/ai.js) `/campaigns/:id/generate-scene-stream` for the full pattern.
- **Deployment reality.** Single Compute Engine VM running `docker compose` with backend + Valkey side-by-side. `REDIS_URL=redis://valkey:6379` comes from [docker-compose.prod.yml](../docker-compose.prod.yml). CI/CD from `main` auto-deploys. No VPC connector, no Cloud Run autoscale concerns — everything runs in one process space on one VM. This is Prod-A from the hosting decision in section 1. Local dev: `npm run dev` (= `docker compose up --build --watch`) with auto-restart of backend on `backend/src` / `shared` edits.
- **API versioning is in place.** All routes under `/v1/`. Any breaking change (notably item 3 refresh tokens) should register new routes under `/v2/` and leave `/v1/` running in parallel.
- **No BYOK cleanup DONE.** Backend is the sole AI dispatch path. FE `src/services/ai/service.js`, `imageGen.js`, `meshyClient.js` all go through BE. Per-user API keys work end-to-end: KeysModal posts to `PUT /v1/auth/settings`, BE encrypts and stores on `User.apiKeys`, `resolveApiKey(encryptedBundle, keyName)` decrypts and falls back to env when the user hasn't set a key. New AI services must accept `userApiKeys` in options and pass it to `requireServerApiKey(keyName, userApiKeys, providerLabel)`. The pattern is threaded through `sceneGenerator`, `campaignGenerator`, `storyPromptGenerator`, plus 3 new services wired in the no-BYOK pass: `combatCommentary.js`, `objectiveVerifier.js`, `recapGenerator.js`. See [backend/src/services/aiJsonCall.js](../backend/src/services/aiJsonCall.js) for the shared helper.
- **Auto-memory exists.** Check `project_post_merge_progress` and `project_no_byok` memories for the cumulative handoff. Read `user_profile` + `feedback_*` memories for working style (pragmatic, batched playtest cadence, right-sized commits).

## Deployment context (updated 2026-04-14)

- **Host:** Single Compute Engine VM on GCP. Was Cloud Run when this plan was written — swapped to a VM as part of the Redis decision (see section 1, "Hosting decision" / Prod-A).
- **Pipeline:** CI/CD from `main` auto-updates the VM. Every push to main triggers a deploy. No manual steps, no Cloud Run revisions.
- **Runtime:** `docker compose` with backend + Valkey as sibling services inside one compose network. Mongo lives external (Atlas). Media via GCS.
- **Why this matters for remaining items:**
  - **Horizontal scale is NOT currently a concern.** Everything runs in one process space on one VM. Pub/sub (item 1 Stage 2) only matters if you add a second backend instance.
  - **Cloud Run cold start and stateless-instance problems are gone.** Room state surviving restarts now only matters for `docker compose restart backend` or a VM reboot, not autoscale.
  - **Low-friction path back to managed services** — if/when you outgrow the single VM, migration to Memorystore + Cloud Run is mostly `REDIS_URL=` swap + VPC connector + DNS cutover. Every Redis consumer follows the optional-mode pattern, so flipping between hosts is low risk.

---

## 1. Redis room state

**Stage 2 deferred indefinitely (2026-04-14 night).** After Stage 1 plumbing landed and every other Redis consumer migrated, we re-scoped the roomManager migration and decided NOT to do it now. Rationale:

- **Main failure mode is already covered.** `saveAllActiveRooms()` on SIGTERM + `saveRoomToDB()` after every major mutation (convert, disconnect, rejoin, start-game, post-scene-gen) + `loadActiveSessionsFromDB()` on boot already handle clean restarts and most mid-game state. DB persistence is coarse-grained but functional.
- **Residual gap has no concrete driver.** What Redis write-through would add on top: pending-action / typing-state / character-update survival across hard crashes. Currently no incident report or playtest complaint tied to this.
- **Pub/sub bridge is dead code on single-VM Prod-A.** The plan's own Phase 4 section calls this out: "Can be deferred indefinitely for single-VM Prod-A". Horizontal scale is not on the roadmap.
- **Cost is real.** 2-3 focused sessions for the proper split (state store + socket registry + dual-write migration + async propagation through 20+ handler call sites).

**Revisit trigger.** Pick this back up only when one of these happens:
1. **Second backend instance is on the roadmap** — then pub/sub becomes load-bearing and the full split is mandatory.
2. **Bug report surfaces** — e.g. "I lost my pending action when the backend crashed" — then we have a concrete driver for the write-through path.
3. **Memorystore / Cloud Run migration** — if we move off the single VM, Stage 2 becomes a prerequisite for room-state consistency across instances.

Everything below this deferral notice stays as the handoff doc for whoever picks this up later.

---

**Hosting decision (2026-04-14, Stage 1 DONE).** Picked **Prod-A: self-hosted Valkey via docker-compose on a single Compute Engine VM**, rejecting Memorystore (~$44/mo with VPC connector, overkill for pre-prod) and Upstash (vendor lock, per-request pricing scales badly with WS traffic). Tradeoff: lose Cloud Run autoscale (we only ran 1 instance anyway), gain simpler stack and ~$13/mo fixed cost on e2-small. When horizontal scale eventually matters, migration to Memorystore is `REDIS_URL=` env var swap + DNS cutover.

**Stage 1 — plumbing (DONE 2026-04-14).** Infrastructure layer landed separately from the roomManager migration so consumers can adopt Redis independently:
- **[docker-compose.yml](docker-compose.yml)** — `valkey:7-alpine` service, RDB snapshot 60s/1000 changes, volume `valkey-data`, port 6379. Backend gets `REDIS_URL=redis://valkey:6379` + `depends_on`.
- **[docker-compose.prod.yml](docker-compose.prod.yml)** — Valkey bound to `127.0.0.1:6379` (not exposed publicly), backend talks to it via docker network.
- **[backend/src/services/redisClient.js](../backend/src/services/redisClient.js)** — singleton ioredis client, lazy connect, exponential backoff (capped 10s), `READONLY` failover reconnect, graceful `closeRedis()` on SIGTERM. Exports `getRedisClient`, `isRedisEnabled`, `pingRedis`, `closeRedis`, `getRedisStatus`.
- **[backend/src/config.js](../backend/src/config.js)** — `redisUrl` config (empty default = optional mode).
- **[backend/src/server.js](../backend/src/server.js)** — boot triggers connect attempt, `/health` reports `redis: 'ok' | 'down' | 'disabled'`, shutdown hook calls `closeRedis()`.
- **Optional mode** — when `REDIS_URL` is empty, backend logs `[redis] disabled` and every consumer must have an in-memory fallback. This lets devs run without Docker and keeps the 503-test suite hitting zero Redis.

**Stage 2 — roomManager migration (STILL TODO — the heavy item).** Plumbing is live but the actual roomManager migration hasn't landed. This is the hardest remaining item.

**Why it's heavy.** [backend/src/services/roomManager.js](../backend/src/services/roomManager.js) is 675 lines and the in-memory `Map<roomCode, room>` is doing **two jobs simultaneously**:
1. **State store** — roomCode, hostId, phase, settings, players metadata, gameState. This IS serializable and belongs in Redis.
2. **Socket registry** — `player.ws` references to live `WebSocket` instances. These are **per-instance runtime objects that CANNOT be serialized to Redis** under any circumstance.

The file intermixes these freely: `player.ws = ws`, `player.ws?.readyState === 1`, `player.ws.send(payload)`. Functions touching sockets directly: `sanitizeRoom` (reads `ws.readyState` for `connected` field), `disconnectPlayer` (nulls `ws`, checks readyState), `broadcast` (iterates and sends), `sendTo` (sends to one), `closeAllRoomSockets` (closes every ws), `cleanupInactiveRooms` (checks readyState), `loadActiveSessionsFromDB` (sets `ws: null` on rehydrate).

**Solution shape — split into two layers:**

- **Layer A — State store (Redis-backed).** Functions that only touch persistent state: `createRoom`, `createRoomWithGameState`, `joinRoom`, `leaveRoom`, `listUserRooms`, `updateCharacter`, `updateSettings`, `setPhase`, `setGameState`, `submitAction`, `withdrawAction`, `approveActions`, `executeSoloAction`, `getRoom`, `listJoinableRooms`, `touchRoom`, `saveRoomToDB`, `deleteRoomFromDB`, `loadActiveSessionsFromDB`, `findSessionInDB`, `restoreRoom`, `restorePendingActions`. All become async. Storage: Redis hash `room:<code>` with JSON-encoded `{phase, hostId, settings, gameState, players}`.
- **Layer B — Socket registry (per-instance, process-local).** A `Map<odId, WebSocket>` that never leaves the process. Functions: `registerSocket(odId, ws)`, `unregisterSocket(odId)`, `getLocalSocket(odId)`, `iterateLocalSockets()`. Used only by the WS handlers that own the socket.
- **Layer C — Pub/sub bridge.** When instance A wants to broadcast to room R: publish to Redis channel `room:<R>:events` with `{targetOdId?, message}`. Every instance subscribes to `room:<R>:events` when it has at least one socket for room R. On receive, each subscriber iterates its local registry and forwards the message to matching sockets. Unsubscribe when its last local socket for R disconnects.

**Data model.**
```
room:<code>               → Redis hash, JSON-encoded room state minus ws refs
room:<code>:lastActivity  → Redis string, UNIX ms, for cleanup
room:<code>:events        → Redis pub/sub channel for broadcasts
TTL                       → ROOM_INACTIVE_TTL_MS (30min) refreshed on every write
```

**Migration strategy — dual-write first, cut reads over, then delete the Map.**

1. **Phase 1 — dual-write.** Every write to `rooms.set(...)` / mutation also writes to Redis. Reads still go to `rooms.get(...)`. Adds a `if (isRedisEnabled()) { await redis.hset(...) }` sidecar to every existing function. Risk: low, because the Map is still the source of truth. Test: existing tests should pass unchanged.
2. **Phase 2 — cut reads over.** Flip the read path from `rooms.get(...)` to `await redisGet(...)`. Now all 20+ functions become async. Every caller of roomManager needs `await`. Frontend-facing WS handlers are the biggest call-site cluster. Risk: medium — async propagation is invasive and can introduce ordering bugs.
3. **Phase 3 — delete the Map.** Once reads flow from Redis reliably (verified via playtest), remove `const rooms = new Map()` entirely. Layer B's socket registry replaces it for the local socket-lookup use case.
4. **Phase 4 — pub/sub.** Add broadcast bridge. Only meaningful if/when you run >1 backend instance. Can be deferred indefinitely for single-VM Prod-A, but the code should be in place so the instance-count change is zero-risk later.

**Testing strategy.** The existing 64 WS handler tests (item 11) mock `roomManager` at the module level — they should keep working throughout the migration if the function signatures stay the same (plus async). After Phase 2, some handler tests may need `await`-ing previously-sync mocks. Integration: ideally a playtest in a staging-like setup with 2 players in a room, one instance.

**Value for current deployment (Prod-A single VM).** Restart survival: Valkey RDB snapshots every 60s mean `docker compose restart backend` preserves room state (today it does NOT — the Map is gone, and the DB fallback via `saveAllActiveRooms()`/`loadActiveSessionsFromDB()` only covers clean SIGTERM shutdowns). Pub/sub fan-out: zero value today, full value when horizontally scaling.

**Estimated scope.** 2-3 focused sessions. Phase 1+2 is ~1 session if careful with async propagation. Phase 3+4 is another session. Playtest + bugfix is a third.

**Dependency.** Plumbing (Stage 1) was the only prerequisite. Stage 2 is now self-contained — it does not block anything else on this plan.

---

## 2. BullMQ for AI generation — ✅ DONE 2026-04-14

**Both stages landed in one day.** Stage 1: backend queue infra + `/generate-campaign` migration. Stage 2: `/generate-scene-stream` migration with streaming UX preserved via Redis pub/sub bridge.

**Key files to know about:**
- [backend/src/services/queues/aiQueue.js](../backend/src/services/queues/aiQueue.js) — 5 per-provider queues (`ai-openai`, `ai-anthropic`, `ai-gemini`, `ai-stability`, `ai-meshy`). Note the `-` separator: BullMQ forbids `:` in queue names. `enqueueJob(name, data, { provider, userId, jobId? })` supports pre-generated jobIds.
- [backend/src/workers/aiWorker.js](../backend/src/workers/aiWorker.js) — handler registry with `generate-campaign` and `generate-scene`. Two launch modes: in-process (`startWorkers()` from `server.js`) and standalone (`npm run worker`, `WORKER_MODE=1`). Exports `sceneJobChannel(jobId)` helper — shared with the route handler so both sides agree on the pub/sub key.
- [backend/src/plugins/bullBoard.js](../backend/src/plugins/bullBoard.js) — bull-board UI at `/v1/admin/queues`, admin-claim gated.
- [backend/src/routes/ai.js](../backend/src/routes/ai.js) — `/generate-campaign` returns `202 { jobId }` (poll path) or SSE (fallback when Redis off). `/campaigns/:id/generate-scene-stream` pre-generates jobId, subscribes to pub/sub, enqueues with that ID, bridges events to SSE. `GET /ai/jobs/:id` polling endpoint.
- [src/services/aiJobPoller.js](../src/services/aiJobPoller.js) — FE adaptive poller (500ms → 2s).
- [docker-compose.yml](../docker-compose.yml) — `backend-worker` service under `profiles: ["workers"]`. Dormant by default on Prod-A (main container runs workers in-process); activate with `docker compose --profile workers up` when you want worker isolation.

**Pattern to copy for new queue consumers:** pre-generate `jobId` with `crypto.randomUUID()`, `subscriber.subscribe(channel)` BEFORE `enqueueJob(..., { jobId })`, forward messages to SSE, close on terminal event. Handler inside the worker publishes via `redis.publish(channel, JSON.stringify(event))` fire-and-forget.

**Tests:** [backend/src/services/queues/aiQueue.test.js](../backend/src/services/queues/aiQueue.test.js) (9 tests) + [backend/src/workers/aiWorker.test.js](../backend/src/workers/aiWorker.test.js) (5 tests). Uses `vi.hoisted` for BullMQ Queue factory mocks.

---

## 3. Refresh tokens + revocation — ✅ DONE 2026-04-14

**Delivered.** Cookie-based refresh token flow landed under `/v2/auth/*`, backed by Redis, with double-submit CSRF. FE apiClient rewritten to drop localStorage token persistence and auto-retry on 401. `/v1/auth/*` kept alive for rollback; no route removed.

**Key files:**
- [backend/src/services/refreshTokenService.js](../backend/src/services/refreshTokenService.js) — `issueRefreshToken` / `verifyRefreshToken` / `revokeRefreshToken` / `revokeAllUserRefreshTokens`. Cookie format `<userId>.<tokenId>`, row at `user:<userId>:refresh:<tokenId>` with 30d TTL. SCAN+DEL for bulk revoke.
- [backend/src/plugins/csrf.js](../backend/src/plugins/csrf.js) — double-submit cookie plugin. Constant-time header/cookie compare. Opt-in via `config: { csrf: true }`. Exports `generateCsrfToken()` (32-byte base64url).
- [backend/src/routes/authV2.js](../backend/src/routes/authV2.js) — `/register`, `/login`, `/refresh` (csrf), `/logout` (csrf), `/me` (bearer). Registered under `/v2/auth` prefix in server.js with 10 req/min rate limit. Returns 503 when Redis disabled. 15min access-token TTL via per-call `fastify.jwt.sign({}, { expiresIn: '15m' })`.
- [backend/src/server.js](../backend/src/server.js) — registers `@fastify/cookie` + `csrfPlugin`. Routes /v2 scope added. 404 handler now short-circuits on both /v1 and /v2 prefixes.
- [backend/src/plugins/cors.js](../backend/src/plugins/cors.js) — `allowedHeaders` extended with `X-CSRF-Token` and `Idempotency-Key`. `credentials: true` was already set.
- [src/services/apiClient.js](../src/services/apiClient.js) — full rewrite of auth state:
  - Access token now **in-memory only**, not localStorage (page reload → rely on refresh cookie).
  - `credentials: 'include'` on every fetch.
  - `X-CSRF-Token` auto-injected on mutating methods from the `csrf-token` cookie via `document.cookie`.
  - `request()` does one-shot 401 retry via `refreshAccessToken()` (deduped via `_refreshInFlight` promise so React Strict Mode double-effect is safe). Defensive guard skips retry when path contains `/v2/auth/refresh`.
  - `bootstrapAuth()` exposed for mount-time refresh cookie exchange; called by `SettingsContext`.
  - `login` / `register` / `logout` rewritten to hit `/v2/auth/*` via raw fetch (not `request()`), return `{accessToken, csrfToken, user, token: accessToken}` — the `token` alias keeps old callers happy.
  - `onAuthChange(listener)` subscription for external state sync.
  - `/v2/*` paths pass through `withVersion()` verbatim (only `/v1` is prefixed automatically).
- [src/contexts/SettingsContext.jsx](../src/contexts/SettingsContext.jsx) — bootstrap effect now awaits `apiClient.bootstrapAuth()` on mount, sets `backendUser` from the refresh response. Removed the now-redundant `loadBackendUser` mount effect. `fetchBackendKeys`+`gameData.loadAll` effect now depends on `backendUser` (fires when bootstrap populates it). `shouldCheckBackendSession` simplified to just check the backend-url config.

**Tests (34 new, 183 total backend / 360 FE unit):**
- [backend/src/services/refreshTokenService.test.js](../backend/src/services/refreshTokenService.test.js) — 8 tests: issue shape, verify round-trip, cookie parse guards, expired row auto-evict, revoke, revokeAll SCAN+DEL, Redis-disabled null return, per-user keyspace isolation.
- [backend/src/plugins/csrf.test.js](../backend/src/plugins/csrf.test.js) — 8 tests: token shape/length, match/mismatch, missing header/cookie, safe-method bypass, non-opt-in bypass, length-mismatch constant-time edge.
- [backend/src/routes/authV2.test.js](../backend/src/routes/authV2.test.js) — 10 tests: register+login happy paths, duplicate email 409, wrong password 401, refresh happy path, refresh without CSRF 403, refresh without cookie 401, logout revokes + clears cookies, 503 when Redis disabled, /me with bearer.
- [src/services/apiClient.test.js](../src/services/apiClient.test.js) — 20 tests total (8 existing idempotency + 12 new for v2 auth): `credentials: include`, CSRF header injection on mutating + skip on safe, 401 retry flow with fresh bearer, refresh-itself failure path, no-infinite-loop on `/v2/auth/refresh`, `/v2/*` path passthrough vs `/v1` prefix, login stores access token, logout clears state + posts CSRF, `onAuthChange` observer.

**Deliberately deferred (not scope for this session):**
- **Admin revoke endpoint** (`/v2/admin/sessions/:userId/revoke`) — needs `admin` flag on User model. Skipped because no incident-response use case today. `revokeAllUserRefreshTokens()` is in place as the service primitive; wire the route later when needed.
- **Refresh token rotation on use** — current impl keeps the same refresh token row alive until TTL. Rotating on every refresh adds stolen-token detection (old token used after refresh → alert) but complicates multi-tab scenarios (two tabs racing for refresh invalidate each other). Defer until there's a concrete threat model.
- **SSE / WebSocket token expiry mid-connection** — snapshot-at-connect model unchanged. If a 15min access token expires mid-scene-stream, the stream continues (connection-level auth), but the next reconnect fails until the next apiClient.request() 401-refreshes. Acceptable for pre-prod; add reconnect logic if this becomes a pain.
- **`/v1/auth/*` sunset** — still alive as the fallback path. Delete when there are no more users holding long-lived /v1 JWTs (natural TTL expiry: 7d after the last /v1 login). Combine with item 12 JWT_SECRET rotation for a clean cut.
- **Playtest** — user will batch-playtest per `feedback_playtest_cadence` memory. Flows to exercise: first login (no cookie), page reload (valid cookie), page reload (expired cookie), logout, two-tab refresh race, long-session 401→refresh→retry.

**Known constraints:**
- Refresh token cookie path is `/v2/auth` — browser won't send it to `/v1/*` routes, which is correct (v1 uses bearer from the same /v2 access token, and /v1 auth endpoints don't need the refresh cookie).
- CSRF cookie path is `/` so FE can read it via `document.cookie` from any route. Non-httpOnly by design.
- `@fastify/cookie@^11` installed as the only new dep. Signed-cookie key not set; we don't rely on cookie signatures for security (refresh cookie value is already an opaque random token row in Redis).

### Original plan follows for historical reference:

**Status update 2026-04-14.** Redis plumbing is live, `/v1/` versioning is live (item 5 done). The breaking-change concern from the original plan is now cleanly solvable — new refresh-token endpoints land under `/v2/auth/*`, the old `/v1/auth/login` stays functional with long-lived JWT for old clients, and migration becomes a soft rollout rather than a flag day.

**Problem.** Current auth uses long-lived JWT bearer tokens. No revocation — if a token leaks we cannot kill it without rotating `JWT_SECRET` (which logs out everyone simultaneously, see item 12 for the pending one-time rotation planned at deploy time).

**Solution shape.** Short-lived access token + long-lived refresh token pattern.

- **Access token:** JWT, 15min TTL, bearer-auth on every API call (unchanged from today's pattern except for the shorter TTL).
- **Refresh token:** opaque random string (not a JWT — no claims, no verification overhead), 30-day TTL, stored in Redis with key `user:<id>:refresh:<tokenId>` → value `{expiresAt, deviceInfo, createdAt}`. Single GET on refresh endpoint, O(1) revocation.
- **Delivery:** refresh token in **httpOnly SameSite=Strict cookie**, NOT localStorage. This is the critical UX + security change — it prevents JS-level token exfil (XSS token theft) but forces CSRF protection for every state-changing request.
- **Revocation:** `DEL user:<id>:refresh:<tokenId>` kills one session. `SCAN user:<id>:refresh:*` + `DEL` kills all sessions for a user ("log out everywhere"). Admin endpoint `/v2/admin/sessions/:userId/revoke` for incident response.

**Why this is a breaking change** — cookie-based auth has different semantics from bearer-token auth:

1. **CSRF posture flips.** Bearer tokens are immune to CSRF because attackers can't read them from a cross-origin form submission. Cookies are automatically attached to every request to their origin — which is exactly what CSRF exploits. Cookie-based auth MUST have a CSRF token on every POST/PUT/PATCH/DELETE. Standard pattern: double-submit cookie (server sets `csrf-token` cookie + client reads it + echoes it in an `X-CSRF-Token` header; server verifies both match). Touches every mutating route.
2. **CORS `credentials: include` required.** Frontend `fetch` calls need `credentials: 'include'` to send the cookie. Backend CORS config needs `Access-Control-Allow-Credentials: true` and a specific `Access-Control-Allow-Origin` (wildcard is rejected by browsers when credentials are on).
3. **Frontend retry interceptor.** Every authenticated request needs: if response is 401 and refresh hasn't been tried, call `POST /v2/auth/refresh` (cookie auto-attached, returns new access token), stash it, retry original request with new bearer. On refresh failure, hard-logout. This lives in `apiClient.request()`.

**Scope.**

- **Backend:**
  - New routes under `/v2/auth/*`: `POST /login` (returns access token + sets refresh cookie), `POST /refresh` (reads refresh cookie, returns new access token), `POST /logout` (deletes refresh cookie + Redis row)
  - Redis service helper `backend/src/services/refreshTokenService.js` — `issue`, `verify`, `revoke`, `revokeAllForUser`. Follows the optional-mode pattern: when Redis is disabled, refresh-token endpoints return 503 (this feature REQUIRES Redis).
  - CSRF plugin — [backend/src/plugins/csrf.js](../backend/src/plugins/csrf.js) that adds `preHandler` hook checking `X-CSRF-Token` header against `csrf-token` cookie on all `config.csrf: true` routes. Double-submit cookie pattern.
  - Update existing `fastify.authenticate` to also validate CSRF for cookie-authed requests
  - Admin endpoint `/v2/admin/sessions/:userId/revoke` (requires admin claim in JWT — introduce admin flag on User model)
  - Keep `/v1/auth/*` alive with current long-lived JWT behavior until every client has migrated
- **Frontend:**
  - [src/services/apiClient.js](../src/services/apiClient.js) — add 401-retry interceptor, CSRF header injection, `credentials: 'include'` on all fetches
  - Auth store — handle refresh token lifecycle, fall back to login when refresh fails
  - Every mutation call site — needs the CSRF header (can be automatic via apiClient, no per-site change)
  - New `POST /v2/auth/logout` call on logout button (replaces current `localStorage.removeItem`)

**Migration plan.**

1. **Ship /v2/ routes + CSRF plugin.** `/v1/auth/*` keeps working for old clients.
2. **Ship FE interceptor + cookie support.** On login, FE now talks to `/v2/auth/login` and stores access token in memory (not localStorage). Refresh cookie handles persistence.
3. **Sunset `/v1/auth/*` after 30 days.** Old tokens naturally expire (per current JWT TTL). Force-logout any remaining clients on that date.
4. **Bonus: revoke all active sessions** as part of the item 12 `JWT_SECRET` rotation. This flushes leaked tokens that may still be in the wild from pre-plan times.

**Blockers.**
- **None infra-wise.** Redis is live.
- **Heavy FE work.** The interceptor + auth store rework is the biggest single chunk. Plan a full read of current `authStore` + every `apiClient.request` call path before writing code.
- **CSRF test coverage.** Need tests that verify a request without the header gets rejected, and a request with a wrong header gets rejected. Easy with `fastify.inject()`.
- **Playtest required.** Touches login flow, logout flow, token expiry flow. At least one multi-device test (log in on two devices, revoke one, confirm the other still works).

**Estimated scope.** 2-3 focused sessions. Session 1: backend /v2/auth routes + refresh token service + CSRF plugin + tests. Session 2: FE apiClient interceptor + auth store rework + FE tests. Session 3: migration + playtest + any bugfixes.

---

## 4. Basic CSP — AUDIT DONE 2026-04-14 (enable deferred)

**Problem.** `backend/src/server.js:52` currently registers helmet with `contentSecurityPolicy: false` — disabled because we didn't know what external origins were needed. Without CSP, XSS in scene text or NPC names could execute arbitrary JS.

**Status (2026-04-14).** Audit done. Enable deferred until we can verify in a staging environment — there is too much risk of breaking font loading, Three.js shader compilation, or WebRTC connection setup to ship without a playtest pass.

**Audit results.**

| Category | Origins found | Source |
|---|---|---|
| Scripts | `'self'` only — single `<script type="module" src="/src/main.jsx">` in [index.html:19](../index.html#L19). No analytics, no Sentry, no external CDN scripts. | grep `<script` in index.html |
| Styles | `'self'` + Google Fonts CSS (`https://fonts.googleapis.com`). Tailwind emits classes at build time, no runtime injection. `'unsafe-inline'` needed only if any runtime `<style>` tags exist (Three.js etc. — need to verify). | [index.html:8-14](../index.html#L8-L14) |
| Fonts | `https://fonts.gstatic.com` (fetched by Google Fonts CSS via @font-face) | implied by fonts.googleapis.com |
| Images | `'self'`, `data:`, `blob:`, `/media/*` (backend), `https://oaidalleapiprodscus.blob.core.windows.net` (DALL-E), `https://storage.googleapis.com/*` (GCS user uploads), `https://*.meshy.ai` (3D preview thumbnails), Stability AI output URLs | FE proxy-mode generates images directly; backend-mode serves via `/media/*` |
| Connect (FE proxy mode) | `https://api.openai.com`, `https://api.anthropic.com`, `https://api.stability.ai`, `https://api.elevenlabs.io`, `https://api.meshy.ai`, `https://generativelanguage.googleapis.com` (Gemini) | [src/services/ai/providers.js](../src/services/ai/providers.js), [src/services/imageGen.js](../src/services/imageGen.js), [src/services/meshyClient.js](../src/services/meshyClient.js) |
| Connect (BE mode) | backend origin (same-origin in prod, `http://localhost:3001` in dev), WebSocket `wss://<backend>` or `ws://localhost:3001` | default in prod |
| Media (audio) | `/music/*` (local), ElevenLabs audio URLs via backend proxy, GCS audio objects | [backend/src/routes/proxy/elevenlabs.js](../backend/src/routes/proxy/elevenlabs.js) |
| Frame | None (no iframes, no YouTube embeds) | confirmed via grep |

**Notes on backend CSP.**
- The backend is API-only (returns JSON, WebSocket). Setting `contentSecurityPolicy` via helmet on backend responses has minimal defensive value — CSP is a browser-side directive applied to documents, not JSON fetches. The useful location is the frontend (index.html meta tag or whatever serves the static dist in prod).
- Re-enabling `contentSecurityPolicy: true` with helmet defaults on backend is still cheap defense-in-depth for the edge case where someone browses to a backend URL directly.

**Ready-to-ship policy** (dev variant commented for localhost):
```
default-src 'self';
img-src 'self' data: blob: https://*.googleusercontent.com https://oaidalleapiprodscus.blob.core.windows.net https://storage.googleapis.com https://*.meshy.ai;
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' wss: https://api.openai.com https://api.anthropic.com https://api.stability.ai https://api.elevenlabs.io https://api.meshy.ai https://generativelanguage.googleapis.com;
media-src 'self' https://*.elevenlabs.io blob: https://storage.googleapis.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

Caveats to verify in staging before flipping from report-only to enforce:
1. **`script-src 'self'` without `unsafe-eval`** — Three.js/R3F does not use eval for GLSL but some build tools do. If Scene3D breaks on load, add `'unsafe-eval'` reluctantly.
2. **`style-src 'unsafe-inline'`** — Tailwind is build-time, but React sometimes injects inline styles (style attributes are NOT covered by `'unsafe-inline'` in modern CSP; inline `<style>` tags are). If material-symbols or glassmorphism effects break, investigate.
3. **`connect-src wss:`** — permissive on WebSocket origin because prod hostname varies. Can tighten to `wss://nikczemny-krzemuch.run.app` or whatever the actual prod URL is.
4. **Frontend proxy mode** — every user-supplied API key direct fetch goes from `connect-src`. If a user configures a local LLM (Ollama/LM Studio at `http://localhost:11434`), they need `connect-src 'self' http://localhost:*` added for their session. Either document this or drop local LLM support (deprecated anyway per [backend/src/services/localAI.js deletion](../backend/src/services/localAI.js)).

**Deployment plan when ready:**
1. Ship CSP as `Content-Security-Policy-Report-Only` header first (via helmet on backend — even though backend is API-only, we can set the report-only header on the document that serves `index.html`, wherever that is).
2. Wire a report endpoint (`/csp-report`) that just logs violations to pino.
3. Watch logs for a week, tighten based on real violations.
4. Flip to enforcing `Content-Security-Policy`.

**Blockers.**
- Need staging env to exercise Three.js scene rendering, ElevenLabs TTS playback, WebRTC voice/video, and image generation with the report-only policy.
- Need to confirm where frontend HTML is served in prod to decide between `<meta http-equiv>` in `index.html` vs HTTP header from static server.

---

## 5. API versioning (`/v1/`) — DONE 2026-04-14

**Problem.** No versioning scheme on API routes. Any breaking change requires frontend + backend deploy atomicity.

**Solution shape.** Prefix all routes with `/v1/` via Fastify prefix plugin. Introduce `/v2/` only when a breaking change is needed; old clients keep working against `/v1/`.

**Implementation notes.**
- Backend: every scope in [backend/src/server.js](../backend/src/server.js) registers under `/v1/*` prefix. `/health` stays at root for orchestrator probes.
- Frontend: [src/services/apiClient.js](../src/services/apiClient.js) exports `API_VERSION = '/v1'` and prepends it inside `request()`. `resolveMediaUrl` also hoists legacy `/media/` and `/proxy/` paths (including full-URL DB records) onto `/v1` for backward compat with pre-versioning data.
- Hard-coded fetch call sites updated: [websocket.js](../src/services/websocket.js) (`/v1/multiplayer`), [ai/service.js](../src/services/ai/service.js) (`/v1/ai/campaigns/.../generate-scene-stream`), [CampaignViewerPage.jsx](../src/components/viewer/CampaignViewerPage.jsx) (`/v1/campaigns/share/...`), [elevenlabs.js](../src/services/elevenlabs.js) (`/v1/campaigns/share/.../tts`).
- `notFoundHandler` simplified: only `/v1/*` and `/health` return JSON 404; everything else falls through to `index.html` for React Router.
- Not bundled with refresh-token breaking change (item 3) because item 3 is Redis-blocked — doing versioning now means item 3 can land as a non-breaking addition.

**Remaining work for /v2/ bump.** When we need to break the API (refresh-tokens, etc.), register new scopes under `/v2/*` and keep `/v1/*` running in parallel.

---

## 6. Proxy route middleware extraction

**Problem.** `backend/src/routes/proxy/*.js` (openai, anthropic, elevenlabs, meshy, stability, gemini) duplicate: request validation, API key resolution, rate-limit headers, error shape translation, cache-through-DB for image/audio blobs. Six routes with six copies of the same concerns.

**Solution shape.** **Deferred pending dedicated design session** — the plan explicitly flagged this: *"variance too high for shallow refactor (text-gen vs image-gen + DB cache vs TTS vs 3D model all have different shapes)"*.

The right design probably looks like:
- A thin `proxyRouteFactory({ provider, requestSchema, cacheStrategy, transformRequest, transformResponse })` helper.
- Per-provider config objects that describe the differences.
- Different cache strategies: pass-through (text gen), DB-blob (images), stream (TTS), URL-only (3D).

**Blockers.**
- Needs its own session. Too much domain variance to hack in during another refactor.

---

## 7. Idempotency keys — ✅ DONE 2026-04-14

**Delivered.** Fastify plugin [backend/src/plugins/idempotency.js](../backend/src/plugins/idempotency.js) with opt-in route config. When a route has `config: { idempotency: true }` and the request carries a non-empty `Idempotency-Key` header from an authenticated user, the plugin caches the response in Redis keyed `idem:<userId>:<headerValue>`. Retries replay the cached body+status instead of re-executing the handler.

**Lifecycle.**

1. **preHandler** — atomic `SET NX` with `__pending__` marker + 60s TTL to claim the key. If claim succeeds, stash the redis key on `request.idempotencyRedisKey` and let the handler run.
2. **preHandler (claim fails)** — GET the existing value. If it's still `__pending__`, return **409 Conflict** with the original idempotency key echoed back. If it's a completed response, replay it (restore statusCode + content-type, add `idempotent-replay: true` header).
3. **onSend** — if the request claimed a key and the handler returned 2xx, overwrite the pending marker with the serialized response `{statusCode, contentType, body}` and bump TTL to 24h. If the handler returned non-2xx, DEL the pending marker so retries can proceed immediately.

**Opt-in routes (backend).**
- [POST /v1/campaigns](../backend/src/routes/campaigns/crud.js) — creates campaign row
- [POST /v1/ai/campaigns/:id/scenes](../backend/src/routes/ai.js) — persists scene + triggers async embedding
- [POST /v1/ai/campaigns/:id/scenes/bulk](../backend/src/routes/ai.js) — persists multiple scenes in one request (added during FE integration — same bounded-concurrency DB writes had the same duplicate-save risk)

**What FE semantics this actually buys us.**
- **Double-click / React Strict Mode double-render within the same session**: each call generates its own UUID, but both requests race on the backend — first wins the SET NX, second sees `__pending__` and gets 409 Conflict. Frontend surfaces the 409 as a user-facing error (current behavior — `apiClient.request` throws on non-ok status). This prevents duplicate row creation, which is the primary goal.
- **Network flake with automatic retry**: NOT handled by `{ idempotent: true }` because each attempt generates a fresh UUID — the backend treats them as independent requests. To get retry-with-same-key, callers must use `{ idempotencyKey: stableKey }` and generate the UUID once per logical operation. Deferred until a concrete use case emerges (the storage.js auto-save flow already has its own dedup via `sceneIndex`/`_sceneIndexCache`).
- **Network flake + user manually clicks "retry"**: user hits the button, FE fires a new call with a new UUID → backend runs fresh. This is an explicit new attempt, duplicates are on the user. Backend dedup does not apply.

**Deliberately out of scope for v1 (known limitations).**
- **SSE routes** — `/v1/ai/generate-campaign` and `/v1/ai/campaigns/:id/generate-scene-stream` stream `text/event-stream`. Idempotency + streaming is a different design problem (cache vs re-stream vs replay accumulated tokens). Deferred to when SSE becomes a user-visible retry problem.
- **Binary responses** — the plugin checks payload type in onSend; non-JSON bodies cause it to DEL the claim and skip caching (so the handler still runs and the client can retry).
- **Unauthenticated requests** — plugin no-ops when `request.user` is missing. Per-IP idempotency would risk cross-user cache poisoning on shared IPs.
- **Frontend integration — DONE 2026-04-14.** [src/services/apiClient.js](../src/services/apiClient.js) gained a `buildIdempotencyHeader` helper and both `post`, `put`, `patch` now accept an options object with two mutually exclusive forms: `{ idempotent: true }` auto-generates a fresh UUID per call via `crypto.randomUUID()` (fallback: `idem-<ts>-<rand>` for exotic environments without WebCrypto), and `{ idempotencyKey: '<stable>' }` lets the caller provide a stable key for retry-with-same-key flows. Explicit key wins when both are passed. All 5 mutation call sites opted in with `{ idempotent: true }`: 3× `POST /campaigns` ([storage.js:245](../src/services/storage.js#L245), [storage.js:369](../src/services/storage.js#L369), [useSceneGeneration.js:111](../src/hooks/sceneGeneration/useSceneGeneration.js#L111)), 1× `POST /ai/campaigns/:id/scenes` ([storage.js:299](../src/services/storage.js#L299)), 2× `POST /ai/campaigns/:id/scenes/bulk` ([storage.js:274](../src/services/storage.js#L274), [storage.js:378](../src/services/storage.js#L378)). 8 new tests in [src/services/apiClient.test.js](../src/services/apiClient.test.js) cover: no header by default, auto-UUID per call, unique UUIDs across successive calls, explicit key passthrough, explicit wins over auto, Authorization header survives, PUT/PATCH parity, backward compat without options.

**Race handling.**
- Retry-after-timeout (primary case): sequential, first request caches, second replays. Works perfectly.
- Truly concurrent (two parallel requests with the same key): first SET NX wins, second sees `__pending__` and gets 409. Client retries in ~100ms and hits the now-completed cache.
- Crashed first request: pending marker expires after 60s, next retry re-claims.

**Tests** (9, in [backend/src/plugins/idempotency.test.js](../backend/src/plugins/idempotency.test.js)): skip when `config.idempotency` absent, skip when header missing, skip when unauthenticated, claim-key flow (SET NX + pending + completed overwrite), cached replay with `idempotent-replay` header, 409 on pending, lock release on non-2xx, per-user key namespace (same uuid across users does not collide), graceful degradation when Redis throws.

**Redis disabled fallback.** Plugin is a transparent no-op when `isRedisEnabled()` is false — routes with the config still work, they just lose dedup. Same pattern as rate-limit store and embedding cache.

---

## 8. Per-user rate limiting — ✅ DONE 2026-04-14

**Delivered.** Custom `keyGenerator` in [backend/src/plugins/rateLimitKey.js](../backend/src/plugins/rateLimitKey.js) that returns `u:<userId>` when the JWT verifies and the payload has an `id` field, `ip:<address>` fallback otherwise. Wired into the global `@fastify/rate-limit` registration in [backend/src/server.js](../backend/src/server.js) alongside a Redis store (`redis: isRedisEnabled() ? getRedisClient() : undefined`) and a `rl:` namespace to avoid colliding with other Redis keys. 6 tests in [backend/src/plugins/rateLimitKey.test.js](../backend/src/plugins/rateLimitKey.test.js) cover: valid JWT → `u:<id>`, missing header → `ip:`, bad signature → `ip:`, expired token → `ip:`, payload missing `id` → `ip:`, namespace separation (user `id` equal to an IP string does not collide with that IP's bucket).

**Notable design decisions.**
- **Double-verify is acceptable.** The global rate-limit `onRequest` hook fires before route-level `onRequest: [authenticate]`, so `request.user` is not populated when the keyGenerator runs. It does its own `request.jwtVerify()`; authenticated routes then verify a second time in their own hook. HMAC cost is ~50-200μs/request — not the hot path, not worth plumbing order dependencies between plugins and routes.
- **Namespace prefix on the key.** Keys are `u:<id>` or `ip:<address>`, not raw ids. Prevents a user whose id happens to equal some other user's IP address from sharing a bucket. Also makes it trivial to scan/flush user-only or ip-only buckets in Redis.
- **Redis store is conditional.** When `isRedisEnabled()` is false, we pass `redis: undefined` and `@fastify/rate-limit` falls back to its built-in in-memory LRU — byte-for-byte identical behavior to pre-change state.

**Result.** Authenticated users are no longer rate-limited against each other when sharing an IP (corporate NAT, VPN, mobile carrier). Once Redis is live in prod, counters survive backend restarts and are shared across instances. Per-tier limits (free vs paid) would be a straight-line extension — the keyGenerator has `request.user` at its disposal and can inspect a tier field when billing ships.

---

## 9. Embedding LRU TTL

**Problem.** `aiContextTools.js` caches OpenAI text embeddings (`text-embedding-3-small` output) in an in-memory LRU inside the process. Cache is:
- Lost on every Cloud Run cold start.
- Not shared across instances.
- Has no TTL — stale embeddings could persist forever if the underlying content changes.

**Solution — both phases DONE 2026-04-14:**

- **9a Short term (DONE)** — 1h TTL added to the in-memory LRU in [backend/src/services/embeddingService.js](../backend/src/services/embeddingService.js). Entries became `{value, expiresAt}`; expired reads evict. Test hook `__resetEmbeddingCacheForTests` exported; 5 tests covered TTL, expiry, cross-key behavior.

- **9b Long term (DONE)** — migrated to **two-tier L1 + L2 cache**:
  - **L1** — in-memory LRU (kept from 9a), 100 entries, 1h TTL, sub-microsecond hot reads
  - **L2** — Redis-backed, key format `embed:<sha256 of text>`, `JSON.stringify(embedding)` value, EX TTL 3600s
  - **Read path**: L1 hit → return. L1 miss → L2 GET → on hit, promote to L1 → return. Full miss → OpenAI API → populate L1 + L2
  - **Write path**: `await cacheSet` writes L1 synchronously then L2 async (errors logged, not surfaced)
  - **Batch parallelism**: `embedBatch` uses `Promise.all(texts.map(cacheGet))` to parallelize L2 reads instead of serializing on network RTT
  - **Fallback behavior**: when `isRedisEnabled()` is false OR `getRedisClient()` returns null OR Redis throws, the service silently degrades to L1-only (i.e. exact 9a behavior). All 5 original 9a tests still pass unchanged under this mode.
  - **New tests** (6): L2 write with SHA256 key + EX TTL format, L2 hit without OpenAI call + L1 promotion, L1 hit short-circuits L2 lookup, Redis GET failure falls through to OpenAI, Redis SET failure doesn't break L1 population, batch path parallelizes and mixes L1/L2/miss.
  - **Tests file**: [backend/src/services/embeddingService.test.js](../backend/src/services/embeddingService.test.js) now at 11 tests, mocks `./redisClient.js` at module level so no real Redis traffic.

**No blockers remaining.** This was the first real consumer of the Redis plumbing from Stage 1 of item 1 — validated end-to-end that `isRedisEnabled`/`getRedisClient`/error-fallback pattern works for production code paths.

---

## Remaining work as of 2026-04-14 EOD

Everything small/medium is closed. The last heavy item (item 1 Stage 2) was **deferred indefinitely** after re-scoping — see section 1 deferral notice. Items 2 (BullMQ) and 3 (refresh tokens + CSRF) both shipped 2026-04-14.

**Nothing heavy remains in this plan.** What's left is all ops/design:

### Deferred items that aren't "heavy" but need attention later

- **Item 4 (CSP enable)** — audit done, ready-to-ship policy drafted. Needs **staging environment** to exercise Three.js / WebRTC / ElevenLabs / image-gen flows with a report-only header before enforcing. Blocker is ops, not code.
- **Item 6 (Proxy middleware extraction)** — plan itself flags *"variance too high for shallow refactor, needs dedicated design session"*. Text-gen / image-gen / TTS / 3D model routes all have different request/response shapes. Don't solo-attack. Open its own chat with *"here's the problem, design me a proxy route factory"* framing.
- **Item 12 (Pre-merge deployment checklist)** — NOT Claude-implementable. `JWT_SECRET` rotation needs prod env access; OpenAI model ID verification needs a prod API key. Flag in a human ops ticket.

### Estimated total scope for remaining heavy items

5-8 focused sessions. Not a sprint. Spread across as many days as make sense.

---

## 10. FE↔BE AI helper consolidation via `shared/` — ✅ DONE 2026-04-14

**Delivered:**
- [shared/domain/fallbackActions.js](../shared/domain/fallbackActions.js) — both `postProcessSuggestedActions` (FE entry, max 3) and `ensureSuggestedActions` (BE entry, 4-category variants) co-located; 11 tests in [shared/contracts/fallbackActions.test.js](../shared/contracts/fallbackActions.test.js).
- [shared/domain/aiResponseParser.js](../shared/domain/aiResponseParser.js) — `safeParseJSON`, `stripMarkdownFences`, `parseAIResponseLean`; 13 tests in [shared/contracts/aiResponseParser.test.js](../shared/contracts/aiResponseParser.test.js).
- [shared/domain/dialogueRepair.js](../shared/domain/dialogueRepair.js) — FE variant (hardDedupe, fuzzy name matching, player reattribution) won the reconcile — BE lost its simpler 282L copy. [shared/domain/dialogueSpeaker.js](../shared/domain/dialogueSpeaker.js) extracted for `hasNamedSpeaker`/`isGenericSpeakerName`. Existing 30+ FE tests still pass unchanged.
- `aiClient.js` intentionally NOT consolidated — FE and BE clients differ materially (browser fetch vs node+retries, auth header shapes). Left duplicated.

**Not landed (by design):** The 557L `src/services/aiResponse/parse.js` heavy Zod normalization path is still FE-only. It's used exclusively in FE proxy mode which is being removed (see `project_no_byok` memory) — when FE proxy mode dies, parse.js goes with it.

### Original plan follows for historical reference:

**Problem.** CLAUDE.md already flags: *"Frontend proxy mode duplicates prompt building from backend lean version"*. Session 6 B.3 audit confirmed four specific parallels where frontend and backend maintain independent copies of the same logic:

| Responsibility | Frontend | Backend |
|---|---|---|
| Dialogue repair (regex-heavy text splitter + speaker attribution) | [src/services/aiResponse/dialogueRepair.js](../src/services/aiResponse/dialogueRepair.js) 550L | [backend/src/services/multiplayerAI/dialogueRepair.js](../backend/src/services/multiplayerAI/dialogueRepair.js) 282L |
| Fallback suggested-actions generator | [src/services/ai/suggestedActions.js](../src/services/ai/suggestedActions.js) 264L | [backend/src/services/multiplayerAI/fallbackActions.js](../backend/src/services/multiplayerAI/fallbackActions.js) 159L |
| Lean AI response parser | [src/services/aiResponse/parse.js](../src/services/aiResponse/parse.js) 557L | [backend/src/services/sceneGenerator.js](../backend/src/services/sceneGenerator.js) `parseAIResponse` (~50L) |
| OpenAI/Anthropic dispatcher | [src/services/ai/service.js](../src/services/ai/service.js) 714L | `backend/src/services/multiplayerAI/aiClient.js` + sceneGenerator streaming variants |

Frontend-proxy mode and backend-scene-gen mode both run the full pipeline end-to-end — FE when the user has their own API key (legacy proxy mode), BE otherwise (primary mode, per CLAUDE.md AI Architecture). Both paths are live today, and any bugfix in one side has to be mirrored by hand in the other.

**Solution shape.** Extract pure helpers to `shared/domain/` the same way we did for `multiplayerState.js`, `diceRollInference.js`, `stateValidation.js`:

- `shared/domain/dialogueRepair.js` — Polish/English quote parser + speaker attribution. Pure, no runtime-specific deps. FE and BE both `import { repairDialogueSegments, ensurePlayerDialogue } from 'shared/domain/dialogueRepair.js'`.
- `shared/domain/fallbackActions.js` — FALLBACK_ACTION_VARIANTS + normalize/ensure helpers. Pure text.
- `shared/domain/aiResponseParser.js` — `parseAIResponse` (the lean variant with default-field filling). Pure JSON munging.
- `shared/domain/aiClient.js` — **probably NOT** — FE and BE clients differ materially (FE uses browser fetch, BE uses node fetch + retries; BE has streaming variants + buffered; FE has auth header shape differences). Leave duplicated, track separately.

**Scope.** Each helper needs:
1. Line-by-line diff FE vs BE to identify behavioral drift.
2. Reconcile into one authoritative version (FE copy is usually the larger one — it's had more bugfixes).
3. Move to `shared/domain/`.
4. Replace FE and BE imports with the shared path.
5. Delete duplicates.
6. Vitest on both sides — shared helpers should have their own test file in `shared/contracts/` or `shared/domain/` for parity.

**Estimate.** ~1 focused session per helper × 3 helpers = 3 sessions. Dialogue repair is the biggest (500+L each side), do it last.

**Blockers.**
- FE/BE behavioral drift may be non-trivial — each merge resolution is a small design decision.
- No infrastructure dependency (no Redis, no auth rework). Can land at any point post-merge.
- Low risk per merge: helpers are pure functions, easy to test in isolation.

**Ordering recommendation.** Can slot in anywhere after the merge — independent of items 1-9. Probably best right after the merge lands while frontend refactor context is still fresh.

---

## 11. WS message handling tests — ✅ DONE 2026-04-14

**Delivered:** 64 tests across 6 handler files under [backend/src/routes/multiplayer/handlers/](../backend/src/routes/multiplayer/handlers/):
- `lobby.test.js` — 15 tests (CREATE_ROOM, CONVERT_TO_MULTIPLAYER, JOIN_ROOM lobby+midgame, LEAVE_ROOM, REJOIN_ROOM via memory+DB, KICK_PLAYER host-only)
- `roomState.test.js` — 14 tests (UPDATE_CHARACTER with fetchOwnedCharacter, UPDATE_SETTINGS, SYNC_CHARACTER merge+preserve, UPDATE_SCENE_IMAGE, TYPING, PING)
- `gameplay.test.js` — 11 tests (START_GAME host-only+fail branch, SUBMIT/WITHDRAW, APPROVE_ACTIONS with restorePendingActions on failure, SOLO_ACTION)
- `quests.test.js` — 9 tests (ACCEPT, DECLINE, VERIFY_OBJECTIVE with AI mocked for fulfilled/not-fulfilled/already-done branches)
- `combat.test.js` — 8 tests (COMBAT_SYNC host-only, MANOEUVRE forward-to-host, COMBAT_ENDED with per-character wounds/xp + dead-player detection + journal)
- `webrtc.test.js` — 7 tests (OFFER/ANSWER/ICE/TRACK_STATE passthrough + guard branches)

All handlers mocked via `vi.mock('../../../services/roomManager.js')` + `vi.mock('../../../services/multiplayerSceneFlow.js')` — no real sockets, no DB. Dispatcher test skipped (7-line function, low ROI).

### Original plan follows for historical reference:

**Problem.** Carryover z merge_status.md Group A.3. Backend testy pokrywają dziś auth flow ([backend/src/routes/auth.test.js](../backend/src/routes/auth.test.js)), campaign save-state ([backend/src/routes/campaigns.saveState.test.js](../backend/src/routes/campaigns.saveState.test.js)), character mutations, apiKeyService i roomManager. Brakuje testów dla WS dispatcher + handlers pod [backend/src/routes/multiplayer/](../backend/src/routes/multiplayer/) — 21 typów wiadomości rozbitych na 6 handler-files po split B.2, zero automated coverage. Każda zmiana w handlerze wymaga dziś manual playtest.

**Solution shape.** Unit-level testy per handler, nie end-to-end WS. Strategia analogiczna do `characterMutations.test.js`:

- Zmock'ować `ctx` (`{ fastify, ws, uid, sendWs, log }`) + mutable `session` — każdy handler dostaje stuby zamiast prawdziwego socketu.
- Zmock'ować `roomManager` (`getRoom`, `addPlayer`, `removePlayer`, `setGameState`, `touchRoom`, `saveRoomToDB`) na poziomie modułu przez `vi.mock`.
- Per handler-file jeden `.test.js`:
  - `handlers/lobby.test.js` — CREATE_ROOM, JOIN_ROOM (ownership check), LEAVE_ROOM, REJOIN_ROOM, KICK_PLAYER, CONVERT_TO_MULTIPLAYER
  - `handlers/roomState.test.js` — UPDATE_CHARACTER, UPDATE_SETTINGS, SYNC_CHARACTER, UPDATE_SCENE_IMAGE, PING
  - `handlers/gameplay.test.js` — START_GAME, SUBMIT_ACTION, WITHDRAW_ACTION, APPROVE_ACTIONS, SOLO_ACTION (+ `runMultiplayerSceneFlow` zmock'owane)
  - `handlers/quests.test.js` — ACCEPT/DECLINE/VERIFY quest objective
  - `handlers/combat.test.js` — COMBAT_SYNC, COMBAT_MANOEUVRE, COMBAT_ENDED
  - `handlers/webrtc.test.js` — OFFER/ANSWER/ICE/TRACK_STATE passthrough
- Dispatcher test w `connection.test.js` — unknown message type → ERROR, znany type → delegate do handlera, session mutation (JOIN_ROOM ustawia `session.roomCode`).

**Blockers.**
- Zero — nic nie wymaga Redis / infra. Czysta praca refactorowo-testowa, można zrobić w 1-2 sesjach.
- Ryzyko drift: handlery wołają `runMultiplayerSceneFlow`, które chodzi po AI + DB. Trzeba zmock'ować na poziomie `services/multiplayerSceneFlow.js` żeby testy były <10ms.

**Ordering.** Niezależne od items 1-10. Może być zrobione w dowolnym momencie post-merge, dobrze pasuje obok item 10 (FE↔BE helper consolidation) bo obie pozycje to quality/test work bez infra deps.

---

## 12. Pre-merge deployment checklist (carryover)

Two items from `merge_status.md` pre-merge checklist that survived to post-merge as deployment concerns. Not Claude-implementable — flag them here so they're not lost when `merge_status.md` is deleted.

- **`JWT_SECRET` rotation w production env.** Tracked JWT-token files (`barnaba.md`, `quirky-chasing-iverson.md`) zostały usunięte w `fc322a1`, ale tokeny wydane pod starym secret są ważne do ~kwiecień 2026. Rotacja secret kasuje je wszystkie. **Akcja:** zaktualizować `JWT_SECRET` env var na Cloud Run przy najbliższym deploy, wszyscy active users zostaną wylogowani (jednorazowy koszt, akceptowalny).

- **OpenAI model IDs verify.** Defaults w [backend/src/config.js](../backend/src/config.js) wskazują na `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`. Przed release trzeba potwierdzić że te ID wciąż resolvują u OpenAI (API się zmienia, model naming rzadko ale zdarza). **Akcja:** curl `https://api.openai.com/v1/models` z prod key, grep powyższe ID, w razie 404 ustawić `AI_MODEL_*_OPENAI` env var na fallback (`gpt-4o` / `gpt-4o-mini`).

---

## Not in this plan (intentionally)

- **Horizontal scaling beyond Cloud Run autoscale** — out of scope until item 1 is live.
- **Observability / tracing** — separate initiative, not in original `merge_status.md`.
- **Per-tier rate limiting (free vs paid)** — predicated on a billing layer that doesn't exist yet.
