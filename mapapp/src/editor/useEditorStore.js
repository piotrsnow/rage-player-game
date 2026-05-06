// Zustand store for the Map Editor.
//
// Holds:
//   - map metadata (id, name, size [cols,rows], projectTilesize, packIds)
//   - layers: { ground: Grid, overlay: Grid, objects: Grid }
//     where Grid is a flat Uint32Array of length cols*rows. 0 = empty.
//     A non-zero cell is a packed tile id that indexes into `paletteByKey`.
//   - collision: Uint8Array of length cols*rows. 0 = walkable, 1 = blocked.
//   - palette: array of `PaletteEntry` (see `engine/paletteEntry.js`).
//     Palette is keyed by a packed string `<tilesetId>:<localId>`. The flat
//     layer arrays store indices into `palette` (offset by +1 so 0 = empty).
//   - active tool state (tool, selectedPaletteIndex, autotileGroupId)
//   - history stack for undo/redo (patch-based, bounded)
//
// Layers are mutated via `applyPatches([{ layer, x, y, next }, ...])`. Every
// mutation records an undo patch set in the history and clears the redo
// stack. Keyboard shortcuts (handled by the Editor page) call undo()/redo().

import { create } from 'zustand';
import { makePaletteKey } from '../engine/paletteEntry.js';

export const LAYER_NAMES = ['ground', 'overlay', 'objects'];
export const TOOLS = {
  brush: 'brush',
  rect: 'rect',
  fill: 'fill',
  eraser: 'eraser',
  autotile: 'autotile',
  wall: 'wall',
  select: 'select',
  npcPlace: 'npcPlace',
  playerStart: 'playerStart',
};

// Kinds stored in MapDoc.objects[]. Each object: { id, x, y, kind, data }.
export const OBJECT_KINDS = {
  npcPlace: 'npc_place',
  playerStart: 'player_start',
};

const HISTORY_CAP = 100;

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'obj_' + Math.random().toString(36).slice(2, 11);
}

function emptyLayer(cols, rows) {
  return new Uint32Array(cols * rows);
}

function emptyCollision(cols, rows) {
  return new Uint8Array(cols * rows);
}

function makeLayers(cols, rows) {
  const layers = {};
  for (const name of LAYER_NAMES) layers[name] = emptyLayer(cols, rows);
  return layers;
}

// Apply a batch of cell patches to `layers` + `collision`, cloning ONLY the
// layers (and collision) that are actually written to. Returns the new
// maps + the reverse patch list (for undo/redo). If nothing changed, the
// returned reverse list is empty.
function applyPatchSet(state, patches) {
  const nextLayers = { ...state.layers };
  const touched = new Set();
  let nextCollision = state.collision;
  let collisionTouched = false;
  const reverse = [];
  for (const p of patches) {
    const idx = p.y * state.cols + p.x;
    if (idx < 0 || idx >= state.cols * state.rows) continue;
    if (p.layer === '@collision') {
      if (!collisionTouched) {
        nextCollision = new Uint8Array(state.collision);
        collisionTouched = true;
      }
      const prev = nextCollision[idx];
      if (prev === p.next) continue;
      reverse.push({ layer: '@collision', x: p.x, y: p.y, next: prev });
      nextCollision[idx] = p.next;
    } else {
      const srcArr = state.layers[p.layer];
      if (!srcArr) continue;
      if (!touched.has(p.layer)) {
        nextLayers[p.layer] = new Uint32Array(srcArr);
        touched.add(p.layer);
      }
      const arr = nextLayers[p.layer];
      const prev = arr[idx];
      if (prev === p.next) continue;
      reverse.push({ layer: p.layer, x: p.x, y: p.y, next: prev });
      arr[idx] = p.next;
    }
  }
  return { nextLayers, nextCollision, reverse };
}

