// Orchestrator for the field-map visual pipeline.
//
// Called by:
//   - Cloud Tasks → POST /v1/internal/post-location-board-visuals (prod)
//   - cloudTasks.enqueuePostLocationBoardVisuals inline fallback (dev)
//
// Pipeline:
//   1. Load ExplorationBoard (v2) from the location row. Skip if visualStatus
//      is already "ready" + visualPack is populated (idempotent).
//   2. For each asset (capped), generate a PNG sized w*baseTilePx × h*baseTilePx
//      via SD-WebUI or Stability (per DM settings on the campaign).
//   3. Compose all PNGs into a single atlas via buildAtlas.
//   4. Import the atlas into Map Studio under the campaign owner's userId
//      (deterministic pack name: `campaign:<id>:loc:<kind>:<id>`).
//   5. Write visualPack + visualStatus="ready" back to the location row.
//
// Failures: any thrown error sets visualStatus="failed" + visualError on the
// location row (so the FE can stop polling and the user sees the fallback
// renderer). Cloud Tasks retries on 500 — the next attempt re-runs from the
// top, but step 1 short-circuits when work has already completed.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { loadUserApiKeys } from '../apiKeyService.js';
import { pmap } from '../../routes/mapStudio/_helpers.js';
import { importTilesetPack, findPackByName } from '../mapStudio/importPack.js';
import { renderTileVariant } from '../mapStudio/renderTileVariant.js';
import { generateTilePng, generatePlaceholderTile, isProviderConfigured } from './imageGen.js';
import { buildAtlas } from './buildAtlas.js';
import { config } from '../../config.js';

const log = childLogger({ module: 'fieldMapVisual' });

const MAX_ASSETS = 40;
const IMAGE_GEN_CONCURRENCY = 3;

function locationTableFor(kind) {
  return kind === 'world' ? 'worldLocation' : 'campaignLocation';
}

async function loadBoard({ locationKind, locationId }) {
  const table = locationTableFor(locationKind);
  const row = await prisma[table].findUnique({
    where: { id: locationId },
    select: { id: true, tacticalGrid: true },
  });
  return row?.tacticalGrid || null;
}

async function writeBoard({ locationKind, locationId, board }) {
  const table = locationTableFor(locationKind);
  await prisma[table].update({
    where: { id: locationId },
    data: { tacticalGrid: board },
  });
}

function packNameFor(campaignId, locationKind, locationId) {
  return `campaign:${campaignId}:loc:${locationKind}:${locationId}`;
}

function readDmSettings(coreState) {
  const dm = coreState?.dmSettings || {};
  const cfg = config.fieldMapVisuals || {};
  const providerRaw = dm.fieldMapVisualProvider || cfg.provider || 'sd-webui';
  return {
    provider: providerRaw === 'stability' ? 'stability' : 'sd-webui',
    baseTilePx: Math.max(16, Math.min(256, Math.round(dm.fieldMapBaseTilePx ?? cfg.baseTilePx ?? 64))),
    projectTilesize: Math.max(8, Math.min(128, Math.round(dm.fieldMapProjectTilesize ?? cfg.projectTilesize ?? 24))),
    styleSuffix: typeof dm.fieldMapStyleSuffix === 'string' && dm.fieldMapStyleSuffix.trim()
      ? dm.fieldMapStyleSuffix.slice(0, 200)
      : (cfg.styleSuffix || ''),
  };
}

/**
 * Main entrypoint — invoked from Cloud Tasks or inline.
 *
 * @param {{
 *   campaignId: string,
 *   userId: string,
 *   locationKind: 'world' | 'campaign',
 *   locationId: string,
 *   requestId?: string,
 * }} payload
 */
