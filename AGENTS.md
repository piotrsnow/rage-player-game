# RPGON / Nikczemny Krzemuch — AI RPG game on a custom d50 system

## Stack

- **Frontend**: React 18 + Vite 6, Tailwind CSS, React Three Fiber (3D scenes), i18next, Zod 4
- **Backend**: Fastify 5, Prisma (MongoDB), JWT + refresh cookies, WebSocket (multiplayer), BullMQ (Valkey/Redis)
- **Database**: MongoDB Atlas (normalized collections + Atlas Vector Search)
- **AI**: OpenAI (GPT-5.4/mini/nano, 4.1/mini/nano, 4o/mini, o3/o4-mini) + Anthropic (Claude Sonnet 4, Haiku 4.5) + Google Gemini. Nano/standard/premium tiering via `src/services/ai/models.js`.
- **3D**: Three.js / React Three Fiber — procedural scene rendering with GLB model support
- **Media**: Sharp (image resize), ElevenLabs (TTS), Stability AI (scene images), Meshy (3D models), GCP Storage
- **Testing**: Vitest (unit), Playwright (e2e)
- **Shared**: `shared/` — domain logic and contracts used by both frontend and backend

## Commands

- `npm run dev` — `docker compose up --build --watch`: boots backend :3001 + valkey, auto-restarts backend on changes in `backend/src` / `shared`, rebuilds image on package.json or frontend `src/` changes. MongoDB is Atlas-only (`DATABASE_URL` SRV string required in `.env`).
- `npm run dev:down` — `docker compose down`
- `npm run dev:logs` — tail backend container logs
- `npm run dev:frontend` — `vite` with HMR on :5173 (Playwright E2E + fast FE iteration alongside watched backend)
- `npm run build` — Vite production build
- `npm test` — Vitest unit tests
- `npm run test:e2e` — Playwright e2e tests
- `cd backend && npm run db:push` — push Prisma schema to MongoDB
- `cd backend && npx prisma generate` — regenerate Prisma client

## Conventions

- ES Modules everywhere (`"type": "module"`)
- No ESLint/Prettier config — use sensible defaults
- Polish language in UI (i18next), English in code/comments
- No TypeScript — plain JavaScript with `.jsx` extensions
- React: functional components only, hooks for all logic
- State: Zustand store (`src/stores/gameStore.js`) with Immer-based reducer handlers, granular selectors. Legacy `useGame()` facade in `GameContext.jsx`.
- AI responses: always validated with Zod before dispatch
- Game mechanics: engines in `src/services/*Engine.js`, data in `src/data/rpg*.js`, deterministic helpers in `src/services/mechanics/`
- Styling: Tailwind utility classes, dark theme with glassmorphism (`backdrop-blur`, `bg-opacity`)
- File naming: React components `PascalCase.jsx`, services/hooks/data `camelCase.js`, tests `*.test.js` next to source
- Embeddings stored as native BSON arrays via mongodb driver (not Prisma)
- JSON fields stored as strings in Prisma (MongoDB limitation), parsed on read

## Architecture overview

### Frontend (`src/`)

- **State** — Zustand store + Immer handlers in `src/stores/`. Non-game contexts (Settings, Multiplayer, Music, Modals) stay on React Context.
- **Hooks** — scene generation (`src/hooks/sceneGeneration/`), combat (4 pure-factory hooks), narration, campaign lifecycle, image repair, summary modal, viewer mode, multiplayer glue.
- **Services** — AI dispatch (`src/services/ai/`), AI response parsing (`src/services/aiResponse/`), game engines (combat/magic/trade/crafting/alchemy), deterministic mechanics (`mechanics/`), storage/sync (`storage.js`), API client (`apiClient.js`), field map (`fieldMap/`).
- **Components** — `GameplayPage` orchestrates panels (Scene, Action, Chat, Combat, Magic, Trade, Party). Character sheet, campaign creator, lobby, gallery, multiplayer, settings, 3D scene rendering (`Scene3D/`).
- **Data** — RPGon rules (`rpgSystem.js`, `rpgMagic.js`, `rpgFactions.js`), equipment, achievements, 3D prefabs.

