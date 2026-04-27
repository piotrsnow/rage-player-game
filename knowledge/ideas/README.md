# Ideas — future concepts not yet adopted

Files in this folder describe **patterns and features we've considered but explicitly NOT built**. Each one has a "When it becomes relevant" section that names the trigger for adoption.

## Convention for Claude

If a recommendation references one of these ideas, **say so explicitly** so the user knows to open the file before acting:

> "This looks like a good fit for the `autonomous-npcs` idea in `knowledge/ideas/autonomous-npcs.md` — please read it before we decide."

Never silently act on an idea here as if it were an established pattern. The content is a starting sketch, not a design doc. Before adopting one:

1. Re-read the file and the linked source.
2. Confirm the "When it becomes relevant" trigger has actually hit.
3. Discuss with the user — decide to adopt, defer, or delete.
4. If adopted, promote the file content to `knowledge/patterns/` or `knowledge/concepts/` and delete it from `ideas/`.

## Current ideas

- [async-tool-pattern](async-tool-pattern.md) — non-blocking tool execution for agent loops
- [autonomous-npcs](autonomous-npcs.md) — NPCs with persistent goals that tick in the background
- [biome-tiles](biome-tiles.md) — pre-seeded terrain grid (mountains/forest/swamp/etc.) so AI inventions inherit context (post-F5b; supersedes hearsay placeholder-stub)
- [combat-auto-resolve](combat-auto-resolve.md) — AFK handling in multiplayer combat rounds
- [declarative-event-routing](declarative-event-routing.md) — config-driven event dispatch
- [deja-vu-npc-memory](deja-vu-npc-memory.md) — surface past-campaign memories as dream-like fragments in canonical NPCs (post-F5b)
- [deferred-event-batching](deferred-event-batching.md) — debounced multi-event batching
- [freeroam-mode](freeroam-mode.md) — explore canonical world without an active campaign as a second top-level mode (post-F5b)
- [living-world-admin-extras](living-world-admin-extras.md) — 2D map, audit UI, reputation dashboard, bulk moderation, cost panel (Phase 6 extras, deferred)
- [living-world-atonement-loop](living-world-atonement-loop.md) — redemption-arc quest to clear vendetta state (deferred)
- [living-world-cross-user-visibility](living-world-cross-user-visibility.md) — cross-user WorldEvent injection + spoiler filter (deferred)
- [living-world-npc-auto-dispatch](living-world-npc-auto-dispatch.md) — Cloud Tasks repeatable for background NPC ticks + ASYNC_TOOL loop (Phase 5 auto, deferred)
- [living-world-scene-orchestration](living-world-scene-orchestration.md) — DM directives + parallel per-NPC standard calls at end of scene (Phase 4 full, deferred)
- [living-world-vector-search](living-world-vector-search.md) — semantic NPC/location dedupe (deferred, name-dedupe is the current fallback)
- [npc-action-assignment](npc-action-assignment.md) — campaign-side `CampaignNPC.activeGoal` mechanic + radiant quest hooks; archived 2026-04-28 (post-quest mini-scene replaced the practical job)
- [prompt-fragment-system](prompt-fragment-system.md) — markdown fragments + LRU cache for prompts
- [side-quests-between-campaigns](side-quests-between-campaigns.md) — side/personal/faction quests as between-campaign feature (currently disabled in prompts + FE)
