// useToolDispatch — the 200-line tool router pulled out of EditorPage.
//
// Handles:
//   - brush / eraser / rect / fill painting on the active layer
//   - autotile + wall recomputation
//   - select / copy / paste rectangular regions
//   - NPC place + player start object creation
//   - eyedropper (Alt+LMB)
//   - collision bit toggling (Shift+LMB on collision overlay)
//
// Exposes:
//   - onPaint(args)   — handler wired into MapCanvas's `onPaint`.
//     Wraps the tool dispatch in one undo stroke per drag (down →
//     beginStroke, up → endStroke).
//   - hoverCellRef    — last hovered cell, shared with the shortcut
//                       hook so Ctrl+V knows where to paste.

import { useCallback, useRef } from 'react';
import { OBJECT_KINDS, TOOLS, useEditorStore } from './useEditorStore.js';
import { recomputeAutotileArea } from '../engine/autotile.js';
import { recomputeWallArea } from '../engine/wallTool.js';

function findGroupForPaletteEntry(paletteEntry, groupsByTileset) {
  if (!paletteEntry || !paletteEntry.autotileGroupId) return null;
  const groups = groupsByTileset.get(paletteEntry.tilesetId) || [];
  return groups.find((g) => g.id === paletteEntry.autotileGroupId) || null;
}

function tilesetColsFor(paletteEntry, palette) {
  let maxCol = 0;
  for (const e of palette) {
    if (e.tilesetId === paletteEntry.tilesetId && e.col > maxCol) maxCol = e.col;
  }
  return maxCol + 1;
}

function floodFill(state, sx, sy, layerName, next) {
  const arr = state.layers[layerName];
  const start = arr[sy * state.cols + sx];
  if (start === next) return [];
  const seen = new Uint8Array(state.cols * state.rows);
  const q = [[sx, sy]];
  const patches = [];
  while (q.length) {
    const [x, y] = q.pop();
    const idx = y * state.cols + x;
    if (seen[idx]) continue;
    seen[idx] = 1;
    if (arr[idx] !== start) continue;
    patches.push({ layer: layerName, x, y, next });
    if (x > 0) q.push([x - 1, y]);
    if (x < state.cols - 1) q.push([x + 1, y]);
    if (y > 0) q.push([x, y - 1]);
    if (y < state.rows - 1) q.push([x, y + 1]);
  }
  return patches;
}

