# Living World — cross-campaign persistent world

Per-campaign scope lives in `Campaign*` tables (scenes, NPCs, codex). The
Living World layer adds a shared, campaign-transcending state that feeds
back into each player's scene generation: canonical NPCs, locations,
world events, reputation, and dungeons.

## When it's on

`Campaign.livingWorldEnabled: Boolean` — opt-in per campaign, set in the
creator UI. All Phase 1-7 code paths gate on this flag before touching
Living World tables so legacy campaigns stay unaffected.

## Phases shipped

| Phase | What it adds | Primary services |
|---|---|---|
| 1 | `WorldLocation` + `WorldNPC` + `WorldEvent` ledger, basic context injection | `worldStateService`, `worldEventLog`, `aiContextTools.buildLivingWorldContext` |
| 2 | Companion mode, per-campaign lock, deferred outbox | `companionService`, `deferredOutbox` (inline `npcPromotion` deleted in Round E Phase 12b Slice B — canonical promotion is post-campaign admin-review only now) |
| 3 (partial) | Reputation + attribution ledger schema; `visibility='global'` reads enabled; rate limit + anonymization deferred | `reputationService`, `worldEventLog.forLocation`, `reputationHook` |
| 4 | DM agent memory per campaign, item attribution hints | `dmMemoryService`, `dmMemoryUpdater`, `processStateChanges.processItemAttributions` |
| 5 | NPC agent loop (on-demand ticks), quest-driven goal assigner, background goals, event-driven global triggers | `npcAgentLoop`, `questGoalAssigner`, `globalNpcTriggers`, `npcTickDispatcher` |
| 6 | Admin dashboard (read-only) | [backend/src/routes/adminLivingWorld.js](../../backend/src/routes/adminLivingWorld.js), [src/components/admin/AdminLivingWorldPage.jsx](../../src/components/admin/AdminLivingWorldPage.jsx) |
| 7 | Travel graph + discovery, deterministic dungeon seeding, world time tuning | `travelGraph`, `userDiscoveryService`, `dungeonSeedGenerator`, `dungeonEntry`, `contentLocalizer` |
| A | Per-campaign settlement seeding at creation (hamlet/village/town/city, bounded map centered on Yeralden), `settlementCaps` + `worldBounds` on Campaign | `worldSeeder.seedInitialWorld`, `nameBank.pickSettlementName` |
| B | Block mid-play settlement creation (settlements are creation-time-only); only wilderness/camp/ruin/cave/forest/dungeon allowed mid-play. SEEDED SETTLEMENTS block injected into scene prompt | `processStateChanges.BLOCKED_MIDPLAY_LOCATION_TYPES`, `aiContextTools.buildSeededSettlementsBlock` |
| C | Saturation-curve prompt hint — compares settlement count vs `settlementCaps` + key-NPC count vs `maxKeyNpcs` and injects a "WORLD IS NEARLY FULL" / "prefer existing" nudge at the top of the LIVING WORLD block | `aiContextTools.buildSaturationHint` |
| D | Hybrid quest-giver picker — when nano flags `quest_offer_likely` AND saturation is tight, BE pre-selects a weighted-random existing NPC (60% local / 30% low-quest / 10% wildcard, role-affinity filtered) and injects a `SUGGESTED QUEST-GIVER` line into the dynamic suffix | `questGoalAssigner.pickQuestGiver`, `intentClassifier.quest_offer_likely`, `systemPrompt` suffix |
| E | Custom-sublocation budget scaled by `difficultyTier` — `customCap` added to `SETTLEMENT_TEMPLATES`, multiplied by `{low:0, medium:1.0, high:1.5, deadly:2.0}` per-campaign at admission time. Capital remains global but each campaign's additions count against its own tier | `settlementTemplates.effectiveCustomCap`, `topologyGuard.decideSublocationAdmission` custom branch |
| F | Travel montage (compress trip > 5 km to ONE scene; injected via TRAVEL MONTAGE MODE instruction) + `worldBounds` enforcement in `processTopLevelEntry` (out-of-bounds new top-level rejected) | `aiContextTools.buildTravelBlock` montage flag, `processStateChanges.processTopLevelEntry` bounds check |
| G — Round A | Schema + content foundation for the plans/living-world-grid-quests-triggers-fog.md roadmap: canonical/non-canonical fog-of-war split, NPC categories, hand-authored wilderness/dungeons/ruins, NPC explicit knowledge seeding, admin-editable world lore injected into every scene | `seedWorld.js` (content + `isCanonical=true` flag), `userDiscoveryService` (canonical/non-canonical routing + `markLocationHeardAbout` + `loadCampaignFog`), `questGoalAssigner.categorize` + `NPC_CATEGORIES`, `aiContextTools.buildWorldLorePreamble`, admin routes `/v1/admin/livingWorld/lore` |
| H — Round B | Independent CampaignNPC shadow + WorldNPC split (each carries its own activeGoal — canonical ticks in background, shadow tracks quest role), hard-bound starter quest (`startSpawnPicker`), `onComplete.moveNpcToPlayer` quest trigger, hearsay dialog (`[NPC_KNOWLEDGE]` + `locationMentioned` bucket + policy), AI-generated non-canonical locations placed by smart placer (distanceHint + optional direction + random fallback), unified `listLocationsForCampaign` query, `[WORLD BOUNDS]` prompt hint, NPC source policy in quest-gen. See [campaign-sandbox.md](./campaign-sandbox.md) and [hearsay-and-ai-locations.md](./hearsay-and-ai-locations.md) | `campaignSandbox.js`, `startSpawnPicker.js`, `locationQueries.js`, `positionCalculator.computeSmartPosition`, `processStateChanges.fireMoveNpcToPlayerTrigger` + `processLocationMentions`, `campaignGenerator` starter-bind block, `aiContextTools.buildLivingWorldContext` hearsayByNpc + worldBoundsHint |
| I — Round C | Player tile-grid map (fixed -10..10 grid = canonical world extent, three-state fog with visited / heard-about / unknown, synthetic-message travel dispatch) + sublocation drill-down (parent-sized sub-grid, `Wchodzę do …` dispatch, back = local toggle) + admin Force/Tile-grid toggle with sub-grid drill-down modal (bypass fog) | `routes/livingWorld.js` `GET /campaigns/:id/map`, `routes/adminLivingWorld.js` `GET /graph/sublocations/:parentId`, `hooks/useCampaignMap`, `components/gameplay/worldMap/*` (incl. `SubLocationGrid.jsx` + `subGridRenderer.js`), `components/admin/adminLivingWorld/tabs/{MapTab.jsx, AdminTileGridView.jsx}` |
| J — Round E Phase 9 | `WorldEntityEmbedding` table + `ragService` unified retrieval for world-scope entities (canonical NPCs/locations, non-canonical campaign locations, dungeon rooms, future lore chunks + promotion candidates). Naive in-process cosine similarity, OpenAI `text-embedding-3-small` (1536d), fire-and-forget index at every world-entity creation site, idempotent `batchBackfillMissing` at end of `seedWorld`. Diverges from campaign-scope vector search (Atlas `$vectorSearch` with inline `embedding` fields) to stay under Atlas shared-tier index cap — swap-friendly when scale demands | `backend/src/services/livingWorld/ragService.js`, `backend/src/services/embeddingService.buildLocationEmbeddingText`, `backend/src/scripts/seedWorld.js#backfillRagEmbeddings`, hooked into `worldStateService.{findOrCreateWorldLocation, findOrCreateWorldNPC, createSublocation}`, `processStateChanges/locations.js`, `worldSeeder.js`, `dungeonSeedGenerator.js` |
| K — Round E Phases 10/11/12/12-lite/12b | Post-campaign world write-back orchestrator (`runPostCampaignWorldWriteback`). Shadow diff vs canonical (Phase 10) → Haiku fact extraction from compressed memory (Phase 11) → resolver + confidence tiering (Phase 12): HIGH NPC-kind (shadow-corroborated) auto-appends to `WorldNPC.knowledgeBase`; MEDIUM + all locations + unsupported HIGH upsert into `PendingWorldStateChange` (`computeIdempotencyKey` SHA-1 hash, sticky admin status, **no normalization** — different phrasings become distinct rumors) → narrow `alive`/`location` auto-apply to WorldNPC (Phase 12-lite) → NPC promotion pipeline (Phase 12b: stats/structural quest count → dialog sample harvest → Haiku verdict `{recommend, uniqueness, worldFit, reasons}` → cross-campaign dedup via `ragService('promotion_candidate')` → upsert `NPCPromotionCandidate`). Inline `maybePromote` deleted — canonical `WorldNPC` never created mid-play. **No trigger wired** (Phase 13a) | `backend/src/services/livingWorld/postCampaignWriteback.js`, `postCampaignFactExtraction.js`, `postCampaignWorldChanges.js`, `postCampaignPromotion.js`, `postCampaignPromotionVerdict.js`; `WorldLocation.knowledgeBase` + `PendingWorldStateChange` + `NPCPromotionCandidate` in `schema.prisma` |

