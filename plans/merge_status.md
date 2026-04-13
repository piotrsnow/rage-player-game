# Merge `new_rpg_system` → `main` — Current Status

**Updated:** 2026-04-13 (session 5 — verification pass)

This branch carries a massive RPGon rewrite + frontend decomposition. Five rounds of hardening are all committed and pushed. This document is the single resume point — a fresh chat should read this, `CLAUDE.md`, and `knowledge/concepts/frontend-refactor-regressions.md` to pick up context.

**Current state:** working tree clean, `new_rpg_system` up-to-date with `origin/new_rpg_system`. Only blocker to merge is manual playtest.

---

## What's done (committed, all on origin)

### `95763f8` — Custom logger for BE (Phase 4 batch 3 — structured logging)
- **New module** [backend/src/lib/logger.js](../backend/src/lib/logger.js) — shared pino instance (`logger`) + `childLogger({ bindings })` helper. JSON output, `LOG_LEVEL` env override, `debug` in dev / `info` in prod.
- **Fastify adoption**: `Fastify({ loggerInstance: logger })` in [server.js](../backend/src/server.js). `request.log`, `fastify.log`, and `import { logger }` all resolve to the same pino instance.
- **No pino-pretty transport** — breaks test discovery when the package isn't installed. Human-readable dev logs should be piped through `pino-pretty` in the npm script (`"dev": "node --watch src/server.js | pino-pretty"`).
- **11 files migrated** from `console.*` → `log.{warn,error,info,debug}({ err, ...bindings }, 'msg')`:
  - Services: roomManager (7), sceneGenerator (~17), multiplayerAI (2), memoryCompressor (3), intentClassifier (1), aiContextTools (4)
  - Routes: campaigns (~10), multiplayer (uses `fastify.log` pino-shorthand with Error objects — valid pino), ai (2), music (2)
  - Plugin: cors (1)
- **Scripts in `backend/src/scripts/*` intentionally untouched** — CLI tools, `console.*` is fine there.
- Also bundled in this commit: `plans/combat_e2e_tests.md`, `plans/merge_status.md` (initial), and 4 new `skills/*.md` docs (backend_architect, cleanup-rpg, frontend_patterns_skill, senior_baseline).

### `fc322a1` — BE AUDIT (Phase 1 security hardening)
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

## Pre-merge checklist (non-playtest)

Manual playtest is handled by user out of band. Before actually merging `new_rpg_system` → `main`:

- **`JWT_SECRET` rotation** in production env — tracked JWT-token files were deleted in `fc322a1`, secret rotation neutralizes any leaked tokens.
- **Verify OpenAI model defaults** resolve — see "Known config drift" below.
- ~~**Rebase/merge check** vs current `main`~~ → verified session 5: `new_rpg_system` is 33 commits ahead, 0 behind `origin/main`. Clean fast-forward, no conflicts.

---

## Pre-merge backlog — all to be done in current session (sessions 5-6)

User decision (session 5): the entire pre-merge backlog is tackled in this chat before merging to `main`. `useNarrator.js` stays off-limits (flagged `playtest-driven`). Infra items extracted to [post_merge_infra.md](post_merge_infra.md) for after the merge.

### Group A — mechanical / self-contained
1. **Remaining dedup audit** — `getSkillLevel` x6 (frontend), `Set add/delete spread` x4. `getGenderLabel`, `short-id`, `Toggle` already closed in prior sessions.
2. **Full schema coverage** — proxy image gen (openai `/images`, stability, gemini image), meshy 3d gen, elevenlabs TTS, media multipart upload. All still unschematized after batch 2.
3. **More backend tests** — auth flow, campaign save-state, WS message handling. Only `characterMutations.test.js` + `roomManager.test.js` exist today.
4. **Luck coverage sweep** — session 5 decision: no migration, no backward compat. `szczescie` must apply to every success/failure roll. Formula: `luckRoll = rollPercentage(); luckySuccess = luckRoll <= szczescie; success = luckySuccess || baseSuccess`.

