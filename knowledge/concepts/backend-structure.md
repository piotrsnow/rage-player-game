# Backend Structure — subdomain map

High-level map of `backend/src/` and `shared/`. Not a file-by-file inventory. Each row points at the entry file when you start working on that subdomain.

## Routes

All routes mount under `/v1/*`. Health check at `/health` (outside the `/v1` scope).

- `auth.js` — `/v1/auth/*` (register, login, refresh, logout, /me, /settings, /api-keys). Cookie-based refresh + double-submit CSRF. See [auth.md](auth.md).
- `ai.js` — all AI endpoints (~865L). Simple single-shot (`/generate-story-prompt`, `/combat-commentary`, `/verify-objective`, `/generate-recap`), streaming (`/generate-campaign`, `/campaigns/:id/generate-scene-stream`), job polling (`/jobs/:id`), scene persistence (`/campaigns/:id/scenes`, `/scenes/bulk`, GET `/scenes`, PATCH `/core`). See [scene-generation.md](scene-generation.md) and [patterns/sse-streaming.md](../patterns/sse-streaming.md).
- `characters.js` — Character library CRUD
- `gameData.js` — static game data API (equipment, etc.)
- `media.js` — media upload/serve (local or GCS)
- `music.js` — music generation proxy
- `wanted3d.js` — 3D model request management
- `campaigns.js` — thin facade, registers `campaigns/` submodules: `public.js`, `crud.js`, `sharing.js`, `recaps.js`, `schemas.js`. See [persistence.md](persistence.md).
- `multiplayer.js` — thin facade, registers `multiplayer/` submodules: `http.js` (HTTP), `connection.js` (WS auth + heartbeat + rate limit + dispatcher), `handlers/lobby.js`, `handlers/roomState.js`, `handlers/gameplay.js`, `handlers/quests.js`, `handlers/combat.js`, `handlers/webrtc.js`. See [multiplayer.md](multiplayer.md).
- `proxy/` — `openai.js`, `anthropic.js`, `gemini.js`, `elevenlabs.js`, `stability.js`, `meshy.js`. Centralized upstream API calls with per-user key resolution.

## Services

### Scene generation pipeline

`sceneGenerator.js` (1L facade) → `sceneGenerator/`:

- [generateSceneStream.js](../../backend/src/services/sceneGenerator/generateSceneStream.js) — orchestrator (load, intent, shortcuts, pre-roll, context, prompts, streaming, post-process, save, side effects, complete)
- `campaignLoader.js` — parallel DB load + coreState hydration
- `shortcuts.js` — `tryTradeShortcut`, `tryCombatFastPath` (early-return paths that skip the large model)
- `systemPrompt.js` — `buildLeanSystemPrompt` + `buildAnthropicSystemBlocks`
- `userPrompt.js` — `buildUserPrompt` + `buildPreRollInstructions`
- `contextSection.js` — formats `assembleContext` output into the prompt suffix
- `streamingClient.js` — OpenAI/Anthropic streaming + `runTwoStagePipelineStreaming` + `parseAIResponseLean` re-export
- `diceResolution.js` — `applyCreativityToRoll`, `isCreativityEligible`, `resolveModelDiceRolls`, `calculateFreeformSkillXP`
- `enemyFill.js` — `fillEnemiesFromBestiary`
- `processStateChanges.js` — applies NPCs / knowledge / codex / quests + generates scene embeddings
- `labels.js` — DM settings label helpers + `formatMoney`
- `inlineKeys.js` — `getInlineEntityKeys`

See [scene-generation.md](scene-generation.md).

### Living World

All cross-campaign persistent state + NPC simulation lives in
`backend/src/services/livingWorld/`. Entry points below. For the big
picture see [living-world.md](living-world.md) and
[npc-clone-architecture.md](npc-clone-architecture.md).

