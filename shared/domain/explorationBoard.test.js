import { describe, expect, it } from 'vitest';
import {
  ExplorationBoardSchema,
  ExplorationBoardV1Schema,
  ExplorationBoardV2Schema,
  BoardAssetSchema,
  BoardPlacementSchema,
  safeValidateBoard,
  hasVisualLayer,
  isExplorationBoard,
} from './explorationBoard.js';

const minimalGrid = (w = 8, h = 6) => {
  const tiles = [];
  for (let c = 0; c < w; c++) {
    const col = [];
    for (let r = 0; r < h; r++) col.push('grass');
    tiles.push(col);
  }
  return tiles;
};

const baseV1 = {
  version: 1,
  width: 8,
  height: 6,
  tiles: minimalGrid(8, 6),
  objects: [],
  exits: [],
  entities: [],
  spawnPoint: { x: 4, y: 3 },
  generatedAt: new Date().toISOString(),
};

describe('ExplorationBoardSchema', () => {
  it('accepts a v1 board', () => {
    const parsed = ExplorationBoardSchema.safeParse(baseV1);
    expect(parsed.success).toBe(true);
    expect(parsed.data.version).toBe(1);
  });

  it('accepts a v2 board with assets + visualPlacements', () => {
    const v2 = {
      ...baseV1,
      version: 2,
      baseTilePx: 64,
      styleAnchor: 'pixel art, top-down',
      assets: [
        { id: 'grass_tile', kind: 'tile', footprint: { w: 1, h: 1 },
          prompt: 'grassy field, pixel art', layer: 'ground' },
        { id: 'cottage', kind: 'stamp', footprint: { w: 2, h: 2 },
          prompt: 'stone cottage with thatched roof, top-down', layer: 'object' },
      ],
      visualPlacements: [
        { assetId: 'grass_tile', anchor: { x: 0, y: 0 }, layer: 'ground' },
        { assetId: 'cottage',    anchor: { x: 3, y: 2 }, layer: 'object' },
      ],
      visualStatus: 'pending',
      visualPack: null,
    };
    const parsed = ExplorationBoardSchema.safeParse(v2);
    expect(parsed.success).toBe(true);
    expect(parsed.data.version).toBe(2);
    expect(parsed.data.assets).toHaveLength(2);
    expect(parsed.data.visualPlacements).toHaveLength(2);
  });

  it('rejects an unknown version', () => {
    const bad = { ...baseV1, version: 9 };
    expect(ExplorationBoardSchema.safeParse(bad).success).toBe(false);
  });

  it('isExplorationBoard true for v1 and v2', () => {
    expect(isExplorationBoard(baseV1)).toBe(true);
    expect(isExplorationBoard({ ...baseV1, version: 2 })).toBe(true);
    expect(isExplorationBoard(null)).toBe(false);
    expect(isExplorationBoard({ version: 3 })).toBe(false);
  });

  it('hasVisualLayer requires v2 + non-empty assets', () => {
    expect(hasVisualLayer(baseV1)).toBe(false);
    expect(hasVisualLayer({ ...baseV1, version: 2, assets: [] })).toBe(false);
    expect(hasVisualLayer({
      ...baseV1,
      version: 2,
      assets: [{ id: 'a', kind: 'tile', footprint: { w: 1, h: 1 }, prompt: 'ok', layer: 'ground' }],
    })).toBe(true);
  });
});

describe('BoardAssetSchema footprint -> px math', () => {
  it('1x1 asset at baseTilePx=64 → 64x64 PNG', () => {
    const asset = BoardAssetSchema.parse({
      id: 'tile', kind: 'tile', footprint: { w: 1, h: 1 },
      prompt: 'grass', layer: 'ground',
    });
    const baseTilePx = 64;
    expect(asset.footprint.w * baseTilePx).toBe(64);
    expect(asset.footprint.h * baseTilePx).toBe(64);
  });

  it('2x2 stamp at baseTilePx=64 → 128x128 PNG', () => {
    const asset = BoardAssetSchema.parse({
      id: 'house', kind: 'stamp', footprint: { w: 2, h: 2 },
      prompt: 'cottage', layer: 'object',
    });
    const baseTilePx = 64;
    expect(asset.footprint.w * baseTilePx).toBe(128);
    expect(asset.footprint.h * baseTilePx).toBe(128);
  });

  it('clamps footprint to 1..8', () => {
    expect(() => BoardAssetSchema.parse({
      id: 't', kind: 'tile', footprint: { w: 0, h: 1 },
      prompt: 'x', layer: 'ground',
    })).toThrow();
    expect(() => BoardAssetSchema.parse({
      id: 't', kind: 'tile', footprint: { w: 9, h: 1 },
      prompt: 'x', layer: 'ground',
    })).toThrow();
  });
});

describe('safeValidateBoard', () => {
  it('returns ok=true for valid v2', () => {
    const ok = safeValidateBoard({
      ...baseV1,
      version: 2,
      baseTilePx: 64,
      assets: [],
      visualPlacements: [],
      visualStatus: 'pending',
    });
    expect(ok.ok).toBe(true);
  });

  it('returns ok=false for shape errors', () => {
    const bad = safeValidateBoard({ version: 2, width: 5 });
    expect(bad.ok).toBe(false);
  });
});

describe('BoardPlacementSchema', () => {
  it('accepts known layers', () => {
    expect(BoardPlacementSchema.parse({
      assetId: 'x', anchor: { x: 0, y: 0 }, layer: 'ground',
    })).toBeTruthy();
  });

  it('rejects unknown layer', () => {
    expect(() => BoardPlacementSchema.parse({
      assetId: 'x', anchor: { x: 0, y: 0 }, layer: 'mystery',
    })).toThrow();
  });
});
