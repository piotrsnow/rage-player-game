# Post-Merge Infra Backlog — remaining items

Live TODO list trimmed on 2026-04-15 after 8/11 items shipped. Historical context for completed items lives in git (`git log -- plans/post_merge_infra.md`) and the `project_post_merge_progress` auto-memory entry.

## Remaining items

| # | Area | Status |
|---|---|---|
| 1 | Redis room state (Stage 2) | **DEFERRED INDEFINITELY 2026-04-14** — see section 1 for revisit triggers |
| 4 | Basic CSP | **AUDIT DONE** — enable deferred pending staging playtest |
| 6 | Proxy route middleware extraction | **TODO** — needs dedicated design session |
| 12 | Pre-merge deployment checklist | **TODO** — not Claude-implementable (JWT rotation, OpenAI model ID verify) |

---

## 1. Redis room state — Stage 2 deferred indefinitely

**Decision (2026-04-14 night).** After Stage 1 plumbing landed and every other Redis consumer migrated, we re-scoped the roomManager migration and decided NOT to do it now. Rationale:

- **Main failure mode is already covered.** `saveAllActiveRooms()` on SIGTERM + `saveRoomToDB()` after every major mutation (convert, disconnect, rejoin, start-game, post-scene-gen) + `loadActiveSessionsFromDB()` on boot already handle clean restarts and most mid-game state. DB persistence is coarse-grained but functional.
- **Residual gap has no concrete driver.** What Redis write-through would add on top: pending-action / typing-state / character-update survival across hard crashes. Currently no incident report or playtest complaint tied to this.
- **Pub/sub bridge is dead code on single-VM Prod-A.** Horizontal scale is not on the roadmap.
- **Cost is real.** 2-3 focused sessions for the proper split (state store + socket registry + dual-write migration + async propagation through 20+ handler call sites).

**Revisit trigger.** Pick this back up only when one of these happens:
1. **Second backend instance is on the roadmap** — pub/sub becomes load-bearing and the full split is mandatory.
2. **Bug report surfaces** — e.g. "I lost my pending action when the backend crashed" — then we have a concrete driver for the write-through path.
3. **Memorystore / Cloud Run migration** — if we move off the single VM, Stage 2 becomes a prerequisite for room-state consistency across instances.

**Handoff below stays as the design doc for whoever picks this up later.**

### Why it's heavy

[backend/src/services/roomManager.js](../backend/src/services/roomManager.js) is 675 lines and the in-memory `Map<roomCode, room>` is doing **two jobs simultaneously**:
1. **State store** — roomCode, hostId, phase, settings, players metadata, gameState. This IS serializable and belongs in Redis.
2. **Socket registry** — `player.ws` references to live `WebSocket` instances. These are **per-instance runtime objects that CANNOT be serialized to Redis** under any circumstance.

The file intermixes these freely: `player.ws = ws`, `player.ws?.readyState === 1`, `player.ws.send(payload)`. Functions touching sockets directly: `sanitizeRoom`, `disconnectPlayer`, `broadcast`, `sendTo`, `closeAllRoomSockets`, `cleanupInactiveRooms`, `loadActiveSessionsFromDB`.

### Solution shape — split into two layers

- **Layer A — State store (Redis-backed).** Functions that only touch persistent state: `createRoom`, `joinRoom`, `leaveRoom`, `updateCharacter`, `updateSettings`, `setPhase`, `setGameState`, `submitAction`, `getRoom`, `saveRoomToDB`, `loadActiveSessionsFromDB`, etc. All become async. Storage: Redis hash `room:<code>` with JSON-encoded `{phase, hostId, settings, gameState, players}`.
- **Layer B — Socket registry (per-instance, process-local).** A `Map<odId, WebSocket>` that never leaves the process. Functions: `registerSocket(odId, ws)`, `unregisterSocket(odId)`, `getLocalSocket(odId)`, `iterateLocalSockets()`.
- **Layer C — Pub/sub bridge.** When instance A wants to broadcast to room R: publish to Redis channel `room:<R>:events` with `{targetOdId?, message}`. Every instance subscribes when it has at least one local socket for R, forwards matches, unsubscribes on last disconnect.

