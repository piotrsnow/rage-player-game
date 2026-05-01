// renderTileVariant — scale a Tileset's original PNG atlas to a target tile
// size and cache it through mediaStore, updating Tileset.renderedVariants.
//
// Strategy (this iteration):
//   - We scale the ENTIRE source PNG by `targetSize / effectiveNative`
//     uniformly. This works for single-region packs (RPG Maker A1/A2, typical
//     16px tilesets) and for multi-region packs where every region shares the
//     same nativeTilesize. When a pack mixes native sizes per region, a full-
//     image uniform scale would misalign — in that case we fall back to
//     per-region compositing using sharp composites.
//   - Output format: PNG. `nearest` → zero filtering (pixel art safe).
//     `bilinear` → sharp's `bilinear`. `lanczos3` → `lanczos3` (smooth).
//
// Idempotent: if Tileset.renderedVariants[targetSize] already exists, we
// return the cached entry without re-rendering.

import sharp from 'sharp';
import { createHash } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { createMediaStore } from '../mediaStore.js';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';

const store = createMediaStore(config);

const KERNELS = {
  nearest: 'nearest',
  bilinear: 'linear',   // sharp v0.34 doesn't expose "bilinear" — linear is the closest analogue
  lanczos3: 'lanczos3',
};

function parseJson(str, fallback) {
  if (str == null || str === '') return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

function variantStoragePath(packId, tilesetId, targetSize, algo) {
  const hash = createHash('sha256')
    .update(`${tilesetId}:${targetSize}:${algo}`)
    .digest('hex')
    .slice(0, 16);
  return `tilesets/${packId}/${tilesetId}@${targetSize}-${algo}-${hash}.png`;
}

async function loadSourcePng(pack, tileset) {
  const assetKey = tileset.imageKey;
  const asset = await prisma.mediaAsset.findUnique({ where: { key: assetKey } });
  if (!asset) throw new Error(`MediaAsset not found for Tileset.imageKey=${assetKey}`);
  const result = await store.get(asset.path);
  if (!result) throw new Error(`Media bytes missing for ${asset.path}`);
  return result.buffer;
}

/**
 * Render (or return cached) scaled variant of a Tileset's atlas at `targetSize`.
 *
 * @param {object} params
 * @param {string} params.tilesetId
 * @param {number} params.targetSize      target tilesize in pixels (4..256)
 * @param {'nearest'|'bilinear'|'lanczos3'} [params.algo]  override pack scaleAlgo
 * @param {boolean} [params.force]        skip cache, re-render
 * @returns {Promise<{ imageKey: string, algo: string, renderedAt: string, targetSize: number, cached: boolean }>}
 */
export async function renderTileVariant({ tilesetId, targetSize, algo, force = false }) {
  if (!tilesetId) throw new Error('tilesetId required');
  if (!Number.isInteger(targetSize) || targetSize < 4 || targetSize > 256) {
    throw new Error(`targetSize out of range: ${targetSize}`);
  }

  const tileset = await prisma.tileset.findUnique({ where: { id: tilesetId } });
  if (!tileset) throw new Error(`Tileset ${tilesetId} not found`);

  const pack = await prisma.tilesetPack.findUnique({ where: { id: tileset.packId } });
  if (!pack) throw new Error(`TilesetPack ${tileset.packId} not found`);

  const effectiveAlgo = algo || pack.scaleAlgo || 'nearest';
  if (!KERNELS[effectiveAlgo]) {
    throw new Error(`Unsupported scaleAlgo: ${effectiveAlgo}`);
  }

  const renderedVariants = parseJson(tileset.renderedVariants, {});
  const cacheKey = String(targetSize);

  if (!force && renderedVariants[cacheKey]?.imageKey && renderedVariants[cacheKey]?.algo === effectiveAlgo) {
    return {
      ...renderedVariants[cacheKey],
      targetSize,
      cached: true,
    };
  }

  const regions = parseJson(tileset.regions, []);
  const sourceBuffer = await loadSourcePng(pack, tileset);
  const baseNative = tileset.nativeTilesize || 16;

  // Detect if all regions share the same nativeTilesize (or there are no
  // regions → treat whole PNG as one region at baseNative).
  const nativeSizes = regions.length
    ? regions.map((r) => r.nativeTilesize || baseNative)
    : [baseNative];
  const allSame = nativeSizes.every((s) => s === nativeSizes[0]);

  let outBuffer;
  if (regions.length === 0 || allSame) {
    const effectiveNative = nativeSizes[0] ?? baseNative;
    const scale = targetSize / effectiveNative;
    const src = sharp(sourceBuffer);
    const meta = await src.metadata();
    const newW = Math.max(1, Math.round(meta.width * scale));
    const newH = Math.max(1, Math.round(meta.height * scale));
    outBuffer = await src
      .resize(newW, newH, { kernel: KERNELS[effectiveAlgo] })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } else {
    // Mixed native sizes → scale each region independently, composite back
    // into a new image matching the original canvas dimensions post-scale.
    // We pick the max region scale to avoid clipping; canvas dims = original
    // * maxScale, placed at original coords * maxScale.
    const meta = await sharp(sourceBuffer).metadata();
    const maxScale = Math.max(...nativeSizes.map((n) => targetSize / n));
    const canvasW = Math.max(1, Math.round(meta.width * maxScale));
    const canvasH = Math.max(1, Math.round(meta.height * maxScale));
    const composites = [];
    for (const region of regions) {
      const native = region.nativeTilesize || baseNative;
      const scale = targetSize / native;
      const rw = Math.max(1, Math.round(region.w * scale));
      const rh = Math.max(1, Math.round(region.h * scale));
      const regionBuf = await sharp(sourceBuffer)
        .extract({ left: region.x, top: region.y, width: region.w, height: region.h })
        .resize(rw, rh, { kernel: KERNELS[effectiveAlgo] })
        .png()
        .toBuffer();
      composites.push({
        input: regionBuf,
        left: Math.round(region.x * maxScale),
        top: Math.round(region.y * maxScale),
      });
    }
    outBuffer = await sharp({
      create: {
        width: canvasW,
        height: canvasH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  const storagePath = variantStoragePath(pack.id, tileset.id, targetSize, effectiveAlgo);
  await store.put(storagePath, outBuffer, 'image/png');

  const variantKey = `tileset-variant:${tileset.id}:${targetSize}:${effectiveAlgo}`;

  // Persist a MediaAsset row so variant PNGs are visible to the media
  // routes (public GET by path works already because LocalStore served
  // the file, but having a MediaAsset keeps stats/cleanup consistent).
  await prisma.mediaAsset.upsert({
    where: { key: variantKey },
    create: {
      userId: pack.userId,
      key: variantKey,
      type: 'image',
      contentType: 'image/png',
      size: outBuffer.length,
      backend: config.mediaBackend,
      path: storagePath,
      metadata: JSON.stringify({
        kind: 'tileset-variant',
        tilesetId: tileset.id,
        targetSize,
        algo: effectiveAlgo,
      }),
    },
    update: {
      size: outBuffer.length,
      path: storagePath,
      metadata: JSON.stringify({
        kind: 'tileset-variant',
        tilesetId: tileset.id,
        targetSize,
        algo: effectiveAlgo,
      }),
      lastAccessedAt: new Date(),
    },
  });

  const entry = {
    imageKey: variantKey,
    algo: effectiveAlgo,
    renderedAt: new Date().toISOString(),
  };

  const nextVariants = { ...renderedVariants, [cacheKey]: entry };
  await prisma.tileset.update({
    where: { id: tileset.id },
    data: { renderedVariants: JSON.stringify(nextVariants) },
  });

  logger.info?.(
    { tilesetId, targetSize, algo: effectiveAlgo, bytes: outBuffer.length },
    'renderTileVariant: wrote variant'
  );

  return { ...entry, targetSize, cached: false };
}

/**
 * Delete a cached variant (file + row + Tileset.renderedVariants entry).
 */
export async function deleteTileVariant({ tilesetId, targetSize }) {
  const tileset = await prisma.tileset.findUnique({ where: { id: tilesetId } });
  if (!tileset) return { deleted: false };
  const renderedVariants = parseJson(tileset.renderedVariants, {});
  const cacheKey = String(targetSize);
  const entry = renderedVariants[cacheKey];
  if (!entry) return { deleted: false };

  const asset = await prisma.mediaAsset.findUnique({ where: { key: entry.imageKey } });
  if (asset) {
    await store.delete(asset.path);
    await prisma.mediaAsset.delete({ where: { key: asset.key } }).catch(() => {});
  }
  const { [cacheKey]: _, ...rest } = renderedVariants;
  await prisma.tileset.update({
    where: { id: tileset.id },
    data: { renderedVariants: JSON.stringify(rest) },
  });
  return { deleted: true };
}