## Three things that look the same but aren't: canonical world, per-campaign seed, map viewport

It's easy to conflate these because they all talk about "the world". They are distinct:

1. **Canonical world — global, immutable during play.** [backend/src/scripts/seedWorld.js](../../backend/src/scripts/seedWorld.js) upserts a fixed set of ~20 hand-authored `WorldLocation` rows (capital + named villages + dungeons + wilderness + ruins) with `isCanonical=true`. **Same for every campaign.** The player-facing map renders from these rows (plus whatever non-canonical rows the current campaign has created).
2. **Per-campaign ephemeral seed — hamlets/villages/towns/cities generated at campaign creation.** [worldSeeder.js](../../backend/src/services/livingWorld/worldSeeder.js) (Phase A) picks count + bounds from the campaign's `length` and scatters fresh settlement rows on a ring around (0,0). These rows become canonical too (they live in `WorldLocation`), but were not authored — they were generated for this campaign's flavor.
3. **Player map viewport — fixed `-10..10` grid.** The tile-grid map (`PlayerWorldMap.jsx`, Round C) always renders on a global `-10..10` range — it does **not** consult `Campaign.worldBounds`. The canonical world is the map; the grid is the canvas.

The per-campaign field **`Campaign.worldBounds`** is an **AI/seeder placement guardrail**, not a viewport:
- `worldSeeder.seedInitialWorld` uses it to decide the ring radius when scattering ephemeral settlements.
- `processTopLevelEntry` (Phase F) uses it to reject AI-emitted new top-level locations that fall outside the range.
- `buildWorldBoundsHint` uses it to tell premium "you have N km of remaining room to the N/E/S/W".
- **No UI reads it.** The BE map endpoint does not return it; the FE renderer does not consume it.