### Data model

```
room:<code>               → Redis hash, JSON-encoded room state minus ws refs
room:<code>:lastActivity  → Redis string, UNIX ms, for cleanup
room:<code>:events        → Redis pub/sub channel for broadcasts
TTL                       → ROOM_INACTIVE_TTL_MS (30min) refreshed on every write
```

### Migration strategy — dual-write first, cut reads over, then delete the Map

1. **Phase 1 — dual-write.** Every write to `rooms.set(...)` / mutation also writes to Redis. Reads still go to `rooms.get(...)`. Low risk — Map is still the source of truth.
2. **Phase 2 — cut reads over.** Flip reads from `rooms.get(...)` to `await redisGet(...)`. 20+ functions become async, every caller needs `await`. Medium risk — async propagation is invasive.
3. **Phase 3 — delete the Map.** Once reads flow from Redis reliably (verified via playtest), remove `const rooms = new Map()`. Layer B replaces it for local socket lookup.
4. **Phase 4 — pub/sub.** Add broadcast bridge. Only meaningful with >1 backend instance. Can be deferred for single-VM Prod-A; code should be in place so instance-count change is zero-risk.

**Testing.** Existing 64 WS handler tests mock `roomManager` at module level — should keep working through the migration if signatures stay the same (plus async). After Phase 2, some tests may need `await`-ing previously-sync mocks.

**Estimated scope.** 2-3 focused sessions. Phase 1+2 ≈ 1 session. Phase 3+4 ≈ 1 session. Playtest + bugfix ≈ 1 session.

**Dependency.** Plumbing (Stage 1) was the only prerequisite. Stage 2 is self-contained — does not block anything else.

---

## 4. Basic CSP — audit done, enable deferred

**Problem.** `backend/src/server.js:52` registers helmet with `contentSecurityPolicy: false`. Without CSP, XSS in scene text or NPC names could execute arbitrary JS.

**Status.** Audit done 2026-04-14. Enable deferred until we can verify in a staging environment — too much risk of breaking font loading, Three.js shader compilation, or WebRTC connection setup without a playtest pass.

### Audit results