export function useToolDispatch({
  groupsByTileset,
  wallCandidates,
  palette,
  toasts,
  hoverCellRef: externalHoverRef,
}) {
  const internalHoverRef = useRef(null);
  const hoverCellRef = externalHoverRef || internalHoverRef;
  const dragStartRef = useRef(null);

  const dispatchTool = useCallback(({ phase, cell, rect, button, ev }, state) => {
    if (cell && (phase === 'move' || phase === 'down' || phase === 'eyedrop')) {
      hoverCellRef.current = cell;
    }
    if (!cell && !rect) return;
    const layerName = state.activeLayer;
    const collisionToggle = state.showCollision && ev?.shiftKey;

    // Eyedropper (Alt+LMB, fired by MapCanvas as its own phase).
    if (phase === 'eyedrop' && cell) {
      const v = state.layers[layerName]?.[cell.y * state.cols + cell.x];
      if (v) {
        state.setSelectedPaletteIndex(v - 1);
        toasts.show(`Eyedropper → palette #${v - 1}`, { level: 'info', ttl: 2000 });
      }
      return;
    }

    if (phase === 'down') dragStartRef.current = cell;
    const isUp = phase === 'up';
    const isDown = phase === 'down';

    if (collisionToggle && cell) {
      if (isDown) {
        const cur = state.collision[cell.y * state.cols + cell.x];
        state.applyPatches([{ layer: '@collision', x: cell.x, y: cell.y, next: cur ? 0 : 1 }]);
      }
      return;
    }

    const selectedIndex = state.selectedPaletteIndex;
    const useIndex = state.tool === TOOLS.eraser ? 0 : (selectedIndex + 1);
    const paletteEntry = selectedIndex >= 0 ? state.palette[selectedIndex] : null;

    if (state.tool === TOOLS.npcPlace || state.tool === TOOLS.playerStart) {
      if (!isDown || !cell) return;
      const kind = state.tool === TOOLS.npcPlace ? OBJECT_KINDS.npcPlace : OBJECT_KINDS.playerStart;
      const existing = state.objects.find((o) => o.x === cell.x && o.y === cell.y && o.kind === kind);
      if (button === 'right') {
        if (existing) state.removeObject(existing.id);
        return;
      }
      if (existing) {
        state.setSelectedObject(existing.id);
        return;
      }
      if (kind === OBJECT_KINDS.playerStart) {
        // Only one player start per map — replace previous.
        for (const o of state.objects.filter((o) => o.kind === OBJECT_KINDS.playerStart)) {
          state.removeObject(o.id);
        }
      }
      const created = state.addObject({
        x: cell.x, y: cell.y, kind,
        data: kind === OBJECT_KINDS.npcPlace
          ? { tags: [], spawnChance: 1, minCount: 0, maxCount: 1 }
          : {},
      });
      state.setSelectedObject(created.id);
      return;
    }

    switch (state.tool) {
      case TOOLS.select: {
        if (button === 'right' && isDown) {
          state.clearSelection();
          return;
        }
        if (isUp && rect) {
          state.setSelection({ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 });
        }
        return;
      }
      case TOOLS.brush: {
        if (!cell) return;
        if (button === 'right') {
          state.applyPatches([{ layer: layerName, x: cell.x, y: cell.y, next: 0 }]);
          return;
        }
        if (useIndex <= 0) return;
        state.applyPatches([{ layer: layerName, x: cell.x, y: cell.y, next: useIndex }]);
        return;
      }
      case TOOLS.eraser: {
        if (!cell) return;
        state.applyPatches([{ layer: layerName, x: cell.x, y: cell.y, next: 0 }]);
        return;
      }
      case TOOLS.rect: {
        if (!isUp || !rect) return;
        if (useIndex <= 0) return;
        const patches = [];
        for (let y = rect.y0; y <= rect.y1; y++) {
          for (let x = rect.x0; x <= rect.x1; x++) {
            patches.push({ layer: layerName, x, y, next: useIndex });
          }
        }
        state.applyPatches(patches);
        return;
      }
      case TOOLS.fill: {
        if (!isDown || !cell) return;
        if (useIndex <= 0 && state.tool !== TOOLS.eraser) return;
        const patches = floodFill(state, cell.x, cell.y, layerName, useIndex);
        state.applyPatches(patches);
        return;
      }
      case TOOLS.autotile: {
        if (!cell) return;
        const group = findGroupForPaletteEntry(paletteEntry, groupsByTileset);
        if (!group) {
          toasts.show('Autotile: pick a tile inside an autotile group in the palette first.', { level: 'warning' });
          return;
        }
        const tilesetId = paletteEntry.tilesetId;
        const tilesetCols = tilesetColsFor(paletteEntry, palette);
        let paintedCells;
        if (isUp && rect) {
          paintedCells = [];
          for (let y = rect.y0; y <= rect.y1; y++) {
            for (let x = rect.x0; x <= rect.x1; x++) paintedCells.push({ x, y });
          }
        } else if (isDown || phase === 'move') {
          paintedCells = [cell];
        } else {
          return;
        }
        const sentinels = new Set(paintedCells.map((c) => c.y * state.cols + c.x));
        const isInGroup = (x, y) => {
          if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return false;
          if (sentinels.has(y * state.cols + x)) return true;
          const v = state.layers[layerName][y * state.cols + x];
          if (!v) return false;
          const e = state.palette[v - 1];
          return e && e.autotileGroupId === group.id;
        };
        const minX = Math.min(...paintedCells.map((c) => c.x));
        const minY = Math.min(...paintedCells.map((c) => c.y));
        const maxX = Math.max(...paintedCells.map((c) => c.x));
        const maxY = Math.max(...paintedCells.map((c) => c.y));
        const patches = recomputeAutotileArea({
          x0: minX, y0: minY, x1: maxX, y1: maxY, cols: state.cols, rows: state.rows,
          isInGroup, group, tilesetCols, tilesetId, paletteByKey: state.paletteByKey, layer: layerName,
        });
        if (patches.length) state.applyPatches(patches);
        return;
      }
      case TOOLS.wall: {
        if (!cell) return;
        const layerWalls = wallCandidates.filter(() => true);
        if (!layerWalls.length) {
          toasts.show('Wall tool: no tile tagged with atom "wall" in the palette.', { level: 'warning' });
          return;
        }
        let paintedCells;
        if (isUp && rect) {
          paintedCells = [];
          for (let y = rect.y0; y <= rect.y1; y++) {
            for (let x = rect.x0; x <= rect.x1; x++) paintedCells.push({ x, y });
          }
        } else if (isDown || phase === 'move') {
          paintedCells = [cell];
        } else {
          return;
        }
        const sentinels = new Set(paintedCells.map((c) => c.y * state.cols + c.x));
        const isWall = (x, y) => {
          if (sentinels.has(y * state.cols + x)) return true;
          const v = state.layers[layerName][y * state.cols + x];
          if (!v) return false;
          const e = state.palette[v - 1];
          return e && (e.atoms || []).includes('wall');
        };
        const minX = Math.min(...paintedCells.map((c) => c.x));
        const minY = Math.min(...paintedCells.map((c) => c.y));
        const maxX = Math.max(...paintedCells.map((c) => c.x));
        const maxY = Math.max(...paintedCells.map((c) => c.y));
        const patches = recomputeWallArea({
          candidates: layerWalls, isWall,
          x0: minX, y0: minY, x1: maxX, y1: maxY, cols: state.cols, rows: state.rows,
          layer: layerName,
        });
        if (patches.length) state.applyPatches(patches);
        return;
      }
      default:
        return;
    }
  }, [groupsByTileset, wallCandidates, palette, toasts, hoverCellRef]);

  const onPaint = useCallback((args) => {
    const { phase } = args;
    const state = useEditorStore.getState();

    // 'leave' = drag aborted by mouseleave. Close out the stroke so the
    // accumulated undo entry is committed; no tool dispatch.
    if (phase === 'leave') {
      state.endStroke();
      return;
    }

    // Wrap tool dispatch in one undo stroke: one drag → one Ctrl+Z.
    if (phase === 'down') state.beginStroke();
    dispatchTool(args, state);
    if (phase === 'up') state.endStroke();
  }, [dispatchTool]);

  return { onPaint, hoverCellRef };
}
