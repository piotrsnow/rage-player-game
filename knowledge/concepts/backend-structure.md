# Backend File Structure

Detailed file inventory for `backend/` and `shared/`. For high-level architecture see [AGENTS.md](../../AGENTS.md).

**April 2026 split sweep (session 6):** four monoliths (`campaigns.js` 935L, `multiplayer.js` 1291L, `multiplayerAI.js` 1615L, `sceneGenerator.js` 1901L) were broken into thin facades + submodule folders. See [[../patterns/backend-monolith-split]] for the recurring pattern.

## Routes (`backend/src/routes/`)

### Flat routes
- `auth.js` + `auth.test.js` — cookie-based refresh flow under `/v1/auth`: /register, /login, /refresh (CSRF), /logout (CSRF), /me (bearer), /settings (bearer), /api-keys (bearer). Access token 15min, refresh cookie 30d in Redis. Redis REQUIRED — register/login/refresh return 503 when disabled. See [[../../memory pointer: project_auth_v2_refresh]].
- `characters.js` — Character library CRUD
- `ai.js` — All AI endpoints in one (~760L — on the edge of the size budget, split candidate):
  - Simple single-shot: /generate-story-prompt, /combat-commentary, /verify-objective, /generate-recap (all use `aiJsonCall.js`)
  - Streaming: /generate-campaign (inline SSE), /campaigns/:id/generate-scene-stream (BullMQ + pub/sub bridge, inline SSE fallback)
  - Job polling: /jobs/:id (scans all BullMQ queues)
  - Scene persistence: /campaigns/:id/scenes, /campaigns/:id/scenes/bulk (both opt-in idempotency), GET /campaigns/:id/scenes, PATCH /campaigns/:id/core
  - See [[../patterns/sse-streaming]] and [[../decisions/bullmq-vs-sse-routes]]
- `gameData.js` — Static game data API (equipment, etc.)
- `media.js` — Media upload/serve (local or GCS)
- `music.js` — Music generation proxy
- `wanted3d.js` — Wanted 3D model requests management
- `proxy/openai.js` — Proxied OpenAI chat + image
- `proxy/anthropic.js` — Proxied Anthropic chat
- `proxy/gemini.js` — Proxied Gemini chat + image
- `proxy/elevenlabs.js` — Proxied ElevenLabs TTS
- `proxy/stability.js` — Proxied Stability AI image generation
- `proxy/meshy.js` — Proxied Meshy 3D model generation

### Split routes

