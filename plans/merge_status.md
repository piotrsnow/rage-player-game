# Merge `new_rpg_system` → `main` — Current Status

**Updated:** 2026-04-13 (end of session 4)

This branch carries a massive RPGon rewrite + frontend decomposition. Four rounds of hardening are either committed or staged in the working tree. This document is the single resume point — a fresh chat should read this, `CLAUDE.md`, and `knowledge/concepts/frontend-refactor-regressions.md` to pick up context.

---

## What's done (committed)

Branch is **3 commits ahead** of `origin/new_rpg_system`. `fc322a1 BE AUDIT` is already on origin from the start of the session; the three new commits below are local-only.

### `fc322a1` — BE AUDIT (Phase 1 security hardening) — *on origin*
- Deleted `barnaba.md` + `quirky-chasing-iverson.md` (tracked JWT-token files). `JWT_SECRET` rotation scheduled before release — neutralizes any leaked tokens.
- **CORS allowlist for SSE**: new `resolveSseCorsOrigin()` helper in [backend/src/plugins/cors.js](backend/src/plugins/cors.js) + `writeSseHead()` wrapper in [backend/src/routes/ai.js](backend/src/routes/ai.js). Rejects disallowed origins instead of reflecting `request.headers.origin`.
- **MP char-ownership fallback deleted**: `normalizeJoinCharacter(msg.characterData)` branch at multiplayer.js JOIN_ROOM removed — `characterId` is now required, validated via `fetchOwnedCharacter()`.
- **seedText prompt-injection sanitization**: `sanitizeSeedText()` in [backend/src/services/storyPromptGenerator.js](backend/src/services/storyPromptGenerator.js) (max 500, strip control chars, `<user_seed>` delimiter).
- **SettingsContext useEffect deps**: narrowed to `[settings.backendUrl, settings.useBackend, backendUser]`, inlined `shouldCheckBackendSession`.
- **JSON schemas on high-risk routes**: `CHARACTER_BODY_SCHEMA`, `STATE_CHANGES_SCHEMA`, `CAMPAIGN_WRITE_SCHEMA`, `STORY_PROMPT_SCHEMA`, `GENERATE_CAMPAIGN_SCHEMA`, `GENERATE_SCENE_SCHEMA` — all with `additionalProperties: false`.
- **Rate limit scopes** for `/multiplayer` + `/game-data` (120/min) in [backend/src/server.js](backend/src/server.js).
- **Body limit tightening**: global 50MB → 2MB, `onRoute` override to 50MB for `/media` routes.
- **WebSocket hardening** in [backend/src/routes/multiplayer.js](backend/src/routes/multiplayer.js): 30s ping/pong heartbeat with terminate-on-miss, per-message throttling (30/s normal, 60/s hard-close), 6 silent catches logged.
- **CSRF posture**: bearer tokens confirmed, no cookie auth → no CSRF work needed.