When in doubt: canonical + bounds are BE concerns (placement, AI constraints); the map viewport is a FE constant.

## Global visibility — what bubbles up

Events default to `visibility='campaign'`. Only a narrow set gets promoted:

- **`campaign_complete`** — player resolved the main conflict. Payload:
  `{title, summary, majorAchievements, locationName}`. Written by
  `processStateChanges.processCampaignComplete` (B).
- **`major_deed`** — AI flagged `worldImpact: 'major'` + code gate
  confirmed (named-NPC killed, main-quest done, `locationLiberated`,
  deadly encounter, dungeon complete). See
  `shouldPromoteToGlobal` in [processStateChanges.js](../../backend/src/services/sceneGenerator/processStateChanges.js) (C).
- **`dungeon_cleared`** / **`deadly_victory`** — self-gating, written by
  the same processor when the appropriate stateChanges flag fires.
- **Nano audit** — side quests that finish quietly get a cheap nano check
  (`auditQuestWorldImpact`) asking "is this gossip-worthy?" as a backup
  for premium forgetting to flag (C1).

Fame/infamy feed from these events into `Character.fame` / `.infamy`
thresholds (E). Renown crossings turn on the systemPrompt RENOWN suffix
for first-time NPC meetings (G4).

## Phase G — Round A (plan: [plans/living-world-grid-quests-triggers-fog.md](../../plans/living-world-grid-quests-triggers-fog.md))

