// TilesetUpload — drag-and-drop zone for `.tset`, manifest+PNG, or orphan
// PNGs. Builds an ImportRequest payload (same shape the backend expects from
// POST /v1/map-studio/import) and previews it before upload.
//
// For the large/complex `.tset` case, the faster path is the offline CLI
// (`npm run import-tset -- <folder>`). The browser path here is provided for
// smaller manifests + PNGs and for ad-hoc demos.
//
// This stays deliberately minimal: file grouping + a preview table, no
// RegionEditor yet (that's a separate component already scaffolded).

import React, { useRef, useState } from 'react';
import {
  buildTsetAtlasBlob,
  blobToBase64,
  detectTilesize,
  parseManifest,
  parseTset,
  sliceGrid,
} from '../engine/slicer.js';
import { getMaxTextureSize } from '../engine/webglLimits.js';
import { api } from '../services/api.js';
import Spinner from '../ui/Spinner.jsx';
import Button from '../ui/Button.jsx';
import { Input, Select } from '../ui/Input.jsx';
import ImportProgress from './ImportProgress.jsx';

// Predict the atlas dimensions a given dropzone entry will produce on the
// server. For manifest/png we know the PNG dimensions already; for .tset we
// use the author's bounding box × tilesize. Used purely to warn the user
// (and keep the upload from silently producing a tileset that can't be
// previewed in WebGL after import).
function predictAtlasSize(entry) {
  if (entry.kind === 'tset') {
    const b = entry.parsed?.bounds;
    const cols = b?.cols || 1;
    const rows = b?.rows || 1;
    return { width: cols * entry.tilesize, height: rows * entry.tilesize };
  }
  if (entry.kind === 'png' || entry.kind === 'manifest') {
    return { width: entry.width || 0, height: entry.height || 0 };
  }
  return { width: 0, height: 0 };
}

const DZ_BASE =
  'rounded-lg p-5 text-center text-on-surface-variant/80 border-2 border-dashed transition-colors cursor-pointer select-none';
const dzClass = (dragOver) =>
  dragOver
    ? `${DZ_BASE} border-primary/60 bg-primary/10`
    : `${DZ_BASE} border-outline-variant/30 bg-surface-container/50 hover:border-primary/30 hover:bg-surface-container-high/50`;