export const useEditorStore = create((set, get) => ({
  mapId: null,
  name: 'Untitled',
  cols: 32,
  rows: 24,
  projectTilesize: 24,
  packIds: [],
  layers: makeLayers(32, 24),
  collision: emptyCollision(32, 24),
  palette: [], // [{ key, packId, tilesetId, localId, imageKey, col, row, tilesize }]
  paletteByKey: new Map(),

  activeLayer: 'ground',
  tool: TOOLS.brush,
  selectedPaletteIndex: -1,
  autotileGroupId: null,
  showCollision: false,
  showGrid: true,
  zoom: 1,

  // Placed objects from MapDoc.objects: { id, x, y, kind, data }.
  objects: [],
  selectedObjectId: null,

  // Map-level NPC assignments from MapDoc.meta.npcs: [{ actorId, tagsRequired? }]
  mapNpcs: [],

  // Rectangular selection made via the `select` tool. Stored as
  // { x0, y0, x1, y1 } in cell coordinates (inclusive on both ends).
  // Cleared on tool change / Escape / paste.
  selection: null,
  // Clipboard for copy/paste. Null when nothing is copied.
  // Shape: { cols, rows, cells: { [layerName]: Uint32Array(cols*rows) },
  //   palette: PaletteEntry[] } — we snapshot the palette entries so paste
  //   can re-map through paletteByKey even if the user switched packs.
  clipboard: null,

  history: [], // [{ patches, prev }]
  future: [],
  dirty: false,

  // Stroke coalescing: when `strokeActive` is true, `applyPatches` does not
  // push its own history entry. Instead, reverse patches are accumulated
  // (deduped by layer+cell, keeping the ORIGINAL value seen at stroke start)
  // into `strokeReverse`. `endStroke()` then commits one combined entry.
  // This makes a brush drag one Ctrl+Z instead of N.
  strokeActive: false,
  strokeReverse: [],
  strokeSeen: new Set(),

  resetMap({ cols = 32, rows = 24, projectTilesize = 24, name = 'Untitled', packIds = [] } = {}) {
    set({
      mapId: null,
      name,
      cols,
      rows,
      projectTilesize,
      packIds,
      layers: makeLayers(cols, rows),
      collision: emptyCollision(cols, rows),
      objects: [],
      mapNpcs: [],
      selectedObjectId: null,
      selection: null,
      history: [],
      future: [],
      dirty: false,
    });
  },

  loadMap(doc, paletteFromPacks) {
    const [cols, rows] = Array.isArray(doc.size) ? doc.size : [32, 24];
    const layers = makeLayers(cols, rows);
    const srcLayers = doc.layers || {};
    const paletteByKey = paletteFromPacks?.paletteByKey || new Map();

    for (const name of LAYER_NAMES) {
      const grid = srcLayers[name];
      if (!Array.isArray(grid)) continue;
      for (let y = 0; y < rows; y++) {
        const row = grid[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < cols; x++) {
          const cell = row[x];
          if (!cell) continue;
          const key = keyFromCell(cell);
          const idx = paletteByKey.get(key);
          if (idx !== undefined) layers[name][y * cols + x] = idx + 1;
        }
      }
    }

    // Collision: expect string of 0/1 of length cols*rows (compact enough).
    const collision = emptyCollision(cols, rows);
    if (typeof doc.collision === 'string' && doc.collision.length === cols * rows) {
      for (let i = 0; i < collision.length; i++) {
        collision[i] = doc.collision.charCodeAt(i) === 49 /* '1' */ ? 1 : 0;
      }
    }

    const rawObjects = Array.isArray(doc.objects) ? doc.objects : [];
    const objects = rawObjects.map((o) => ({
      id: o.id || cryptoRandomId(),
      x: Number(o.x) || 0,
      y: Number(o.y) || 0,
      kind: o.kind || 'unknown',
      data: o.data && typeof o.data === 'object' ? { ...o.data } : {},
    }));
    const meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
    const mapNpcs = Array.isArray(meta.npcs) ? meta.npcs.map((n) => ({ ...n })) : [];

    set({
      mapId: doc.id,
      name: doc.name || 'Untitled',
      cols,
      rows,
      projectTilesize: doc.projectTilesize || 24,
      packIds: Array.isArray(doc.packIds) ? [...doc.packIds] : [],
      layers,
      collision,
      objects,
      mapNpcs,
      selectedObjectId: null,
      palette: paletteFromPacks?.palette || [],
      paletteByKey,
      selection: null,
      history: [],
      future: [],
      dirty: false,
    });
  },

  addObject(obj) {
    const next = [...get().objects, {
      id: obj.id || cryptoRandomId(),
      x: obj.x, y: obj.y, kind: obj.kind,
      data: { ...(obj.data || {}) },
    }];
    set({ objects: next, dirty: true });
    return next[next.length - 1];
  },
  updateObject(id, patch) {
    set({
      objects: get().objects.map((o) => (o.id === id ? { ...o, ...patch, data: { ...o.data, ...(patch.data || {}) } } : o)),
      dirty: true,
    });
  },
  removeObject(id) {
    set({
      objects: get().objects.filter((o) => o.id !== id),
      selectedObjectId: get().selectedObjectId === id ? null : get().selectedObjectId,
      dirty: true,
    });
  },
  setSelectedObject(id) { set({ selectedObjectId: id }); },

  setMapNpcs(arr) { set({ mapNpcs: [...arr], dirty: true }); },
  toggleMapNpc(actorId) {
    const list = get().mapNpcs;
    const idx = list.findIndex((n) => n.actorId === actorId);
    if (idx >= 0) set({ mapNpcs: list.filter((_, i) => i !== idx), dirty: true });
    else set({ mapNpcs: [...list, { actorId }], dirty: true });
  },

  setPalette({ palette, paletteByKey }) {
    set({ palette, paletteByKey });
  },

  setSelection(rect) {
    if (!rect) { set({ selection: null }); return; }
    const { x0, y0, x1, y1 } = rect;
    set({
      selection: {
        x0: Math.max(0, Math.min(x0, x1)),
        y0: Math.max(0, Math.min(y0, y1)),
        x1: Math.min(get().cols - 1, Math.max(x0, x1)),
        y1: Math.min(get().rows - 1, Math.max(y0, y1)),
      },
    });
  },
  clearSelection() { set({ selection: null }); },

  // Snapshot the cells under the current selection for every layer into
  // `clipboard`. Paste (`pasteAt`) re-maps cells through `paletteByKey`
  // so a copy from one tileset works even after switching packs (as long
  // as the source palette entries are still addressable).
  copySelection() {
    const s = get();
    if (!s.selection) return false;
    const { x0, y0, x1, y1 } = s.selection;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const cells = {};
    for (const name of LAYER_NAMES) {
      const src = s.layers[name];
      const dst = new Uint32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          dst[y * w + x] = src[(y0 + y) * s.cols + (x0 + x)];
        }
      }
      cells[name] = dst;
    }
    set({ clipboard: { cols: w, rows: h, cells, palette: s.palette } });
    return true;
  },

  // Paste the current clipboard at (tx, ty) (top-left corner). Re-maps each
  // source cell through the current palette using the snapshot palette's
  // keys so a paste works if the palette has been reshuffled.
  pasteAt(tx, ty) {
    const s = get();
    const cb = s.clipboard;
    if (!cb) return false;
    const patches = [];
    const keyLookup = s.paletteByKey;
    for (const name of LAYER_NAMES) {
      const src = cb.cells[name];
      if (!src) continue;
      for (let y = 0; y < cb.rows; y++) {
        for (let x = 0; x < cb.cols; x++) {
          const dx = tx + x;
          const dy = ty + y;
          if (dx < 0 || dy < 0 || dx >= s.cols || dy >= s.rows) continue;
          const v = src[y * cb.cols + x];
          let mapped = 0;
          if (v) {
            const srcEntry = cb.palette[v - 1];
            if (srcEntry) {
              const k = makePaletteKey(srcEntry.tilesetId, srcEntry.localId);
              const idx = keyLookup.get(k);
              if (idx !== undefined) mapped = idx + 1;
            }
          }
          patches.push({ layer: name, x: dx, y: dy, next: mapped });
        }
      }
    }
    if (patches.length) s.applyPatches(patches);
    return true;
  },
  setPackIds(ids) { set({ packIds: [...ids] }); },
  setName(name) { set({ name, dirty: true }); },
  setActiveLayer(name) { set({ activeLayer: name }); },
  setTool(tool) { set({ tool }); },
  setSelectedPaletteIndex(idx) { set({ selectedPaletteIndex: idx }); },
  setAutotileGroupId(id) { set({ autotileGroupId: id }); },
  setShowCollision(v) { set({ showCollision: v }); },
  setShowGrid(v) { set({ showGrid: v }); },
  setZoom(z) { set({ zoom: Math.max(0.25, Math.min(4, z)) }); },
  setDirty(v) { set({ dirty: v }); },

  resize({ cols, rows }) {
    const prev = get();
    if (cols === prev.cols && rows === prev.rows) return;
    const layers = makeLayers(cols, rows);
    for (const name of LAYER_NAMES) {
      const src = prev.layers[name];
      const minC = Math.min(prev.cols, cols);
      const minR = Math.min(prev.rows, rows);
      for (let y = 0; y < minR; y++) {
        for (let x = 0; x < minC; x++) {
          layers[name][y * cols + x] = src[y * prev.cols + x];
        }
      }
    }
    const collision = emptyCollision(cols, rows);
    const minC = Math.min(prev.cols, cols);
    const minR = Math.min(prev.rows, rows);
    for (let y = 0; y < minR; y++) {
      for (let x = 0; x < minC; x++) {
        collision[y * cols + x] = prev.collision[y * prev.cols + x];
      }
    }
    set({ cols, rows, layers, collision, history: [], future: [], dirty: true });
  },

  // Apply a batch of cell writes. Each patch is
  //   { layer: 'ground'|... | '@collision', x, y, next }
  // Records undo data so `undo()` can roll back. Only clones the layers
  // (and collision) that are actually being touched by the patch set —
  // previously we cloned all three layers on every call, which for a
  // brush-drag on a 128×128 map meant N*3*Uint32Array(16k) copies per stroke.
  //
  // When a stroke is active (see `beginStroke`), the reverse patches are
  // accumulated into the stroke buffer (deduped per cell, preserving the
  // pre-stroke value) instead of being committed as their own history entry.
  applyPatches(patches, { skipHistory = false } = {}) {
    if (!patches?.length) return;
    const state = get();
    const { nextLayers, nextCollision, reverse } = applyPatchSet(state, patches);
    if (!reverse.length) return;

    if (state.strokeActive && !skipHistory) {
      const seen = state.strokeSeen;
      const buf = state.strokeReverse;
      for (const r of reverse) {
        const k = r.layer + ':' + r.x + ',' + r.y;
        if (seen.has(k)) continue; // original pre-stroke value already recorded
        seen.add(k);
        buf.push(r);
      }
      set({
        layers: nextLayers,
        collision: nextCollision,
        dirty: true,
      });
      return;
    }

    const nextHistory = skipHistory ? state.history : [...state.history, { patches: reverse }];
    while (nextHistory.length > HISTORY_CAP) nextHistory.shift();
    set({
      layers: nextLayers,
      collision: nextCollision,
      history: nextHistory,
      future: skipHistory ? state.future : [],
      dirty: true,
    });
  },

  // Begin a coalesced stroke. While a stroke is active, every `applyPatches`
  // call writes into a shared reverse buffer instead of producing its own
  // history entry, so one brush drag → one Ctrl+Z. If a stroke is already
  // active (e.g. user dragged off the canvas without releasing), we
  // auto-commit its accumulated reverse patches first so nothing is lost.
  beginStroke() {
    const cur = get();
    if (cur.strokeActive && cur.strokeReverse.length) {
      const nextHistory = [...cur.history, { patches: cur.strokeReverse }];
      while (nextHistory.length > HISTORY_CAP) nextHistory.shift();
      set({ history: nextHistory, future: [] });
    }
    set({ strokeActive: true, strokeReverse: [], strokeSeen: new Set() });
  },

  endStroke() {
    const cur = get();
    if (!cur.strokeActive) return;
    if (!cur.strokeReverse.length) {
      set({ strokeActive: false, strokeReverse: [], strokeSeen: new Set() });
      return;
    }
    const nextHistory = [...cur.history, { patches: cur.strokeReverse }];
    while (nextHistory.length > HISTORY_CAP) nextHistory.shift();
    set({
      strokeActive: false,
      strokeReverse: [],
      strokeSeen: new Set(),
      history: nextHistory,
      future: [],
    });
  },

  undo() {
    const { history, future } = get();
    if (!history.length) return;
    const entry = history[history.length - 1];
    const state = get();
    const { nextLayers, nextCollision, reverse: redoPatches } = applyPatchSet(state, entry.patches);
    set({
      layers: nextLayers,
      collision: nextCollision,
      history: history.slice(0, -1),
      future: [...future, { patches: redoPatches }],
      dirty: true,
    });
  },

  redo() {
    const { history, future } = get();
    if (!future.length) return;
    const entry = future[future.length - 1];
    const state = get();
    const { nextLayers, nextCollision, reverse: undoPatches } = applyPatchSet(state, entry.patches);
    set({
      layers: nextLayers,
      collision: nextCollision,
      history: [...history, { patches: undoPatches }],
      future: future.slice(0, -1),
      dirty: true,
    });
  },

  clearDirty() { set({ dirty: false }); },
}));

