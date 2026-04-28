# Biome map + step movement (F5d)

The world has a continuous biome layer and free-vector movement on top of the
existing match-or-drop POI travel. Two ortogonal subsystems that ship together.

## Biome map — polygon source-of-truth, not tiles

The original idea ([knowledge/ideas/biome-tiles.md](../ideas/biome-tiles.md))
proposed a 21×21 `WorldTile` grid in Postgres. **We rejected that shape.** With
the player's continuous position (km-scale) and 250 m precision target,
discrete tile lookup is too coarse — a quarter-tile move shouldn't snap to
a different biome. Instead:

- **Source of truth** = Bezier path strings in
  [shared/domain/biomeMap.js](../../shared/domain/biomeMap.js), sampled at
  module load into flat polygon vertex arrays.
- **Lookup** = `getBiomeForCoords(x, y)` walks `BIOME_REGIONS` in reverse
  (topmost overlay wins) and runs ray-cast point-in-polygon. ~10 polygons ×
  ~30 vertices = constant cost, well below LLM/DB.
- **No DB rows.** No migration, no `WorldTile` model, no `tileId` FK on
  `WorldLocation`/`CampaignLocation`. The biome map is hand-authored code
  shared between FE and BE.
- **Visualization** = [plans/biome-tiles-proposal.svg](../../plans/biome-tiles-proposal.svg)
  is the editing surface. SVG path `d` strings paste verbatim into
  `biomeMap.js` (sampler flips Y once because SVG is svgY = -mapY).

### Layer order (matches the SVG)

1. plains background (no polygon — fallback when nothing else hits)
2. wasteland N strip
3. wasteland S strip
4. mountains (W wall + SW pocket)
5. hills (transition bridge between mountains and forest)
6. forest Czarnobór (massive C-shape)
7. wasteland Wilcze Pustkowia (ellipse island inside forest)
8. swamp Szeptające Trzęsawiska (SE blob, merges into forest)

Each region carries `{biome, danger, name?, polygon}`. `name` is the
human-readable region label (e.g. "Czarnobór"); regions without a name fall
back to the biome enum.

### Where biome is consumed

- [aiContextTools/contextBuilders/currentBiome.js](../../backend/src/services/aiContextTools/contextBuilders/currentBiome.js)
  resolves the player's current biome (continuous coords win, anchored POI
  is fallback) and surfaces it as `## [CURRENT BIOME]` in the prompt.
- [livingWorld/pathScan.js](../../backend/src/services/livingWorld/pathScan.js)
  samples biome along a movement segment for transition detection.
- [worldMap/tileMapRenderer.js](../../src/components/gameplay/worldMap/tileMapRenderer.js)
  paints biomes as a polygon underlay on the player map.

## Step movement — vector + match-or-drop coexistence

The intent classifier extracts movement requests in three kinds; they share
the `[MOVEMENT]` prompt block and pathScan output.

| Intent | Trigger | Carried as | Resolved by |
|---|---|---|---|
| Named-target travel | "idę do Kamionki", map click | `_travelTarget: 'Kamionka'` | `resolveLocationByName` → POI's regionX/Y |
| Free-vector | "1 km na północ", "500m W" | `_directionalMove: {azimuth, distanceKm}` | `applyMovementVector(curX, curY, az, dist)` |
| Dungeon nav | "idę na północ" (no distance) | `_dungeonDirection: 'N'` | dungeon room edge lookup |

**Distance is required for free-vector** — without it the phrase falls to
dungeon nav. This is deliberate: the player must commit to a number.

Order in [intentClassifier/heuristics.js](../../backend/src/services/intentClassifier/heuristics.js):
travel (named) → vector (with distance) → dungeon (direction-only).

### pathScan: 250 m radius along the segment

[pathScan.js](../../backend/src/services/livingWorld/pathScan.js) brute-forces
all top-level locations against the segment AB:

- `poisAlongPath` — perp distance ≤ 250 m, sorted by `alongKm`, with `side`
  ('left' / 'right' relative to A→B)
- `poisAtDestination` — euclidean distance ≤ 250 m from B
- `path.{fromBiome, toBiome, transitions[]}` — biome composition with
  transitions sampled every 0.25 km

### Pass-by discovery

Canonical POIs in `poisAlongPath` get flipped to `heard_about` via
`markLocationHeardAbout` ([userDiscoveryService.js](../../backend/src/services/livingWorld/userDiscoveryService.js)).
Walking past Świetłogaj reveals it on the map even if you never entered.

### World barriers (out-of-bounds)

[shared/domain/worldBarriers.js](../../shared/domain/worldBarriers.js) names
the obstacle blocking each cardinal:

- N: Robak Pożeracz Pól (gigantic burrowing worm)
- S: Robak Strażnik Trzewi (its twin)
- W: Pradawny Smok
- E: Bezkresny Ocean

`buildTravelBlock` clamps the destination to `Campaign.worldBounds` and emits
`barrierHit: {direction, barrier}`. The `[MOVEMENT]` prompt instructs the AI
to narrate the obstacle and stop the player at the boundary. The same names
also surface in `[WORLD BOUNDS]` per direction.

## Anchored vs wandering modes

`Campaign.currentLocation*` (FK trio) coexists with `Campaign.currentX/Y`
(continuous position). [processStateChanges/index.js](../../backend/src/services/sceneGenerator/processStateChanges/index.js)
handles three AI emission shapes:

| AI emits | Behaviour |
|---|---|
| `currentLocation` matches POI | **Anchored**: write FK trio + sync currentX/Y from POI |
| `currentLocation` unresolved + `currentX/Y` | **Wandering**: store flavor name (no FK), set coords. **Does NOT create a CampaignLocation row** — flavor is one-shot string |
| Bare `currentX/Y`, no name | Wandering with no flavor (clear name) |
| `currentLocation` unresolved, no coords | Drop with warning (legacy match-or-drop) |

Flavor names like "skraj Czarnoboru, otwarte pola" are deliberate: they
describe the patch of biome the player is standing on, but don't promote to
a persistent location row.

## What's deferred

- HUD compass / "1 km N" UI affordance — the player has to type it
- Random encounters along the path
- Travel time / fatigue
- Map click on empty biome → vector move (currently map clicks only fire on
  POIs)

## Critical-path files

| Task | File |
|---|---|
| Biome polygons + lookup | [shared/domain/biomeMap.js](../../shared/domain/biomeMap.js) |
| Vector intent parsing | [shared/domain/movementIntent.js](../../shared/domain/movementIntent.js) |
| World barriers | [shared/domain/worldBarriers.js](../../shared/domain/worldBarriers.js) |
| Path scan | [backend/src/services/livingWorld/pathScan.js](../../backend/src/services/livingWorld/pathScan.js) |
| `[CURRENT BIOME]` builder | [backend/src/services/aiContextTools/contextBuilders/currentBiome.js](../../backend/src/services/aiContextTools/contextBuilders/currentBiome.js) |
| `[MOVEMENT]` builder | [backend/src/services/aiContextTools/contextBuilders/travel.js](../../backend/src/services/aiContextTools/contextBuilders/travel.js) |
| `[MOVEMENT]` + `[WORLD BOUNDS]` render | [backend/src/services/sceneGenerator/contextSection.js](../../backend/src/services/sceneGenerator/contextSection.js) |
| State-change handler (anchored vs wandering) | [backend/src/services/sceneGenerator/processStateChanges/index.js](../../backend/src/services/sceneGenerator/processStateChanges/index.js) |
| Map biome layer + player marker | [src/components/gameplay/worldMap/tileMapRenderer.js](../../src/components/gameplay/worldMap/tileMapRenderer.js) |
| SVG visualization (editing surface) | [plans/biome-tiles-proposal.svg](../../plans/biome-tiles-proposal.svg) |