### Backend (`backend/`)

- **Routes** — `/v1/auth` (cookie refresh flow), campaigns CRUD (split), characters, `ai.js` (scene SSE + campaign SSE + single-shots + job polling), game data, media, multiplayer WebSocket (split), proxy endpoints (OpenAI/Anthropic/Gemini/ElevenLabs/Stability/Meshy). All under `/v1/*`; `/health` at root.
- **Services** — scene generation pipeline (`sceneGenerator/`), intent classification, context assembly (`aiContextTools.js`), memory compression, shared `aiJsonCall.js` for single-shot calls, multiplayer AI pipeline (`multiplayerAI/`), vector search, room manager, media storage.
- **Infrastructure** — `redisClient.js` (regular + BullMQ connections), `queues/aiQueue.js` (per-provider BullMQ queues), `workers/aiWorker.js` (handler registry with pub/sub bridge for streaming jobs), `plugins/csrf.js`, `plugins/idempotency.js`, `plugins/rateLimitKey.js`, `plugins/bullBoard.js`, `refreshTokenService.js`.

### Database (MongoDB via Prisma)

| Model | Purpose |
|---|---|
| `User` | Auth, encrypted API keys, settings |
| `Campaign` | `coreState` (lean JSON string), metadata |
| `CampaignScene/NPC/Knowledge/Codex/Quest` | Normalized with Atlas Vector Search embeddings |
| `Character` | Reusable character library (with campaign lock fields) |
| `MultiplayerSession` | Room state backup for crash recovery |
| `MediaAsset` | User-generated images/music/TTS |
| `PrefabAsset` / `Wanted3D` | 3D model catalog |
| `Achievement` | Per-user unlocked achievements |

## AI pipeline (summary)

Every scene generation goes through a two-stage pipeline: nano model selects what context is needed, backend assembles it in parallel, premium model runs once with a lean prompt (~3.5-7k tokens).

```
Player action
  → [FE] resolveMechanics()                    — deterministic d50/combat/magic
  → [FE] useSceneGeneration → SSE stream       — POST /v1/ai/campaigns/:id/generate-scene-stream
  → [BE route] writeSseHead + BullMQ enqueue   — pre-generated jobId, subscribe-before-enqueue
  → [Worker] generateSceneStream phases:
      1. load campaign state (parallel DB)
      2. classifyIntent (heuristic → nano)
      3. tryTradeShortcut / tryCombatFastPath (early return)
      4. generatePreRolls (3 d50 values for fallback)
      5. assembleContext (parallel DB for selected categories)
      6. build prompts + runTwoStagePipelineStreaming (premium)
      7. parse + validate + reconcile dice + fill enemies + process state changes
      8. post-scene async: compress facts, location summary, quest objectives, embedding
  → [FE] applySceneStateChanges → stateValidator → gameDispatch
```

Full detail: [knowledge/concepts/scene-generation.md](knowledge/concepts/scene-generation.md).

### Design principles

1. **Context selection over tool calling** — nano picks, code assembles, premium runs once. Not a loop.
2. **Game state over history** — structured state in the prompt, not raw scene history.
3. **Bounded memory compression** — 15-fact cap per campaign → stable ~7k input regardless of length.
4. **Nano for planning** — intent, fact extraction, skill inference, quest checks. Premium is for narration only.

### RPGon game system

Custom d50 system (not WFRP). Full spec: [RPG_SYSTEM.md](RPG_SYSTEM.md). Code pointer: [knowledge/concepts/rpgon-mechanics.md](knowledge/concepts/rpgon-mechanics.md).

- **Dice:** d50 vs `attribute + skill + modifiers`. Roll 1 = crit success, roll 50 = crit failure.
- **Attributes:** 6 stats 1-25 (`sila`, `inteligencja`, `charyzma`, `zrecznosc`, `wytrzymalosc`, `szczescie`). Baseline character: all 1 except szczęście (0).
- **Skills:** ~31 skills, each tied to one attribute, levels 0-25.
- **Magic:** 9 spell trees, mana-based, spells from scrolls, 1-5 mana per spell.
- **Combat:** d50-based, `damage = Siła + weapon - Wytrzymałość - AP`, margin instead of SL.
- **Szczęście:** attribute value IS the % chance of auto-success on any roll.
- **Currency:** 3-tier Korona (ZK/SK/MK), `1 ZK = 20 SK = 240 MK`.
- **Character identity:** titles unlocked from achievements; no careers/classes.

