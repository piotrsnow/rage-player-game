#!/usr/bin/env node
// Offline importer for Map Studio packs.
//
// Usage:
//   node mapapp/tools/import-tset.mjs <folder> [options]
//
// Options:
//   --name <string>        Pack name (defaults to folder basename).
//   --tilesize <int>       Project tilesize for the pack (default 24).
//   --algo <nearest|bilinear|lanczos3>
//                          Scale algorithm (default nearest).
//   --backend <url>        Backend origin (default http://localhost:3001).
//   --jwt <token>          Auth token. Also picked up from MAPAPP_JWT.
//   --dry-run              Skip the HTTP POST; print what would be sent.
//   --out <path>           Dump the import payload to this JSON file for
//                          inspection/testing. Works with or without --dry-run.
//   --hint-native <int>    Tilesize hint used when auto-detecting grid on
//                          orphan PNGs (default 16).
//
// Inputs recognised inside <folder>:
//   - *.tset           → v2.1.x-lite tileset (stitched into one atlas PNG)
//   - *.manifest.json  → ImportManifest sidecar (PNG referenced by name)
//   - *.png            → orphan PNG, grid-sliced with autodetected tilesize
//
// The folder is scanned non-recursively for top-level files plus one level
// deep (Objects/ etc. used by fantasy_overworld). Additional nesting is
// ignored — you usually want one folder per pack.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

import {
  parseTset,
  parseManifest,
  detectTilesize,
  sliceGrid,
} from '../src/engine/slicer.js';

// ── args ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function log(...msg) { console.log('[import-tset]', ...msg); }
function warn(...msg) { console.warn('[import-tset]', ...msg); }
function die(msg) { console.error('[import-tset] ERROR:', msg); process.exit(1); }

// ── filesystem scan ──────────────────────────────────────────────────
async function scanFolder(folder) {
  const results = { tsets: [], manifests: [], pngs: [] };
  async function walk(dir, depth) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 1) await walk(full, depth + 1);
        continue;
      }
      const lower = e.name.toLowerCase();
      if (lower.endsWith('.tset')) results.tsets.push(full);
      else if (lower.endsWith('.manifest.json')) results.manifests.push(full);
      else if (lower.endsWith('.png')) results.pngs.push(full);
    }
  }
  await walk(folder, 0);
  return results;
}

// ── .tset → atlas buffer ─────────────────────────────────────────────
// Composites every placed tile PNG onto a single atlas canvas with sharp.
// Returns { buffer, width, height, tilesize, tiles:[{localId,col,row}] }.
async function stitchTset(tsetPath) {
  const text = await fsp.readFile(tsetPath, 'utf8');
  const parsed = parseTset(text);
  const { tilesize, sources, tiles: tileDefs, placements, bounds } = parsed;

  if (!placements.length) {
    throw new Error(`.tset has no placements: ${tsetPath}`);
  }
  const cols = bounds.cols;
  const rows = bounds.rows;
  const width = cols * tilesize;
  const height = rows * tilesize;

  // Decode each source PNG once; some may not be tilesize-sized, so we resize
  // to tilesize during composite.
  const sourceBuffers = new Map();
  for (const s of sources) {
    if (!s.valid) continue;
    const buf = Buffer.from(s.base64, 'base64');
    sourceBuffers.set(s.id, buf);
  }

  // Build composite ops. Sharp handles thousands of composites in a single
  // pipeline call. We pre-resize any source that isn't already tilesize².
  const composites = [];
  const atlasTiles = [];
  for (const p of placements) {
    const tileDef = tileDefs[p.tileID];
    const buf = tileDef ? sourceBuffers.get(tileDef.sourceID) : null;
    const col = p.x - bounds.minX;
    const row = p.y - bounds.minY;
    atlasTiles.push({ tileID: p.tileID, col, row });
    if (!buf) continue;
    const inputBuffer = await sharp(buf)
      .resize(tilesize, tilesize, { kernel: sharp.kernel.nearest, fit: 'fill' })
      .png()
      .toBuffer();
    composites.push({
      input: inputBuffer,
      left: col * tilesize,
      top: row * tilesize,
    });
  }

  const canvas = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  atlasTiles.sort((a, b) => a.row - b.row || a.col - b.col);
  atlasTiles.forEach((t, i) => { t.localId = i; });

  return {
    buffer: canvas,
    width,
    height,
    tilesize,
    cols,
    rows,
    tiles: atlasTiles.map((t) => ({
      localId: t.localId,
      regionId: '',
      col: t.col,
      row: t.row,
      nativeSize: tilesize,
    })),
  };
}

