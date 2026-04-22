# Decision — Hand-authored global world seed, proc-gen kept experimental

## Context

Early Living World architecture (Phase A) generated the world around the capital Yeralden procedurally **for every campaign**: `worldSeeder.seedInitialWorld` rolled a ring of hamlets/villages/towns/cities on campaign create, picked names from `nameBank.js`, rolled a starting settlement type weighted against campaign length/difficulty. AI was also licensed to emit new top-level wilderness / ruins / camps mid-play via the `LIVING WORLD` block in the system prompt.

Three problems emerged as the project approached production:

1. **No shared canon between campaigns.** Every campaign got a different ring of settlements with randomly picked names. Lore-driven features (fame, reputation, quest chains referencing places by name) had nothing stable to anchor to.
2. **Testing/debugging cost.** Every reproduction of a scene-gen bug needed a fresh proc-gen world, and two playthroughs of "the same" start weren't actually the same.
3. **Scope creep for AI.** Letting premium invent new settlement types mid-play made every encounter an opportunity for naming inconsistency. Hardblocks kept stacking (no new `hamlet|village|town|city|capital` mid-play, travel-bounded, name distinctiveness rules) which added prompt weight without removing the class of bug.

## Options considered

### A) Double down on proc-gen

Keep `worldSeeder` as the default path, invest in a deterministic seed string on `Campaign` so re-runs reproduce the same world.

- ✓ Retains the "every campaign is different" fantasy
- ✓ Minimal short-term work (just wire a seed string through)
- ✗ Still no stable canon — two campaigns on different seeds share nothing
- ✗ Doesn't fix the AI-invents-locations prompt bloat
- ✗ Procedural names (`nameBank.js`) produce plausible but forgettable places; hand-authored villages have character (smell of resin at the Olbrami sawmill, Bremys the priest of Serneth at Kamionka)

### B) Full hand-authored, rip out Living World

Remove `worldSeeder.js`, `livingWorldEnabled` flag, all Phase A-F code. One world, same for everyone.

- ✓ Minimum complexity — one code path
- ✓ Perfect consistency across campaigns
- ✗ Throws away the agent loop, companion mode, reputation, fame — all of which ARE wanted long-term
- ✗ "Living world" has real replay value for future expansions; cutting it for a pre-prod simplification loses an axis the game will probably want back
- ✗ Large destructive diff for what is actually a content decision, not an architecture decision

### C) Hand-authored global seed as default, Living World kept opt-in — CHOSEN

Classic campaigns (the default) run against a single hand-authored world living in [backend/src/scripts/seedWorld.js](../../backend/src/scripts/seedWorld.js): capital Yeralden at (0,0), surrounding villages with their sublocations, NPCs, and inter-settlement edges. Every seed insertion is upsert-by-canonicalName, re-runnable, committed to the repo like any other content.

Living World stays gated behind `Campaign.livingWorldEnabled` (experimental). When enabled, `worldSeeder.seedInitialWorld` still runs to add a procedural ring around the hand-authored core — the two layers coexist: hand-authored below, proc-gen above.

AI's in-runtime authority is scoped down but not removed:
- **May** create: campaign-specific NPCs, sublocations inside existing settlements, temporary wilderness tied to an active quest.
- **May NOT** create: top-level settlements (`hamlet|village|town|city|capital`) — already hardblocked in `processStateChanges.BLOCKED_MIDPLAY_LOCATION_TYPES`. That rule stays.

The global seed grows over time. Iterations will add ruins, wilderness tiles, dungeons, and settlements in other regions, one batch per PR. Anything the player treats as a "place" eventually lives in `seedWorld.js`, not in a proc-gen call.

- ✓ Stable canon for classic campaigns from day one
- ✓ Testing/debugging reproducible — seed data is under version control
- ✓ Keeps Living World for experimentation (reputation/fame/companions/agent loop still make sense on top of a fixed base)
- ✓ Content edits (add a village, rename a tavern) = one file, one commit
- ✗ Pivot cost: earlier Phase A docs assumed proc-gen was the default; docs are being updated alongside this decision
- ✗ Adding new regions is manual work per PR — no "press button, get continent"

## Consequences

- **`seedWorld.js` is the single source of truth for canonical world state.** It runs at server boot ([server.js](../../backend/src/server.js) ~L220) as fire-and-forget, and as a belt-and-suspender inside `worldSeeder.seedInitialWorld`. Idempotent: upsert on `canonicalName` / `canonicalId`.
- **`worldSeeder.js` now layers on top, never replaces.** Hand-authored villages are pre-loaded into `existingNames` so `nameBank.pickSettlementName` automatically avoids colliding with them — no separate exclusion list to maintain.
- **Roads are seeded too, not just locations.** `seedWorld.js` auto-builds a road graph from settlement `(regionX, regionY)` positions: each top-level location links bidirectionally to its nearest neighbour only, with euclidean-km distance. Routed through `upsertEdge` from `travelGraph.js` so Dijkstra sees them like any other edge. Adding a new village means picking coordinates — the road snaps in on next seed.
- **AI prompt scope contracts slightly.** The `LIVING WORLD — new locations` block in [systemPrompt.js](../../backend/src/services/sceneGenerator/systemPrompt.js) already hardblocks settlement creation; no change required there for this decision. If we later seed all ruins/wilderness too, the block can shrink further (tracked in the roadmap below, not in scope of this decision).
- **`nameBank.js` stays**, because Living World opt-in campaigns still need it. If Living World ever gets removed, `nameBank` + `worldSeeder` go with it.
- **Decision-review trigger.** Re-open this when: (a) a new region requires so many hand-authored entries that proc-gen would be faster, (b) we want random-seed campaigns for replay variety in classic mode, or (c) the hand-authored seed file grows past ~1000L and needs structural split.

## Roadmap — what to seed next (out of scope here, informative)

Current global seed: Yeralden + 2 villages (Świetłogaj NE, Kamionka Stara SW) + their 4 sublocations + 4 NPCs + auto-built nearest-neighbour roads.

Next batches (one per PR, no fixed order):
- Ruins / wilderness tiles within the heartland region (`locationType: wilderness`, with or without hand-authored encounters)
- Additional villages / hamlets to fill out the heartland ring
- Second region beyond heartland (new `region` value)
- Seed dungeons via explicit entries in `seedWorld.js` — at which point `dungeonSeedGenerator.js` can be reassessed (might stay for Living World, might go away entirely)

## Critical files

- [backend/src/scripts/seedWorld.js](../../backend/src/scripts/seedWorld.js) — global hand-authored world seed (capital + villages + sublocations + NPCs + auto-built roads)
- [backend/src/services/livingWorld/worldSeeder.js](../../backend/src/services/livingWorld/worldSeeder.js) — per-campaign proc-gen ring (Living World only)
- [backend/src/services/livingWorld/settlementTemplates.js](../../backend/src/services/livingWorld/settlementTemplates.js) — capacity caps for settlement types (shared by both layers)
- [backend/src/routes/campaigns/crud.js](../../backend/src/routes/campaigns/crud.js) — POST `/v1/campaigns` gates `seedInitialWorld` on `livingWorldEnabled === true`
- [backend/src/services/sceneGenerator/processStateChanges.js](../../backend/src/services/sceneGenerator/processStateChanges.js) — `BLOCKED_MIDPLAY_LOCATION_TYPES` hardblocks AI from creating settlements

## Related

- [concepts/living-world.md](../concepts/living-world.md) — how the experimental layer works, phases 1-F