Foundation pass for the "grid map + quests + triggers + fog" roadmap.
Subsystem-level docs:

- **Fog-of-war** — canonical vs non-canonical split, three visibility
  states. See [fog-of-war.md](./fog-of-war.md).
- **World lore** — admin-editable `WorldLoreSection` injected into every
  scene prompt. See [world-lore.md](./world-lore.md).

New `WorldLocation` columns: `isCanonical`, `knownByDefault`, `dangerLevel`
(safe|moderate|dangerous|deadly), `subGridX/Y` (hand-authored drill-down
slots), `createdByCampaignId`, `displayName`.

New `WorldNPC` / `CampaignNPC` columns: `category` (guard | merchant |
commoner | priest | adventurer — seed guarantees ≥1 per bucket),
`knownLocationIds` on WorldNPC for explicit hearsay authorization (Round B
will wire this into scene prompts).

`seedWorld.js` now carries:
- 17 new canonical locations on the heartland 10×10 grid: 4 dungeons
  (safe/moderate/dangerous/deadly), 6 wilderness, 4 ruins, 3 roadside POI.
  Road fan-out from the capital with difficulty matching each tile.
- Sub-grid coords (`subGridX/subGridY`) for every capital + village
  sublocation — used by the Round C drill-down UI.
- Kupiec Dorgun in the Grand Market (fills the `merchant` category bucket).
- `WorldLoreSection { slug:"main" }` starter row so the scene-gen cache has
  a well-defined "empty preamble" default.

Round B (quest binding + triggers), Round C (UI: grid map + drill-down),
Round D (deferred — biome + lore RAG), Round E (post-campaign write-back +
NPC/location promotion candidates) ride on top of this schema. Plan file
has the phase-by-phase breakdown.

## Phase H — Round B (campaign sandbox + hearsay + AI locations)

Implementation-level docs:
- [campaign-sandbox.md](./campaign-sandbox.md) — Independent WorldNPC vs
  CampaignNPC model, field ownership matrix, clone triggers, dropped hacks.
- [hearsay-and-ai-locations.md](./hearsay-and-ai-locations.md) — `[NPC_KNOWLEDGE]`
  prompt block, `locationMentioned` policy, smart placer, `[WORLD BOUNDS]`
  hint, non-canonical location placement.

New schema columns (Round B additions only — no migration of existing
canonical columns):
- `CampaignNPC`: `lastLocationId`, `pendingIntroHint`, `activeGoal`,
  `goalProgress`, `category` (campaign-scoped; goal/progress
  INDEPENDENT of WorldNPC's — no mirror, no fallback).
- `CampaignQuest.forcedGiver` — set by `startSpawnPicker` so the initial
  quest-giver bind sticks past saturation logic.

Dropped columns (dead hacks from pre-shadow era):
- `WorldNPC.goalTargetCampaignId`, `goalTargetCharacterId` — replaced by
  the shadow-split architecture.

Campaign creation (crud.js POST) now honours `parsed._startSpawn` from the
campaignGenerator SSE stream: overrides `currentLocation` to the picked
sublocation, flags matching quests with `forcedGiver=true`, clones the
starter NPC as CampaignNPC, and discovers the sublocation canonically.

Open follow-ups: `npcLifecycle` pause semantics still operate on canonical
row (could migrate to shadow if per-campaign pause is ever needed).
AI-sublocation `subGridX/Y` — resolved in Round C via
`subGridRenderer.layoutSubsWithFallback`: missing coords get row-major
auto-fill against the parent's grid size (capital/city 10×10, town 7×7,
village/hamlet/ruin/dungeon/cave 5×5), overflow silently dropped.

## NPC tick model (D — clone architecture)

Global NPCs (`WorldNPC`) live in ONE location and tick only when
triggered:

- **`onLocationEntry`** — player enters a WorldLocation: top-3 local
  NPCs tick once (throttled per-campaign via `lastLocationPingAt`).
- **`onDeadlinePass`** — any NPC whose `goalDeadlineAt` passed: tick
  once, batch capped (5 default).
- **`onCrossCampaignMajor`** — another campaign's global event fires in
  this location: nearby NPCs ripple once.

See [npc-clone-architecture.md](./npc-clone-architecture.md) for the
clone vs global split and reconciliation rules.

## Phase A — settlement seeding at campaign creation

Every `livingWorldEnabled` campaign is seeded with a bounded set of settlements when POST `/v1/campaigns` runs. The seed:

1. Calls `seedWorld()` belt-and-suspender (ensures global hand-authored world exists — capital Yeralden + surrounding villages + their NPCs + inter-settlement edges. Idempotent; see [decisions/hand-authored-world-seed.md](../decisions/hand-authored-world-seed.md) for why the global seed grows over time instead of being proc-gen).
2. Reads `length` from `coreState.campaign.length` (`Short|Medium|Long`) → settlement count table:
   - **Short**: 1 hamlet + 1 village, bounds ±2.5 km
   - **Medium**: 2 hamlets + 2 villages + 1 town, bounds ±5 km
   - **Long**: 3 hamlets + 3 villages + 2 towns + 1 city, bounds ±10 km
3. Picks names from [nameBank.js](../../backend/src/services/livingWorld/nameBank.js) (Polish-themed pools, ~30 per type, falls back to roman-numeral suffix on collision). All hand-seeded canonical names (capital + globally seeded villages like `Świetłogaj`, `Kamionka Stara`) are implicitly excluded because `worldSeeder` pre-loads the full set of existing `WorldLocation.canonicalName`s before naming.
4. Places settlements on a ring around (0,0) so Yeralden stays reachable, auto-creates bidirectional `WorldLocationEdge` rows between ring neighbors AND between every seeded settlement ≤10 km from (0,0) and the capital.
5. Picks a starting settlement by weighted random:
   - **Default pool** (capital NOT eligible): `hamlet 10% / village 70% / city 20%` — falls back to `town` if no city seeded.
   - **Capital-eligible pool** (length=Long OR `difficultyTier ∈ {'high','deadly'}`): `hamlet 5% / village 55% / city 20% / capital 20%`.
6. Persists `settlementCaps` (JSON `{hamlet:n, village:n, town:n, city:n}`) + `worldBounds` (JSON `{minX, maxX, minY, maxY}`) on the `Campaign` row.
7. Returns `startingLocationName` → caller merges it into `coreState.world.currentLocation` before character-lock.

Failures are logged but non-fatal — campaign create succeeds with empty `world.locations[]` if seeding throws.

## Phase B — mid-play settlement creation blocked

`processTopLevelEntry` in [processStateChanges.js](../../backend/src/services/sceneGenerator/processStateChanges.js) rejects `locationType ∈ {hamlet, village, town, city, capital}` mid-play. Only `wilderness`, `forest`, `ruin`, `camp`, `cave`, `dungeon`, `interior` are allowed. The system prompt tells premium this explicitly (see TOP-LEVEL section of the LIVING WORLD block).

The `SEEDED SETTLEMENTS` block (built by `buildSeededSettlementsBlock` in [aiContextTools.js](../../backend/src/services/aiContextTools.js)) injects the canonical list — every settlement within `worldBounds` plus the global capital — with distance-from-current, sorted nearest-first. Premium uses this to redirect "player searches for a village" into an existing named settlement instead of inventing one.

## Phase C — saturation-curve hint

`buildSaturationHint` in `aiContextTools.js` runs as part of `buildLivingWorldContext`. It computes two budgets:

- **Settlement budget** — `(cap - existing)/cap` over `hamlet|village|town|city` in the campaign's `worldBounds` (capital excluded, it's global).
- **NPC budget** — `(cap - keyNpcCount)/cap` for the CURRENT top-level settlement (parent walk-up if the player is in a sublocation).