**`campaigns.js`** (thin facade, 7L) re-exports `extractTotalCost` + `stripNormalizedFromCoreState` so `campaigns.saveState.test.js` still works unchanged. Registers:
- `campaigns/public.js` — GET /public, GET /public/:id, GET /share/:token, POST /share/:token/tts (unauth'd)
- `campaigns/crud.js` — GET /, GET /:id, POST /, PUT /:id, DELETE /:id (authed child scope)
- `campaigns/sharing.js` — POST /:id/share, DELETE /:id/share, PATCH /:id/publish
- `campaigns/recaps.js` — GET /:id/recaps, POST /:id/recaps
- `campaigns/schemas.js` — `CAMPAIGN_WRITE_SCHEMA`, `RECAP_SAVE_SCHEMA`

**`multiplayer.js`** (thin facade, 7L) registers:
- `multiplayer/http.js` — GET /rooms, GET /my-sessions
- `multiplayer/connection.js` — WS auth, heartbeat (30s), rate limit (30/s normal, 60/s hard-close), sequential message queue, close handler, **inline dispatcher** (Map lookup over handler modules)
- `multiplayer/handlers/lobby.js` — CREATE_ROOM, CONVERT_TO_MULTIPLAYER, JOIN_ROOM, LEAVE_ROOM, REJOIN_ROOM, KICK_PLAYER
- `multiplayer/handlers/roomState.js` — UPDATE_CHARACTER, UPDATE_SETTINGS, SYNC_CHARACTER, UPDATE_SCENE_IMAGE, TYPING, PING
- `multiplayer/handlers/gameplay.js` — START_GAME, SUBMIT_ACTION, WITHDRAW_ACTION, APPROVE_ACTIONS, SOLO_ACTION (last two deduped via `runMultiplayerSceneFlow`)
- `multiplayer/handlers/quests.js` — ACCEPT_QUEST_OFFER, DECLINE_QUEST_OFFER, VERIFY_QUEST_OBJECTIVE
- `multiplayer/handlers/combat.js` — COMBAT_SYNC, COMBAT_MANOEUVRE, COMBAT_ENDED
- `multiplayer/handlers/webrtc.js` — WEBRTC_OFFER/ANSWER/ICE/TRACK_STATE (signal forwarding)

Handlers share a `session = { odId, roomCode }` object mutated in place + `ctx = { fastify, ws, uid, sendWs, log }` set up once per connection.

## Services (`backend/src/services/`)

### Campaign serialization / persistence helpers
- `campaignSerialize.js` — pure helpers: `extractTotalCost`, `stripNormalizedFromCoreState`, `SCENE_CLIENT_SELECT`, `dedupeScenesByIndexAsc`, `buildDistinctSceneCountMap`
- `campaignSync.js` — DB side-effects: `withRetry` (P2034/P2028 retry), `fetchCampaignCharacters`, `syncNPCsToNormalized`, `syncKnowledgeToNormalized`, `syncQuestsToNormalized`, `reconstructFromNormalized`
- `campaignRecap.js` — recap cache helpers: `normalizeRecapCacheKey`, `buildRecapAssetKey`, `parseRecapMetadata`, `SUMMARY_CACHE_MAX_ITEMS`

### Multiplayer AI pipeline
- `multiplayerAI.js` (thin facade, 7L) re-exports: `generateMultiplayerCampaign`, `generateMultiplayerScene`, `needsCompression`, `compressOldScenes`, `verifyMultiplayerQuestObjective`
- Fallback suggested-actions live in `shared/domain/fallbackActions.js` — BE entry `ensureSuggestedActions`, shared helpers (FE imports `postProcessSuggestedActions` from same file)
- Dialogue repair lives in `shared/domain/dialogueRepair.js` — single source of truth (previously FE/BE duplicated, reconciled to FE variant which had more bugfixes: hardDedupe, fuzzy name matching, player reattribution, generic-speaker safe-mode)
- `multiplayerAI/diceNormalization.js` — `normalizeDifficultyModifier`, `snapDifficultyModifier`, `normalizeDiceRoll`, `recalcDiceRoll`, `computeNewMomentum`, re-exports `rollD50` from `diceResolver.js`
- `multiplayerAI/systemPrompt.js` — `buildMultiplayerSystemPrompt` + `NEEDS_LABELS` + `buildMultiplayerUnmetNeedsBlock`
- `multiplayerAI/scenePrompt.js` — `buildMultiplayerScenePrompt`
- `multiplayerAI/aiClient.js` — `callAI` (OpenAI → Anthropic fallback + retry) + private `safeParseJSONContent`
- `multiplayerAI/campaignGeneration.js` — `generateMultiplayerCampaign` orchestrator
- `multiplayerAI/sceneGeneration.js` — `generateMultiplayerScene` orchestrator
- `multiplayerAI/compression.js` — `needsCompression`, `compressOldScenes`, `verifyMultiplayerQuestObjective`
- `multiplayerSceneFlow.js` — shared flow used by WS handlers: `runMultiplayerSceneFlow`, `persistMultiplayerCharactersToDB`, `fetchOwnedCharacter`, `calcNextMomentum`, `computeNewMomentum`, `applySceneStateChanges`, `buildArrivalNarrative`

### Single-player AI pipeline
- `sceneGenerator.js` (thin facade, 1L) re-exports `generateSceneStream`
- `sceneGenerator/generateSceneStream.js` — orchestrator (phases: load, intent, shortcuts, pre-roll, context, prompts, streaming, post-process, save, side-effects, complete)
- `sceneGenerator/campaignLoader.js` — `loadCampaignState`: parallel DB load (campaign + NPCs + quests + codex + knowledge) + coreState hydration
- `sceneGenerator/shortcuts.js` — `tryTradeShortcut`, `tryCombatFastPath`, `findCombatTargetNpc`, `generateShortNarrative` (trade intent + combat fast-path early-returns that skip the large model)
- `sceneGenerator/systemPrompt.js` — `buildLeanSystemPrompt` + `buildAnthropicSystemBlocks` (large prompt template, ~400L — cohesive single file per project decision)
- `sceneGenerator/userPrompt.js` — `buildUserPrompt` + `buildPreRollInstructions` (imports `detectCombatIntent` from `shared/domain/`)
- `sceneGenerator/contextSection.js` — `buildContextSection` (formats `assembleContext` output into prompt suffix)
- `sceneGenerator/streamingClient.js` — `callOpenAIStreaming`, `callAnthropicStreaming`, `runTwoStagePipelineStreaming`. `parseAIResponse` re-exported from `shared/domain/aiResponseParser.js` (`parseAIResponseLean`).
- `sceneGenerator/diceResolution.js` — `applyCreativityToRoll`, `isCreativityEligible`, `resolveModelDiceRolls`, `calculateFreeformSkillXP`, `DIFFICULTY_SKILL_XP`
- `sceneGenerator/enemyFill.js` — `fillEnemiesFromBestiary` (enemyHints + name matching)
- `sceneGenerator/processStateChanges.js` — `processStateChanges` (NPCs, knowledge, codex, quests via inline sub-functions) + `generateSceneEmbedding`
- `sceneGenerator/labels.js` — DM settings label helpers + `formatMoney`
- `sceneGenerator/inlineKeys.js` — `getInlineEntityKeys` (used by `assembleContext` to skip entities already inlined in the system prompt)

### Other AI services
- `aiJsonCall.js` — Shared helper for single-shot JSON AI calls (OpenAI + Anthropic non-streaming). Used by `combatCommentary.js`, `objectiveVerifier.js`, `recapGenerator.js`, `storyPromptGenerator.js`. Accepts `userApiKeys` for per-user key resolution via `requireServerApiKey`.
- `combatCommentary.js` — POST /v1/ai/combat-commentary — mid-combat narration + battle cries (single-shot JSON, premium tier)
- `objectiveVerifier.js` — POST /v1/ai/verify-objective — fulfillment classifier (single-shot JSON, low temp)
- `recapGenerator.js` — POST /v1/ai/generate-recap — campaign recap with chunking (25 scenes per chunk) + merge step. Modes: story/dialogue/poem/report.
- `intentClassifier.js` — Two-stage intent classification: heuristic regex (~70%) + nano model fallback. Output: context selection flags for `assembleContext()`. Imports `detectCombatIntent` from `shared/domain/`.
- `aiContextTools.js` — AI function calling tools + `assembleContext()` for two-stage pipeline context assembly
- `memoryCompressor.js` — Post-scene fact extraction via nano model. Running summary after each scene + location summary when player moves
- `aiErrors.js` — Structured AI error handling (`AIServiceError`, `AI_ERROR_CODES`, `parseProviderError`, `toClientAiError`)
- `campaignGenerator.js` — Streaming single-player campaign generator (inline SSE path, NOT via BullMQ — see [[../decisions/bullmq-vs-sse-routes]])
- `storyPromptGenerator.js` — Nano-model story prompt generator with input sanitization

### Dice / mechanics
- `diceResolver.js` — d50 skill check resolution. Exports `rollD50`, `clamp`, `resolveBackendDiceRoll`, `resolveBackendDiceRollWithPreRoll`, `generatePreRolls`, `CREATIVITY_BONUS_MAX`, `SKILL_BY_NAME`, `DIFFICULTY_THRESHOLDS`, `getSkillLevel`
- `rewardResolver.js` — Converts abstract reward tags (`type: 'weapon', rarity: 'uncommon'`) into concrete items/materials/money
- `characterMutations.js` + `characterMutations.test.js` — `applyCharacterStateChanges`, `deserializeCharacterRow`, `characterToPrismaUpdate`. 19 unit tests covering wound clamping, death, xp/level cascade, mana clamping, attribute changes + maxWounds recalc.

### Multiplayer infrastructure
- `roomManager.js` + `roomManager.test.js` — In-memory rooms + Prisma persistence for crash recovery. Exports room lifecycle (`createRoom`, `joinRoom`, `leaveRoom`, `restoreRoom`, `disconnectPlayer`) + state mutation (`updateCharacter`, `updateSettings`, `submitAction`, `approveActions`, `executeSoloAction`, `setPhase`, `setGameState`, `restorePendingActions`) + query (`getRoom`, `listJoinableRooms`, `listUserRooms`, `findSessionInDB`, `sanitizeRoom`) + IO (`broadcast`, `sendTo`, `saveRoomToDB`, `deleteRoomFromDB`, `touchRoom`, `closeAllRoomSockets`).
- `stateValidator.js` — Multiplayer state change validation (separate from FE version — known dedup candidate in post_merge_infra)
- `stateChangeMessages.js` — Human-readable state change messages (`formatMoneyDelta` helper)

### Data & storage
- `embeddingService.js` — OpenAI text-embedding-3-small wrapper
- `vectorSearchService.js` — MongoDB Atlas Vector Search
- `mongoNative.js` — Native MongoDB driver for embeddings (BSON arrays — Prisma can't handle them, see [[../decisions/embeddings-native-driver]])
- `mediaStore.js` — Media storage abstraction (local / GCS)
- `localStore.js` — Local filesystem storage
- `gcpStore.js` — Google Cloud Storage

### Auth & utilities
- `apiKeyService.js` + `apiKeyService.test.js` — API key encryption/decryption (AES-256). Exports `encrypt`, `decrypt`, `resolveApiKey(encryptedUserKeys, keyName)` (per-user precedence with env fallback), `requireServerApiKey(keyName, encryptedKeys?, providerLabel)` (throws 503 if neither configured), `loadUserApiKeys(prisma, userId)` (fetches `User.apiKeys` row).
- `refreshTokenService.js` + `refreshTokenService.test.js` — Opaque random refresh tokens in Redis. Key pattern `user:<userId>:refresh:<tokenId>`, cookie format `<userId>.<tokenId>`, 30d TTL. Exports `issueRefreshToken`, `verifyRefreshToken`, `revokeRefreshToken`, `revokeAllUserRefreshTokens` (SCAN+DEL). Returns null when Redis disabled (caller returns 503).
- `hashService.js` — Content-addressable hashing for media
- `imageResize.js` — Image resizing with Sharp
- `timeUtils.js` — Time/period utilities (`hourToPeriod`, `decayNeeds`)

### Queues + workers
- `services/queues/aiQueue.js` + test — BullMQ per-provider queues (`ai-openai`, `ai-anthropic`, `ai-gemini`, `ai-stability`, `ai-meshy`). Exports `getQueue(provider)`, `enqueueJob(name, data, { provider, userId, jobId? })`, `getJobStatus`, `findJobAcrossQueues`, `closeAllQueues`. Fallback-safe: returns null when `isRedisEnabled()` is false.
- `workers/aiWorker.js` + test — Worker pool (concurrency 4 text / 2 media), handler registry keyed by `job.name`. Registered: `generate-scene` (streaming via Redis pub/sub bridge on channel `scene-job:<jobId>:events`). Dual-mode: in-process (default) or standalone (`WORKER_MODE=1 npm run worker`). Exports `sceneJobChannel(jobId)` helper that must be shared with the route handler.
- `services/redisClient.js` — Singleton ioredis clients. `getRedisClient()` (regular: retries 3, readyCheck on) vs `getBullMQConnection()` (null retries, no ready check — required for BLPOP blocking reads). `isRedisEnabled()`, `pingRedis()`, `closeRedis()`, `getRedisStatus()`.

### Plugins (new in post-merge infra push)
- `plugins/csrf.js` + test — Double-submit cookie CSRF. Opt-in per route via `config: { csrf: true }`. Constant-time compare. Applied to `/v1/auth/refresh` and `/v1/auth/logout`.
- `plugins/idempotency.js` + test — `Idempotency-Key` header support, Redis-backed SET NX claim + 60s pending → 24h completed cache. Opt-in via `config: { idempotency: true }`. 409 on concurrent races, replay with `idempotent-replay: true` header. Opted in on `POST /v1/campaigns`, `POST /v1/ai/campaigns/:id/scenes`, `POST /v1/ai/campaigns/:id/scenes/bulk`.
- `plugins/rateLimitKey.js` + test — Custom keyGenerator for `@fastify/rate-limit`. Returns `u:<userId>` when JWT verifies, `ip:<address>` fallback. Double-verifies JWT because the rate-limit onRequest hook fires before route-level `authenticate` (~100μs HMAC × 2).
- `plugins/bullBoard.js` — Bull-board UI at `/v1/admin/queues`, gated by `fastify.authenticate` + `request.user.admin` (admin flag on User model NOT yet implemented — effectively locked).

## Infrastructure
- `backend/src/lib/prisma.js` — Prisma client singleton
- `backend/src/lib/logger.js` — Shared pino instance (`logger` + `childLogger({ bindings })` helper). JSON output, `LOG_LEVEL` env override.
- `backend/src/middleware/requireAuth.js` — JWT auth middleware
- `backend/src/plugins/auth.js` — Fastify auth plugin
- `backend/src/plugins/cors.js` — CORS plugin + `resolveSseCorsOrigin()` allowlist helper

## Data
- `backend/src/data/equipment/index.js` — Server-side equipment + bestiary exports

## Scripts
- `backend/src/scripts/migrateCoreState.js` — DB migration script
- `backend/src/scripts/createVectorIndexes.js` — Create Atlas Vector Search indexes

## Shared (`shared/`)

### Domain (pure logic, used by FE and BE)
- `domain/arrays.js` — Array helpers (Set add/delete spread → `addToSet`/`removeFromSet`)
- `domain/combatIntent.js` — `detectCombatIntent` + `COMBAT_INTENT_REGEX` (Polish conjugations, weapon-draw patterns, system-tag handling) — used by FE scene state hook, BE `intentClassifier`, BE `sceneGenerator/userPrompt`
- `domain/diceRollInference.js` — `resolveDiceRollAttribute` — maps skill/action text to RPGon attribute
- `domain/ids.js` — `shortId(len)` + `prefixedId(prefix, len)` — single source of short-ID generation
- `domain/luck.js` — `rollLuckCheck(szczescie, rollPercentageFn)` + `isLuckySuccess` — szczescie auto-success mechanic
- `domain/multiplayerState.js` — `applyMultiplayerSceneStateChanges` pipeline
- `domain/pricing.js` — Currency conversion (1 GC = 10 SS = 100 CP) + `normalizeCoins`
- `domain/skills.js` — `getSkillLevel(skills, skillName)` — single source of skill-level lookup
- `domain/stateValidation.js` — Validators for state-change payloads

### Contracts (FE/BE WebSocket messages)
- `contracts/multiplayer.js` — WS message types, `createWsMessage`, `normalizeClientWsType`, `normalizeMultiplayerStateChanges`, `TYPING_DRAFT_MAX_LENGTH`, `WS_SERVER_TYPES`
- `contracts/multiplayer.test.js` — Schema + normalization unit tests

### Map tiles
- `map_tiles/modelCatalog3d.js` — 3D model catalog for tile map rendering

## Test inventory

Backend unit tests (53 total):
- `auth.test.js`
- `campaigns.saveState.test.js` — tests `extractTotalCost` + `stripNormalizedFromCoreState` re-exported from `campaigns.js` facade
- `apiKeyService.test.js`
- `characterMutations.test.js` — 19 tests
- `roomManager.test.js`

Shared contract test:
- `shared/contracts/multiplayer.test.js`
