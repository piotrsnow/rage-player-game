# RPGON / Nikczemny Krzemuch — AI RPG game on a custom d50 system

Generic engineering discipline for new code. The cost of a big-bang refactor is **always** higher than writing the right shape the first time. Apply this skill the moment you touch a fresh project, a new module, or a feature that will live longer than a week.

The goal is simple: **never let any file, function, or component grow into something a future contributor will dread opening.** If you find yourself thinking "I'll clean it up later" — clean it up now, while the code is small and the diff is cheap.

---

## Mindset

You are a senior engineer. That means:

- **Boring code wins.** Clever one-liners cost reading time forever. Trade cleverness for clarity.
- **Decide structure before typing.** Two minutes of "where does this belong?" saves an hour of moving it later.
- **Extract on the second copy, not the third.** The third copy means the diff is now in three places and the bug is in two of them.
- **Right-sized commits, not small commits.** A cohesive feature or bugfix sweep is one commit. Don't fragment a logical unit just to keep diffs small.
- **Read before writing.** Before adding a helper, grep the codebase — chances are it already exists under a different name.
- **Treat warning signs as deadlines, not suggestions.** The moment something inside a file obviously wants to be its own hook, child component, or helper — extract it during the change, not later. ~250 LOC is a smell signal, not a hard cap; the real failure is letting one file own multiple distinct concerns.

---

## You Are Not Alone — Collaboration Mode

**You are working *with* a human who owns this project.** They know the product vision, the trade-offs already made, the constraints that aren't written down, and the reasons behind decisions you'll never see in the code. They understand programming. They are reviewing your work in real time. Treat them as a senior collaborator and project lead, not as a vague "user" you're producing output for.

This changes how you behave:

### Ask, don't guess

If any of these are true, **stop and ask** before writing code:

- The requirements have a gap you'd have to fill with assumptions.
- There are multiple reasonable approaches and the trade-offs matter (perf vs simplicity, new abstraction vs duplication, breaking change vs compat shim).
- You're about to touch a subsystem you don't fully understand.
- The request conflicts with something in the existing code, conventions, or memory/knowledge files.
- You'd need to invent a name, a schema, a file location, or an API shape that the project owner will have to live with.
- You're not sure whether the change should live in layer A or layer B.
- The "obvious" solution feels too easy and you suspect there's a reason nobody did it yet.

**Asking is not weakness — it is the cheapest debugging tool you have.** A 30-second clarification beats a 30-minute rewrite. The project owner would rather answer one question now than rebase your work later.

When you ask, ask **specifically**: present the options you see, the trade-offs you've identified, and your tentative recommendation. Don't dump a generic "what should I do?" — that wastes their time. A good question shows you've already thought about it.

### Discuss before deciding

When you disagree with the user's proposed approach, **say so**. A senior collaborator pushes back when they see a problem — they don't just nod and execute. Be respectful, be specific, and propose an alternative. The user may have context you don't (and will tell you), or you may have spotted something they missed (and they'll thank you). Either way, the conversation is the value.

Equally: when the user pushes back on **your** approach, take it seriously. They know things you don't. Don't capitulate immediately to be agreeable, but don't dig in either — examine their argument on its merits and update your view if it's right.

### Default to planning mode for anything non-trivial

Before writing code for anything that isn't a **quick, few-line, obviously-correct change**, switch into planning mode:

1. **State what you understand** the goal to be, in your own words. The user will correct you if you're wrong — and they often will be wrong about that themselves until they see it written down.
2. **List the steps** you intend to take, each one specific enough to be reviewed (file paths, function names, what gets moved where, what gets created, what gets deleted).
3. **Flag the open questions** — the things you'd need to decide and don't have a clear answer for. Each one is an explicit ask.
4. **Identify the risks** — what could break, what's the blast radius, what would need testing.
5. **Wait for approval** before executing. Then execute against the plan, and call out any deviation as it happens.

The threshold for "needs a plan" is low: anything that touches multiple files, introduces a new abstraction, changes a contract, or might have non-obvious downstream effects deserves a plan. Five minutes of plan now beats an hour of unwinding later.

What does **not** need a plan:
- Renaming a single local variable.
- Fixing an obvious typo.
- Adding a missing null check at a single call site.
- Adjusting one Tailwind class.
- Anything where the user explicitly said "just do it" and the scope is small.

Plan mode is for the *initial* alignment, not the only license to ask. New questions surface as code meets reality — raise them when they come up instead of guessing your way past them.

### Surface assumptions, don't bury them

Whenever you make an assumption to keep moving, **say it out loud** in your response: *"I'm assuming X — flag if that's wrong."* Buried assumptions are bugs that haven't fired yet. Surfaced assumptions are cheap to correct and become part of the shared understanding for the rest of the session.

### Stop, don't escalate

If a second attempt at the same approach fails, that's the signal to stop and surface — *"this isn't working, here's what I tried, here's what I think is wrong"* — not to try a third variant of the same idea. Bashing harder on a wrong path costs more than asking does.