The lower of the two decides the hint level: `< 0.2` → "WORLD IS NEARLY FULL — reuse existing settlements/NPCs"; `< 0.5` → "Prefer existing settlements/NPCs"; otherwise nothing. Rendered at the top of the LIVING WORLD block in `contextSection.js`.

## Phase D — hybrid quest-giver picker

Nano's output schema now includes `quest_offer_likely` — true when the player solicits paid work ("szukam zlecenia", "any odd jobs?"). When that fires AND Phase C reports either budget < 0.5, `generateSceneStream` calls `pickQuestGiver(campaignId, currentLocation)`:

1. Loads all CampaignNPCs + the subset of outstanding quest assignments.
2. Filters by alive + key (via WorldNPC `keyNpc`) + role-affinity to the quest type (role keywords from `ROLE_AFFINITY`).
3. Partitions candidates into three buckets: **local** (current-location OR edge-adjacent via `loadCampaignGraph`), **lightly-assigned** (`<2` quests as giver/turn-in), **wildcard** (all eligible).
4. Weighted roll 60 / 30 / 10 — empty buckets redistribute, so a sparse roster still picks *someone* whenever eligible NPCs exist.
5. Returns `{name, role, location}` or null. The hint is injected into the premium dynamicSuffix as `SUGGESTED QUEST-GIVER: <name> (<role>) at <location>`.

Premium MAY deviate — the hint is non-binding.

## Phase E — difficulty-scaled custom cap

`SETTLEMENT_TEMPLATES` now carries `customCap`: `{hamlet:0, village:1, town:2, city:3, capital:5}`. At sublocation-admission time (`processSublocationEntry`) the effective cap is `floor(base * DIFFICULTY_CUSTOM_CAP_MULTIPLIER[tier])` with `{low:0, medium:1.0, high:1.5, deadly:2.0}`. `decideSublocationAdmission` rejects custom entries beyond this cap with `reason: 'custom_cap_exceeded'`. The SUBLOCATIONS block in `contextSection.js` surfaces `customBudgetRemaining` so premium knows when to fall back to optional slots only.

Capital note: Yeralden is shared across campaigns, but each campaign's tier governs *its own* additions. A deadly run can add 10 custom sublocations; a concurrent low-tier run sees them read-only and can't add more.

## Phase F — travel montage + bounds enforcement

Two independent additions:

1. **Travel montage** — when `buildTravelBlock` resolves a known-graph path (direct or sensible detour) with `totalDistance > 5 km`, the block sets `montage: true`. `contextSection.js` injects `TRAVEL MONTAGE MODE` instructions telling premium to compress the journey into one 1-2-paragraph scene with at most one minor incident, skipping per-waypoint narration.
2. **Bounds enforcement** — `processLocationChanges` fetches `campaign.worldBounds` once per batch and `processTopLevelEntry` rejects any new top-level WorldLocation whose computed `regionX/regionY` falls outside those bounds. Silent reject — premium's narration still lands, BE just doesn't materialize the row. (Note: this is an AI-placement guardrail; it does not affect what the player sees on the map — the player map always renders the full canonical `-10..10` grid regardless.)

## Critical files