### `bfda4fc` — perf: granular Zustand selectors + Phase 3 cleanups
- **GameplayPage migration**: deleted `useMemo` state reconstruction (23 selectors no longer collapse into a single re-render cascade). Children self-subscribe via `useGameSlice()` — GameplayHeader (state prop unused entirely), GameplayModals (4 slices), MainQuestCompleteModal (2 slices), QuickActionsBar (trade/crafting/alchemy.active). Parent inline `state.X` → direct slice vars.
- One-shot handlers use `getGameState()` — `exportAsMarkdown`, `canLeaveCampaign`, `buildRecapStateForDisplayedScene`.
- **useSceneGeneration**: `useCallback` with 18 deps → `useEvent` (stable closure via ref, zero deps).
- **useImageRepairQueue**: local `cancelled` flag → generation-ref pattern, immune to concurrent re-runs.
- **useSummary**: dropped dead `state` prop, removed `narrator.STATES.PLAYING` constant from deps.
- **campaigns POST /**: `reply.code(403).send(...)` instead of 200 + error body on ownership fail.
- **GameContext**: dropped `createDefaultNeeds` re-export (import directly from `gameReducer`).

### `ebc4843` — chore: Phase 4 hygiene sweep
- **Model names centralized**: new `config.aiModels.{premium,standard,nano}.{openai,anthropic}` in [backend/src/config.js](backend/src/config.js) with `AI_MODEL_*` env var overrides. 10 call sites migrated across campaignGenerator, storyPromptGenerator, intentClassifier, sceneGenerator, memoryCompressor, multiplayerAI, proxy routes.
- **Health check DB ping**: `/health` now runs `prisma.$runCommandRaw({ ping: 1 })` and returns 503 on DB failure.
- **short-id dedup**: new [shared/domain/ids.js](shared/domain/ids.js) with `shortId(len)` + `prefixedId(prefix, len)`. Frontend `src/utils/ids.js` re-exports from shared. 11 call sites migrated: gameState, alchemy/crafting/trade engines, rewardResolver (backend), multiplayerState, stateValidation (shared).

### `e7cf2b6` — chore: graceful shutdown, schema coverage sweep, seed backend tests
- **Graceful shutdown**: SIGTERM/SIGINT handler in [backend/src/server.js](backend/src/server.js) stops cleanup timer → `saveAllActiveRooms()` → `closeAllRoomSockets(1001)` → `fastify.close()` → `process.exit(0)`. 10s force-exit safety. Multiplayer sessions survive container restarts.
- **Schema coverage extended** beyond Phase 1B high-risk routes:
  - [backend/src/routes/ai.js](backend/src/routes/ai.js): `SCENE_BODY_SCHEMA` (POST /scenes), `SCENE_BULK_SCHEMA` (POST /scenes/bulk), `CORE_STATE_PATCH_SCHEMA` (PATCH /core)
  - [backend/src/routes/auth.js](backend/src/routes/auth.js): PUT /settings body schema (dropped redundant runtime guard)
  - [backend/src/routes/campaigns.js](backend/src/routes/campaigns.js): `RECAP_SAVE_SCHEMA` (POST /:id/recaps)
  - [backend/src/routes/wanted3d.js](backend/src/routes/wanted3d.js): `REPORT_BODY_SCHEMA` with nested entry bounds
  - [backend/src/routes/proxy/openai.js](backend/src/routes/proxy/openai.js) + [backend/src/routes/proxy/anthropic.js](backend/src/routes/proxy/anthropic.js): `CHAT_BODY_SCHEMA`
- **Seed backend tests**: new [backend/src/services/characterMutations.test.js](backend/src/services/characterMutations.test.js) — 19 tests covering `applyCharacterStateChanges` (wounds clamping + death, forceStatus, xp/level cascade with attributePoints grant, mana clamping, attribute changes + maxWounds recalc). Uses the RPGon baseline fixture: all 6 attrs at 1, szczęście at 0.

---

## What's in progress — UNCOMMITTED

### Phase 4 batch 3 — Structured logging (pino)

All changes in working tree, validated end-to-end (364 vitest passed, build clean). **Not yet committed** — waiting for user approval.

- **New module** [backend/src/lib/logger.js](backend/src/lib/logger.js) — shared pino instance (`logger`) + `childLogger({ bindings })` helper.
- **Fastify adoption**: `Fastify({ loggerInstance: logger })` in server.js. `request.log`, `fastify.log`, and `import { logger }` are all the same pino instance under the hood.
- **No pino-pretty dependency** — output is JSON by default. For human-readable dev logs, pipe through `pino-pretty` in the npm script (the canonical pattern). Transport was initially configured for dev but failed hard when pino-pretty wasn't installed, breaking test discovery — removed.
- **11 files migrated from `console.*` to `log.{warn,error,info,debug}` with structured bindings** (err, campaignId, roomCode, characterId, etc.):
  - Services: [roomManager.js](backend/src/services/roomManager.js), [sceneGenerator.js](backend/src/services/sceneGenerator.js) (~12 call sites), [multiplayerAI.js](backend/src/services/multiplayerAI.js), [memoryCompressor.js](backend/src/services/memoryCompressor.js), [intentClassifier.js](backend/src/services/intentClassifier.js), [aiContextTools.js](backend/src/services/aiContextTools.js)
  - Routes: [campaigns.js](backend/src/routes/campaigns.js), [multiplayer.js](backend/src/routes/multiplayer.js), [ai.js](backend/src/routes/ai.js), [music.js](backend/src/routes/music.js)
  - Plugin: [cors.js](backend/src/plugins/cors.js)
- **Scripts in `backend/src/scripts/*` left alone** — CLI tools, not server runtime. `console.*` is fine there.

**Files modified in working tree:**
```
backend/src/lib/logger.js                 (new)
backend/src/server.js                     (Fastify loggerInstance)
backend/src/plugins/cors.js               (1 log)
backend/src/services/roomManager.js       (8 logs)
backend/src/services/sceneGenerator.js    (~12 logs)
backend/src/services/multiplayerAI.js     (2 logs)
backend/src/services/memoryCompressor.js  (3 logs)
backend/src/services/intentClassifier.js  (1 log)
backend/src/services/aiContextTools.js    (4 logs)
backend/src/routes/campaigns.js           (~10 logs)
backend/src/routes/multiplayer.js         (1 log)
backend/src/routes/ai.js                  (2 logs)
backend/src/routes/music.js               (2 logs)
```

**First decision in a new chat:** commit or revert this batch. It's validated and working; revert only if playtest surfaces a logger-related issue.

---

## Playtest gate — BLOCKS MERGE

User explicitly chose to batch playtest at the end of all changes, not per-phase (see `feedback_playtest_cadence` in auto-memory).

### High-risk (biggest automation gaps)
- **Combat solo + multiplayer** — zero automated coverage. Victory / defeat / surrender / truce / enemy auto-turn (2.5s delay) / MP host path / non-host result sync
- **Scene image repair** — current-missing + viewer-missing + migration sweep (now generation-ref safe) + manual retry in ScenePanel
- **Story recap** — `useSummary` cache/generate/speak (ElevenLabs + browser TTS fallback)/copy/re-open cycle
- **Viewer mode** — `?view/:shareToken` flows: narrator force-enable, `?scene=N` URL sync, initial chat alignment

### Medium-risk (touched in Phase 3)
- **DMSettingsPage sliders** — extra scrutiny after SettingsContext deps fix. Historical regressions: sliders lag on settings memoization changes. Check narratorPoeticism, narratorGrittiness (default 30, not 50!), narratorDetail, narratorHumor (default 20!), narratorDrama, narratorSeriousness.
- **Chat message rendering** — all 5 types (dm, combat_commentary, player, dice_roll, system), HighlightedText during narration, DialogueSegments dedup, StreamingContent partial view, dice roll expand/collapse
- **GameplayHeader button row** — ~17 buttons. `exportAsMarkdown` now uses `getGameState()` inline (no longer receives `state` prop). Verify export produces correct JSON.

### Security verification (quick smoke)
- CORS allowlist rejects disallowed origin on SSE (`curl -H "Origin: https://evil.example"`)
- Schema validation returns 400 on malformed body (send extra properties)
- Rate limit headers present on `/multiplayer/rooms` and `/game-data`
- WebSocket heartbeat: open DevTools Network → WS frames, see ping/pong every 30s
- **`JWT_SECRET` rotation** in production env before release

**If anything breaks during playtest:** triage per the `feedback_fix_and_ask` memory — fix broken/missing code in-place, don't silently preserve regressions.

---

## Backlog — post-merge, not blockers

### Backend architecture (each needs its own dedicated session)
- **Split monolithic files** — `sceneGenerator.js` 1897L, `multiplayerAI.js` 1612L, `multiplayer` route 1289L, `campaigns` route 912L. Each file needs its own plan.
- **Redis room state** — unblocks horizontal scaling, survives instance restart.
- **BullMQ for AI generation** — unblocks request handlers on 10-30s scene gens.
- **Refresh tokens + revocation** — short-lived access + httpOnly refresh cookie + Redis blacklist.
- **Basic CSP** — currently `contentSecurityPolicy: false` in helmet; needs CDN audit first.
- **Proxy route middleware extraction** — variance too high for shallow refactor (text-gen vs image-gen + DB cache vs TTS vs 3D model all have different shapes). Dedicated design session required.
- **Full schema coverage** — Phase 1B + batch 2 covered high-risk routes; still unschematized: proxy image gen (openai /images, stability, gemini image), meshy 3d gen, elevenlabs TTS, media multipart upload.
- **More backend tests** — only `characterMutations.test.js` + `roomManager.test.js` exist. Priority: auth flow, campaign save-state, WS message handling.
- **API versioning** (`/v1/`), **idempotency keys** on critical endpoints, **embedding LRU TTL**, **per-user rate limiting** (currently per-IP).

### Frontend architecture
- **`useNarrator.js` split** — 945L monolith. Flagged `playtest-driven` in `frontend-refactor-regressions.md`. **Do NOT touch until a specific bug surfaces.**
- **Combat e2e tests** — full plan at [plans/combat_e2e_tests.md](plans/combat_e2e_tests.md). Hybrid Vitest + Playwright, ~8h total.
- **Remaining dedup audit items** — `getSkillLevel` x6 (frontend), `Set add/delete spread` x4. `getGenderLabel`, `short-id`, `Toggle` already closed.
- **Fate system migration** — existing characters with fate points will behave differently post-merge. Decision pending: document behavior change vs write a one-shot migration.

### Memory updates needed after merge
- `project_optimization_progress.md` — Faza E is DONE (useAI.js already split to 67 LOC), update status to "complete".
- `project_frontend_refactor.md` — all PRs #1-#10 committed, granular selectors migration done, mark as "complete, pending playtest".
- `project_dedup_audit_backlog.md` — `short-id` and `getGenderLabel` are closed. Remaining: `getSkillLevel` x6, `Set add/delete spread` x4.

---

## How to resume in a new chat

1. Open a fresh chat in `c:\git\rage-player-game`.
2. Point me at this file: *"Continue from `plans/merge_status.md`"*.
3. I'll read this + `CLAUDE.md` + memory + `knowledge/concepts/frontend-refactor-regressions.md` to pick up context.
4. **First decision point:** commit or revert Phase 4 batch 3 (structured logging). Run `git status` — if the 13 files listed above are still modified, that batch is uncommitted. Recommended action: commit (it's validated and working).
5. **Second decision point:** playtest now or tackle more backlog. User's stated preference is big batched playtest before merge — default to playtest unless otherwise directed.

### Key reference files
- `CLAUDE.md` — project instructions (always loaded)
- `knowledge/concepts/frontend-refactor-regressions.md` — the full manual-test watchlist
- `plans/combat_e2e_tests.md` — future automated combat coverage plan
- `plans/merge_status.md` — this file
