# Scene Generation Pipeline

The single most important subsystem. When scene generation breaks, most of the game breaks. Read this before touching anything in `backend/src/services/sceneGenerator/` or `src/hooks/sceneGeneration/`.

## High-level flow

```
Frontend: useSceneGeneration.generateScene(playerAction)
  ├── resolveMechanics()          ← deterministic d50/combat/magic on the FE
  ├── useSceneBackendStream       ← opens SSE to POST /v1/ai/campaigns/:id/generate-scene-stream
  └── applySceneStateChanges()    ← on complete, dispatches stateChanges + XP + achievements

Backend route: POST /v1/ai/campaigns/:id/generate-scene-stream
  ├── writeSseHead(request, reply) ← SSE headers, hijack, manual CORS
  └── generateSceneStream(campaignId, action, opts, onEvent)  ← inline (no Redis/BullMQ)
        └── onEvent forwards each event to reply.raw as data: {...}\n\n
```

Post-scene async work (embedding, NPC/quest sync, memory compression, location summary,
NPC tick batch) runs **after** the SSE complete event:
- **Prod**: enqueued via `enqueuePostSceneWork(payload)` to a Google Cloud Tasks queue,
  which calls `POST /v1/internal/post-scene-work` (OIDC-authenticated).
- **Dev**: same `enqueuePostSceneWork` runs the handler inline (fire-and-forget).

**`firstScene` runs through the same post-scene pipeline.** The intro scene authored by `campaignGenerator` never touches `generateSceneStream` — it lands in `CampaignScene` via `POST /v1/ai/campaigns/:id/scenes/bulk` right after campaign creation. The bulk save endpoint in [routes/ai/scenes.js](../../backend/src/routes/ai/scenes.js) detects a freshly-CREATED `sceneIndex=0` (not an update) and fires `enqueuePostSceneWork` for it with `playerAction=''` + `prevLoc=null` + `newLoc=Campaign.currentLocationName`. Without this hook, scene 1's prompt has no compressed facts about the opening (the questgiver re-greets the player from scratch). Detection is gated on "first save of sceneIndex=0" so re-saves / scene edits don't re-fire nano.

See [decisions/cloud-run-no-redis.md](../decisions/cloud-run-no-redis.md) for why there's
no BullMQ/Redis in this pipeline.

## Phases inside `generateSceneStream`

File: [backend/src/services/sceneGenerator/generateSceneStream.js](../../backend/src/services/sceneGenerator/generateSceneStream.js) (~415L, orchestrator).

| # | Phase | Implementation |
|---|---|---|
| 1 | Load campaign state | `loadCampaignState(campaignId)` → parallel DB fetch (Campaign + NPCs + Quests + Codex + Knowledge), hydrates `coreState` |
| 2 | Intent classification | `classifyIntent(action, ...)` → heuristic regex first (~70% free), falls back to nano model for freeform |
| 3 | Trade shortcut | `tryTradeShortcut(intentResult, coreState, dbNpcs)` → if matched, emit `complete` and return (skips large model) |
| 4 | Combat fast-path | `tryCombatFastPath(...)` → same shape, handles trivial "clear combat" outcomes |
| 5 | Generate pre-rolled dice | `generatePreRolls()` → up to 3 d50 values for the large model to self-resolve checks the nano missed |
| 6 | Assemble context | `assembleContext(campaignId, selectionResult, currentLocation, skipKeys)` → parallel DB queries for the categories the intent classifier asked for |
| 7 | Build prompts | `buildLeanSystemPrompt()` + `buildUserPrompt()` + `buildPreRollInstructions()` + `buildContextSection()` |
| 8 | Streaming large model call | `runTwoStagePipelineStreaming()` — streams chunks via `onEvent({type:'chunk', text})` |
| 9 | Post-parse | Backend parses the final JSON (`parseAIResponseLean`), validates via shared schemas, reconciles dice rolls, fills enemy stats from bestiary, processes state changes (incl. `currentLocation` match-or-drop via [`processCurrentLocationChange`](../../backend/src/services/sceneGenerator/processStateChanges/index.js) — AI emits the destination NAME after travel montage, BE resolves to canonical/sandbox row and writes `Campaign.currentLocation{Name,Kind,Id}`; unrecognized names are dropped, AI never creates locations mid-play) |
| 10 | Side effects (async, best-effort) | `compressSceneToSummary()` (facts + journal/knowledge/codex/worldFacts/needs extraction), `generateLocationSummary()` (on location change), `generateSceneEmbedding()`. Nano-extracted knowledge/codex is persisted via `processStateChanges()` in phase 2 of postSceneWork. Quest objective auto-completion is deterministic — when all objectives are marked done, the quest is auto-completed by the FE handler + BE `processQuestObjectiveUpdates()`. |
| 11 | Complete event | `onEvent({type:'complete', data:{scene, sceneIndex, sceneId}})` |

## SSE event shapes

The stream is forwarded verbatim from worker → pub/sub → route → client. The frontend parser lives in [src/services/ai/service.js](../../src/services/ai/service.js) `generateSceneViaBackendStream`.

```
data: {"type":"intent","data":{"intent":"explore","selection":{...}}}
data: {"type":"context_ready","data":{}}
data: {"type":"dice_early","data":{"diceRoll":{...}}}
data: {"type":"chunk","text":"<partial JSON fragment>"}
data: {"type":"complete","data":{"scene":{...},"sceneIndex":N,"sceneId":"..."}}
data: {"type":"error","error":"message","code":"LLM_TIMEOUT"}
```