| Purpose | File |
|---|---|
| Schema | [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma) (WorldLocation, WorldNPC, WorldEvent, WorldReputation, WorldNpcAttribution, Campaign.settlementCaps + worldBounds) |
| Event log | [worldEventLog.js](../../backend/src/services/livingWorld/worldEventLog.js) |
| Context assembly | [aiContextTools.js](../../backend/src/services/aiContextTools.js) `buildLivingWorldContext`, `buildSeededSettlementsBlock` |
| Promotion (post-campaign admin-review) | [postCampaignPromotion.js](../../backend/src/services/livingWorld/postCampaignPromotion.js) + [postCampaignPromotionVerdict.js](../../backend/src/services/livingWorld/postCampaignPromotionVerdict.js) (Round E Phase 12b); inline `npcPromotion.js` deleted |
| Lifecycle (pause / resume) | [npcLifecycle.js](../../backend/src/services/livingWorld/npcLifecycle.js) |
| Post-campaign write-back orchestrator | [postCampaignWriteback.js](../../backend/src/services/livingWorld/postCampaignWriteback.js) (Round E Phases 10/11/12/12-lite/12b) |
| Post-campaign world-change pipeline | [postCampaignWorldChanges.js](../../backend/src/services/livingWorld/postCampaignWorldChanges.js) (Round E Phase 12 — HIGH NPC auto-apply + `PendingWorldStateChange` for MEDIUM + locations) |
| Goals (quest + background) | [questGoalAssigner.js](../../backend/src/services/livingWorld/questGoalAssigner.js) |
| Global tick triggers | [globalNpcTriggers.js](../../backend/src/services/livingWorld/globalNpcTriggers.js) |
| Clone reconciliation | [cloneReconciliation.js](../../backend/src/services/livingWorld/cloneReconciliation.js) |
| Fame service | [fameService.js](../../backend/src/services/livingWorld/fameService.js) |
| Quest audit | [questAudit.js](../../backend/src/services/livingWorld/questAudit.js) |
| Dungeons (Phase 7) | [dungeonSeedGenerator.js](../../backend/src/services/livingWorld/dungeonSeedGenerator.js), [dungeonEntry.js](../../backend/src/services/livingWorld/dungeonEntry.js), [contentLocalizer.js](../../backend/src/services/livingWorld/contentLocalizer.js), [backend/src/data/dungeonTemplates.js](../../backend/src/data/dungeonTemplates.js) |
| Phase A seeding | [worldSeeder.js](../../backend/src/services/livingWorld/worldSeeder.js), [nameBank.js](../../backend/src/services/livingWorld/nameBank.js), [scripts/seedWorld.js](../../backend/src/scripts/seedWorld.js) (global hand-authored world: Yeralden + surrounding villages — currently Świetłogaj, Kamionka Stara — + all their sublocations, NPCs, and inter-settlement edges) |
| Phase B mid-play guard | [processStateChanges.js](../../backend/src/services/sceneGenerator/processStateChanges.js) `BLOCKED_MIDPLAY_LOCATION_TYPES` |
| Phase C saturation hint | [aiContextTools.js](../../backend/src/services/aiContextTools.js) `buildSaturationHint`, [contextSection.js](../../backend/src/services/sceneGenerator/contextSection.js) tight/watch render |
| Phase D quest-giver picker | [questGoalAssigner.js](../../backend/src/services/livingWorld/questGoalAssigner.js) `pickQuestGiver`, [intentClassifier.js](../../backend/src/services/intentClassifier.js) `quest_offer_likely`, [generateSceneStream.js](../../backend/src/services/sceneGenerator/generateSceneStream.js) wiring |
| Phase E custom-cap scaling | [settlementTemplates.js](../../backend/src/services/livingWorld/settlementTemplates.js) `customCap` + `effectiveCustomCap`, [topologyGuard.js](../../backend/src/services/livingWorld/topologyGuard.js) custom branch |
| Phase F travel + bounds | [aiContextTools.js](../../backend/src/services/aiContextTools.js) `buildTravelBlock` montage flag, [processStateChanges.js](../../backend/src/services/sceneGenerator/processStateChanges.js) `processTopLevelEntry` bounds check |

## Deferred

- **Phase 3 full** — rate limit per campaign, spoiler filter for active
  quest overlap, anonymization of payload identifiers. Current payloads
  are meta-only (title/summary/locationName), so minimal-viable cross-
  campaign reads ship without these.
- **Phase 5 auto-dispatch** — Cloud Tasks scheduled worker to tick NPCs
  without player scenes. See [knowledge/ideas/living-world-npc-auto-dispatch.md](../ideas/living-world-npc-auto-dispatch.md).
- **Scene orchestration round** — parallel agent reactions post-narration.
  See [knowledge/ideas/living-world-scene-orchestration.md](../ideas/living-world-scene-orchestration.md).