### Honest end-of-turn handoff

When you report back, distinguish *what you changed* from *what you verified*. Untested edits get flagged; assumptions still in flight get named; anything left for the user to confirm gets called out. No rosy summaries.

### Propose, don't dictate

When you spot a refactor opportunity, an architectural improvement, or a cleanup the user didn't ask for: **propose it, don't sneak it in**. *"While I'm here, I noticed X — want me to fix it now or note it for later?"* The user decides scope. You surface options.

### Build and use a shared knowledge layer

Sessions are short. Projects are long. Anything you (or the user) figured out in one session will be lost by the next unless it's written down somewhere both sides can read.

Persistent files: `CLAUDE.md` (this file), `knowledge/` (subsystem deep-dives, decisions, patterns, ideas), and per-conversation memory. Before touching a subsystem, read its `knowledge/concepts/*.md` file — it exists because the answer wasn't obvious from the code. After learning something durable, write it down where it belongs; code rot is faster than you think.

## Minimum viable code

No speculative features, no abstractions for single use code, no "flexibility" you weren't asked for. You can suggest them in plan but don't implement anything what's not agreed on.

If you wrote 200 lines and 50 would work, REWRITE IT. ask yourself if a senior engineer would call this overcomplicated

## Surgical changes only

Don't touch code you don't fully understand, don't refactor unrelated stuff as a side effect, don't delete comments because they look unnecessary. only change what the task actually requires.

## Goal driven execution

Give claude success criteria instead of step by step instructions. 


## Stack

- **Frontend**: React 18 + Vite 6, Tailwind CSS, React Three Fiber (3D scenes), i18next, Zod 4
- **Backend**: Fastify 5, Prisma (Postgres 16 + pgvector), JWT + refresh cookies, WebSocket (multiplayer), Cloud Tasks (post-scene async)
- **Database**: PostgreSQL 16 + pgvector (JSONB, FK cascade, HNSW vector indexes; Cloud SQL in prod, `pgvector/pgvector:pg16` container in dev)
- **AI**: OpenAI (GPT-4.1/mini/nano, 4o/mini, o3/o4-mini, gpt-5.4-nano for nanoReasoning) + Anthropic (Claude Sonnet 4, Haiku 4.5) + Google Gemini. Nano/standard/premium tiering via `src/services/ai/models.js`.
- **3D**: Three.js / React Three Fiber — procedural scene rendering with GLB model support
- **Media**: Sharp (image resize), ElevenLabs (TTS), Stability AI (scene images), Meshy (3D models), GCP Storage
- **Testing**: Vitest (unit), Playwright (e2e)
- **Shared**: `shared/` — domain logic and contracts used by both frontend and backend

## Commands

- `npm run dev` — runs backend + frontend together via `concurrently`. Backend on :3001 (Docker Compose with watch), Vite HMR on :5173. One Ctrl+C kills both. Postgres + pgvector ships as the `db` service in `docker-compose.yml`; `DATABASE_URL` defaults to `postgresql://rpgon:rpgon@db:5432/rpgon` so no `.env` editing is needed for offline dev. No Redis/Valkey — post-scene work runs inline in dev.
- `npm run dev:backend` — backend only (`docker compose up --build --watch`); use when iterating on the bundled FE served by the backend container.
- `npm run dev:frontend` — Vite only on :5173 (assumes backend is already running).
- `npm run dev:down` — `docker compose down`
- `npm run dev:logs` — tail backend container logs
- `npm run build` — Vite production build
- `npm test` — Vitest unit tests
- `npm run test:e2e` — Playwright e2e tests
- `cd backend && npm run db:migrate` — `prisma migrate dev` (creates + applies a new migration in dev)
- `cd backend && npm run db:push` — `prisma db push` escape hatch for prototyping without a migration
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
- Embeddings stored in pgvector `vector(1536)` columns; written via [embeddingWrite.js](backend/src/services/embeddingWrite.js), queried via `<=>` cosine through `$queryRaw`. See [knowledge/decisions/embeddings-pgvector.md](knowledge/decisions/embeddings-pgvector.md).
- JSON fields use Prisma `Json` (native JSONB) — round-trip JS objects/arrays directly, no `JSON.parse` / `JSON.stringify`.

## Architecture overview

### Frontend (`src/`)

- **State** — Zustand store + Immer handlers in `src/stores/`. Non-game contexts (Settings, Multiplayer, Music, Modals) stay on React Context.
- **Hooks** — scene generation (`src/hooks/sceneGeneration/`), combat (4 pure-factory hooks), narration, campaign lifecycle, image repair, summary modal, viewer mode, multiplayer glue.
- **Services** — AI dispatch (`src/services/ai/`), AI response parsing (`src/services/aiResponse/`), game engines (combat/magic/trade/crafting/alchemy), deterministic mechanics (`mechanics/`), storage/sync (`storage.js`), API client (`apiClient.js`), field map (`fieldMap/`).
- **Components** — `GameplayPage` orchestrates panels (Scene, Action, Chat, Combat, Magic, Trade, Party). Character sheet, campaign creator, lobby, gallery, multiplayer, settings, 3D scene rendering (`Scene3D/`).
- **Admin panel** — `src/components/admin/AdminLivingWorldPage.jsx` is a tab switcher; each tab + shared primitives live in `src/components/admin/adminLivingWorld/{tabs,shared}/`.
- **Data** — RPGon rules (`rpgSystem.js`, `rpgMagic.js`, `rpgFactions.js`), equipment, achievements, 3D prefabs.

