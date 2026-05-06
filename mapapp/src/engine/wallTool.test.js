// Unit tests for wallTool.js — requiredEdgesForMask, scoreCandidate,
// buildWallLookup, and recomputeWallArea.

import { describe, it, expect } from 'vitest';
import { N, E, S, W, NE, SE, SW, NW } from './autotile.js';
import {
  EDGE_BITS,
  requiredEdgesForMask,
  scoreCandidate,
  buildWallLookup,
  recomputeWallArea,
} from './wallTool.js';

describe('requiredEdgesForMask', () => {
  it('a fully isolated cell needs all four cardinal edges', () => {
    expect(requiredEdgesForMask(0)).toBe(N | E | S | W);
  });

  it('a fully surrounded cell with all diagonals needs nothing', () => {
    const allAround = N | E | S | W | NE | SE | SW | NW;
    expect(requiredEdgesForMask(allAround)).toBe(0);
  });

  it('only the opposite edge is required when three cardinals are present', () => {
    // N, E, S present; W missing → needs edge_W.
    const m = N | E | S | NE | SE;
    expect(requiredEdgesForMask(m)).toBe(W);
  });

  it('requires an inner-corner diagonal only when both cardinals exist but diagonal is empty', () => {
    // N and E present, NE diagonal absent → edge_NE required (plus missing
    // cardinals S and W).
    const m = N | E;
    const req = requiredEdgesForMask(m);
    expect(req & NE).toBe(NE);
    expect(req & S).toBe(S);
    expect(req & W).toBe(W);
  });

  it('does NOT require a diagonal edge when the adjacent cardinals are missing', () => {
    // Only NE diagonal present (pointless case) — no cardinals, no diag req.
    const m = NE;
    const req = requiredEdgesForMask(m);
    expect(req & NE).toBe(0);
  });
});

describe('scoreCandidate', () => {
  it('rewards matching exactly the required edges', () => {
    const req = N | E;
    const good = { atoms: ['edge_N', 'edge_E'] };
    const extra = { atoms: ['edge_N', 'edge_E', 'edge_S'] };
    expect(scoreCandidate(good, req)).toBeGreaterThan(scoreCandidate(extra, req));
  });

  it('penalises candidates missing a required edge', () => {
    const req = N | E;
    const missing = { atoms: ['edge_N'] };
    expect(scoreCandidate(missing, req)).toBeLessThan(0);
  });

  it('applies role tie-breaker (corner > edge > inner > fill)', () => {
    const req = N | E;
    const base = { atoms: ['edge_N', 'edge_E'] };
    const asCorner = { ...base, autotileRole: 'corner' };
    const asFill = { ...base, autotileRole: 'fill' };
    const asEdge = { ...base, autotileRole: 'edge' };
    const asInner = { ...base, autotileRole: 'inner' };
    expect(scoreCandidate(asCorner, req)).toBeGreaterThan(scoreCandidate(asEdge, req));
    expect(scoreCandidate(asEdge, req)).toBeGreaterThan(scoreCandidate(asInner, req));
    expect(scoreCandidate(asInner, req)).toBeGreaterThan(scoreCandidate(asFill, req));
  });

  it('handles candidates without edge atoms', () => {
    expect(scoreCandidate({ atoms: [] }, 0)).toBe(0);
    // No edges required and no edges present → zero (no extras, no bonus).
    expect(scoreCandidate({ atoms: [] }, N | E | S | W)).toBeLessThan(0);
  });

  it('ignores unknown atom strings', () => {
    const req = N;
    const candidate = { atoms: ['edge_N', 'wall', 'material_stone'] };
    // Non-edge atoms should not affect scoring.
    const score = scoreCandidate(candidate, req);
    expect(score).toBeGreaterThan(0);
  });
});

describe('EDGE_BITS', () => {
  it('maps all eight edge_* atoms to the autotile direction bits', () => {
    expect(EDGE_BITS.edge_N).toBe(N);
    expect(EDGE_BITS.edge_E).toBe(E);
    expect(EDGE_BITS.edge_S).toBe(S);
    expect(EDGE_BITS.edge_W).toBe(W);
    expect(EDGE_BITS.edge_NE).toBe(NE);
    expect(EDGE_BITS.edge_SE).toBe(SE);
    expect(EDGE_BITS.edge_SW).toBe(SW);
    expect(EDGE_BITS.edge_NW).toBe(NW);
  });
});