### Group B — monolith splits (each gets its own plan doc first, per `feedback_docs_before_impl`)
5. ~~**[backend/src/routes/campaigns.js](../backend/src/routes/campaigns.js)** 912L — smallest, simplest starting point.~~ → **done in session 6**. Plan in [split_campaigns_routes.md](split_campaigns_routes.md). Thin entrypoint re-exports `extractTotalCost` + `stripNormalizedFromCoreState` so `campaigns.saveState.test.js` still passes unchanged. 4 route sub-plugins (`public.js`, `crud.js`, `sharing.js`, `recaps.js`) + 3 services (`campaignSerialize.js`, `campaignSync.js`, `campaignRecap.js`). All 410 unit tests green.
6. ~~**[backend/src/routes/multiplayer.js](../backend/src/routes/multiplayer.js)** 1289L — WS handling, JOIN_ROOM / START_GAME / combat paths.~~ → **done in session 6**. Plan in [split_multiplayer.md](split_multiplayer.md). Thin entrypoint (7L) + `http.js` + `connection.js` (WS lifecycle + inline dispatcher) + 6 handler files under `routes/multiplayer/handlers/` (lobby/roomState/gameplay/quests/combat/webrtc). Extracted `runMultiplayerSceneFlow` in new `services/multiplayerSceneFlow.js` dedupes ~90L between `APPROVE_ACTIONS` and `SOLO_ACTION` via `soloActionName` param. Backend vitest: 53 tests green.
7. ~~**[backend/src/services/multiplayerAI.js](../backend/src/services/multiplayerAI.js)** 1612L.~~ → **done in session 6**. Plan in [split_multiplayer_ai.md](split_multiplayer_ai.md). Thin facade (7L) re-exporting 5 public funkcji + 9 modułów pod `multiplayerAI/`: `fallbackActions` (159L), `dialogueRepair` (282L), `diceNormalization` (90L), `systemPrompt` (244L), `scenePrompt` (226L), `aiClient` (93L), `campaignGeneration` (160L), `sceneGeneration` (208L), `compression` (83L). Bonus cleanups: `generateMidGameCharacter` (94L dead code) usunięty, `calculateMargin` (dead) usunięte, `clamp` + `rollD50` zdedupowane z `diceResolver.js` (exportuje teraz `rollD50`), `normalizeDiceRoll` / `recalcDiceRoll` wyjechały z closure'a w `generateMultiplayerScene` do pure helperów w `diceNormalization.js`. Known FE/BE duplication (dialogue repair, fallback actions, parse) udokumentowana jako post-merge item 10 w [post_merge_infra.md](post_merge_infra.md). Backend vitest: 53/53 green.
8. ~~**[backend/src/services/sceneGenerator.js](../backend/src/services/sceneGenerator.js)** 1897L — largest, most critical path, last.~~ → **done in session 6**. Plan in [split_scene_generator.md](split_scene_generator.md). Thin facade (1L) + 12 modułów pod `sceneGenerator/`: `labels` (24L), `inlineKeys` (36L), `systemPrompt` (412L, template świadomie over 300L soft), `userPrompt` (151L), `contextSection` (43L), `diceResolution` (154L), `enemyFill` (45L), `shortcuts` (180L, wyciągnięty trade + combat fast-path), `streamingClient` (254L — OpenAI/Anthropic SSE + parseAIResponse), `processStateChanges` (227L, rozbite na inline helpers per NPCs/knowledge/codex/quests), `campaignLoader` (106L, DB loading z hydratacją coreState), `generateSceneStream` (316L orchestrator). Bonus: `detectCombatIntent` wyciągnięte do **[shared/domain/combatIntent.js](../shared/domain/combatIntent.js)** (FE wersja richsza = canonical), usunięte 3 duplikaty (2× BE + 1× FE local), 3 call sites zaktualizowane. Backend vitest: 53/53, frontend vitest: 393/393.

### Out of scope for this chat
- **Combat e2e tests** (`plans/combat_e2e_tests.md`, ~8h) — separate session, after the merge lands.
- **`useNarrator.js` split** — flagged `playtest-driven`, do not touch until a specific bug surfaces.
- **All infra items** — see [plans/post_merge_infra.md](post_merge_infra.md). Deferred until after merge.

### Known config drift
- OpenAI defaults reference `gpt-5.4` / `gpt-5.4-mini` / `gpt-5.4-nano` in [config.js](../backend/src/config.js). Verify these model IDs still resolve at OpenAI before release; env vars `AI_MODEL_*_OPENAI` override at deploy time if needed.
- ~~`claude-sonnet-4-20250514` premium default~~ → bumped to `claude-sonnet-4-6` in session 5.

---

## How to resume in a new chat

1. Open a fresh chat in the repo root.
2. Point me at this file: *"Continue from `plans/merge_status.md`"*.
3. I'll read this + `CLAUDE.md` + auto-memory + `knowledge/concepts/frontend-refactor-regressions.md` to pick up context.
4. **Default next step:** pick one of the Backlog items below, or proceed with the merge if user's out-of-band playtest is green.
5. **Before opening the merge PR:** run the "Pre-merge checklist" section — JWT rotation, OpenAI model verify, rebase check vs `main`.

### Key reference files
- `CLAUDE.md` — project instructions (always loaded)
- `knowledge/concepts/frontend-refactor-regressions.md` — the full manual-test watchlist
- `plans/combat_e2e_tests.md` — future automated combat coverage plan
- `plans/merge_status.md` — this file