- `worldEventLog.js` — `appendEvent`, `forLocation`, `forNpc`
- `worldStateService.js` — `findOrCreateWorldLocation`, `createSublocation`
- `npcAgentLoop.js` — `runNpcTick`, eligibility, action normalization
- `npcTickDispatcher.js` — legacy scene-cadence batch (fallback)
- `globalNpcTriggers.js` — `onLocationEntry`, `onDeadlinePass`, `onCrossCampaignMajor` (event-driven, primary)
- `questGoalAssigner.js` — quest-role inference, goal templates, `generateBackgroundGoal`. Round E Phase 12b: operates on all `CampaignNPC` rows (canonical lookup is opt-in per-row)
- `postCampaignPromotion.js` + `postCampaignPromotionVerdict.js` — post-campaign admin-review promotion pipeline (Round E Phase 12b). Inline `npcPromotion.js` deleted in Slice B — canonical `WorldNPC` rows are never created mid-play anymore
- `postCampaignWriteback.js`, `postCampaignFactExtraction.js`, `postCampaignWorldChanges.js` — post-campaign orchestrator + Phase 11 LLM fact extraction + Phase 12 world-change pipeline (`PendingWorldStateChange` admin queue + HIGH NPC `knowledgeBase` auto-apply)
- `npcLifecycle.js` — pause / resume on player location change
- `companionService.js` — loyalty drift, travel propagation
- `deferredOutbox.js` — companion trip replay
- `reputationService.js` / `reputationHook.js` — scoped reputation
- `travelGraph.js`, `userDiscoveryService.js` — edges + per-user discovery
- `cloneReconciliation.js` — classify clone vs global divergence
- `fameService.js` — `applyFameFromEvent`, `computeFameLabel` (Character-level renown)
- `questAudit.js` — nano backup for "was this side quest major?"
- `dungeonSeedGenerator.js`, `dungeonEntry.js`, `contentLocalizer.js` — Phase 7 deterministic dungeon seeding + localized room text
- `dmMemoryService.js`, `dmMemoryUpdater.js` — Phase 4 DM agent memory
- `topologyGuard.js`, `positionCalculator.js` — sublocation admission + coords

`processStateChanges.js` (in `sceneGenerator/`) is the main consumer —
writes global events, applies fame deltas, runs reconciliation, kicks
the tick triggers.

### AI helpers

- [intentClassifier.js](../../backend/src/services/intentClassifier.js) — Stage 1 of two-stage pipeline (heuristic + nano fallback)
- [aiContextTools.js](../../backend/src/services/aiContextTools.js) — Stage 2 (`assembleContext`) + legacy tool-use definitions
- [memoryCompressor.js](../../backend/src/services/memoryCompressor.js) — post-scene nano: running summary facts + state extraction (journal, knowledge, codex, worldFacts, needs) in a single call + location summaries + quest objective checks
- [aiJsonCall.js](../../backend/src/services/aiJsonCall.js) — shared single-shot JSON call helper (OpenAI + Anthropic non-streaming) with per-user key resolution
- [aiErrors.js](../../backend/src/services/aiErrors.js) — `AIServiceError`, `AI_ERROR_CODES`, `parseProviderError`, `toClientAiError`

### Single-shot AI services

- [combatCommentary.js](../../backend/src/services/combatCommentary.js) — mid-combat narration + battle cries
- [objectiveVerifier.js](../../backend/src/services/objectiveVerifier.js) — quest objective fulfillment classifier (low temp)
- [recapGenerator.js](../../backend/src/services/recapGenerator.js) — campaign recap with chunking (25 scenes/chunk) + merge. Modes: story / dialogue / poem / report.
- [storyPromptGenerator.js](../../backend/src/services/storyPromptGenerator.js) — nano-model premise generator

### Multiplayer AI pipeline

`multiplayerAI.js` (7L facade) → `multiplayerAI/`:

- `aiClient.js` — `callAI` with OpenAI → Anthropic fallback + retry
- `systemPrompt.js` — `buildMultiplayerSystemPrompt` + needs block helpers
- `scenePrompt.js` — `buildMultiplayerScenePrompt`
- `campaignGeneration.js` — `generateMultiplayerCampaign`
- `sceneGeneration.js` — `generateMultiplayerScene`
- `compression.js` — `needsCompression`, `compressOldScenes`, `verifyMultiplayerQuestObjective`
- `diceNormalization.js` — `normalizeDifficultyModifier`, `snapDifficultyModifier`, `normalizeDiceRoll`, `recalcDiceRoll`, `computeNewMomentum`
- [multiplayerSceneFlow.js](../../backend/src/services/multiplayerSceneFlow.js) — shared flow: `runMultiplayerSceneFlow`, `persistMultiplayerCharactersToDB`, `fetchOwnedCharacter`, `applySceneStateChanges`, `buildArrivalNarrative`

See [multiplayer.md](multiplayer.md).

### Campaign serialization / persistence

- [campaignSerialize.js](../../backend/src/services/campaignSerialize.js) — pure helpers: `extractTotalCost`, `stripNormalizedFromCoreState`, `SCENE_CLIENT_SELECT`, `dedupeScenesByIndexAsc`, `buildDistinctSceneCountMap`
- [campaignSync.js](../../backend/src/services/campaignSync.js) — DB side effects: `withRetry` (P2034/P2028 retry), `fetchCampaignCharacters`, `syncNPCsToNormalized`, `syncKnowledgeToNormalized`, `syncQuestsToNormalized`, `reconstructFromNormalized`
- [campaignRecap.js](../../backend/src/services/campaignRecap.js) — recap cache helpers
- [campaignGenerator.js](../../backend/src/services/campaignGenerator.js) — streaming single-player campaign generator

### Dice / mechanics

- [diceResolver.js](../../backend/src/services/diceResolver.js) — d50 skill check resolution: `rollD50`, `clamp`, `resolveBackendDiceRoll`, `resolveBackendDiceRollWithPreRoll`, `generatePreRolls`, `CREATIVITY_BONUS_MAX`, `SKILL_BY_NAME`, `DIFFICULTY_THRESHOLDS`, `getSkillLevel`
- [rewardResolver.js](../../backend/src/services/rewardResolver.js) — abstract reward tags → concrete items/materials/money
- [characterMutations.js](../../backend/src/services/characterMutations.js) — `applyCharacterStateChanges`, `deserializeCharacterRow`, `characterToPrismaUpdate` (+ test)

### Room management (multiplayer)

- [roomManager.js](../../backend/src/services/roomManager.js) — in-memory `Map<roomCode, room>` + Prisma persistence for crash recovery. Room lifecycle, state mutation, query, IO (broadcast/sendTo/etc.). (+ test)

### State validation (MP path)

- [stateValidator.js](../../backend/src/services/stateValidator.js) — `validateMultiplayerStateChanges` using shared helpers from `shared/domain/stateValidation.js`
- [stateChangeMessages.js](../../backend/src/services/stateChangeMessages.js) — human-readable messages + `formatMoneyDelta`

### Data & storage