Parser rules:

- Reads line-by-line. Only `data: ` prefixed lines are consumed; `event: ` lines are ignored.
- Breaks out of the read loop on `complete`. No post-complete events are emitted.
- Throws `Stream ended without complete event` if the stream closes without `complete`. Tests that exercise error paths should emit `{type:'error', error, code}` instead of closing.
- `chunk.text` is accumulated into `rawAccumulated` and progressively parsed for partial narrative reveal in ChatPanel.

See [patterns/sse-streaming.md](../patterns/sse-streaming.md) for the `writeSseHead` invariants and Playwright mock format.

## LLM timeouts

User-tunable via DM Settings (`llmPremiumTimeoutMs` default 45000, `llmNanoTimeoutMs` default 15000). Bounds scene-gen tail latency when a provider hangs.

- **Premium timeout** → SSE `error` event with `code: 'LLM_TIMEOUT'` + `phase: 'scene_generation'`. Client shows error.
- **Nano timeout** → silent fallback. Intent classifier returns heuristic-only selection; memory compressor skips post-scene summary; quest objective check returns `null`. Scene still generates.

Every backend LLM call site accepts an optional `AbortController` signal:

- `streamingClient.js` (premium wrap)
- `intentClassifier.js` (nano fallback)
- `memoryCompressor.js` (post-scene facts + location summary + quest objectives)

When adding a new LLM call, thread an abort signal through and test both premium + nano timeout paths.

## Frontend hook surface

[src/hooks/sceneGeneration/](../../src/hooks/sceneGeneration/) — split into 4 files:

- [useSceneGeneration.js](../../src/hooks/sceneGeneration/useSceneGeneration.js) — orchestrator; owns the duration-history estimator for the progress bar; calls `resolveMechanics` first, then opens the stream
- [useSceneBackendStream.js](../../src/hooks/sceneGeneration/useSceneBackendStream.js) — owns `streamingNarrative`, `earlyDiceRoll`, `streamPartials` state + the SSE reader lifecycle
- [processSceneDialogue.js](../../src/hooks/sceneGeneration/processSceneDialogue.js) — dialogue repair pipeline (single source of truth shared with BE via `shared/domain/dialogueRepair.js`)
- [applySceneStateChanges.js](../../src/hooks/sceneGeneration/applySceneStateChanges.js) — validates + dispatches + applies XP + achievements + quest updates

## When debugging scene generation

Check in this order:

1. **Is the frontend even reaching the backend?** Network tab for `/generate-scene-stream`. If it's failing fast, the mechanics resolver or stream setup is the problem.
2. **SSE events arriving?** Watch the `data: {...}` lines. If only `intent` + `context_ready` land and then nothing, the large model is hanging — check LLM timeout (DM Settings `llmPremiumTimeoutMs`) and provider status. There's no queue dashboard since the route runs inline (no BullMQ/Redis).
3. **Parse errors in console?** `parseAIResponseLean` failed — the large model returned malformed JSON. Check the accumulated chunks for truncation; the Zod schema errors in `src/services/aiResponse/` usually name the failing field.
4. **`stateChanges` applied but something missing?** `applySceneStateChanges.js` → handlers in `src/stores/handlers/` → validator in `src/services/stateValidator.js` + `shared/domain/stateValidation.js`.
5. **Dice roll wrong?** Nano intent classifier resolved it → pre-roll reconciliation in `diceResolution.js`. See [rpgon-mechanics.md](rpgon-mechanics.md).
6. **Fast-path misfired?** `shortcuts.js` — tryTradeShortcut/tryCombatFastPath are handed off via `{handled, result}` contract. If `handled: true`, the large model never runs.

## Gotchas

- **`coreState` is native JSONB in Postgres** (Prisma `Json` type) — round-trips as a JS object, no `JSON.parse` needed at boundaries. `loadCampaignState` consumes it directly.
- **Quest auto-completion is deterministic.** When `questUpdates` marks all objectives done, both FE handler and BE `processQuestObjectiveUpdates` auto-complete the quest. No nano safety-net — manual `verifyQuestObjective` is the player-facing fallback.
- **Backend is the sole AI path.** Don't reintroduce a FE-direct dispatch path. Per-user keys flow through: `loadUserApiKeys(prisma, userId)` → `userApiKeys` option → `requireServerApiKey(keyName, userApiKeys, label)`.
- **`sceneGenerator.js` (1L) is a thin facade** re-exporting `generateSceneStream`. Don't add logic there.

## Related

- [ai-context-assembly.md](ai-context-assembly.md) — intent classifier + assembleContext + memory compression
- [rpgon-mechanics.md](rpgon-mechanics.md) — dice, combat, magic, the pre-roll fallback
- [persistence.md](persistence.md) — coreState shape, normalized collections, save queue
- [patterns/bullmq-queues.md](../patterns/bullmq-queues.md) — the queue + pub/sub bridge
- [patterns/sse-streaming.md](../patterns/sse-streaming.md) — `writeSseHead` invariants
- [decisions/two-stage-pipeline.md](../decisions/two-stage-pipeline.md) — why context-selection over tool-use
