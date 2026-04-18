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
- [combat-auto-resolve](combat-auto-resolve.md) — AFK handling in multiplayer combat rounds
- [declarative-event-routing](declarative-event-routing.md) — config-driven event dispatch
- [deferred-event-batching](deferred-event-batching.md) — debounced multi-event batching
- [living-world-vector-search](living-world-vector-search.md) — semantic NPC/location dedupe (deferred, name-dedupe is the current fallback)
- [prompt-fragment-system](prompt-fragment-system.md) — markdown fragments + LRU cache for prompts
