# Knowledge Base — Nikczemny Krzemuch / RPGon

Codebase knowledge for Claude. Read the relevant file **before** working on a subsystem — cheaper than re-exploring from scratch, and it tells you what's invariant vs what's a tuning knob.

File types:

- **concepts/** — how a subsystem works, where the code lives, how to debug it. Read when working in that area.
- **patterns/** — concrete code patterns and interesting solutions to reuse. Read when writing new code that touches one of these areas.
- **decisions/** — why we picked option B over options A/C. Read when you're tempted to re-open one of these choices.
- **ideas/** — future concepts not yet built, each with a "When it becomes relevant" trigger. **Only mention an idea from here if you explicitly name `knowledge/ideas/<file>.md` so the user knows to read it first.**

## Concepts — subsystems

| File | What it covers |
|---|---|
| [concepts/scene-generation.md](concepts/scene-generation.md) | The two-stage AI pipeline, SSE event shapes, LLM timeouts, debugging order |
| [concepts/ai-context-assembly.md](concepts/ai-context-assembly.md) | Intent classifier, `assembleContext`, memory compression, running facts |
| [concepts/game-state.md](concepts/game-state.md) | Zustand store, handlers, selectors, dispatch path |
| [concepts/persistence.md](concepts/persistence.md) | `coreState` vs normalized, save queue, idempotency, character-to-campaign lock |
| [concepts/combat-system.md](concepts/combat-system.md) | d50 resolution, hook surface, solo vs MP flow, bestiary integration |
| [concepts/multiplayer.md](concepts/multiplayer.md) | Host-owned state, WS handlers, room manager, crash recovery |
| [concepts/auth.md](concepts/auth.md) | Cookie refresh + short JWT access + CSRF + per-user API keys |
| [concepts/rpgon-mechanics.md](concepts/rpgon-mechanics.md) | d50, szczęście auto-success, pre-rolled dice fallback, state change limits |
| [concepts/bestiary.md](concepts/bestiary.md) | Encounter budget, fast-path combat, disposition guard, pendingThreat |
| [concepts/model-tiering.md](concepts/model-tiering.md) | nano / standard / premium tiers + provider fallback |
| [concepts/frontend-structure.md](concepts/frontend-structure.md) | `src/` subdomain map with entry-point cheat sheet |
| [concepts/backend-structure.md](concepts/backend-structure.md) | `backend/src/` + `shared/` subdomain map with entry-point cheat sheet |
| [concepts/fog-of-war.md](concepts/fog-of-war.md) | Three-state location visibility, canonical vs non-canonical split, `userDiscoveryService` helpers |
| [concepts/world-lore.md](concepts/world-lore.md) | Admin-editable `WorldLoreSection` prepended to every scene prompt, `buildWorldLorePreamble` cache |
| [concepts/campaign-sandbox.md](concepts/campaign-sandbox.md) | CampaignNPC shadows over immutable WorldNPC, clone-on-first-encounter, field ownership matrix |
| [concepts/hearsay-and-ai-locations.md](concepts/hearsay-and-ai-locations.md) | `[NPC_KNOWLEDGE]` prompt block, `locationMentioned` policy, AI-created non-canonical locations |

## Patterns — reusable code shapes

| File | Use when |
|---|---|
| [patterns/sse-streaming.md](patterns/sse-streaming.md) | **MANDATORY READ** before touching any SSE route. `writeSseHead` invariants, client parser shape, Playwright mock format. |
| [patterns/bullmq-queues.md](patterns/bullmq-queues.md) | Adding a new queue job, changing worker concurrency, debugging queue/pub-sub issues |
| [patterns/zustand-facade.md](patterns/zustand-facade.md) | Writing new reducer handlers, picking between granular selectors and `useGame()` |
| [patterns/pure-lift-refactoring.md](patterns/pure-lift-refactoring.md) | Breaking up god-components or monolithic services |
| [patterns/hook-pure-factory-testing.md](patterns/hook-pure-factory-testing.md) | **MANDATORY READ** before writing hook tests. No `@testing-library/react`; extract pure factories. |
| [patterns/e2e-campaign-seeding.md](patterns/e2e-campaign-seeding.md) | **MANDATORY READ** before writing Playwright specs that need a loaded campaign. Mock `GET /v1/campaigns/:id` via `page.route()`. |
| [patterns/backend-proxy.md](patterns/backend-proxy.md) | Adding a new AI feature — backend is the sole dispatch path |

## Decisions — settled debates

| File | What was settled |
|---|---|
| [decisions/two-stage-pipeline.md](decisions/two-stage-pipeline.md) | Nano selection + code assembly over AI tool-calling loop |
| [decisions/no-byok.md](decisions/no-byok.md) | Backend is the sole AI dispatch path; no FE-direct provider calls |
| [decisions/bullmq-vs-sse-routes.md](decisions/bullmq-vs-sse-routes.md) | BullMQ + pub/sub bridge + SSE vs inline SSE vs poll-only |
| [decisions/atlas-only-no-local-mongo.md](decisions/atlas-only-no-local-mongo.md) | Atlas SRV everywhere, no local mongo container |
| [decisions/embeddings-native-driver.md](decisions/embeddings-native-driver.md) | Native MongoDB driver for embeddings (Prisma can't do BSON arrays) |
| [decisions/rpgon-custom-system.md](decisions/rpgon-custom-system.md) | Custom d50 system (RPGon) instead of WFRP |
| [decisions/currency-three-tier-pl.md](decisions/currency-three-tier-pl.md) | Złota/Srebrna/Miedziana Korona, `1 ZK = 20 SK = 240 MK` |
| [decisions/titles-from-achievements.md](decisions/titles-from-achievements.md) | Character identity via achievement-unlocked titles, not classes |
| [decisions/hand-authored-world-seed.md](decisions/hand-authored-world-seed.md) | Canonical world in `seedWorld.js`; Living World proc-gen stays opt-in |

## Ideas — future concepts (not adopted)

**When referencing an idea, ALWAYS name the file path** (e.g. `knowledge/ideas/autonomous-npcs.md`) so the user knows to read it before deciding. These are sketches, not plans — they need re-evaluation against the current state of the code before adoption.

See [ideas/README.md](ideas/README.md) for the full convention. Current ideas:

- [ideas/async-tool-pattern.md](ideas/async-tool-pattern.md)
- [ideas/autonomous-npcs.md](ideas/autonomous-npcs.md)
- [ideas/combat-auto-resolve.md](ideas/combat-auto-resolve.md)
- [ideas/declarative-event-routing.md](ideas/declarative-event-routing.md)
- [ideas/deferred-event-batching.md](ideas/deferred-event-batching.md)
- [ideas/prompt-fragment-system.md](ideas/prompt-fragment-system.md)

## Rules for editing this knowledge base

1. **Write for future-you.** Assume you're walking into this file cold, six weeks from now, while debugging.
2. **Code references over code duplication.** Point at [file.js:42](../path/file.js#L42) instead of pasting 30 lines — the file is the source of truth, not the knowledge doc.
3. **No git-log style.** "We used to do X, now we do Y" belongs in `git log`, not here. State the current rule.
4. **Verify before citing.** If a note names a file or function and you're about to act on it, grep first. Notes can go stale.
5. **Update on conflict.** If you discover a note is wrong, fix it in the same commit that touches the code. Don't create a new note contradicting the old.
6. **Don't duplicate CLAUDE.md.** CLAUDE.md is always-loaded and terse. Knowledge is on-demand and detailed. Never paste the same content in both.