| Category | Origins found | Source |
|---|---|---|
| Scripts | `'self'` only — single `<script type="module" src="/src/main.jsx">` in [index.html:19](../index.html#L19). No analytics, no Sentry, no external CDN scripts. | grep `<script` in index.html |
| Styles | `'self'` + Google Fonts CSS (`https://fonts.googleapis.com`). Tailwind emits classes at build time. `'unsafe-inline'` needed only if runtime `<style>` tags exist. | [index.html:8-14](../index.html#L8-L14) |
| Fonts | `https://fonts.gstatic.com` | fetched by Google Fonts CSS |
| Images | `'self'`, `data:`, `blob:`, `/media/*` (backend), DALL-E blob, `storage.googleapis.com` (GCS uploads), `*.meshy.ai` (3D thumbnails), Stability AI output URLs | BE-only dispatch; FE receives via `/media/*` |
| Connect (BE mode) | backend origin (same-origin in prod, `http://localhost:3001` in dev), WebSocket `wss://<backend>` or `ws://localhost:3001` | default in prod |
| Media (audio) | `/music/*` (local), ElevenLabs audio URLs via backend proxy, GCS audio objects | [backend/src/routes/proxy/elevenlabs.js](../backend/src/routes/proxy/elevenlabs.js) |
| Frame | None (no iframes, no YouTube embeds) | confirmed via grep |

### Notes on backend CSP

- Backend is API-only (JSON, WebSocket). Setting `contentSecurityPolicy` via helmet on backend responses has minimal defensive value — CSP is a browser-side directive for documents, not JSON fetches. Useful location is the frontend (index.html meta tag or static server response header).
- Re-enabling `contentSecurityPolicy: true` with helmet defaults on backend is still cheap defense-in-depth for someone browsing directly to a backend URL.

### Ready-to-ship policy

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

**Caveats to verify in staging before flipping from report-only to enforce:**
1. **`script-src 'self'` without `unsafe-eval`** — Three.js/R3F does not use eval for GLSL but some build tools do. If Scene3D breaks on load, add `'unsafe-eval'` reluctantly.
2. **`style-src 'unsafe-inline'`** — Tailwind is build-time, but React sometimes injects inline styles. If material-symbols or glassmorphism effects break, investigate.
3. **`connect-src wss:`** — permissive on WebSocket origin because prod hostname varies. Tighten to actual prod URL later.
4. **Connect allowlist** — after no-BYOK cleanup the FE talks only to its own backend, so the long direct-provider allowlist can be trimmed. Keep `'self'` + `wss:` and confirm no FE code still talks to `api.openai.com` etc. before removing those entries.

### Deployment plan

1. Ship CSP as `Content-Security-Policy-Report-Only` header first (set on whatever document serves `index.html` in prod).
2. Wire `/csp-report` endpoint that logs violations to pino.
3. Watch logs for a week, tighten based on real violations.
4. Flip to enforcing `Content-Security-Policy`.

**Blockers.**
- Need staging env to exercise Three.js scene rendering, ElevenLabs TTS playback, WebRTC voice/video, and image generation with the report-only policy.
- Need to confirm where frontend HTML is served in prod to decide `<meta http-equiv>` in `index.html` vs HTTP header from static server.

---

## 6. Proxy route middleware extraction

**Problem.** `backend/src/routes/proxy/*.js` (openai, anthropic, elevenlabs, meshy, stability, gemini) duplicate: request validation, API key resolution, rate-limit headers, error shape translation, cache-through-DB for image/audio blobs. Six routes with six copies of the same concerns.

**Status.** Deferred pending dedicated design session. The plan explicitly flagged this: *variance too high for shallow refactor (text-gen vs image-gen + DB cache vs TTS vs 3D model all have different shapes).*

### Solution shape

The right design probably looks like:
- A thin `proxyRouteFactory({ provider, requestSchema, cacheStrategy, transformRequest, transformResponse })` helper.
- Per-provider config objects that describe the differences.
- Different cache strategies: pass-through (text gen), DB-blob (images), stream (TTS), URL-only (3D).

**Blockers.**
- Needs its own session. Too much domain variance to hack in during another refactor.
- Also: confirm how much of this is still alive after no-BYOK cleanup — some proxy routes may be dead code now that the backend holds keys directly. Audit scope before refactor.

---

## 12. Pre-merge deployment checklist (carryover)

Two items from `merge_status.md` pre-merge checklist that survived to post-merge as deployment concerns. Not Claude-implementable — flagged here so they're not lost.

- **`JWT_SECRET` rotation w production env.** Tracked JWT-token files (`barnaba.md`, `quirky-chasing-iverson.md`) zostały usunięte w `fc322a1`, ale tokeny wydane pod starym secret są ważne do ~kwiecień 2026. Rotacja secret kasuje je wszystkie. **Akcja:** zaktualizować `JWT_SECRET` env var na Cloud Run przy najbliższym deploy, wszyscy active users zostaną wylogowani (jednorazowy koszt, akceptowalny).

- **OpenAI model IDs verify.** Defaults w [backend/src/config.js](../backend/src/config.js) wskazują na `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`. Przed release trzeba potwierdzić że te ID wciąż resolvują u OpenAI (API się zmienia, model naming rzadko ale zdarza). **Akcja:** curl `https://api.openai.com/v1/models` z prod key, grep powyższe ID, w razie 404 ustawić `AI_MODEL_*_OPENAI` env var na fallback (`gpt-4o` / `gpt-4o-mini`).

---

## Not in this plan (intentionally)

- **Horizontal scaling beyond Cloud Run autoscale** — out of scope until item 1 is live.
- **Observability / tracing** — separate initiative.
- **Per-tier rate limiting (free vs paid)** — predicated on a billing layer that doesn't exist yet.
