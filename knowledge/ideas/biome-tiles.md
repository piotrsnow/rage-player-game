# Biome tiles — pre-seeded terrain grid

## Idea

Replace "AI invents a location with no terrain context" with "world is pre-divided into biome tiles; AI inventions inherit the current tile's terrain." A `WorldTile` row owns a grid cell, a biome (mountains / forest / plains / swamp / wasteland / coast / urban), and a danger baseline. Every WorldLocation and CampaignLocation belongs to a tile via `tileId`. The player map renders a colored biome layer under POIs.

## Motivation

Two architectural pain points the current point-only model can't fix:

1. **AI emits `currentLocation: "Mroczna Polana"` with no spatial/terrain context.** Backend has no clue whether it's a forest, a hill, or a clearing. `processStateChanges/locations.js` falls back to `locationType='generic'` and a random-ish position via `computeSmartPosition`. Player map renders a generic dot. Encounter/danger scaling has nothing to anchor on.
2. **Hearsay placeholder stubs (the F5b deferred work) only defer the problem to "upgrade-on-enter,"** where the LLM still invents terrain from nothing. The terrain context never gets pinned down.

Tiles fix both at the source: the LLM sees `[CURRENT TILE: eastern wilderness, biome: mountains, danger: moderate]` in the prompt before inventing anything, and any new CampaignLocation in that tile is automatically a mountain location at coordinates inside the tile's bounds.

## Sketch

### Schema

```prisma
enum Biome {
  plains
  forest
  hills
  mountains
  swamp
  wasteland
  coast
  urban
}

model WorldTile {
  id            String   @id @default(uuid(7)) @db.Uuid
  // Grid coords match the existing -10..10 player map. Unique per cell.
  gridX         Int
  gridY         Int
  biome         Biome
  // Optional descriptor — "haunted moors", "wronia forest" — overrides the
  // bare biome label in player-facing text. Most tiles leave it null and
  // inherit the biome name.
  name          String?
  dangerLevel   DangerLevel @default(safe)
  description   String      @default("")
  worldLocations    WorldLocation[]
  campaignLocations CampaignLocation[]

  @@unique([gridX, gridY])
  @@index([biome])
}

// New columns on WorldLocation + CampaignLocation:
//   tileId String? @db.Uuid
//   tile   WorldTile? @relation(fields: [tileId], references: [id], onDelete: SetNull)
```

### Seeding

- `seedWorld.js` authors the canonical biome grid (e.g. 21x21 tiles for the existing -10..10 grid). Capital tile = `urban`, surrounding ring = `plains`, eastern edge = `mountains`, etc. **Hand-authored**, mirrors the existing `WorldLocation` canonical seed pattern.
- Every canonical `WorldLocation` upserted in `seedWorld.js` resolves its tile via `(gridX = floor(regionX), gridY = floor(regionY))` and writes `tileId`.

### Backend hooks

- `processStateChanges/locations.js`:
  - `processTopLevelEntry` — instead of `computeSmartPosition` placing freely, CLAMP to the current tile's bounds. AI emissions inherit the tile's `biome` → `locationType` mapping (mountains tile → `mountain` or `wilderness` locationType).
  - `processSublocationEntry` — sublocation inherits parent's `tileId`.