export async function runLocationBoardVisuals(payload) {
  const { campaignId, userId, locationKind, locationId, requestId } = payload;
  if (!campaignId || !userId || !locationKind || !locationId) {
    throw new Error('runLocationBoardVisuals: missing required payload fields');
  }

  const board = await loadBoard({ locationKind, locationId });
  if (!board) {
    log.warn({ locationKind, locationId, requestId }, 'No board found; skipping');
    return { skipped: true, reason: 'no-board' };
  }
  if (board.version !== 2) {
    return { skipped: true, reason: 'not-v2' };
  }
  if (!Array.isArray(board.assets) || board.assets.length === 0) {
    return { skipped: true, reason: 'no-assets' };
  }
  if (board.visualStatus === 'ready' && board.visualPack?.packId) {
    return { skipped: true, reason: 'already-ready' };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true, userId: true },
  });
  if (!campaign) {
    throw new Error(`runLocationBoardVisuals: campaign ${campaignId} not found`);
  }
  const ownerId = campaign.userId || userId;
  const dm = readDmSettings(campaign.coreState);

  // Honor cap regardless of what the LLM emitted — protects against runaway
  // SD calls if a prompt regression starts producing 200 assets per board.
  const assets = board.assets.slice(0, MAX_ASSETS);

  log.info({
    campaignId, locationKind, locationId, requestId,
    assetCount: assets.length, provider: dm.provider, baseTilePx: dm.baseTilePx,
  }, 'Visual pipeline start');

  const userApiKeys = await loadUserApiKeys(prisma, ownerId);
  const providerOk = isProviderConfigured(dm.provider);
  if (!providerOk) {
    log.warn({ provider: dm.provider }, 'Image provider not configured — falling back to placeholder tiles');
  }

  // Step 2: generate per-asset PNGs in parallel (bounded).
  const buffers = new Map();
  let firstError = null;
  await pmap(assets, IMAGE_GEN_CONCURRENCY, async (asset) => {
    const w = asset.footprint.w * dm.baseTilePx;
    const h = asset.footprint.h * dm.baseTilePx;
    try {
      const png = providerOk
        ? await generateTilePng({
            prompt: asset.prompt,
            styleAnchor: board.styleAnchor || '',
            styleSuffix: dm.styleSuffix,
            width: w,
            height: h,
            provider: dm.provider,
            userApiKeys,
          })
        : await generatePlaceholderTile({ width: w, height: h });
      buffers.set(asset.id, png);
    } catch (err) {
      log.warn({ err: err.message, assetId: asset.id }, 'Asset generation failed; using placeholder');
      if (!firstError) firstError = err.message;
      buffers.set(asset.id, await generatePlaceholderTile({ width: w, height: h }));
    }
  });

  try {
    // Step 3: atlas composition.
    const atlas = await buildAtlas({
      assets,
      buffers,
      baseTilePx: dm.baseTilePx,
    });

    // Step 4: import (idempotent upsert by pack name).
    const packName = packNameFor(campaignId, locationKind, locationId);
    const existingPack = await findPackByName(ownerId, packName);

    // Append-mode would normally accumulate tilesets; for visuals we want a
    // single tileset per pack. Delete the prior tileset rows if we found an
    // old pack so the atlas is the only tileset.
    if (existingPack) {
      await prisma.tile.deleteMany({
        where: { tileset: { packId: existingPack.id } },
      });
      await prisma.autotileGroup.deleteMany({
        where: { tileset: { packId: existingPack.id } },
      });
      await prisma.tileset.deleteMany({ where: { packId: existingPack.id } });
    }

    const { pack, tilesets } = await importTilesetPack({
      userId: ownerId,
      packMeta: {
        name: packName,
        projectTilesize: dm.projectTilesize,
        scaleAlgo: 'nearest',
        origin: { source: 'field-map-visual', campaignId, locationKind, locationId },
      },
      tilesets: [{
        name: `${locationKind}:${locationId}`,
        buffer: atlas.buffer,
        contentType: 'image/png',
        nativeTilesize: atlas.nativeTilesize,
        regions: [],
        tiles: atlas.tiles,
      }],
      targetPackId: existingPack?.id,
    });

    const tileset = tilesets[0];

    // Best-effort wait for the variant to be available — gives the FE a
    // ready-to-use rendered size on first poll. Failures here aren't fatal;
    // the FE can still render from native size or re-render later.
    let variantImageKey = null;
    try {
      const variant = await renderTileVariant({
        tilesetId: tileset.id,
        targetSize: dm.projectTilesize,
        algo: 'nearest',
      });
      variantImageKey = variant?.imageKey || null;
    } catch (err) {
      log.warn({ err: err.message, tilesetId: tileset.id }, 'renderTileVariant in worker failed (non-fatal)');
    }

    // FE doesn't have permission to hit /v1/map-studio routes (those are
    // pseudo-user-scoped). The board carries the atlas imageKey directly so
    // the renderer can load it via `/v1/media/file/<key>` — that endpoint
    // accepts both storage paths and media keys.
    const atlasImageKey = variantImageKey || tileset.imageKey;

    // Step 5: patch board with visualPack + ready status.
    const updatedBoard = {
      ...board,
      visualPack: {
        packId: pack.id,
        tilesetId: tileset.id,
        projectTilesize: dm.projectTilesize,
        // Native PNG dimensions of the atlas (variant is scaled to
        // projectTilesize per tile cell, so derive there). FE picks one based
        // on what the user wants to render.
        nativeTilesize: atlas.nativeTilesize,
        atlasCols: atlas.cols,
        atlasRows: atlas.rows,
        imageKey: atlasImageKey,
        palette: atlas.palette,
        generatedAt: new Date().toISOString(),
      },
      visualStatus: 'ready',
      visualError: undefined,
    };
    delete updatedBoard.visualError;
    await writeBoard({ locationKind, locationId, board: updatedBoard });

    log.info({
      campaignId, locationKind, locationId,
      packId: pack.id, tilesetId: tileset.id,
      atlasSize: `${atlas.width}x${atlas.height}`,
    }, 'Visual pipeline ready');

    return { ok: true, packId: pack.id, tilesetId: tileset.id };
  } catch (err) {
    log.error({
      err: err.message, campaignId, locationKind, locationId, requestId,
    }, 'Visual pipeline failed');
    await writeBoard({
      locationKind,
      locationId,
      board: {
        ...board,
        visualStatus: 'failed',
        visualError: String(err.message || 'unknown error').slice(0, 400),
      },
    });
    // Re-throw so Cloud Tasks marks the task as failed (which triggers retry
    // per queue config). The inline path catches and logs — see cloudTasks.js.
    throw err;
  }
}
