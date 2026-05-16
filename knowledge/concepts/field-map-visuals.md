# Field map visuals pipeline

Entering a location triggers two parallel results: the **logic grid** (returned synchronously, so the player can already walk around) and the **visual layer** (filled in by an async worker — atlas of pixel-art tiles + stamps generated per location).

## Why two layers

Gameplay logic (`tiles[][]`, `objects`, `exits`, `entities`, `spawnPoint`) lives on the canonical battlefield tile IDs from [`shared/domain/battlefieldTiles.js`](../../shared/domain/battlefieldTiles.js). Pathfinding, fog-of-war, combat — everything reads from there.

The visual layer is purely cosmetic. The LLM emits an *art manifest* alongside the grid:
- `styleAnchor` — shared style suffix (EN) for every prompt.
- `assets[]` — deduplicated list of visual elements with EN prompts + footprints (1×1 tile, 2×2 stamp, etc).
- `visualPlacements[]` — where each asset is anchored on the grid (top-left cell for stamps).

A background worker materializes the manifest into an actual atlas PNG via Stable Diffusion (SD-WebUI / Stability) + Sharp compositing, imports it into Map Studio under the campaign owner's `userId`, and patches the board with `visualPack: { packId, tilesetId, palette, imageKey, ... }`.

## Schema (v1 vs v2)

| Version | Shape | Status |
|---------|-------|--------|
| v1 | logic only | legacy procedural / fallback path |
| v2 | logic + visual manifest + (eventually) visualPack | LLM standard tier |

`ExplorationBoardSchema` ([shared/domain/explorationBoard.js](../../shared/domain/explorationBoard.js)) is a `z.discriminatedUnion('version', [...])` — readers accept either. Helpers:
- `isExplorationBoard(board)` — true for v1 or v2.
- `hasVisualLayer(board)` — true only when v2 + non-empty `assets`.

## Pipeline

```
FE → POST /v1/campaigns/:id/location-board
       ↓
    locationBoard.js route (backend/src/routes/ai/locationBoard.js)
       • standard-tier LLM call (returns logic grid + asset manifest)
       • persist tacticalGrid v2 with visualStatus=pending
       • enqueuePostLocationBoardVisuals(...)
       ↓ async
    runLocationBoardVisuals (backend/src/services/fieldMapVisual/index.js)
       • generateTilePng per asset (3 in parallel; SD-WebUI or Stability)
       • buildAtlas — sharp compositing, deterministic (col, row) per asset
       • importTilesetPack — under campaign owner's userId, deterministic
         pack name `campaign:<id>:loc:<kind>:<id>` (idempotent upsert)
       • renderTileVariant @ projectTilesize (default 24 px)
       • patch tacticalGrid with visualPack + visualStatus=ready
       ↓
    FE useLocationBoardVisuals hook (src/hooks/useLocationBoardVisuals.js)
       • polls POST location-board every 4s while pending (max ~2 min)
       • on ready: loads atlas PNG via /v1/media/file/<imageKey>
       • drawAtlasLayer paints over the colored-tile fallback in canvas
```

## Sizes

| Setting | Default | Where it lives | Purpose |
|---------|---------|----------------|---------|
| `baseTilePx` | 64 | `coreState.dmSettings.fieldMapBaseTilePx`; fallback `config.fieldMapVisuals.baseTilePx` | Pixels per grid cell at generation time. A 2×2 stamp PNG → `baseTilePx*2` square. |
| `projectTilesize` | 24 | `coreState.dmSettings.fieldMapProjectTilesize` | Variant size cached for canvas rendering — Map Studio rescales the atlas. |
| `provider` | `sd-webui` | `coreState.dmSettings.fieldMapVisualProvider` | `sd-webui` (local) or `stability` (Stability AI v2beta SD3.5). |
| `styleSuffix` | "top-down view, pixel art, seamless, no text" | `coreState.dmSettings.fieldMapStyleSuffix` | Appended to every prompt before send. |

Provider-specific SD-WebUI tile preset is controlled via env (`SD_WEBUI_TILE_STEPS`, `SD_WEBUI_TILE_CFG`, `SD_WEBUI_TILE_SAMPLER`) and lives on `config.sdWebui.tile*`.

## Budget & limits

- **Max 40 unique assets per board** (cap enforced in `runLocationBoardVisuals` and the LLM prompt). Anything beyond gets dropped — the LLM is instructed to deduplicate aggressively (one `floor_wood` asset, many placements).
- **Atlas dim cap: 4096 px** — `buildAtlas` throws if a layout grows past that.
- **Image gen concurrency: 3** — keeps SD-WebUI from queueing too many requests.

## Idempotency

- Re-entering a location with `visualStatus=ready` returns the cached board; no worker is enqueued.
- Re-entering with `visualStatus=pending` re-enqueues the worker (cheap; the worker is a no-op when assets are already in flight).
- The worker uses a deterministic pack name — running twice for the same location reuses the same `TilesetPack`, replaces its tilesets, and emits the same `visualPack`.

## Failure mode

If image generation throws (provider offline, prompt rejected, etc), the worker:
- Falls back to a solid-color placeholder PNG for that asset.
- Writes `visualStatus=failed` + `visualError` if the atlas/import step fails.

The FE renderer keeps showing the colored-tile fallback whenever `visualStatus !== 'ready'` or the atlas image hasn't decoded yet. No regressions in pathfinding / fog / interactions when visuals fail.

## Files

| Concern | File |
|---------|------|
| Schema | [`shared/domain/explorationBoard.js`](../../shared/domain/explorationBoard.js) |
| LLM route | [`backend/src/routes/ai/locationBoard.js`](../../backend/src/routes/ai/locationBoard.js) |
| Worker orchestrator | [`backend/src/services/fieldMapVisual/index.js`](../../backend/src/services/fieldMapVisual/index.js) |
| Per-asset image gen | [`backend/src/services/fieldMapVisual/imageGen.js`](../../backend/src/services/fieldMapVisual/imageGen.js) |
| Atlas composition | [`backend/src/services/fieldMapVisual/buildAtlas.js`](../../backend/src/services/fieldMapVisual/buildAtlas.js) |
| Map Studio import (shared) | [`backend/src/services/mapStudio/importPack.js`](../../backend/src/services/mapStudio/importPack.js) |
| Cloud Tasks helper | [`backend/src/services/cloudTasks.js`](../../backend/src/services/cloudTasks.js) — `enqueuePostLocationBoardVisuals` |
| Internal route | [`backend/src/routes/internal.js`](../../backend/src/routes/internal.js) — `/v1/internal/post-location-board-visuals` |
| FE hook | [`src/hooks/useLocationBoardVisuals.js`](../../src/hooks/useLocationBoardVisuals.js) |
| FE renderer | [`src/components/gameplay/combat/fieldMapTileRenderer.js`](../../src/components/gameplay/combat/fieldMapTileRenderer.js) |
| DM settings UI | [`src/components/settings/sections/FieldMapVisualsSection.jsx`](../../src/components/settings/sections/FieldMapVisualsSection.jsx) |

## Out of scope (V1)

- Autotile (wang / blob_47) blending across `visualPlacements`.
- Cross-campaign pack sharing.
- Editing visuals inside Map Studio after generation.
- Legacy `field-map/:sceneIndex` route does not get the visual pipeline.