export function keyFromCell(cell) {
  if (typeof cell === 'object' && cell) {
    return makePaletteKey(cell.tilesetId, cell.localId);
  }
  // packed int ids unsupported for now
  return String(cell);
}

export function keyForPaletteEntry(entry) {
  return makePaletteKey(entry.tilesetId, entry.localId);
}

// Serialise store layers into the MapDoc wire format (2D array of cell objects).
export function serialiseMap(state) {
  const {
    layers, collision, cols, rows, palette, name, projectTilesize, packIds, mapId,
    objects, mapNpcs,
  } = state;
  const outLayers = {};
  for (const layerName of Object.keys(layers)) {
    const arr = layers[layerName];
    const grid = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        const v = arr[y * cols + x];
        if (!v) row.push(null);
        else {
          const p = palette[v - 1];
          if (!p) row.push(null);
          else row.push({ packId: p.packId, tilesetId: p.tilesetId, localId: p.localId });
        }
      }
      grid.push(row);
    }
    outLayers[layerName] = grid;
  }
  let collisionStr = '';
  for (let i = 0; i < collision.length; i++) collisionStr += collision[i] ? '1' : '0';
  return {
    id: mapId,
    name,
    size: [cols, rows],
    projectTilesize,
    packIds,
    layers: outLayers,
    collision: collisionStr,
    objects: Array.isArray(objects) ? objects.map((o) => ({
      id: o.id, x: o.x, y: o.y, kind: o.kind, data: { ...o.data },
    })) : [],
    meta: { npcs: Array.isArray(mapNpcs) ? [...mapNpcs] : [] },
  };
}