- `worldSeeder.js` — per-campaign settlement placement constrained to `plains`/`hills`/`coast` tiles (settlements don't spawn on mountain peaks).
- New context builder: `[CURRENT TILE]` block in scene prompt, listing `biome + dangerLevel + descriptor` for the player's tile + adjacent tiles.
- `findOrCreateCampaignLocation` — auto-assign `tileId` from `regionX/regionY`.

### Hearsay reframe

Drops the F5b placeholder-stub idea entirely:
- Hearsay references a TILE (or named region within a tile), not a specific point. `[NPC_KNOWLEDGE]` block can say "Karczmarz wspomina o starych ruinach gdzieś w mokradłach na południu" — points at the southern swamp tile, no point row needed.
- Player map shows tile annotation overlay ("rumored bandit camp in this tile") without committing to coordinates.
- When the player physically enters and AI emits `newLocations`, the location lands as a real `CampaignLocation` with `tileId` filled from the player's current tile.

### Player map

- Render biome layer (colored squares) under POIs. Use a muted palette so dots stay readable.
- Tile descriptor surfaces on hover.
- Optionally: show tile boundaries faintly so the player perceives the world as discrete regions.

## When it becomes relevant

- F5b shipped with "AI invents location with no terrain context" as an explicit known debt. First playtest where the AI's invented locations feel ungrounded (mountain shrine in a plains region, tavern in a swamp) is the trigger.
- Or: when the encounter/danger scaling needs a non-AI source of truth (e.g. wilderness tile = baseline `moderate`, mountain tile = `dangerous`).
- Or: when player feedback says "the world feels random / placeless" — the biome layer addresses it directly.

## Open design questions

1. **Resolution.** 21x21 (matches existing `-10..10` map) is the default. Coarser (7x7) = bigger biome regions but less granularity for "mountains here, foothills next tile" transitions. **Tentative pick: 21x21.**
2. **Per-campaign vs canonical-only.** Canonical map is shared across campaigns today. Tiles should match — every player sees the same biome grid. Per-campaign tile variance would lose the "shared world" feel. **Tentative pick: canonical-only.**
3. **Biome enum.** Default proposal: `plains, forest, hills, mountains, swamp, wasteland, coast, urban`. Add `desert, tundra, jungle` later if the world grows. Dungeons are NOT a biome — they're POIs *within* a tile.
4. **Boundary semantics.** A location strictly belongs to one tile (`tileId` not array). Locations near a boundary still pick one tile based on `floor(regionX), floor(regionY)`.
5. **Travel narration on tile transitions.** Optional polish: when player crosses from one biome to another, scene prompt gets a "TILE TRANSITION: forest → mountains" hint so AI narrates the change. Could be Phase 2.
6. **Per-tile `dangerLevel` vs per-location `dangerLevel`.** Both coexist. Tile is the baseline (`moderate` for wilderness); a specific dungeon inside that tile can be `deadly`. Encounter scaler reads max(tile, location).
7. **Custom-named regions.** "Wronia Forest" feels different from "generic forest tile #14". `WorldTile.name` (nullable) lets admin author meaningful region names. Tiles without a name fall back to biome label in prompts.
8. **Migration of existing locations.** Backfill `tileId` for every existing canonical + campaign location based on `regionX/regionY`. One-shot script in the F5c migration.

## What changes in code (when adopted)

- `backend/prisma/schema.prisma` — add `Biome` enum, `WorldTile` model, `tileId` columns on `WorldLocation` + `CampaignLocation`.
- `backend/src/scripts/seedWorld.js` — author the canonical biome grid; backfill `tileId` on every canonical location.
- `backend/src/services/livingWorld/worldSeeder.js` — constrain settlement placement to settlement-friendly biomes.
- `backend/src/services/sceneGenerator/processStateChanges/locations.js` — clamp `processTopLevelEntry` to current tile bounds; inherit `tileId` in `processSublocationEntry`.
- `backend/src/services/livingWorld/worldStateService.js` — `findOrCreateCampaignLocation` auto-assigns `tileId`.
- New: `backend/src/services/livingWorld/tileService.js` — `getTileForCoords(x, y)`, `getTileById(id)`, `getAdjacentTiles(tile)`.
- New: `backend/src/services/aiContextTools/contextBuilders/currentTile.js` — `[CURRENT TILE]` prompt block.
- `src/components/gameplay/worldMap/PlayerWorldMap.jsx` — biome layer renderer.
- `src/components/admin/adminLivingWorld/tabs/AdminTileGridView.jsx` — biome editing surface for admin.

## Adjacent

- [freeroam-mode](freeroam-mode.md) — biome tiles make freeRoam more readable; the player exploring "mountains east of the capital" is a clearer mental model than "wandering canonical points."
- [living-world-admin-extras](living-world-admin-extras.md) — biome admin editor (paint tiles) is a natural addition to the admin world tools.
- F5b's known debt: "Hearsay (`processLocationMentions`) is canonical-only" — biome tiles supersede the placeholder-stub fix.
