# Post-Merge Infra Backlog

**Extracted from:** `plans/merge_status.md` (session 5, 2026-04-13)
**Status:** Partially executed 2026-04-14. Redis decision made + infra plumbing landed + first real consumer (item 9b) migrated. Items 1/2/3/7/8 still on the runway.

## Progress snapshot

| # | Item | Status |
|---|---|---|
| — | **Redis decision + plumbing (Stage 1)** | **✅ DONE 2026-04-14** — Prod-A (self-hosted Valkey in docker-compose on single VM), `redisClient.js` singleton with optional mode, `/health` reports redis status, graceful shutdown wired |
| 1 | Redis room state | **TODO** — plumbing unblocked but migration is heavy (roomManager has 675L with ws refs interleaved across 20+ functions) — deferred to dedicated session |
| 2 | BullMQ for AI generation | **TODO** — plumbing unblocked (ioredis installed, ready for bull) |
| 3 | Refresh tokens + revocation | **TODO** — plumbing unblocked |
| 4 | Basic CSP | **AUDIT DONE** — enable deferred pending staging playtest |
| 5 | API versioning (`/v1/`) | **✅ DONE 2026-04-14** |
| 6 | Proxy route middleware extraction | **TODO** — standalone, needs design session |
| 7 | Idempotency keys | **✅ DONE 2026-04-14** — backend plugin (9 tests) + FE apiClient extension (8 tests) + opt-in on all 5 mutation call sites (3× POST /campaigns, 1× POST /scenes, 1× POST /scenes/bulk) |
| 8 | Per-user rate limiting | **✅ DONE 2026-04-14** — custom keyGenerator (userId when authed, IP fallback), Redis store when enabled, 6 tests |
| 9a | Embedding LRU short-term TTL | **✅ DONE 2026-04-14** |
| 9b | Embedding LRU Redis migration | **✅ DONE 2026-04-14** — two-tier L1+L2 cache, SHA256 keys, EX TTL, fallback on Redis errors, 6 new tests |
| 10 | FE↔BE AI helper consolidation | **✅ DONE 2026-04-14** (fallbackActions + aiResponseParser + dialogueRepair → `shared/domain/`) |
| 11 | WS message handler tests | **✅ DONE 2026-04-14** (64 tests across 6 handler files) |
| 12 | Pre-merge deployment checklist | **TODO** — not Claude-implementable (JWT rotation, OpenAI model ID verify) |

**What landed on 2026-04-14:** items 4 (audit), 5, 9a, 9b, 10 (a/b/c), 11, plus the Redis infra/plumbing layer (Stage 1 of item 1). Full test suite 509/509, build green. See `project_post_merge_progress` memory for the detailed handoff.

**What's next when resuming:** the Redis plumbing is live and validated with three consumers (9b embedding cache, 8 rate-limit counters, and the `/health` probe). Ops reality check: user confirmed 2026-04-14 that the production VM + CI/CD from main is already live — pushing to main auto-updates the VM. Caveat: verify the pipeline actually starts the new `valkey` compose service on first deploy (if it's image-pull-only, someone may need to manually `docker compose up -d` once). Heavy items 1 Stage 2 (roomManager migration) / 2 (BullMQ) / 3 (refresh tokens) should each be their own dedicated session. Item 7 (idempotency keys) is the next small follow-up — similar shape to item 8 (small keyGenerator-ish helper + Redis GET/SET for cached responses).

## Deployment context

- **Current host:** Google Cloud Run.
- **Target host:** Google Cloud Platform (staying in GCP ecosystem).
- **Container runtime:** Docker.
- **Implication for every item below:** prefer GCP-native managed services over self-hosted alternatives where the cost/complexity tradeoff is reasonable. Cloud Run is stateless and scales to zero, so anything that assumes in-memory state across instances is broken today.

---

## 1. Redis room state

**Hosting decision (2026-04-14, Stage 1 DONE).** Picked **Prod-A: self-hosted Valkey via docker-compose on a single Compute Engine VM**, rejecting Memorystore (~$44/mo with VPC connector, overkill for pre-prod) and Upstash (vendor lock, per-request pricing scales badly with WS traffic). Tradeoff: lose Cloud Run autoscale (we only ran 1 instance anyway), gain simpler stack and ~$13/mo fixed cost on e2-small. When horizontal scale eventually matters, migration to Memorystore is `REDIS_URL=` env var swap + DNS cutover.

**Stage 1 — plumbing (DONE 2026-04-14).** Infrastructure layer landed separately from the roomManager migration so consumers can adopt Redis independently:
- **[docker-compose.yml](docker-compose.yml)** — `valkey:7-alpine` service, RDB snapshot 60s/1000 changes, volume `valkey-data`, port 6379. Backend gets `REDIS_URL=redis://valkey:6379` + `depends_on`.
- **[docker-compose.prod.yml](docker-compose.prod.yml)** — Valkey bound to `127.0.0.1:6379` (not exposed publicly), backend talks to it via docker network.
- **[backend/src/services/redisClient.js](../backend/src/services/redisClient.js)** — singleton ioredis client, lazy connect, exponential backoff (capped 10s), `READONLY` failover reconnect, graceful `closeRedis()` on SIGTERM. Exports `getRedisClient`, `isRedisEnabled`, `pingRedis`, `closeRedis`, `getRedisStatus`.
- **[backend/src/config.js](../backend/src/config.js)** — `redisUrl` config (empty default = optional mode).
- **[backend/src/server.js](../backend/src/server.js)** — boot triggers connect attempt, `/health` reports `redis: 'ok' | 'down' | 'disabled'`, shutdown hook calls `closeRedis()`.
- **Optional mode** — when `REDIS_URL` is empty, backend logs `[redis] disabled` and every consumer must have an in-memory fallback. This lets devs run without Docker and keeps the 503-test suite hitting zero Redis.