### Backend (`backend/`)

- **Routes** — `/v1/auth` (cookie refresh flow), campaigns CRUD, characters, `ai.js` (barrel → `routes/ai/` with SSE + single-shots + scenes + coreState), `/v1/admin/livingWorld` (gated on `User.isAdmin`), `/v1/internal/post-scene-work` (Cloud Tasks handler), game data, media, multiplayer WebSocket (split), proxy endpoints (OpenAI/Anthropic/Gemini/ElevenLabs/Stability/Meshy). All under `/v1/*`; `/health` at root.
- **Services** — scene generation pipeline (`sceneGenerator/` with `processStateChanges/` handlers split by bucket, `systemPrompt/` split by section), intent classification (`intentClassifier/` heuristics + nanoSelector), context assembly (`aiContextTools/` handlers + contextBuilders), memory compression, shared `aiJsonCall.js` for single-shot calls, multiplayer AI pipeline (`multiplayerAI/`), vector search, room manager, media storage, `cloudTasks.js` (post-scene enqueue), `postSceneWork.js` (async handler).
- **Living World** — `services/livingWorld/` — campaign sandbox (CampaignNPC shadow + F5b CampaignLocation per-campaign sandbox), quest-goal assigner (`questGoalAssigner/` with role/category/picker split), npc agent loop, reputation, travel graph (Dijkstra over canonical-only `Road`s), dungeon seed, fog-of-war discovery helpers, hearsay orchestration. AI mid-play creation lands in `CampaignLocation`; canonical promotion happens via admin queue.
- **Infrastructure** — `plugins/csrf.js`, `plugins/idempotency.js` (in-memory), `plugins/rateLimitKey.js`, `plugins/requireAdmin.js` (JWT claim-based), `refreshTokenService.js` (Postgres-backed, in-process 10-min reaper), `oidcVerify.js` (Cloud Tasks auth).

### Database (Postgres 16 + pgvector via Prisma)

| Model | Purpose |
|---|---|
| `User` | Auth, encrypted API keys, settings, `isAdmin` flag |
| `Campaign` | `coreState` (lean JSONB), metadata |
| `CampaignScene/NPC/Knowledge/Codex/Quest` | Normalized with pgvector HNSW embeddings |
| `CampaignNpcRelationship` / `CampaignQuestObjective` | F4 — child tables that replaced `CampaignNPC.relationships` / `CampaignQuest.objectives` JSONB |
| `CampaignParticipant` | Join table (campaign ↔ character + role) |
| `Character` | Reusable character library (with campaign lock fields). F4: skills/inventory/materials decomposed; equipped slots are text refs to itemKey |
| `CharacterSkill` / `CharacterInventoryItem` / `CharacterMaterial` | F4 — child tables. Items+materials stack by `slugify(name)` (see [shared/domain/itemKeys.js](shared/domain/itemKeys.js)). |
| `RefreshToken` | Opaque refresh tokens; cleanup runs on a 10-min `setInterval` |
| `MultiplayerSession` + `MultiplayerSessionPlayer` | Room state backup with normalized players join table |
| `MediaAsset` | User-generated images/music/TTS |
| `PrefabAsset` / `Wanted3D` | 3D model catalog |
| `Achievement` | Per-user unlocked achievements |
| `WorldNPC` / `WorldLocation` / `Road` / `WorldEvent` / `WorldReputation` | Living World canonical world state. F5b: `Road` renamed from `WorldLocationEdge` (canonical-only travel infra); `WorldLocation.isCanonical`/`createdByCampaignId` dropped — every WorldLocation IS canonical. |
| `CampaignNPC` | Per-campaign shadow of WorldNPC (independent activeGoal). F5b: `lastLocation{Kind,Id}` is a polymorphic FK pair into either WorldLocation or CampaignLocation. |
| `CampaignLocation` | F5b — per-campaign sandbox for AI-mid-play-created locations. Promoted to canonical WorldLocation via destructive copy + relink (admin queue). Carries own `regionX/regionY` for player-map rendering; off the canonical Road graph. |
| `WorldLoreSection` | Admin-editable world lore injected into every scene prompt |

## AI pipeline (summary)

Every scene generation goes through a two-stage pipeline: nano model selects what context is needed, backend assembles it in parallel, premium model runs once with a lean prompt (~3.5-7k tokens).

