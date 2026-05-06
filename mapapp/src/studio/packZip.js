// Pack ZIP utilities — backup / share an entire TilesetPack as a portable
// ZIP archive.
//
// Layout of the ZIP (version 1):
//   manifest.json  — { version: 1, pack, tilesets:[{...,tiles,autotileGroups}], rules }
//   images/tileset-<index>.png
//
// Export downloads the ZIP to the browser. Import parses the ZIP, then
// calls the existing POST /v1/map-studio/import endpoint — creates a new
// pack owned by the current user (no in-place replace).
//
// All three entry points (buildPackZip, downloadPackZip, importPackZip)
// accept an optional `{ onProgress }` callback. The callback receives a
// uniform shape suitable for feeding directly into <ImportProgress>:
//   { phase, loaded, total, sourceBytes, subLabel }

import JSZip from 'jszip';
import { api, mediaUrlForKey } from '../services/api.js';

const ZIP_VERSION = 1;

async function fetchBinary(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function noop() {}

/**
 * Build a ZIP Blob for the given pack.
 * Pulls tileset images via the media endpoint (cookie-auth).
 *
 * Progress weighting:
 *   metadata      0-10%
 *   fetch-images  10-85%
 *   zip           85-99%
 *   done          100%
 */
export async function buildPackZip(packId, { onProgress } = {}) {
  const emit = onProgress || noop;

  emit({ phase: 'zip-read', loaded: 0, total: 100, subLabel: 'Fetching pack metadata' });
  const [pack, tilesets, rules] = await Promise.all([
    api.getPack(packId),
    api.listTilesets(packId),
    api.listRules(packId),
  ]);
  emit({ phase: 'zip-read', loaded: 10, total: 100, subLabel: 'Fetching tileset images' });

  const zip = new JSZip();
  const manifestTilesets = [];
  const totalTs = Math.max(1, tilesets.length);

  for (let i = 0; i < tilesets.length; i++) {
    const ts = tilesets[i];
    const [tiles, groups] = await Promise.all([
      api.listTiles(ts.id),
      api.listAutotileGroups(ts.id),
    ]);
    const imageBytes = await fetchBinary(mediaUrlForKey(ts.imageKey));
    const imagePath = `images/tileset-${i}.png`;
    zip.file(imagePath, imageBytes);

    // 10 → 85 across the tileset loop.
    const pct = 10 + Math.round(((i + 1) / totalTs) * 75);
    emit({
      phase: 'zip-read',
      loaded: pct,
      total: 100,
      subLabel: `tileset ${i + 1}/${tilesets.length}: ${ts.name}`,
    });

    manifestTilesets.push({
      name: ts.name,
      image: imagePath,
      nativeTilesize: ts.nativeTilesize,
      imageWidth: ts.imageWidth,
      imageHeight: ts.imageHeight,
      regions: ts.regions || [],
      tiles: tiles.map((t) => ({
        localId: t.localId,
        regionId: t.regionId || '',
        col: t.col,
        row: t.row,
        nativeSize: t.nativeSize,
        atoms: t.atoms || [],
        traits: t.traits || {},
        tags: t.tags || [],
        autotileGroupId: t.autotileGroupId || null,
        autotileRole: t.autotileRole || null,
        notes: t.notes || '',
      })),
      autotileGroups: groups.map((g) => ({
        name: g.name,
        layout: g.layout,
        regionId: g.regionId || '',
        originCol: g.originCol,
        originRow: g.originRow,
        traits: g.traits || {},
      })),
    });
  }

  const manifest = {
    version: ZIP_VERSION,
    pack: {
      name: pack.name,
      projectTilesize: pack.projectTilesize,
      scaleAlgo: pack.scaleAlgo,
      traitVocab: pack.traitVocab || {},
      origin: pack.origin || {},
    },
    tilesets: manifestTilesets,
    rules: (rules || []).map((r) => ({
      name: r.name,
      leftTraits: r.leftTraits,
      rightTraits: r.rightTraits,
      via: r.via,
      viaRef: r.viaRef,
      priority: r.priority,
    })),
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  emit({ phase: 'zip-read', loaded: 85, total: 100, subLabel: 'Compressing ZIP…' });
  const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
    // JSZip emits { percent } continuously during generation — remap to 85-99%.
    const pct = 85 + Math.round((Number(meta.percent) || 0) * 0.14);
    emit({
      phase: 'zip-read',
      loaded: Math.min(99, pct),
      total: 100,
      subLabel: 'Compressing ZIP…',
    });
  });

  return { blob, manifest };
}