## Knowledge base — `knowledge/`

**When working on a subsystem, read the relevant knowledge file first.** CLAUDE.md is kept terse on purpose; knowledge files expand on the why and how.

### Concepts — subsystems

- `knowledge/concepts/scene-generation.md` — two-stage pipeline, SSE events, LLM timeouts, debugging order
- `knowledge/concepts/ai-context-assembly.md` — intent classifier, `assembleContext`, memory compression
- `knowledge/concepts/game-state.md` — Zustand store + handlers + selectors
- `knowledge/concepts/persistence.md` — `coreState`, normalized collections, save queue, idempotency, char lock
- `knowledge/concepts/combat-system.md` — d50 resolution, hooks, solo vs MP flow
- `knowledge/concepts/multiplayer.md` — host-owned state, WS handlers, room manager
- `knowledge/concepts/auth.md` — cookie refresh + JWT + CSRF + per-user keys
- `knowledge/concepts/rpgon-mechanics.md` — d50, pre-rolled dice fallback, state change limits
- `knowledge/concepts/bestiary.md` — encounter budget, fast-path combat, disposition guard
- `knowledge/concepts/model-tiering.md` — nano / standard / premium tiers
- `knowledge/concepts/frontend-structure.md` — `src/` subdomain map + entry-point cheat sheet
- `knowledge/concepts/backend-structure.md` — `backend/` + `shared/` subdomain map + entry-point cheat sheet

### Patterns — reusable code shapes

- `knowledge/patterns/sse-streaming.md` — **MANDATORY** before touching any SSE route
- `knowledge/patterns/bullmq-queues.md` — per-provider queues, pub/sub bridge, dual-mode workers
- `knowledge/patterns/zustand-facade.md` — facade + granular selectors
- `knowledge/patterns/pure-lift-refactoring.md` — lift ladder for components, thin-facade split for backend
- `knowledge/patterns/hook-pure-factory-testing.md` — **MANDATORY** before writing hook tests
- `knowledge/patterns/e2e-campaign-seeding.md` — **MANDATORY** before writing Playwright specs that need a loaded campaign
- `knowledge/patterns/backend-proxy.md` — backend is the sole AI dispatch path

### Decisions — settled debates

- `knowledge/decisions/two-stage-pipeline.md` — nano selection + code assembly (not tool calling)
- `knowledge/decisions/no-byok.md` — backend is the sole AI dispatch path
- `knowledge/decisions/bullmq-vs-sse-routes.md` — BullMQ + pub/sub bridge + SSE (not poll-only)
- `knowledge/decisions/atlas-only-no-local-mongo.md` — Atlas SRV everywhere
- `knowledge/decisions/embeddings-native-driver.md` — native MongoDB driver for BSON arrays
- `knowledge/decisions/rpgon-custom-system.md` — custom d50 system, not WFRP
- `knowledge/decisions/currency-three-tier-pl.md` — ZK/SK/MK exchange rates
- `knowledge/decisions/titles-from-achievements.md` — character identity via titles

### Ideas — future concepts (not adopted)

**If you recommend something from `knowledge/ideas/`, ALWAYS name the file path** (e.g. `knowledge/ideas/autonomous-npcs.md`) so the user knows to read it before deciding. These are sketches with "when it becomes relevant" triggers — never act on them as if they were decided patterns.

Current ideas (all from a `gradient-bang` review): async-tool-pattern, autonomous-npcs, combat-auto-resolve, declarative-event-routing, deferred-event-batching, prompt-fragment-system. See [knowledge/ideas/README.md](knowledge/ideas/README.md).

## Critical-path files (when in doubt, start here)

