# Hearsay + AI-created locations

Round B adds two inter-dependent prompt surfaces: NPCs can reveal
locations in dialog (bounded by an explicit knowledge set), and premium
can invent new per-campaign locations that get placed on the existing
grid as non-canonical rows.

## Hearsay — NPC dialog reveals locations

**Prompt side** — [`buildLivingWorldContext`](../../backend/src/services/aiContextTools.js)
emits a `hearsayByNpc` array: for each key NPC at the current location, the
set of locations they are ALLOWED to reveal. Resolved by
[`resolveNpcKnownLocations`](../../backend/src/services/livingWorld/campaignSandbox.js)
as `own location ∪ WorldNpcKnownLocation grants`. Edge = stricte zbudowana
droga (bezpieczne przejście) — Roads do NOT propagate NPC knowledge, so a
guard standing in the capital does not automatically know about every
village a Road links to. Reach beyond the home tile must be authored
explicitly via `WorldNpcKnownLocation` rows (seed + admin). Rendered in
the system prompt as:

    ## [NPC_KNOWLEDGE] — miejsca, o których każdy NPC MOŻE mówić
    - Kapitan Gerent wie o:
      · Koszary Królewskie (interior) [id: ...]
      · Zrujnowana Wieża Strażnicza (dungeon ⚠ safe) [id: ...]
      · …

**Response side** — scene-gen stateChanges accept a new bucket:

    "stateChanges": {
      "locationMentioned": [
        { "locationName": "<exact name from prompt>", "byNpcId": "<NPC name or CampaignNPC.npcId>" }
      ],
      ...
    }

**Policy enforcement** — [`processLocationMentions`](../../backend/src/services/sceneGenerator/processStateChanges/livingWorld.js)
resolves `locationName` against both canonical `WorldLocation` and per-campaign
`CampaignLocation` (uuid-fast-path → `resolveLocationByName` fallback). Canonical
hits run the NPC knowledge-scope check (anchor + 1-hop Roads + explicit
`WorldNpcKnownLocation`) — entries outside the NPC's allowed set are skipped.
Sandbox `CampaignLocation` hits skip the canonical knowledge check (no per-NPC
sandbox-knowledge schema exists; sandbox is already campaign-scoped so leak
risk is bounded). Accepted entries call `markLocationHeardAbout` which writes:
canonical → `UserDiscoveredLocation` (account scope), sandbox →
`CampaignDiscoveredLocation` row with `state='heard_about'`.

Violations are logged as policy warnings — nothing crashes, the AI just
doesn't get to smuggle unknown locations past the fog.

## AI-created campaign locations

**Top-level creation is fully blocked mid-play.** Whatever locationType the
AI emits in `stateChanges.newLocations` with `parentLocationName=null` is
silently dropped by
[`processLocationChanges`](../../backend/src/services/sceneGenerator/processStateChanges/locations.js)
— the only writers for top-level rows are seed time (`seedWorld.js`,
`worldSeeder.js`, `initialLocationsResolver.js`) and admin promotion
(`postCampaignLocationPromotion`). AI dungeons mid-play are also rejected
(no path exists in `processStateChanges`).

Sublocations (`parentLocationName` set) are still honored: walking into a
new tavern/forge/wing inside an existing settlement is fine, the AI emits
the entry and BE materializes it as a `CampaignLocation` (per-campaign
sandbox, no global cap — `topologyGuard.decideSublocationAdmission` only
rejects on missing/generic name now). The auto-promote rule in
`processStateChanges/index.js` then sets the new sub as `currentLocation`
when it sits in the player's walk-up chain.