- [embeddingService.js](../../backend/src/services/embeddingService.js) — OpenAI text-embedding-3-small wrapper with L1 + L2 (Redis) cache
- [vectorSearchService.js](../../backend/src/services/vectorSearchService.js) — Atlas Vector Search
- [mongoNative.js](../../backend/src/services/mongoNative.js) — native MongoDB driver for embeddings (BSON arrays that Prisma can't represent)
- [mediaStore.js](../../backend/src/services/mediaStore.js) — media storage abstraction
- [localStore.js](../../backend/src/services/localStore.js), [gcpStore.js](../../backend/src/services/gcpStore.js)
- [hashService.js](../../backend/src/services/hashService.js) — content-addressable hashing
- [imageResize.js](../../backend/src/services/imageResize.js) — Sharp-based resize
- [timeUtils.js](../../backend/src/services/timeUtils.js) — `hourToPeriod`, `decayNeeds`

### Auth

- [apiKeyService.js](../../backend/src/services/apiKeyService.js) — AES-256 key encryption, `encrypt`, `decrypt`, `resolveApiKey`, `requireServerApiKey`, `loadUserApiKeys` (+ test)
- [refreshTokenService.js](../../backend/src/services/refreshTokenService.js) — opaque refresh tokens in Redis, O(1) revoke (+ test)

### Queues + workers

- [services/queues/aiQueue.js](../../backend/src/services/queues/aiQueue.js) — per-provider BullMQ queues (`ai-openai`, `ai-anthropic`, `ai-gemini`, `ai-stability`, `ai-meshy`). `getQueue`, `enqueueJob`, `getJobStatus`, `findJobAcrossQueues`, `closeAllQueues`. Redis-off safe.
- [workers/aiWorker.js](../../backend/src/workers/aiWorker.js) — worker pool + handler registry by `job.name`. Registered: `generate-scene`, `generate-campaign` (both stream via pub/sub bridge). Dual mode: in-process (default) or standalone (`WORKER_MODE=1`). Exports `sceneJobChannel`, `campaignJobChannel`.
- [services/redisClient.js](../../backend/src/services/redisClient.js) — singleton ioredis clients. `getRedisClient()` (regular: retries 3, readyCheck on) vs `getBullMQConnection()` (null retries, no ready check — for BLPOP). `isRedisEnabled`, `pingRedis`, `closeRedis`, `getRedisStatus`.

See [patterns/bullmq-queues.md](../patterns/bullmq-queues.md).

### Plugins

- [plugins/csrf.js](../../backend/src/plugins/csrf.js) — double-submit cookie CSRF. Opt-in via `config: { csrf: true }`. Constant-time compare.
- [plugins/idempotency.js](../../backend/src/plugins/idempotency.js) — `Idempotency-Key` header, Redis-backed SET NX + 60s pending → 24h completed cache. Opt-in via `config: { idempotency: true }`. 409 on concurrent races, replay with `idempotent-replay: true`.
- [plugins/rateLimitKey.js](../../backend/src/plugins/rateLimitKey.js) — custom keyGenerator for `@fastify/rate-limit`. Returns `u:<userId>` when JWT verifies, `ip:<address>` fallback.
- [plugins/bullBoard.js](../../backend/src/plugins/bullBoard.js) — bull-board UI at `/v1/admin/queues`, gated by `authenticate` + `admin` claim. Admin flag not yet on User model → effectively locked.
- [plugins/auth.js](../../backend/src/plugins/auth.js) — JWT plugin + `fastify.authenticate` decorator
- [plugins/cors.js](../../backend/src/plugins/cors.js) — CORS + `resolveSseCorsOrigin()` allowlist for SSE raw writes

### Infrastructure

- [backend/src/lib/prisma.js](../../backend/src/lib/prisma.js) — Prisma client singleton
- [backend/src/lib/logger.js](../../backend/src/lib/logger.js) — pino + `childLogger({ bindings })`
- [backend/src/middleware/requireAuth.js](../../backend/src/middleware/requireAuth.js) — JWT middleware
- [backend/src/server.js](../../backend/src/server.js) — boot: plugin registration, queue startup, graceful shutdown ordering (rooms → sockets → workers → queues → redis → fastify)

## Data

- `backend/src/data/equipment/` — server-side equipment + bestiary. `index.js` exports `searchBestiary`, `selectBestiaryEncounter`, `getBestiaryLocationSummary`, `applyAttributeVariance`, `THREAT_COSTS`. See [bestiary.md](bestiary.md).

## Scripts

- `backend/src/scripts/createVectorIndexes.js` — one-time: creates Atlas Vector Search indexes
- `backend/src/scripts/migrateCoreState.js` — DB migration script (ad hoc)

## Shared (`shared/`)

Pure logic used by both FE and BE. No React, no fastify. Safe to import from either side.

### `shared/domain/`

- [combatIntent.js](../../shared/domain/combatIntent.js) — `detectCombatIntent` + `COMBAT_INTENT_REGEX` (Polish conjugations, weapon-draw patterns)
- [combatXp.js](../../shared/domain/combatXp.js) — `computeCombatCharXp`
- [diceRollInference.js](../../shared/domain/diceRollInference.js) — `resolveDiceRollAttribute`
- [ids.js](../../shared/domain/ids.js) — `shortId(len)` + `prefixedId(prefix, len)`
- [luck.js](../../shared/domain/luck.js) — `rollLuckCheck`, `isLuckySuccess`
- [multiplayerState.js](../../shared/domain/multiplayerState.js) — `applyMultiplayerSceneStateChanges` pipeline
- [pricing.js](../../shared/domain/pricing.js) — currency conversion (1 ZK = 20 SK = 240 MK) + `normalizeCoins`
- [skills.js](../../shared/domain/skills.js) — `getSkillLevel(skills, skillName)`
- [stateValidation.js](../../shared/domain/stateValidation.js) — 12 validators + `STATE_CHANGE_LIMITS`
- [safeLocation.js](../../shared/domain/safeLocation.js) — `isSafeLocation` + `SAFE_LOCATION_RE` (character-to-campaign lock release check)
- [dialogueRepair.js](../../shared/domain/dialogueRepair.js) — single source of truth for dialogue repair (hardDedupe, fuzzy name matching, player reattribution, generic-speaker safe-mode)
- [fallbackActions.js](../../shared/domain/fallbackActions.js) — fallback suggested actions. BE entry `ensureSuggestedActions`, FE entry `postProcessSuggestedActions`
- [aiResponseParser.js](../../shared/domain/aiResponseParser.js) — `parseAIResponseLean` (shared by `streamingClient.js` and FE scene hook)
- [achievementTracker.js](../../shared/domain/achievementTracker.js) — achievement state machine (shared between FE and BE)
- [arrays.js](../../shared/domain/arrays.js) — `addToSet`, `removeFromSet`

### `shared/contracts/`

- [multiplayer.js](../../shared/contracts/multiplayer.js) — WS message schemas, `createWsMessage`, `normalizeClientWsType`, `normalizeMultiplayerStateChanges`, `TYPING_DRAFT_MAX_LENGTH`, `WS_SERVER_TYPES`

### `shared/map_tiles/`

- `modelCatalog3d.js` — 3D model catalog for tile map rendering

## Entry-point cheat sheet

| Task | Start here |
|---|---|
| Scene generation change | [backend/src/services/sceneGenerator/generateSceneStream.js](../../backend/src/services/sceneGenerator/generateSceneStream.js) |
| Intent classifier tuning | [backend/src/services/intentClassifier.js](../../backend/src/services/intentClassifier.js) |
| Context assembly | [backend/src/services/aiContextTools.js](../../backend/src/services/aiContextTools.js) `assembleContext` |
| New AI single-shot endpoint | Add handler in `ai.js` + service via `aiJsonCall.js` |
| New WS message | Add handler in `multiplayer/handlers/<group>.js`, register in `connection.js` dispatcher `HANDLERS` map |
| Queue / worker change | [backend/src/services/queues/aiQueue.js](../../backend/src/services/queues/aiQueue.js), [backend/src/workers/aiWorker.js](../../backend/src/workers/aiWorker.js) |
| Auth flow | [backend/src/routes/auth.js](../../backend/src/routes/auth.js) + [backend/src/services/refreshTokenService.js](../../backend/src/services/refreshTokenService.js) |
| SSE plumbing | [backend/src/routes/ai.js](../../backend/src/routes/ai.js) `writeSseHead` + [patterns/sse-streaming.md](../patterns/sse-streaming.md) |
| Bestiary / encounter | [backend/src/data/equipment/bestiary.js](../../backend/src/data/equipment/bestiary.js) + `sceneGenerator/enemyFill.js` |