// ── orphan PNG → tiles ───────────────────────────────────────────────
async function sliceOrphanPng(pngPath, hintNative) {
  const buffer = await fsp.readFile(pngPath);
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read PNG size: ${pngPath}`);
  }
  const detection = detectTilesize(meta.width, meta.height, { hint: hintNative });
  const tilesize = detection.best;
  const grid = sliceGrid({ width: meta.width, height: meta.height, tilesize });
  log(
    `   auto-tilesize ${tilesize}px → ${grid.cols}×${grid.rows} tiles ` +
      `(candidates: ${detection.candidates.map((c) => c.size).join(',')})`
  );
  return {
    buffer,
    width: meta.width,
    height: meta.height,
    tilesize,
    cols: grid.cols,
    rows: grid.rows,
    tiles: grid.tiles.map((t) => ({
      localId: t.localId,
      regionId: '',
      col: t.col,
      row: t.row,
      nativeSize: tilesize,
    })),
  };
}

// ── manifest → package ───────────────────────────────────────────────
async function packManifest(manifestPath) {
  const text = await fsp.readFile(manifestPath, 'utf8');
  const manifest = parseManifest(text);
  const dir = path.dirname(manifestPath);
  const resolved = [];
  for (const t of manifest.tilesets) {
    const imgPath = path.resolve(dir, t.image);
    if (!fs.existsSync(imgPath)) {
      throw new Error(`Manifest references missing image: ${imgPath}`);
    }
    const buffer = await fsp.readFile(imgPath);
    const meta = await sharp(buffer).metadata();
    const regions = t.regions ?? [];
    // Derive tile inventory per region (or a whole-image region if empty).
    const tiles = regions.length
      ? regions.flatMap((r, ri) =>
          sliceGrid({
            width: r.w,
            height: r.h,
            tilesize: r.nativeTilesize || t.nativeTilesize,
            offsetX: r.x,
            offsetY: r.y,
            regionId: r.id || `region_${ri}`,
            localIdStart: ri * 10000,
          }).tiles.map((tile) => ({
            localId: tile.localId,
            regionId: tile.regionId,
            col: tile.col,
            row: tile.row,
            nativeSize: r.nativeTilesize || t.nativeTilesize,
          }))
        )
      : sliceGrid({
          width: meta.width ?? 0,
          height: meta.height ?? 0,
          tilesize: t.nativeTilesize,
        }).tiles.map((tile) => ({
          localId: tile.localId,
          regionId: '',
          col: tile.col,
          row: tile.row,
          nativeSize: t.nativeTilesize,
        }));

    resolved.push({
      name: t.name,
      buffer,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      nativeTilesize: t.nativeTilesize,
      regions,
      tiles,
    });
  }
  return { manifest, tilesets: resolved };
}

// ── build import payload ─────────────────────────────────────────────
function toImportTileset(name, built) {
  return {
    name,
    imageBase64: built.buffer.toString('base64'),
    contentType: 'image/png',
    nativeTilesize: built.tilesize ?? built.nativeTilesize,
    regions: built.regions ?? [],
    tiles: built.tiles,
    autotileGroups: built.autotileGroups ?? [],
  };
}

async function buildPayload(folder, opts) {
  const { tsets, manifests, pngs } = await scanFolder(folder);
  log(`scanned ${folder}: ${tsets.length} .tset, ${manifests.length} manifests, ${pngs.length} png`);

  const packName = opts.name || path.basename(path.resolve(folder));
  const projectTilesize = Number.parseInt(opts.tilesize ?? '24', 10);
  const scaleAlgo = opts.algo || 'nearest';
  const hintNative = Number.parseInt(opts['hint-native'] ?? '16', 10);

  const tilesetsPayload = [];
  const importedFiles = [];

  // Track PNGs owned by manifests so we don't double-import.
  const consumedPngs = new Set();

  // 1) manifests first
  for (const m of manifests) {
    log(`manifest ${path.relative(folder, m)}`);
    const { tilesets } = await packManifest(m);
    for (const t of tilesets) {
      tilesetsPayload.push(toImportTileset(t.name, t));
      importedFiles.push(path.relative(folder, m));
      consumedPngs.add(path.resolve(path.dirname(m), t.name));
    }
  }

  // 2) .tset files
  for (const tsetPath of tsets) {
    log(`tset ${path.relative(folder, tsetPath)}`);
    const built = await stitchTset(tsetPath);
    const name = path.basename(tsetPath, path.extname(tsetPath));
    tilesetsPayload.push(toImportTileset(name, built));
    importedFiles.push(path.relative(folder, tsetPath));
  }

  // 3) orphan PNGs
  for (const pngPath of pngs) {
    if (consumedPngs.has(path.resolve(pngPath))) continue;
    log(`png  ${path.relative(folder, pngPath)}`);
    const built = await sliceOrphanPng(pngPath, hintNative);
    const name = path.basename(pngPath, path.extname(pngPath));
    tilesetsPayload.push({
      ...toImportTileset(name, built),
      // orphan PNGs become a single whole-image region so the BE can show
      // them in RegionEditor without needing to re-guess the grid.
      regions: [
        {
          id: 'whole',
          name: 'Whole image',
          role: 'tiles',
          x: 0,
          y: 0,
          w: built.width,
          h: built.height,
          nativeTilesize: built.tilesize,
        },
      ],
      tiles: built.tiles.map((t) => ({ ...t, regionId: 'whole' })),
    });
    importedFiles.push(path.relative(folder, pngPath));
  }

  if (!tilesetsPayload.length) {
    die(`No importable files in ${folder}`);
  }

  return {
    packMeta: {
      name: packName,
      projectTilesize,
      scaleAlgo,
      origin: {
        source: tsets.length ? 'tset' : manifests.length ? 'manifest' : 'png',
        importedFiles,
      },
    },
    tilesets: tilesetsPayload,
  };
}

// ── HTTP upload ──────────────────────────────────────────────────────
async function uploadPayload(backend, jwt, payload) {
  const url = new URL('/v1/map-studio/import', backend).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: jwt ? `Bearer ${jwt}` : undefined,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === 'object' ? JSON.stringify(body, null, 2) : body;
    die(`POST ${url} → ${res.status}\n${msg}`);
  }
  return body;
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folder = args._[0];
  if (!folder) {
    die('Usage: node mapapp/tools/import-tset.mjs <folder> [--name ...] [--tilesize 24] [--algo nearest]');
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    die(`Not a folder: ${folder}`);
  }
  const payload = await buildPayload(folder, args);

  log(
    `pack "${payload.packMeta.name}" — ${payload.tilesets.length} tileset(s), ` +
      `${payload.tilesets.reduce((n, t) => n + (t.tiles?.length || 0), 0)} tiles total, ` +
      `projectTilesize=${payload.packMeta.projectTilesize}`
  );

  if (args.out) {
    const summary = {
      packMeta: payload.packMeta,
      tilesets: payload.tilesets.map((t) => ({
        name: t.name,
        bytesBase64: t.imageBase64.length,
        nativeTilesize: t.nativeTilesize,
        tiles: t.tiles?.length ?? 0,
        regions: t.regions?.length ?? 0,
      })),
    };
    await fsp.writeFile(args.out, JSON.stringify(summary, null, 2));
    log(`wrote summary → ${args.out}`);
  }

  if (args['dry-run']) {
    log('dry-run, not uploading');
    return;
  }

  const backend = args.backend || process.env.MAPAPP_BACKEND_URL || 'http://localhost:3001';
  const jwt = args.jwt || process.env.MAPAPP_JWT;
  if (!jwt) {
    die('Missing auth token. Pass --jwt <token> or set MAPAPP_JWT env var.');
  }
  const result = await uploadPayload(backend, jwt, payload);
  log(`uploaded. packId=${result?.pack?.id}, renderTarget=${result?.renderTarget}`);
}

const isDirectRun = (() => {
  const thisFile = fileURLToPath(import.meta.url);
  const entry = process.argv[1] && path.resolve(process.argv[1]);
  return entry && thisFile === entry;
})();

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { buildPayload, stitchTset, sliceOrphanPng };