| Task | Entry file |
|---|---|
| Scene generation bug | [backend/src/services/sceneGenerator/generateSceneStream.js](backend/src/services/sceneGenerator/generateSceneStream.js) |
| Scene gen FE orchestration | [src/hooks/sceneGeneration/useSceneGeneration.js](src/hooks/sceneGeneration/useSceneGeneration.js) |
| AI context selection | [backend/src/services/intentClassifier.js](backend/src/services/intentClassifier.js) + [aiContextTools.js](backend/src/services/aiContextTools.js) |
| AI response validation | [src/services/stateValidator.js](src/services/stateValidator.js) + [shared/domain/stateValidation.js](shared/domain/stateValidation.js) |
| State change application | [src/stores/handlers/applyStateChangesHandler.js](src/stores/handlers/applyStateChangesHandler.js) |
| Combat mechanics | [src/services/combatEngine.js](src/services/combatEngine.js) |
| Save/load | [src/services/storage.js](src/services/storage.js) |
| Multiplayer WS | [backend/src/routes/multiplayer/connection.js](backend/src/routes/multiplayer/connection.js) + `handlers/` |
| Auth flow | [src/services/apiClient.js](src/services/apiClient.js) + [backend/src/routes/auth.js](backend/src/routes/auth.js) |
| BullMQ queues | [backend/src/services/queues/aiQueue.js](backend/src/services/queues/aiQueue.js) + [workers/aiWorker.js](backend/src/workers/aiWorker.js) |
| SSE routes | [backend/src/routes/ai.js](backend/src/routes/ai.js) `writeSseHead` |
| Prisma schema | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) |
| RPGon rules | [src/data/rpgSystem.js](src/data/rpgSystem.js) |

## Known gaps / technical debt

- **`backend/src/routes/ai.js` is ~865L** — over the 600L hard cap. Split into `routes/ai/` folder (schemas / simple / campaign / scene / scenes-crud subfiles) before adding more endpoints.
- **`deepMerge` helper duplicated** at the bottom of `backend/src/routes/ai.js`. Move to a util file on next touch.
- **OpenAI/Anthropic dispatchers in 3 places**: `aiJsonCall.js` (single-shot), `campaignGenerator.js` (streaming), `sceneGenerator/streamingClient.js` (streaming). Acceptable — streaming vs non-streaming APIs are genuinely different shapes.
- **`src/hooks/useNarrator.js` is ~945L** — biggest remaining monolith hook. Split is playtest-driven, not urgent.
- **No token budget enforcement in `assembleContext()`.** Total prompt stays in ~3.5-7k tokens in practice thanks to upstream caps, but a runaway selection could blow past that. Add explicit counting if scenes start hitting model context limits or cost spikes.
- **`src/services/diceRollInference.js` has legacy aliases** not in `shared/domain/diceRollInference.js`. Fold into the shared version when convenient.
- **MP guest join doesn't write character campaign lock.** Only host's characters get locked via `POST /v1/campaigns`. Fix in `backend/src/routes/multiplayer/handlers/lobby.js` if guests report losing characters.

## Important notes

- **No production backward-compat constraints** — we're pre-prod, no v1 users.
- **Backend is the sole AI dispatch path.** No FE proxy/BYOK mode. Users can store per-user keys via `PUT /v1/auth/settings`; backend decrypts and threads them through via `loadUserApiKeys(prisma, userId)` → `userApiKeys` option → `requireServerApiKey(keyName, userApiKeys, label)`. See [knowledge/decisions/no-byok.md](knowledge/decisions/no-byok.md).
- **Redis is optional but load-bearing.** Every consumer (embeddings L2 cache, rate limiter, idempotency plugin, BullMQ queues) checks `isRedisEnabled()` and falls back gracefully. **Exception:** `/v1/auth/register|login|refresh` return 503 when Redis is disabled — refresh tokens have no sensible in-memory fallback.
- **Vector search indexes:** `cd backend && node src/scripts/createVectorIndexes.js` (one-time setup per Atlas cluster).
- **Multiplayer contracts shared via `shared/contracts/multiplayer.js`** — WS message schemas, normalizers, constants.
- **LLM timeouts user-tunable** via DM Settings (`llmPremiumTimeoutMs`, `llmNanoTimeoutMs`). Premium timeout emits SSE `error` with `code: 'LLM_TIMEOUT'`; nano timeout falls back silently.