**Stage 2 — roomManager migration (STILL TODO).** Plumbing is live but the actual roomManager work hasn't landed. Scope is heavy — the file has 675 lines, and `player.ws` (per-instance WebSocket refs that cannot be serialized) is threaded through `broadcast`, `sendTo`, `disconnectPlayer`, `sanitizeRoom.connected`, `closeAllRoomSockets`, `cleanupInactiveRooms`. Proper migration needs:

1. **Split roomManager into two layers** — state store (Redis-backed) vs socket registry (per-instance `odId → ws` map that never leaves the process)
2. **Pub/sub bridge** — each instance subscribes to `room:<code>` channel for rooms where it has at least one local socket; broadcasts publish to Redis, every subscriber fans out locally
3. **Dual-write migration** — Redis + DB in parallel, then switch reads, then delete in-memory map last
4. **Async conversion** — 20+ currently-sync functions become async

For single-instance Prod-A, pub/sub is dead code right now (yields only restart-survival). The real win comes when you horizontally scale. Migration should happen in a dedicated session when there's a concrete driver.

**Data model** (when Stage 2 lands):
- Key per room: `room:<code>` — Redis hash with `{phase, hostId, settings, gameState, players}` JSON-encoded
- Pub/sub: `room:<code>:events` channel for cross-instance broadcasts
- TTL: `ROOM_INACTIVE_TTL_MS` (30min) refreshed on every touch

**Dependency.** Plumbing (Stage 1) **unblocks** BullMQ (item 2), refresh tokens (item 3), idempotency (item 7), per-user RL (item 8), embedding Redis (item 9b — already done). Stage 2 (actual migration) is now self-contained.

---

## 2. BullMQ for AI generation

**Problem.** Scene generation (10-30s), campaign generation (20-60s), and image generation (15-45s) all run synchronously inside request handlers. Cloud Run kills requests after the configured timeout (default 300s, can be bumped to 60min on gen2). Long generations:
- Block the handler process — a single instance can't serve many parallel scene gens.
- Have no retry/resume on instance restart.
- Cannot be observed (no job UI).

**Solution shape.** BullMQ (Redis-backed) job queue.
- Client submits `/ai/generate-scene` → backend enqueues a job, returns `{ jobId }`.
- Client polls `/ai/jobs/:id` or subscribes via SSE for progress updates.
- Worker process (separate Cloud Run service or same service with `WORKER_MODE=1`) consumes the queue.
- Built-in retries, dead-letter queue, job UI via `@bull-board/fastify`.

**Blockers.**
- Depends on item 1 (Redis).
- Design question: one queue for all AI gen, or separate queues per provider (openai/anthropic/meshy/stability) with independent concurrency limits? Recommend: separate, because rate limits differ per provider.
- Frontend work: refactor `useSceneGeneration` to poll/subscribe instead of awaiting the response. Non-trivial — current code assumes SSE streaming comes back inline.

---

## 3. Refresh tokens + revocation

**Problem.** Current auth uses long-lived JWT bearer tokens (per `fc322a1` BE AUDIT). No revocation — if a token leaks we cannot kill it without rotating `JWT_SECRET` (which logs out everyone).

**Solution shape.** Short-lived access token + long-lived refresh token pattern.
- Access token: JWT, 15min TTL, bearer-auth on every API call (as today).
- Refresh token: opaque random string, 30-day TTL, stored in Redis with `user:<id>:refresh:<tokenId>` → `{expiresAt, deviceInfo}`.
- Delivery: refresh token in **httpOnly SameSite=Strict cookie**, not localStorage. This is where the **CSRF posture changes**: cookie-based auth needs CSRF tokens on state-changing requests (POST/PUT/DELETE/PATCH).
- Revocation: `DELETE` on the Redis key immediately kills the session. Admin endpoint `/admin/sessions/:userId/revoke` for incident response.

**Blockers.**
- Depends on item 1 (Redis).
- Breaking change: frontend `authStore` needs to handle 401 → call `/auth/refresh` → retry pattern. Every API client site needs an interceptor.
- CSRF token implementation: double-submit cookie pattern or synchronizer token. Not hard, but touches every mutating route.
- Migration: existing users keep their long-lived JWTs until they expire naturally, or force-logout everyone on deploy.

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

## Recommended ordering (post-merge)

The dependency graph is:

```
Redis (1) ──┬──> BullMQ (2)
            ├──> Refresh tokens (3)
            ├──> Idempotency (7)
            ├──> Per-user RL (8)
            └──> Embedding LRU long-term (9b)

CSP audit (4) ──> CSP enable (4)
API versioning (5) ──┬──> (should bundle with breaking refresh-token change if both happen)
Proxy middleware (6) ──> standalone, needs design session
Embedding TTL short-term (9a) ──> standalone, could slot into Group A if needed
```

**Proposed execution order after merge:**

1. **Redis setup (item 1)** — unblocks 5 of the 9 items. Biggest single-point unlock.
2. **Refresh tokens + CSRF (item 3)** — biggest user-visible security improvement. Bundle with API versioning (item 5) as a single `/v2/` jump.
3. **BullMQ (item 2)** — biggest latency improvement. Once this lands, scene gen stops blocking instances.
4. **Per-user rate limiting (item 8) + Idempotency (item 7)** — small follow-ups once Redis is there.
5. **CSP audit + enable (item 4)** — standalone, parallel-able with 2-4.
6. **Embedding LRU Redis migration (item 9b)** — small follow-up.
7. **Proxy route middleware extraction (item 6)** — standalone, needs its own design session.

**Total scope:** very rough estimate, 5-8 focused sessions. Not a single sprint.

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