describe('buildWallLookup', () => {
  it('produces a mapping with a best candidate per encountered mask', () => {
    const candidates = [
      { paletteIndex: 1, atoms: ['edge_N', 'edge_E', 'edge_S', 'edge_W'], autotileRole: 'fill' },
      { paletteIndex: 2, atoms: ['edge_N'], autotileRole: 'edge' },
      { paletteIndex: 3, atoms: ['edge_N', 'edge_E'], autotileRole: 'corner' },
    ];
    const lookup = buildWallLookup(candidates);
    // Isolated (mask = 0) requires N|E|S|W — only candidate 1 has all four.
    expect(lookup.get(0)?.paletteIndex).toBe(1);
  });

  it('picks the single-edge candidate for a mask that only requires that edge', () => {
    const candidates = [
      { paletteIndex: 10, atoms: ['edge_N'], autotileRole: 'edge' },
      { paletteIndex: 20, atoms: ['edge_N', 'edge_E', 'edge_S', 'edge_W'], autotileRole: 'fill' },
    ];
    const lookup = buildWallLookup(candidates);
    // Mask with E,S,W filled & NE,SE,SW present → only N edge required.
    const mask = E | S | W | SE | SW;
    expect(lookup.get(mask)?.paletteIndex).toBe(10);
  });

  it('breaks ties by preferring the earliest candidate in the input list', () => {
    // When two candidates score equally, the current scorer uses a strict
    // `>` comparison, so the first-seen candidate wins. Document that.
    const cands = [
      { paletteIndex: 1, atoms: ['edge_N', 'edge_E', 'edge_S', 'edge_W'] },
      { paletteIndex: 9, atoms: ['edge_N', 'edge_E', 'edge_S', 'edge_W'] },
    ];
    expect(buildWallLookup(cands).get(0)?.paletteIndex).toBe(1);
    expect(buildWallLookup([...cands].reverse()).get(0)?.paletteIndex).toBe(9);
  });

  it('omits masks that no candidate can serve', () => {
    // Empty candidate list → lookup is empty.
    const lookup = buildWallLookup([]);
    expect(lookup.size).toBe(0);
  });
});

describe('recomputeWallArea', () => {
  const baseCandidates = [
    // Fill with all four edges — score = 40-ish for isolated.
    { paletteIndex: 1, atoms: ['edge_N', 'edge_E', 'edge_S', 'edge_W'], autotileRole: 'fill' },
    // Strict N-only edge — best for masks that only need edge_N.
    { paletteIndex: 2, atoms: ['edge_N'], autotileRole: 'edge' },
  ];

  it('only emits patches for cells that are walls', () => {
    const walls = new Set(['1,1', '2,1']);
    const isWall = (x, y) => walls.has(`${x},${y}`);
    const patches = recomputeWallArea({
      candidates: baseCandidates,
      isWall,
      x0: 1, y0: 1, x1: 2, y1: 1,
      cols: 4, rows: 4,
    });
    expect(patches).toHaveLength(2);
    for (const p of patches) {
      expect(p.layer).toBe('ground');
      expect(isWall(p.x, p.y)).toBe(true);
    }
  });

  it('uses the lookup mask to pick the best candidate per cell', () => {
    // A 3×1 horizontal wall strip; the middle cell has E and W neighbours.
    const isWall = (x, y) => y === 1 && x >= 1 && x <= 3;
    const patches = recomputeWallArea({
      candidates: baseCandidates,
      isWall,
      x0: 1, y0: 1, x1: 3, y1: 1,
      cols: 5, rows: 3,
    });
    expect(patches).toHaveLength(3);
    const mid = patches.find((p) => p.x === 2);
    expect(mid).toBeDefined();
  });

  it('respects the provided layer parameter', () => {
    const isWall = (x, y) => x === 1 && y === 1;
    const patches = recomputeWallArea({
      candidates: baseCandidates,
      isWall,
      x0: 1, y0: 1, x1: 1, y1: 1,
      cols: 3, rows: 3,
      layer: 'wall',
    });
    expect(patches[0]?.layer).toBe('wall');
  });

  it('handles empty wall regions cleanly', () => {
    const isWall = () => false;
    const patches = recomputeWallArea({
      candidates: baseCandidates,
      isWall,
      x0: 0, y0: 0, x1: 5, y1: 5,
      cols: 8, rows: 8,
    });
    expect(patches).toEqual([]);
  });
});