export default function TilesetUpload({ onImported, existingPacks = [], defaultTargetPackId = '' }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [entries, setEntries] = useState([]);
  // Target pack resolution: follow the sidebar-selected pack (defaultTargetPackId)
  // unless the user explicitly picked a different target from the Select.
  // `userOverridePackId === null` means "follow the sidebar". Any string value
  // (including '' for "— New pack —") is treated as an explicit user choice.
  const [userOverridePackId, setUserOverridePackId] = useState(null);
  const [packName, setPackName] = useState('Imported Pack');
  const [projectTilesize, setProjectTilesize] = useState(24);
  const [scaleAlgo, setScaleAlgo] = useState('nearest');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  // Per-pack session memory of the user's last manual tilesize edit. When the
  // user drops a new PNG into a pack, we default to this value (falling back
  // to the pack's projectTilesize, then the detection heuristic).
  const manualTilesizeByPack = useRef(new Map());

  const targetPackId = userOverridePackId ?? defaultTargetPackId;
  const targetPack = targetPackId
    ? existingPacks.find((p) => p.id === targetPackId) || null
    : null;

  const maxTex = getMaxTextureSize();
  const oversizedEntries = entries
    .map((e, i) => ({ e, i, size: predictAtlasSize(e) }))
    .filter(({ size }) => size.width > maxTex || size.height > maxTex);

  function setTargetPackId(nextId) {
    // Clear override when the user re-selects whatever the sidebar already
    // has — this way the selector goes back to "following the sidebar".
    setUserOverridePackId(nextId === defaultTargetPackId ? null : nextId);
  }

  async function handleFiles(fileList) {
    setError(null);
    const files = Array.from(fileList);
    const grouped = groupFiles(files);
    const built = [];
    // Resolve the "last settings" hint for this drop. When the user is inside
    // an existing pack we prefer (1) their own last manual edit for that pack
    // in this session, (2) the pack's projectTilesize, and only finally the
    // generic 16px heuristic.
    const sessionHint = targetPack
      ? manualTilesizeByPack.current.get(targetPack.id)
      : undefined;
    const packHint = sessionHint ?? targetPack?.projectTilesize;
    const detectHint = packHint ?? 16;
    for (const g of grouped) {
      try {
        if (g.kind === 'tset') {
          const text = await g.file.text();
          const parsed = parseTset(text);
          built.push({
            kind: 'tset',
            name: stripExt(g.file.name),
            tilesize: parsed.tilesize,
            tiles: parsed.placements.length,
            parsed,
          });
        } else if (g.kind === 'manifest') {
          const manifest = parseManifest(await g.file.text());
          for (const t of manifest.tilesets) {
            const imgFile = files.find((f) => f.name === t.image);
            if (!imgFile) {
              throw new Error(`Manifest references missing image: ${t.image}`);
            }
            const buffer = await imgFile.arrayBuffer();
            const bmp = await createImageBitmap(new Blob([buffer]));
            built.push({
              kind: 'manifest',
              name: t.name,
              tilesize: t.nativeTilesize,
              width: bmp.width,
              height: bmp.height,
              file: imgFile,
              regions: t.regions ?? [],
            });
          }
        } else if (g.kind === 'png') {
          const buffer = await g.file.arrayBuffer();
          const bmp = await createImageBitmap(new Blob([buffer]));
          const detection = detectTilesize(bmp.width, bmp.height, { hint: detectHint });
          // Inside a targeted pack, commit to the resolved hint so the user
          // doesn't have to re-type 24/32/etc. every drop. Without a target,
          // fall back to the classic detection result.
          const tilesize = packHint ?? detection.best;
          built.push({
            kind: 'png',
            name: stripExt(g.file.name),
            tilesize,
            width: bmp.width,
            height: bmp.height,
            file: g.file,
            candidates: detection.candidates.map((c) => c.size),
          });
        }
      } catch (err) {
        setError(`${g.file.name}: ${err.message}`);
      }
    }
    setEntries((prev) => [...prev, ...built]);
  }

  function onInputChange(e) {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  function removeEntry(idx) {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateTilesize(idx, value) {
    const next = Math.max(1, Number(value) || 1);
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, tilesize: next } : e))
    );
    // Remember the user's manual choice for this pack so the *next* drop into
    // the same pack inherits it. We guard on a valid positive integer and only
    // record when a concrete pack is targeted.
    if (targetPackId && Number.isInteger(next) && next > 0) {
      manualTilesizeByPack.current.set(targetPackId, next);
    }
  }

  async function doImport() {
    if (!entries.length) return;
    setBusy(true);
    setError(null);
    // Track raw PNG byte total across all entries so ImportProgress can derive
    // a size-aware ETA during the server-side processing phase.
    let sourceBytes = 0;
    setProgress({ phase: 'upload', loaded: 0, total: 0, sourceBytes: 0 });
    try {
      const tilesets = [];
      for (const entry of entries) {
        if (entry.kind === 'tset') {
          const { blob, width, height, tilesize, tiles } = await buildTsetAtlasBlob(entry.parsed);
          sourceBytes += blob.size;
          tilesets.push({
            name: entry.name,
            imageBase64: await blobToBase64(blob),
            contentType: 'image/png',
            nativeTilesize: tilesize,
            regions: [],
            tiles: tiles.map((t) => ({
              localId: t.localId,
              regionId: '',
              col: t.col,
              row: t.row,
              nativeSize: tilesize,
            })),
          });
        } else if (entry.kind === 'png' || entry.kind === 'manifest') {
          sourceBytes += entry.file?.size || 0;
          const imageBase64 = await fileToBase64(entry.file);
          const regions = entry.regions && entry.regions.length ? entry.regions : [];
          const tiles = regions.length
            ? regions.flatMap((r, ri) =>
                sliceGrid({
                  width: r.w,
                  height: r.h,
                  tilesize: r.nativeTilesize || entry.tilesize,
                  offsetX: r.x,
                  offsetY: r.y,
                  regionId: r.id || `region_${ri}`,
                  localIdStart: ri * 10000,
                }).tiles.map((t) => ({
                  localId: t.localId,
                  regionId: t.regionId,
                  col: t.col,
                  row: t.row,
                  nativeSize: r.nativeTilesize || entry.tilesize,
                }))
              )
            : sliceGrid({
                width: entry.width,
                height: entry.height,
                tilesize: entry.tilesize,
              }).tiles.map((t) => ({
                localId: t.localId,
                regionId: '',
                col: t.col,
                row: t.row,
                nativeSize: entry.tilesize,
              }));
          tilesets.push({
            name: entry.name,
            imageBase64,
            contentType: entry.file.type || 'image/png',
            nativeTilesize: entry.tilesize,
            regions,
            tiles,
          });
        }
      }

      const originSource = entries.find((e) => e.kind === 'tset')
        ? 'tset'
        : entries.find((e) => e.kind === 'manifest')
        ? 'manifest'
        : 'png';

      const payload = targetPackId
        ? {
            targetPackId,
            tilesets,
          }
        : {
            packMeta: {
              name: packName,
              projectTilesize,
              scaleAlgo,
              origin: { source: originSource },
            },
            tilesets,
          };
      const result = await api.importPack(payload, {
        onProgress: (p) => setProgress({ ...p, sourceBytes }),
      });
      setEntries([]);
      onImported?.(result);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={dzClass(dragOver)}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="font-semibold text-on-surface">
          Przeciągnij .tset / .manifest.json / PNG tutaj
        </div>
        <div className="text-xs mt-1 text-on-surface-variant/80">lub kliknij, żeby wybrać</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".tset,.json,image/png"
          onChange={onInputChange}
        />
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center flex-wrap">
            <label className="text-xs text-on-surface-variant">Target</label>
            <Select
              value={targetPackId}
              onChange={(e) => setTargetPackId(e.target.value)}
              className="min-w-[180px] w-auto"
            >
              <option value="">— New pack —</option>
              {existingPacks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.projectTilesize}px · {p.scaleAlgo})
                </option>
              ))}
            </Select>

            {targetPack ? (
              <span className="text-xs text-on-surface-variant/70">
                Dołączysz {entries.length} tileset{entries.length === 1 ? '' : 'ów'} do „{targetPack.name}”.
                Pack tilesize ({targetPack.projectTilesize}px) i algo ({targetPack.scaleAlgo}) bez zmian.
                {' '}
                Domyślny tilesize nowych plików:{' '}
                {manualTilesizeByPack.current.get(targetPack.id) ?? targetPack.projectTilesize}px.
              </span>
            ) : (
              <>
                <label className="text-xs text-on-surface-variant ml-2">Pack name</label>
                <Input
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                  className="w-auto"
                />
                <label className="text-xs text-on-surface-variant ml-2">Project tilesize</label>
                <Input
                  type="number"
                  min={4}
                  max={256}
                  value={projectTilesize}
                  onChange={(e) => setProjectTilesize(Math.max(4, Number(e.target.value) || 24))}
                  className="w-20"
                />
                <label className="text-xs text-on-surface-variant ml-2">Algo</label>
                <Select
                  value={scaleAlgo}
                  onChange={(e) => setScaleAlgo(e.target.value)}
                  className="w-auto"
                >
                  <option value="nearest">nearest</option>
                  <option value="bilinear">bilinear</option>
                  <option value="lanczos3">lanczos3</option>
                </Select>
              </>
            )}
          </div>

          <table className="w-full text-xs border-collapse">
            <thead className="text-on-surface-variant/70">
              <tr>
                <th className={thClass}>file</th>
                <th className={thClass}>kind</th>
                <th className={thClass}>tilesize</th>
                <th className={thClass}>tiles/regions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className={tdClass}>{e.name}</td>
                  <td className={tdClass}>{e.kind}</td>
                  <td className={tdClass}>
                    <Input
                      type="number"
                      min={4}
                      max={256}
                      value={e.tilesize}
                      onChange={(ev) => updateTilesize(i, ev.target.value)}
                      className="w-16"
                    />
                    {e.candidates?.length > 1 && (
                      <span className="opacity-50 ml-1.5">
                        ({e.candidates.join(',')})
                      </span>
                    )}
                  </td>
                  <td className={tdClass}>
                    {e.kind === 'tset' && `${e.tiles} tiles`}
                    {e.kind === 'png' && `${Math.floor(e.width / e.tilesize)}×${Math.floor(e.height / e.tilesize)}`}
                    {e.kind === 'manifest' && `${e.regions?.length || 0} regions`}
                  </td>
                  <td className={tdClass}>
                    <Button onClick={() => removeEntry(i)}>×</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {oversizedEntries.length > 0 && (
            <div className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded-sm px-2.5 py-1.5">
              <div className="font-semibold mb-0.5">
                Uwaga: {oversizedEntries.length} atlas{oversizedEntries.length === 1 ? '' : 'ów'} przekroczy limit GPU ({maxTex}px).
              </div>
              <div>
                Import się uda, ale podgląd w Studio użyje fallbacku {'<img>'} bez zaznaczania kafli.
                Rozważ podział na mniejsze regiony albo większy tilesize.
              </div>
              <ul className="mt-1 list-disc pl-4">
                {oversizedEntries.map(({ e, size, i }) => (
                  <li key={i}>
                    <span className="font-mono">{e.name}</span>: {size.width}×{size.height}px
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2 items-center">
              <Button variant="primary" onClick={doImport} disabled={busy}>
                {busy && <Spinner size={14} color="currentColor" />}
                {busy
                  ? progress?.phase === 'processing'
                    ? 'Processing on server…'
                    : `Uploading ${entries.length} tileset${entries.length === 1 ? '' : 's'}…`
                  : targetPack
                  ? `Add ${entries.length} tileset${entries.length === 1 ? '' : 's'} to “${targetPack.name}”`
                  : `Import ${entries.length} tileset${entries.length === 1 ? '' : 's'} as new pack`}
              </Button>
              <Button onClick={() => setEntries([])} disabled={busy}>Clear</Button>
            </div>
            {progress && <ImportProgress progress={progress} />}
          </div>
        </div>
      )}

      {error && <div className="text-xs text-error">{error}</div>}
    </div>
  );
}

const thClass = 'text-left px-2 py-1.5 border-b border-outline-variant/15';
const tdClass = 'px-2 py-1.5 border-b border-outline-variant/10';

function groupFiles(files) {
  const out = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.tset')) out.push({ kind: 'tset', file: f });
    else if (lower.endsWith('.manifest.json')) out.push({ kind: 'manifest', file: f });
    else if (lower.endsWith('.png')) out.push({ kind: 'png', file: f });
  }
  return out;
}

function stripExt(name) { return name.replace(/\.[^.]+$/, ''); }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result;
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
