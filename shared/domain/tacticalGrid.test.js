import { describe, expect, it } from 'vitest';
import {
  TILE_TYPES,
  TacticalGridSchema,
  defaultTacticalGrid,
  validateTacticalGrid,
  safeValidateTacticalGrid,
} from './tacticalGrid.js';

describe('tacticalGrid', () => {
  describe('TILE_TYPES', () => {
    it('exports the canonical tile alphabet', () => {
      expect(TILE_TYPES).toEqual(['P', 'F', 'W', 'D', 'S']);
    });
  });

  describe('defaultTacticalGrid', () => {
    it('produces a 12×12 floor grid by default', () => {
      const g = defaultTacticalGrid();
      expect(g.width).toBe(12);
      expect(g.height).toBe(12);
      expect(g.tiles.length).toBe(12);
      expect(g.tiles[0].length).toBe(12);
      expect(g.tiles.every((row) => row.every((t) => t === 'F'))).toBe(true);
    });

    it('respects custom width × height', () => {
      const g = defaultTacticalGrid(8, 6);
      expect(g.width).toBe(8);
      expect(g.height).toBe(6);
      expect(g.tiles.length).toBe(6);
      expect(g.tiles[0].length).toBe(8);
    });
  });

  describe('TacticalGridSchema', () => {
    it('accepts a valid 4×4 grid', () => {
      const grid = {
        width: 4,
        height: 4,
        tiles: [
          ['F', 'F', 'F', 'F'],
          ['F', 'W', 'W', 'F'],
          ['F', 'D', 'S', 'F'],
          ['P', 'P', 'P', 'P'],
        ],
      };
      expect(() => TacticalGridSchema.parse(grid)).not.toThrow();
    });

    it('rejects mismatch height vs tiles.length', () => {
      const grid = {
        width: 4,
        height: 4,
        tiles: [['F', 'F', 'F', 'F']], // only 1 row
      };
      const r = safeValidateTacticalGrid(grid);
      expect(r.success).toBe(false);
    });

    it('rejects mismatch width vs row.length', () => {
      const grid = {
        width: 4,
        height: 2,
        tiles: [
          ['F', 'F', 'F'], // only 3 cols
          ['F', 'F', 'F', 'F'],
        ],
      };
      const r = safeValidateTacticalGrid(grid);
      expect(r.success).toBe(false);
    });

    it('rejects unknown tile types', () => {
      const grid = {
        width: 2,
        height: 2,
        tiles: [
          ['F', 'X'],
          ['F', 'F'],
        ],
      };
      const r = safeValidateTacticalGrid(grid);
      expect(r.success).toBe(false);
    });

    it('rejects undersized grids (< 4)', () => {
      const grid = {
        width: 2,
        height: 2,
        tiles: [['F', 'F'], ['F', 'F']],
      };
      const r = safeValidateTacticalGrid(grid);
      expect(r.success).toBe(false);
    });

    it('rejects oversized grids (> 32)', () => {
      const grid = {
        width: 33,
        height: 4,
        tiles: Array.from({ length: 4 }, () => Array.from({ length: 33 }, () => 'F')),
      };
      const r = safeValidateTacticalGrid(grid);
      expect(r.success).toBe(false);
    });
  });

  describe('validateTacticalGrid (throws on invalid)', () => {
    it('returns parsed grid when valid', () => {
      const grid = defaultTacticalGrid(8, 8);
      const out = validateTacticalGrid(grid);
      expect(out.width).toBe(8);
    });

    it('throws on invalid grid', () => {
      expect(() => validateTacticalGrid({ width: 4, height: 4, tiles: [] })).toThrow();
    });
  });
});
