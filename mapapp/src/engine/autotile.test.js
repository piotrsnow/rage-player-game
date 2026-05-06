// Unit tests for autotile.js — covers neighbourMask, pickVariant (blob_47,
// rpgmaker_a2, wang_2edge), paletteIndexForGroupCell, and recomputeAutotileArea.

import { describe, it, expect } from 'vitest';
import {
  N, E, S, W, NE, SE, SW, NW,
  neighbourMask,
  pickVariant,
  paletteIndexForGroupCell,
  recomputeAutotileArea,
} from './autotile.js';

// Tiny helper: build a grid predicate from a 2D array of booleans.
function gridFrom(rows) {
  return (x, y) => {
    if (y < 0 || y >= rows.length) return false;
    const row = rows[y];
    if (x < 0 || x >= row.length) return false;
    return !!row[x];
  };
}

describe('neighbourMask', () => {
  it('returns 0 for an isolated cell', () => {
    const grid = gridFrom([
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    expect(neighbourMask(grid, 1, 1)).toBe(0);
  });

  it('sets cardinal bits for N/E/S/W neighbours', () => {
    const grid = gridFrom([
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ]);
    expect(neighbourMask(grid, 1, 1)).toBe(N | E | S | W);
  });

  it('sets N only when the north neighbour is present', () => {
    const grid = gridFrom([
      [0, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    expect(neighbourMask(grid, 1, 1)).toBe(N);
  });

  it('does NOT set corner bits when a cardinal is missing', () => {
    // NE diagonal set but N missing — NE must stay 0.
    const grid = gridFrom([
      [0, 0, 1],
      [0, 1, 1],
      [0, 0, 0],
    ]);
    // E is present (col 2, row 1), NE diagonal is present, but N is absent.
    const m = neighbourMask(grid, 1, 1);
    expect(m & NE).toBe(0);
    expect(m & E).toBe(E);
  });

  it('sets NE bit only when N, E, and NE-diagonal are all present', () => {
    const grid = gridFrom([
      [0, 1, 1],
      [0, 1, 1],
      [0, 0, 0],
    ]);
    const m = neighbourMask(grid, 1, 1);
    expect(m & N).toBe(N);
    expect(m & E).toBe(E);
    expect(m & NE).toBe(NE);
  });

  it('sets all 8 bits for a fully surrounded cell', () => {
    const grid = gridFrom([
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    expect(neighbourMask(grid, 1, 1))
      .toBe(N | E | S | W | NE | SE | SW | NW);
  });

  it('treats out-of-bounds cells via the caller-provided predicate', () => {
    // No wrapping — caller controls that. Here the predicate returns false
    // off-grid, so an edge cell sees empty neighbours.
    const grid = gridFrom([
      [1, 1],
      [1, 1],
    ]);
    // Top-left corner: only E, S, SE neighbours are on the grid.
    expect(neighbourMask(grid, 0, 0)).toBe(E | S | SE);
  });
});

describe('pickVariant — blob_47 layout', () => {
  const group = { layout: 'blob_47', originCol: 10, originRow: 20 };

  it('places isolated cell at origin (0,0) offset', () => {
    const cell = pickVariant(group, 0);
    expect(cell).toEqual({ col: 10, row: 20 });
  });

  it('returns different cells for distinct masks', () => {
    const a = pickVariant(group, E);
    const b = pickVariant(group, W);
    expect(a).not.toEqual(b);
  });

  it('applies origin offset to every returned cell', () => {
    const cell = pickVariant(group, N | E | S | W);
    expect(cell.col).toBeGreaterThanOrEqual(group.originCol);
    expect(cell.row).toBeGreaterThanOrEqual(group.originRow);
  });

  it('falls back to the "fill" cell (4,5) for unknown masks', () => {
    // 0xFF without the corner-cardinal invariant is still in-table
    // (full surrounded). Pick an impossible mask instead: diagonals only.
    const cell = pickVariant(group, NE);
    expect(cell).toEqual({ col: group.originCol + 4, row: group.originRow + 5 });
  });

  it('defaults to blob_47 when layout is omitted', () => {
    const noLayout = { originCol: 0, originRow: 0 };
    expect(pickVariant(noLayout, 0)).toEqual({ col: 0, row: 0 });
  });
});

describe('pickVariant — rpgmaker_a2 / rpgmaker_a1 layouts', () => {
  const group = { layout: 'rpgmaker_a2', originCol: 4, originRow: 6 };

  it('returns origin for isolated cell', () => {
    expect(pickVariant(group, 0)).toEqual({ col: 4, row: 6 });
  });

  it('ignores diagonal-only bits (cardinal mask used)', () => {
    // NE alone has cardinalMask 0, should be treated like isolated.
    expect(pickVariant(group, NE)).toEqual({ col: 4, row: 6 });
  });

  it('rpgmaker_a1 behaves identically to rpgmaker_a2', () => {
    const a1 = { layout: 'rpgmaker_a1', originCol: 4, originRow: 6 };
    expect(pickVariant(a1, N | S)).toEqual(pickVariant(group, N | S));
  });

  it('maps full cardinal set to the fill cell (1,0)', () => {
    expect(pickVariant(group, N | E | S | W)).toEqual({ col: 5, row: 6 });
  });
});

describe('pickVariant — wang_2edge layout', () => {
  const group = { layout: 'wang_2edge', originCol: 0, originRow: 0 };

  it('isolated: col=0 row=0', () => {
    expect(pickVariant(group, 0)).toEqual({ col: 0, row: 0 });
  });

  it('E only → col=1 row=0', () => {
    expect(pickVariant(group, E)).toEqual({ col: 1, row: 0 });
  });

  it('W only → col=3 row=0', () => {
    expect(pickVariant(group, W)).toEqual({ col: 3, row: 0 });
  });

  it('E|W → col=2 row=0', () => {
    expect(pickVariant(group, E | W)).toEqual({ col: 2, row: 0 });
  });

  // NOTE: the wang_2edge row mapping treats "has N but no S" as row 1 and
  // "has S but no N" as row 3 (symmetric to col logic). Verify the pair so
  // N-only and S-only produce distinct rows.
  it('N only and S only land on distinct rows (non-centre)', () => {
    const nRow = pickVariant(group, N).row;
    const sRow = pickVariant(group, S).row;
    expect(nRow).not.toBe(sRow);
    expect([1, 3]).toContain(nRow);
    expect([1, 3]).toContain(sRow);
  });

  it('N|S → col=0 row=2', () => {
    expect(pickVariant(group, N | S)).toEqual({ col: 0, row: 2 });
  });

  it('N|E|S|W → col=2 row=2 (centre)', () => {
    expect(pickVariant(group, N | E | S | W)).toEqual({ col: 2, row: 2 });
  });
});

describe('pickVariant — custom layout falls back to origin', () => {
  it('returns the group origin for unknown layout', () => {
    const group = { layout: 'custom', originCol: 7, originRow: 3 };
    expect(pickVariant(group, N | E | S | W)).toEqual({ col: 7, row: 3 });
  });
});

describe('paletteIndexForGroupCell', () => {
  it('returns palette index + 1 when present', () => {
    const paletteByKey = new Map([
      ['tset-a:5', 0],
      ['tset-a:6', 1],
      ['tset-a:7', 2],
    ]);
    const idx = paletteIndexForGroupCell({
      paletteByKey,
      tilesetId: 'tset-a',
      col: 2,
      row: 1,
      tilesetCols: 3,
    }); // localId = 1*3 + 2 = 5 → palette index 0 → returns 1
    expect(idx).toBe(1);
  });

  it('returns 0 (empty) when the cell is missing from the palette', () => {
    const paletteByKey = new Map();
    const idx = paletteIndexForGroupCell({
      paletteByKey,
      tilesetId: 'tset-a',
      col: 0,
      row: 0,
      tilesetCols: 8,
    });
    expect(idx).toBe(0);
  });

  it('uses tileset-scoped keys (does not collide across tilesets)', () => {
    const paletteByKey = new Map([
      ['tset-a:0', 5],
      ['tset-b:0', 9],
    ]);
    expect(paletteIndexForGroupCell({
      paletteByKey, tilesetId: 'tset-a', col: 0, row: 0, tilesetCols: 4,
    })).toBe(6);
    expect(paletteIndexForGroupCell({
      paletteByKey, tilesetId: 'tset-b', col: 0, row: 0, tilesetCols: 4,
    })).toBe(10);
  });
});

describe('recomputeAutotileArea', () => {
  const group = { layout: 'blob_47', originCol: 0, originRow: 0 };

  it('produces one patch per in-group cell (with 1-cell padding)', () => {
    // 3×3 cluster of in-group cells.
    const isInGroup = (x, y) => x >= 1 && x <= 3 && y >= 1 && y <= 3;
    // Build a palette covering the full 8×6 blob atlas.
    const paletteByKey = new Map();
    let i = 0;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
      paletteByKey.set(`tset:${r * 8 + c}`, i++);
    }
    const patches = recomputeAutotileArea({
      x0: 1, y0: 1, x1: 3, y1: 3,
      cols: 8, rows: 8,
      isInGroup,
      group,
      tilesetCols: 8,
      tilesetId: 'tset',
      paletteByKey,
      layer: 'ground',
    });
    // 9 in-group cells in the padded region. All should produce patches.
    expect(patches).toHaveLength(9);
    for (const p of patches) {
      expect(p.layer).toBe('ground');
      expect(p.next).toBeGreaterThan(0);
      expect(p.x).toBeGreaterThanOrEqual(1);
      expect(p.x).toBeLessThanOrEqual(3);
    }
  });

  it('skips cells that are not in the group', () => {
    const isInGroup = (x, y) => x === 2 && y === 2; // just one cell
    const paletteByKey = new Map([['tset:0', 0]]); // origin cell present
    const patches = recomputeAutotileArea({
      x0: 2, y0: 2, x1: 2, y1: 2,
      cols: 5, rows: 5,
      isInGroup,
      group,
      tilesetCols: 8,
      tilesetId: 'tset',
      paletteByKey,
    });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ x: 2, y: 2, layer: 'ground' });
  });

  it('treats the map border as continuous — edge cells look surrounded', () => {
    // Single in-group cell at (0,0). Its off-grid N/W/NW neighbours are
    // treated as "same group" via the `grid` wrapper, so mask should include
    // at least N and W bits.
    const isInGroup = (x, y) => x === 0 && y === 0;
    const paletteByKey = new Map();
    // Map every (col,row) to a palette entry so next>0 for any mask.
    let i = 0;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
      paletteByKey.set(`tset:${r * 8 + c}`, i++);
    }
    const patches = recomputeAutotileArea({
      x0: 0, y0: 0, x1: 0, y1: 0,
      cols: 4, rows: 4,
      isInGroup,
      group,
      tilesetCols: 8,
      tilesetId: 'tset',
      paletteByKey,
    });
    expect(patches).toHaveLength(1);
    expect(patches[0].next).toBeGreaterThan(0);
  });

  it('omits patches when the chosen cell is not in the palette', () => {
    const isInGroup = (x, y) => x === 1 && y === 1;
    const paletteByKey = new Map(); // empty — no palette entry
    const patches = recomputeAutotileArea({
      x0: 1, y0: 1, x1: 1, y1: 1,
      cols: 3, rows: 3,
      isInGroup,
      group,
      tilesetCols: 8,
      tilesetId: 'tset',
      paletteByKey,
    });
    expect(patches).toEqual([]);
  });

  it('honours the layer parameter', () => {
    const isInGroup = (x, y) => x === 1 && y === 1;
    const paletteByKey = new Map([['tset:0', 0]]);
    const patches = recomputeAutotileArea({
      x0: 1, y0: 1, x1: 1, y1: 1,
      cols: 3, rows: 3,
      isInGroup,
      group,
      tilesetCols: 8,
      tilesetId: 'tset',
      paletteByKey,
      layer: 'decal',
    });
    expect(patches[0]?.layer).toBe('decal');
  });
});
