# Post-Merge Infra Backlog

**Extracted from:** `plans/merge_status.md` (session 5, 2026-04-13)
**Status:** Deferred — tackle after the `new_rpg_system` → `main` merge lands.

## Deployment context

- **Current host:** Google Cloud Run.
- **Target host:** Google Cloud Platform (staying in GCP ecosystem).
- **Container runtime:** Docker.
- **Implication for every item below:** prefer GCP-native managed services over self-hosted alternatives where the cost/complexity tradeoff is reasonable. Cloud Run is stateless and scales to zero, so anything that assumes in-memory state across instances is broken today.

---

## 1. Redis room state

**Problem.** Multiplayer room state lives in-process inside `roomManager.js`. On Cloud Run this means:
- Rooms die when the instance scales down.
- A second instance cannot see rooms opened on the first instance → MP completely breaks once autoscaling kicks in.
- Graceful-shutdown persistence (`saveAllActiveRooms()` → DB on SIGTERM, added in `e7cf2b6`) is a band-aid — it only works on *clean* shutdowns and forces full reload on cold starts.

**Solution shape.** Externalize room state to Redis.
- **GCP option:** Memorystore for Redis (managed, VPC-attached). Cloud Run → Memorystore requires a Serverless VPC Access connector.
- **Alt option:** Upstash Redis (HTTP-native, no VPC, pay-per-request). Simpler on Cloud Run but adds a vendor.
- **Data model:** key per room (`room:<code>`), hash with members/state JSON, pub/sub channel per room for cross-instance broadcasts.
- **WS broadcast pattern:** each Cloud Run instance subscribes to the relevant room's pub/sub channel when a socket joins. Emit → Redis pub → all instances fan out to their local sockets.
- **Migration:** dual-write first (DB + Redis), switch reads to Redis, delete the in-memory `activeRooms` map last.

**Blockers.**
- Decision: Memorystore vs Upstash. Memorystore is cheaper per MB but needs VPC + connector (+$9/mo min). Upstash is $0 idle but per-request pricing scales with WS activity.
- Need to measure current room count + message volume first to model cost.

**Dependency.** **Blocks** BullMQ (item 2) and per-user rate limiting (item 8). Both need the same Redis.

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

## 4. Basic CSP

**Problem.** `backend/src/plugins/helmet.js` currently has `contentSecurityPolicy: false` — disabled because we didn't know what external origins were needed. Without CSP, XSS in scene text or NPC names could execute arbitrary JS.

**Solution shape.** Audit external origins first, then enable CSP with an allowlist.

**Audit checklist — need to inventory before writing CSP:**
- **Images:** OpenAI CDN, Stability CDN, Gemini CDN, user-uploaded media (GCS bucket), meshy preview URLs, local `/media/*`.
- **Fonts:** Google Fonts? Bunny Fonts? Self-hosted?
- **Scripts:** analytics? Sentry? any `<script src>` in `index.html`?
- **Connect:** backend API origin, WS origin, proxy origins (openai/anthropic/elevenlabs/meshy), possibly ElevenLabs media CDN for TTS playback.
- **Frame:** YouTube embeds? None I think, but confirm.
- **Media:** ElevenLabs audio URLs, local music under `/music/*`, GCS audio objects.

**Starting CSP draft** (to tighten after audit):
```
default-src 'self';
img-src 'self' data: blob: https://*.googleusercontent.com https://cdn.openai.com https://oaidalleapiprodscus.blob.core.windows.net;
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self' wss://<backend-host> https://api.openai.com https://api.anthropic.com https://api.elevenlabs.io https://api.meshy.ai;
media-src 'self' https://*.elevenlabs.io blob:;
font-src 'self';
```

**Blockers.**
- CSP audit (the inventory above). Can be done in 1-2h by grepping `index.html`, `vite.config.js`, and all `fetch`/`<img src>` call sites.
- `style-src 'unsafe-inline'` is a concession to Tailwind/emotion if used. Check what the actual styling stack needs.

---

## 5. API versioning (`/v1/`)

**Problem.** No versioning scheme on API routes. Any breaking change requires frontend + backend deploy atomicity.

**Solution shape.** Prefix all routes with `/v1/` via Fastify prefix plugin. Introduce `/v2/` only when a breaking change is needed; old clients keep working against `/v1/`.

**Blockers.**
- Frontend: every API client call site needs to prepend `/v1/`. Probably handled with a single base-URL constant, easy grep.
- This is a breaking change for any external consumers (viewer share links? admin scripts?). Inventory consumers first.
- Decision: do it before or after refresh-tokens (item 3)? If refresh-tokens is a breaking change anyway, bundle them in the same `/v1/ → /v2/` bump.

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

## 7. Idempotency keys on critical endpoints

**Problem.** POST `/campaigns`, POST `/campaigns/:id/scenes`, POST `/ai/generate-scene` are all non-idempotent. A retry after a flaky network can create duplicate campaigns or scenes. Frontend has some client-side dedup via `optimisticId`, but it's not airtight.

**Solution shape.** Accept `Idempotency-Key: <client-uuid>` header on mutating endpoints. Backend stores `(key, userId) → response` in Redis for 24h. Second request with same key returns the cached response instead of re-executing.

**Blockers.**
- Depends on item 1 (Redis).
- Frontend work: generate + send idempotency keys from every mutation call site. Small but touches many files.

---

## 8. Per-user rate limiting

**Problem.** Current rate limits (in `server.js`, `@fastify/rate-limit`) are **per-IP**. Problems:
- Shared IPs (VPN, corporate NAT) → legitimate users rate-limit each other.
- Authenticated users can burst their own account from many IPs.
- No way to enforce per-tier limits (free vs paid) once that exists.

**Solution shape.** Replace the default `keyGenerator` with one that returns `userId` (from the bearer token) when authenticated, falling back to IP for unauthenticated endpoints. Store counters in Redis instead of the current in-memory backend.

**Blockers.**
- Depends on item 1 (Redis).
- Trivial code change (~20 lines) once Redis is in place.

---

## 9. Embedding LRU TTL

**Problem.** `aiContextTools.js` caches OpenAI text embeddings (`text-embedding-3-small` output) in an in-memory LRU inside the process. Cache is:
- Lost on every Cloud Run cold start.
- Not shared across instances.
- Has no TTL — stale embeddings could persist forever if the underlying content changes.

**Solution shape.**
- **Short term:** add TTL to the existing in-memory LRU (e.g., 1h). Cheap win even without Redis.
- **Long term:** Redis-backed LRU with proper TTL, shared across instances. Key: `embed:<sha256 of text>` → `{ vector, createdAt }`.

**Blockers.**
- Long-term solution depends on item 1 (Redis).
- Short-term TTL fix is independent — could even slot into Group A.

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

## 10. FE↔BE AI helper consolidation via `shared/`

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

## 11. WS message handling tests

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