```
Player action
  → [FE] resolveMechanics()                    — deterministic d50/combat/magic
  → [FE] useSceneGeneration → SSE stream       — POST /v1/ai/campaigns/:id/generate-scene-stream
  → [BE route] writeSseHead + inline generateSceneStream
      1. load campaign state (parallel DB)
      2. classifyIntent (heuristic → nano)
      3. tryTradeShortcut / tryCombatFastPath (early return)
      4. generatePreRolls (3 d50 values for fallback)
      5. assembleContext (parallel DB for selected categories)
      6. build prompts + runTwoStagePipelineStreaming (premium)
      7. parse + validate + reconcile dice + fill enemies + persist character
      8. enqueue post-scene work via Cloud Tasks (prod) or inline (dev)
  → [FE] applySceneStateChanges → stateValidator → gameDispatch
  → [Cloud Tasks] POST /v1/internal/post-scene-work
      — embedding, NPC/quest sync, nano state extraction (journal, knowledge, codex, worldFacts, needs), memory compression, location summary
```

Full detail: [knowledge/concepts/scene-generation.md](knowledge/concepts/scene-generation.md).

### Design principles

1. **Context selection, not tool calling** — nano picks, code assembles, premium runs once. No tool protocol, no tool-calling loop.
2. **Game state over history** — structured state in the prompt, not raw scene history.
3. **Bounded memory compression** — 15-fact cap per campaign → stable prompt size regardless of length.
4. **Nano for planning AND extraction** — intent classification, fact extraction, skill inference, quest checks, journal/knowledge/codex/worldFacts/needs extraction. Premium is for narration + mechanical stateChanges only.
5. **Intent-driven conditional prompt** — combat/codex/mana-crystal/canTrain rules injected into dynamic suffix only when the intent classifier deems them relevant. Reduces prompt noise for non-combat/non-lore scenes.

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
- `knowledge/concepts/auth.md` — cookie refresh + JWT + CSRF + per-user keys + `isAdmin` claim
- `knowledge/concepts/rpgon-mechanics.md` — d50, pre-rolled dice fallback, state change limits
- `knowledge/concepts/bestiary.md` — encounter budget, fast-path combat, disposition guard
- `knowledge/concepts/model-tiering.md` — nano / standard / premium tiers
- `knowledge/concepts/frontend-structure.md` — `src/` subdomain map + entry-point cheat sheet
- `knowledge/concepts/backend-structure.md` — `backend/` + `shared/` subdomain map + entry-point cheat sheet
- `knowledge/concepts/living-world.md` — Living World phase roadmap (1-7 + A-F + Round A/B), tick model, clone architecture, write-back plans
- `knowledge/concepts/npc-clone-architecture.md` — WorldNPC → CampaignNPC shadow cloning, writer ownership, divergence policy
- `knowledge/concepts/campaign-sandbox.md` — CampaignNPC shadow with own activeGoal, clone triggers, writer ownership matrix
- `knowledge/concepts/fog-of-war.md` — three-state location visibility (unknown/heard-about/visited), canonical vs non-canonical split, discovery helpers
- `knowledge/concepts/world-lore.md` — admin-editable `WorldLoreSection` injected into every scene prompt, cache invalidation
- `knowledge/concepts/hearsay-and-ai-locations.md` — `[NPC_KNOWLEDGE]` prompt block, `locationMentioned` policy, smart placer for AI-created locations, `[WORLD BOUNDS]` hint

### Patterns — reusable code shapes

- `knowledge/patterns/sse-streaming.md` — **MANDATORY** before touching any SSE route
- `knowledge/patterns/zustand-facade.md` — facade + granular selectors
- `knowledge/patterns/pure-lift-refactoring.md` — lift ladder for components, thin-facade split for backend
- `knowledge/patterns/hook-pure-factory-testing.md` — **MANDATORY** before writing hook tests
- `knowledge/patterns/e2e-campaign-seeding.md` — **MANDATORY** before writing Playwright specs that need a loaded campaign
- `knowledge/patterns/backend-proxy.md` — backend is the sole AI dispatch path

### Decisions — settled debates

- `knowledge/decisions/two-stage-pipeline.md` — nano selection + code assembly (not tool calling)
- `knowledge/decisions/no-byok.md` — backend is the sole AI dispatch path
- `knowledge/decisions/cloud-run-no-redis.md` — Cloud Run native, no Redis/BullMQ, Cloud Tasks for post-scene work
- `knowledge/decisions/postgres-dev.md` — Postgres 16 + pgvector everywhere (replaces atlas-only-no-local-mongo)
- `knowledge/decisions/embeddings-pgvector.md` — pgvector `vector(1536)` + HNSW indexes (replaces embeddings-native-driver)
- `knowledge/decisions/rpgon-custom-system.md` — custom d50 system, not WFRP
- `knowledge/decisions/currency-three-tier-pl.md` — ZK/SK/MK exchange rates
- `knowledge/decisions/titles-from-achievements.md` — character identity via titles
- `knowledge/decisions/hand-authored-world-seed.md` — canonical world in `seedWorld.js`; Living World proc-gen stays opt-in

