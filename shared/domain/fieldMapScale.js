/**
 * Maps location graph node `scale` (1-7) to field map grid dimensions.
 * All sizes are designed to fit on screen without camera scrolling.
 */

const SCALE_TO_GRID = [
  /* 0 (fallback) */ { w: 28, h: 16 },
  /* 1 room       */ { w: 14, h: 8 },
  /* 2 building   */ { w: 18, h: 10 },
  /* 3 compound   */ { w: 24, h: 14 },
  /* 4 district   */ { w: 28, h: 16 },
  /* 5 village    */ { w: 32, h: 18 },
  /* 6 town       */ { w: 36, h: 20 },
  /* 7 region     */ { w: 44, h: 24 },
];

export function gridDimensionsForScale(scale) {
  const idx = Math.max(0, Math.min(SCALE_TO_GRID.length - 1, scale ?? 4));
  return SCALE_TO_GRID[idx];
}