export async function downloadPackZip(packId, { onProgress } = {}) {
  const emit = onProgress || noop;
  const { blob, manifest } = await buildPackZip(packId, { onProgress: emit });
  const safeName = (manifest.pack.name || 'pack').replace(/[^a-z0-9_-]+/gi, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
  emit({ phase: 'done', loaded: 100, total: 100 });
}

/**
 * Read a ZIP File and push the contents through the existing import
 * endpoint. Creates a new pack (user can rename after).
 *
 * Progress weighting (overall 0-100%):
 *   zip-read    0-15%    unpacking + base64 encoding images
 *   upload     15-85%    XHR upload to /import
 *   processing 85-95%    server decoding + persisting tile rows
 *   post       95-100%   bulkPatchTiles + createRule follow-ups
 */
export async function importPackZip(file, { onProgress } = {}) {
  const emit = onProgress || noop;

  emit({ phase: 'zip-read', loaded: 0, total: 100, subLabel: 'Reading ZIP…' });
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) throw new Error('manifest.json missing in ZIP');
  const manifest = JSON.parse(await manifestEntry.async('string'));
  if (manifest.version !== ZIP_VERSION) {
    throw new Error(`unsupported manifest version: ${manifest.version}`);
  }

  const tilesets = [];
  const totalTs = Math.max(1, manifest.tilesets.length);
  let sourceBytes = 0;
  for (let i = 0; i < manifest.tilesets.length; i++) {
    const ts = manifest.tilesets[i];
    const imageFile = zip.file(ts.image);
    if (!imageFile) throw new Error(`image missing: ${ts.image}`);
    const bytes = await imageFile.async('uint8array');
    sourceBytes += bytes.length;
    tilesets.push({
      name: ts.name,
      imageBase64: bytesToBase64(bytes),
      contentType: 'image/png',
      nativeTilesize: ts.nativeTilesize,
      regions: ts.regions || [],
      tiles: (ts.tiles || []).map((t) => ({
        localId: t.localId,
        regionId: t.regionId || '',
        col: t.col,
        row: t.row,
        nativeSize: t.nativeSize,
      })),
      autotileGroups: (ts.autotileGroups || []).map((g) => ({
        name: g.name,
        layout: g.layout,
        regionId: g.regionId || '',
        originCol: g.originCol,
        originRow: g.originRow,
      })),
    });
    // 0 → 15 across the tileset-unpack loop.
    const pct = Math.round(((i + 1) / totalTs) * 15);
    emit({
      phase: 'zip-read',
      loaded: pct,
      total: 100,
      sourceBytes,
      subLabel: `tileset ${i + 1}/${manifest.tilesets.length}: ${ts.name}`,
    });
  }

  const payload = {
    packMeta: {
      name: manifest.pack.name || 'Imported Pack',
      projectTilesize: manifest.pack.projectTilesize,
      scaleAlgo: manifest.pack.scaleAlgo,
      origin: { source: 'manifest', importedFiles: ['manifest.json'] },
    },
    tilesets,
  };

  // Forward /import XHR progress, rescaled into 15-85% for upload and 85-95%
  // for processing. sourceBytes threads through so the ETA curve lines up
  // with the empirical 65 s / 3 MB rate.
  const result = await api.importPack(payload, {
    onProgress: (p) => {
      if (p.phase === 'upload') {
        const frac = p.total > 0 ? p.loaded / p.total : 0;
        emit({
          phase: 'upload',
          loaded: Math.round(15 + frac * 70),
          total: 100,
          sourceBytes,
          subLabel: 'Uploading to server',
        });
      } else if (p.phase === 'processing') {
        emit({
          phase: 'processing',
          loaded: 85,
          total: 100,
          sourceBytes,
          subLabel: 'Server processing',
        });
      }
    },
  });

  // Second pass: push tile metadata (atoms/traits/tags) + rules which the
  // /import endpoint doesn't accept directly.
  const patchBatches = [];
  for (let i = 0; i < manifest.tilesets.length; i++) {
    const src = manifest.tilesets[i];
    const target = result.tilesets[i];
    if (!target) continue;
    const patches = (src.tiles || [])
      .filter((t) => (t.atoms?.length || Object.keys(t.traits || {}).length || t.tags?.length || t.notes))
      .map((t) => ({
        localId: t.localId,
        patch: {
          atoms: t.atoms || [],
          traits: t.traits || {},
          tags: t.tags || [],
          autotileRole: t.autotileRole || null,
          notes: t.notes || '',
          regionId: t.regionId || '',
        },
      }));
    if (patches.length) {
      // Split into chunks of 1000 to stay well under the 5000-row bulk cap.
      for (let k = 0; k < patches.length; k += 1000) {
        patchBatches.push({
          tilesetId: target.id,
          patches: patches.slice(k, k + 1000),
          tilesetName: src.name,
        });
      }
    }
  }

  const rules = manifest.rules || [];
  const postTotal = patchBatches.length + rules.length;
  let postDone = 0;
  const emitPost = (subLabel) => {
    const frac = postTotal > 0 ? postDone / postTotal : 1;
    emit({
      phase: 'post',
      loaded: Math.min(99, Math.round(95 + frac * 5)),
      total: 100,
      sourceBytes,
      subLabel,
    });
  };

  if (postTotal > 0) {
    emitPost('Patching tile metadata');
    for (const batch of patchBatches) {
      await api.bulkPatchTiles({
        tilesetId: batch.tilesetId,
        patches: batch.patches,
      });
      postDone++;
      emitPost(`patched ${batch.patches.length} tiles in ${batch.tilesetName}`);
    }
    for (const r of rules) {
      try {
        await api.createRule({
          packId: result.pack.id,
          name: r.name,
          leftTraits: r.leftTraits,
          rightTraits: r.rightTraits,
          via: r.via,
          viaRef: r.viaRef,
          priority: r.priority,
        });
      } catch { /* best-effort; rule validation may reject, keep importing the rest */ }
      postDone++;
      emitPost(`rule: ${r.name}`);
    }
  }

  emit({ phase: 'done', loaded: 100, total: 100, sourceBytes });
  return result;
}