### Ideas — future concepts (not adopted)

**If you recommend something from `knowledge/ideas/`, ALWAYS name the file path** (e.g. `knowledge/ideas/autonomous-npcs.md`) so the user knows to read it before deciding. These are sketches with "when it becomes relevant" triggers — never act on them as if they were decided patterns.

Current ideas: async-tool-pattern, autonomous-npcs, combat-auto-resolve, declarative-event-routing, deferred-event-batching, living-world-admin-extras, living-world-atonement-loop, living-world-cross-user-visibility, living-world-npc-auto-dispatch, living-world-scene-orchestration, living-world-vector-search, prompt-fragment-system, side-quests-between-campaigns. See [knowledge/ideas/README.md](knowledge/ideas/README.md).

## Critical-path files (when in doubt, start here)

| Task | Entry file |
|---|---|
| Scene generation bug | [backend/src/services/sceneGenerator/generateSceneStream.js](backend/src/services/sceneGenerator/generateSceneStream.js) |
| Scene gen FE orchestration | [src/hooks/sceneGeneration/useSceneGeneration.js](src/hooks/sceneGeneration/useSceneGeneration.js) |
| AI context selection | [backend/src/services/intentClassifier/index.js](backend/src/services/intentClassifier/index.js) (heuristics + nanoSelector) + [aiContextTools/index.js](backend/src/services/aiContextTools/index.js) |
| AI response validation | [src/services/stateValidator.js](src/services/stateValidator.js) + [shared/domain/stateValidation.js](shared/domain/stateValidation.js) |
| State change application | [src/stores/handlers/applyStateChangesHandler.js](src/stores/handlers/applyStateChangesHandler.js) |
| Combat mechanics | [src/services/combatEngine.js](src/services/combatEngine.js) |
| Save/load | [src/services/storage.js](src/services/storage.js) |
| Character DB ↔ FE-shape bridge (F4) | [backend/src/services/characterRelations.js](backend/src/services/characterRelations.js) — `loadCharacterSnapshot` / `persistCharacterSnapshot` / `reconstructCharacterSnapshot` / `splitCharacterSnapshot`. Items + materials stack by `slugifyItemName` from [shared/domain/itemKeys.js](shared/domain/itemKeys.js). |
| Multiplayer WS | [backend/src/routes/multiplayer/connection.js](backend/src/routes/multiplayer/connection.js) + `handlers/` |
| Auth flow | [src/services/apiClient.js](src/services/apiClient.js) + [backend/src/routes/auth.js](backend/src/routes/auth.js) |
| System prompt (premium) | [backend/src/services/sceneGenerator/systemPrompt/index.js](backend/src/services/sceneGenerator/systemPrompt/index.js) (sections in `staticRules` / `conditionalRules` / `worldBlock` / `livingWorldBlock`) |
| stateChanges handlers | [backend/src/services/sceneGenerator/processStateChanges/index.js](backend/src/services/sceneGenerator/processStateChanges/index.js) (handlers per bucket + Zod schemas) |
| Nano state extraction | [backend/src/services/memoryCompressor.js](backend/src/services/memoryCompressor.js) `compressSceneToSummary` |
| Post-scene async | [backend/src/services/cloudTasks.js](backend/src/services/cloudTasks.js) + [postSceneWork.js](backend/src/services/postSceneWork.js) |
| SSE routes | [backend/src/routes/ai/sseBoilerplate.js](backend/src/routes/ai/sseBoilerplate.js) `writeSseHead` + per-endpoint handlers in `routes/ai/` |
| Admin routes | [backend/src/routes/adminLivingWorld.js](backend/src/routes/adminLivingWorld.js) (gated on `fastify.requireAdmin` — JWT claim) |
| Prisma schema | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) |
| RPGon rules | [src/data/rpgSystem.js](src/data/rpgSystem.js) |
| Living World canonical seed | [backend/src/scripts/seedWorld.js](backend/src/scripts/seedWorld.js) (capital + villages + NPCs + wilderness/dungeons/ruins) |
| Campaign sandbox (CampaignNPC shadow) | [backend/src/services/livingWorld/campaignSandbox.js](backend/src/services/livingWorld/campaignSandbox.js) |
| Polymorphic location refs (F5b) | [backend/src/services/locationRefs.js](backend/src/services/locationRefs.js) — `LOCATION_KIND_{WORLD,CAMPAIGN}`, `packLocationRef`/`readLocationRef`/`lookupLocationByKindId`, `slugifyLocationName`. Use these for any `xLocation{Kind,Id}` column pair. |
| Polymorphic location lookup (F5b) | [backend/src/services/livingWorld/worldStateService.js](backend/src/services/livingWorld/worldStateService.js) `resolveLocationByName` (canonical-first, falls back to this-campaign CampaignLocation) + `findOrCreateCampaignLocation` (per-campaign sandbox creation). Old `findOrCreateWorldLocation` reserved for canonical-only seed paths. |
| Quest-driven NPC goals | [backend/src/services/livingWorld/questGoalAssigner/index.js](backend/src/services/livingWorld/questGoalAssigner/index.js) (pure classifier + weighted picker split out) |
| Start-spawn picker (campaign binding) | [backend/src/services/livingWorld/startSpawnPicker.js](backend/src/services/livingWorld/startSpawnPicker.js) |
| Fog-of-war helpers | [backend/src/services/livingWorld/userDiscoveryService.js](backend/src/services/livingWorld/userDiscoveryService.js) |
| AI location placement | [backend/src/services/livingWorld/positionCalculator.js](backend/src/services/livingWorld/positionCalculator.js) `computeSmartPosition` |
| World-scope RAG (Round E Phase 9) | [backend/src/services/livingWorld/ragService.js](backend/src/services/livingWorld/ragService.js) `index`/`query`/`invalidate` — `WorldEntityEmbedding` table, pgvector `<=>` cosine via `$queryRaw`, separate from campaign-scope scene/knowledge search in [vectorSearchService.js](backend/src/services/vectorSearchService.js) |
| Post-campaign world write-back (Round E — COMPLETE) | [backend/src/services/livingWorld/postCampaignWriteback.js](backend/src/services/livingWorld/postCampaignWriteback.js) — top-level orchestrator. Pipeline: `collectCampaignShadowDiff` (Phase 10) → `extractWorldFacts` (Phase 11 LLM) → `runWorldStateChangePipeline` (Phase 12 resolver → tiering → HIGH NPC-kind auto-apply to `WorldNPC.knowledgeBase` / MEDIUM + all locations + unsupported HIGH upsert into `PendingWorldStateChange`) → `applyShadowDiffToCanonical` (Phase 12-lite narrow `alive`/`location`) → `runNpcPromotionPipeline` (Phase 12b: stats + dialog harvest + Haiku verdict + RAG dedup → `NPCPromotionCandidate`) → `promoteExperienceLogsToCanonical` (Stage 2b: major experienceLog entries → linked WorldNPC.knowledgeBase with `source: 'campaign:<id>'`, idempotent via replace-by-source-tag) → `runLocationPromotionPipeline` (Phase 12c: non-canonical WorldLocations → `LocationPromotionCandidate`). Entry: `runPostCampaignWorldWriteback(campaignId)`. Triggered via admin route `POST /v1/admin/livingWorld/campaigns/:id/run-writeback` (Phase 13a). |
| Post-campaign world-change pipeline | [backend/src/services/livingWorld/postCampaignWorldChanges.js](backend/src/services/livingWorld/postCampaignWorldChanges.js) — `runWorldStateChangePipeline`, NPC `knowledgeBase` append for HIGH-corroborated NPC changes, `applyLocationKnowledgeChange` + `applyNpcKnowledgeChange` + `applyApprovedPendingChange` (dispatched by Phase 13a approval route). `PendingWorldStateChange` upserted by `computeIdempotencyKey` SHA-1 hash with sticky admin status. |
| Post-campaign NPC promotion | [backend/src/services/livingWorld/postCampaignPromotion.js](backend/src/services/livingWorld/postCampaignPromotion.js) + [postCampaignPromotionVerdict.js](backend/src/services/livingWorld/postCampaignPromotionVerdict.js) — Slice A stats + Slice B dialog sample/dedup/Haiku verdict. Inline `maybePromote` deleted in Slice B — canonical `WorldNPC` rows are **never created mid-play**. Admin approval (Phase 13a) calls `promoteCampaignNpcToWorld` which dedupes against existing canonical by (name + role, alive) or creates a new WorldNPC with `buildNpcCanonicalId` + links `CampaignNPC.worldNpcId`. |
| Post-campaign location promotion | [backend/src/services/livingWorld/postCampaignLocationPromotion.js](backend/src/services/livingWorld/postCampaignLocationPromotion.js) — F5b: `runLocationPromotionPipeline` scores `CampaignLocation` rows by sceneCount + quest-objective count, RAG-dedups against existing `LocationPromotionCandidate`s, sticky upsert keyed by `[campaignId, sourceLocationKind, sourceLocationId]`. Admin approve calls `promoteCampaignLocationToCanonical` which destructively COPIES CampaignLocation → new WorldLocation, RELINKS polymorphic refs (Campaign.currentLocation*, CampaignNPC.lastLocation*, CampaignDiscoveredLocation, CharacterClearedDungeon) in one transaction, DELETES the source CampaignLocation, reindexes RAG as `entityType='location'`. |
| Post-campaign memory promotion (Stage 2b) | [backend/src/services/livingWorld/postCampaignMemoryPromotion.js](backend/src/services/livingWorld/postCampaignMemoryPromotion.js) — `promoteExperienceLogsToCanonical` appends major `CampaignNPC.experienceLog` entries to linked `WorldNPC.knowledgeBase` with `source: 'campaign:<campaignId>'`. Idempotent via replace-by-source-tag (`mergeKnowledgeBaseForCampaign`). FIFO-capped at 50 per NPC. Prompt renders as `(poprzednia kampania)`. |
| Admin canonicalization queue (Round E Phase 13a) | [backend/src/routes/adminLivingWorld.js](backend/src/routes/adminLivingWorld.js) — routes: `GET /pending-world-state-changes`, `POST /pending-world-state-changes/:id/{approve\|reject}`, `GET /promotion-candidates`, `POST /promotion-candidates/:id/{approve\|reject}`, `GET /location-promotion-candidates`, `POST /location-promotion-candidates/:id/{approve\|reject}`, `GET /campaigns`, `POST /campaigns/:id/run-writeback` (rate-limited). UI: [PromotionsTab.jsx](src/components/admin/adminLivingWorld/tabs/PromotionsTab.jsx) renders four panels (run-writeback + pending queue + NPC promotion candidates with dedup-collapse + location promotion candidates). |
| Canon knowledge graph (Round E Phase 13b) | [src/components/admin/adminLivingWorld/tabs/CanonGraphTab.jsx](src/components/admin/adminLivingWorld/tabs/CanonGraphTab.jsx) — SVG force-directed render of canonical world: locations + overworld edges + NPC dots orbiting their home/current location, colored by category. Backed by `GET /v1/admin/livingWorld/canon-graph`. Surfaces lonely locations (no edges) and homeless NPCs (no home link) for spot-check. |
| NPC memory (Stage 1+2a+2a.1+2a.2+2b+3) | [backend/src/services/aiContextTools/contextBuilders/npcBaseline.js](backend/src/services/aiContextTools/contextBuilders/npcBaseline.js) `buildNpcMemory` — merges `WorldNPC.knowledgeBase` (seeded baseline + Stage 2b cross-campaign promoted) + `CampaignNPC.experienceLog` (this campaign's lived experience via `npcMemoryUpdates` stateChanges bucket → [processStateChanges/npcMemoryUpdates.js](backend/src/services/sceneGenerator/processStateChanges/npcMemoryUpdates.js)). Stage 3: when per-NPC merged pool > 15 entries AND `sceneQueryText` is present (`playerAction + currentLocation` threaded from generateSceneStream), replaces static importance-slice with cosine-similarity query against `entityType='npc_memory'`. Entities indexed at write time (`cexp:<campaignNpcId>:<addedAt>` for experience, `wknw:<worldNpcId>:<addedAt>` for cross-campaign). Rendered as `[NPC_MEMORY]` prompt block with `(zawsze)` / `(ta kampania)` / `(poprzednia kampania)` tags. Flavor, not policy-enforced. |

## Known gaps / technical debt

- **`src/hooks/useNarrator.js` is ~945L** — biggest remaining monolith hook. Split is playtest-driven, not urgent.
- **`backend/src/scripts/seedWorld.js` is ~1146L** — bootstrap script, not a hot path, but runs on every boot (idempotent upsert). Adding a seed-completion guard (env flag or DB marker) would skip the no-op I/O on warm starts.
- **No token budget enforcement in `assembleContext()`.** Total prompt stays in ~3.5-7k tokens in practice thanks to upstream caps, but a runaway selection could blow past that. Add explicit counting if scenes start hitting model context limits or cost spikes.
- **Prisma compound indexes missing on Living World models.** `WorldEvent` needs `@@index([eventType, visibility, createdAt])` for the admin events feed; `CampaignNPC` needs `@@index([campaignId, canonicalWorldNpcId])` for shadow lookups. Verify in `schema.prisma` before the next migration.
- **OpenAI/Anthropic dispatchers in 3 places**: `aiJsonCall.js` (single-shot), `campaignGenerator.js` (streaming), `sceneGenerator/streamingClient.js` (streaming). Acceptable — streaming vs non-streaming APIs are genuinely different shapes.
- **`src/services/diceRollInference.js` has legacy aliases** not in `shared/domain/diceRollInference.js`. Fold into the shared version when convenient.
- **MP guest join doesn't write character campaign lock.** Only host's characters get locked via `POST /v1/campaigns`. Fix in `backend/src/routes/multiplayer/handlers/lobby.js` if guests report losing characters.
- **Living World Phase 3 is minimal-viable.** Cross-campaign global events read through `forLocation` (payload is meta-only so no leak), but rate limiting (3 major/tydzień/kampania) and full spoiler filter are deferred. See [knowledge/ideas/living-world-cross-user-visibility.md](knowledge/ideas/living-world-cross-user-visibility.md).
- **NPC auto-dispatch deferred.** Phase 5 ticks are event-driven (player-scene-bound) via `globalNpcTriggers` + on-demand `runNpcTick`. Cloud Tasks scheduled worker for offline-world simulation is a future step; see [knowledge/ideas/living-world-npc-auto-dispatch.md](knowledge/ideas/living-world-npc-auto-dispatch.md).

### Recently split (barrel pattern — import paths preserved)

| File | Was | Now |
|---|---|---|
| `backend/src/routes/ai.js` | 698 LOC | 4-LOC barrel → `routes/ai/{index,schemas,sseBoilerplate,singleShots,campaignStream,sceneStream,scenes,coreState}.js` |
| `backend/src/services/aiContextTools.js` | 1358 LOC | barrel → `aiContextTools/{index,handlers/*,contextBuilders/*,worldLore}.js` |
| `backend/src/services/sceneGenerator/processStateChanges.js` | 1277 LOC | barrel → `processStateChanges/{index,schemas,handlers/*,sceneEmbedding}.js` with Zod validators per bucket |
| `backend/src/services/intentClassifier.js` | 588 LOC | barrel → `intentClassifier/{index,heuristics,nanoSelector,nanoPrompt}.js` |
| `backend/src/services/sceneGenerator/systemPrompt.js` | 550 LOC | barrel → `systemPrompt/{index,staticRules,conditionalRules,dmSettingsBlock,characterBlock,worldBlock,livingWorldBlock}.js` |
| `backend/src/services/livingWorld/questGoalAssigner.js` | 557 LOC | barrel → `questGoalAssigner/{index,questRole,npcGiverPicker,backgroundGoals,categories,roleAffinity}.js` |
| `src/components/admin/AdminLivingWorldPage.jsx` | 795 LOC | tab switcher → `adminLivingWorld/{tabs/*,shared/*}` |

Barrels keep the old import paths intact — `import { ... } from '.../systemPrompt.js'` and friends still work unchanged.

## Important notes

- **No production backward-compat constraints** — we're pre-prod, no v1 users.
- **Backend is the sole AI dispatch path.** No FE proxy/BYOK mode. Users can store per-user keys via `PUT /v1/auth/settings`; backend decrypts and threads them through via `loadUserApiKeys(prisma, userId)` → `userApiKeys` option → `requireServerApiKey(keyName, userApiKeys, label)`. See [knowledge/decisions/no-byok.md](knowledge/decisions/no-byok.md).
- **No Redis/BullMQ.** Refresh tokens in Postgres (10-min `setInterval` reaps expired rows), post-scene async via Cloud Tasks (prod) or inline (dev), rate limiting + idempotency in-memory. See [knowledge/decisions/cloud-run-no-redis.md](knowledge/decisions/cloud-run-no-redis.md).
- **Admin auth is a JWT claim, not a DB lookup.** `signAccessToken` mints `isAdmin` at login/refresh; `fastify.requireAdmin` reads the claim. Role changes take at most one access-token TTL (15 min) to propagate. See [backend/src/plugins/requireAdmin.js](backend/src/plugins/requireAdmin.js).
- **Admin querystring filters are JSON-Schema typed.** Every GET on `/v1/admin/livingWorld/*` declares a `querystring` schema so Fastify coerces/validates before the params reach Prisma — stops bracket-syntax injections like `?locationId[$ne]=null`. LLM-triggering admin endpoints (`/npcs/:id/tick`, `/tick-batch`) carry their own stricter rate limits in the route config.
- **One-time setup scripts:** none. HNSW vector indexes are created in the init migration `0000_init_postgres/migration.sql`; refresh-token cleanup runs in-process via `startPeriodicCleanup()` (called from `server.js`).
- **Living World settlement seeding (Phase A/B).** Every `livingWorldEnabled` campaign gets hamlets/villages/towns/cities pre-seeded at POST `/v1/campaigns` (counts scale with `length`, `Campaign.worldBounds` centered on global capital Yeralden). Settlements are creation-time-only — `processTopLevelEntry` silently rejects `hamlet|village|town|city|capital` emitted mid-play; only wilderness/camp/ruin/cave/forest/dungeon can be created during play. See [knowledge/concepts/living-world.md](knowledge/concepts/living-world.md).
- **Player map = global canonical world.** The tile-grid map (`components/gameplay/worldMap/PlayerWorldMap.jsx`, Round C) renders on a **fixed `-10..10` grid** because [seedWorld.js](backend/src/scripts/seedWorld.js) seeds one canonical world shared by every campaign. `Campaign.worldBounds` is a per-campaign **AI/seeder placement guardrail only** (ring-spawn radius, out-of-bounds reject, `[WORLD BOUNDS]` prompt hint) — it is not the player viewport. See [knowledge/concepts/living-world.md](knowledge/concepts/living-world.md) "Three things that look the same but aren't".
- **Multiplayer contracts shared via `shared/contracts/multiplayer.js`** — WS message schemas, normalizers, constants.
- **LLM timeouts user-tunable** via DM Settings (`llmPremiumTimeoutMs`, `llmNanoTimeoutMs`). Premium timeout emits SSE `error` with `code: 'LLM_TIMEOUT'`; nano timeout falls back silently.