Travel mid-play is match-or-drop: AI emits `stateChanges.currentLocation`
with the EXACT name of an existing fog-visible location (canonical
WorldLocation or this campaign's CampaignLocation). Unrecognized names
are dropped — the player stays put. See
[`processCurrentLocationChange`](../../backend/src/services/sceneGenerator/processStateChanges/index.js)
for the resolver. Travel intent + montage is driven by `## TRAVEL` in
[`contextSection.js`](../../backend/src/services/sceneGenerator/contextSection.js).

### Smart placer

The LLM isn't required to provide coordinates or even directional hints.
BE picks coords via [`computeSmartPosition`](../../backend/src/services/livingWorld/positionCalculator.js):

| Hint AI provides | Placement |
|---|---|
| Nothing | random angle 0–360°, random radius 0.1–2 km (default "close") |
| `distanceHint: "close"` (or `near`/`nearby`) | random angle 0–360°, radius 0.1–2 km |
| `distanceHint: "far"` (or `distant`) | random angle 0–360°, radius 2.1–4 km |
| `directionFromCurrent: N/NE/…/NW` only | cardinal angle (±22.5° on retries), radius from above |
| `directionFromCurrent` + `distanceHint` | cardinal angle (±22.5° on retries), specified radius |
| Legacy `travelDistance` enum (short/half_day/day/two_days/multi_day) | exact km per enum, direction if present else random angle |

The placer runs up to 20 collision-avoidance retries (0.5 km hard
collision radius). worldBounds clamp is internal — out-of-bounds
candidates get pulled to the edge rather than rejected, so AI narration
always materializes. The old strict `computeNewPosition` (requires
direction + travelDistance, drops on missing) is deprecated but still
exported for tests.

Note on `worldBounds`: it's a per-campaign AI-placement guardrail,
**not** the player-visible map range. The map viewport is a fixed
`-10..10` grid (see [living-world.md](./living-world.md) "Three things
that look the same but aren't"). A campaign with `boundsKm=2.5`
(Short) restricts where AI/worldSeeder drops new rows, but the player
still sees the full canonical world on their map.

### Row shape (post-F5b)

AI-created locations land in **`CampaignLocation`** (per-campaign sandbox,
not `WorldLocation`):

- `campaignId=<campaign>`, `name=<raw AI name>`, `canonicalSlug=slugify(name)`
  (slug-stable in-campaign lookup, unique per campaign).
- `dangerLevel` defaults to `safe`; premium can emit a value explicitly.
- Post-create, `markLocationDiscovered` is called with the polymorphic
  `(kind='campaign', id=<row>)` ref so the location immediately lands in
  the player's fog as "visited" (`CampaignDiscoveredLocation` row with
  `state='visited'`, triple PK `[campaignId, locationKind, locationId]`).
- Promotion to canonical (`WorldLocation`) is admin-gated via
  `LocationPromotionCandidate` queue — see [postgres-migration.md F5b](../../plans/postgres-migration.md).

## [WORLD BOUNDS] prompt hint

`buildLivingWorldContext` computes `worldBoundsHint` per scene:

    { remainingN: <km>, remainingS: <km>, remainingE: <km>, remainingW: <km> }

Rendered in `contextSection.js` as:

    ## [WORLD BOUNDS] — remaining travel room: N 3 km · S 5 km · E 2 km · W 4 km.
    Beyond that = edge of the known world (new locations past this boundary are rejected by the engine).

Premium uses this to avoid "you head east for hours" narration when the
campaign's eastern bound is 2 km away.

## Unified location query

[`locationQueries.listLocationsForCampaign(campaignId, opts)`](../../backend/src/services/livingWorld/locationQueries.js)
is the single-source query for "every location this campaign may see" —
canonical `WorldLocation` rows + per-campaign `CampaignLocation` rows
(F5b: each result row tagged with `kind` ∈ `{'world','campaign'}`,
normalized `displayName`). Options:

- `topLevelOnly` — drop sublocations
- `includeSubs` — default true
- `visibleOnly` + `userId` — filter via `loadCampaignFog` to only visited
  + heard-about ids

Used by the Round C player map endpoint and future travel-graph wiring.
