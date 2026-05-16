/**
 * Exploration Board schema — per-location persistent tactical grid
 * with interactive objects, exits, spawn point, and entity positions.
 *
 * Extends the existing battlefieldTiles tile-ID vocabulary.
 * Stored in `tacticalGrid` JSONB on WorldLocation / CampaignLocation.
 * Col-major: tiles[col][row] — same convention as battlefieldGenerator / generateFieldTiles.
 */

import { z } from 'zod';
import { ALL_TILE_IDS } from './battlefieldTiles.js';

const tileIdSchema = z.string().refine((id) => ALL_TILE_IDS.includes(id), {
  message: 'Unknown tile ID',
});

export const OBJECT_TYPES = [
  'chest', 'altar', 'lever', 'sign', 'bed', 'table', 'door',
  'barrel', 'crate', 'bookshelf', 'well', 'campfire', 'forge',
  'cauldron', 'throne', 'statue', 'fountain', 'shrine', 'workbench',
  'stash', 'trap', 'cage', 'grave', 'ladder', 'crystal',
];

export const OBJECT_STATES = ['open', 'closed', 'locked', 'broken', 'active', 'inactive', 'empty'];

export const BoardObjectSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  type: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  description: z.string().max(300).optional(),
  interactable: z.boolean(),
  passable: z.boolean().default(true),
  state: z.string().max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const BoardExitSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  targetLocationName: z.string().min(1).max(200),
  targetLocationRef: z.object({
    kind: z.enum(['world', 'campaign']),
    id: z.string().uuid(),
  }).optional(),
  direction: z.string().max(10).optional(),
  label: z.string().max(120).optional(),
});

export const BoardEntitySchema = z.object({
  id: z.string().min(1).max(200),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

export const SpawnPointSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

export const BoardMutationSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  action: z.enum(['set_state', 'remove', 'add_object', 'set_tile']),
  objectType: z.string().max(40).optional(),
  objectName: z.string().max(120).optional(),
  state: z.string().max(20).optional(),
  tileId: z.string().max(40).optional(),
  description: z.string().max(300).optional(),
});

export const ExplorationBoardSchema = z.object({
  version: z.literal(1),
  width: z.number().int().min(6).max(48),
  height: z.number().int().min(6).max(28),
  tiles: z.array(z.array(z.string())),
  objects: z.array(BoardObjectSchema).default([]),
  exits: z.array(BoardExitSchema).default([]),
  entities: z.array(BoardEntitySchema).default([]),
  spawnPoint: SpawnPointSchema,
  theme: z.string().max(40).optional(),
  generatedAt: z.string().datetime(),
});

export const LOCATION_TYPE_GRID_SIZES = {
  room:         { w: 10, h: 8 },
  interior:     { w: 10, h: 8 },
  building:     { w: 12, h: 10 },
  tavern:       { w: 12, h: 10 },
  shop:         { w: 12, h: 10 },
  cave:         { w: 14, h: 12 },
  dungeon_room: { w: 14, h: 12 },
  ruin:         { w: 16, h: 14 },
  wilderness:   { w: 16, h: 14 },
  camp:         { w: 16, h: 14 },
  hamlet:       { w: 20, h: 18 },
  village:      { w: 20, h: 18 },
  town:         { w: 24, h: 22 },
  city:         { w: 28, h: 24 },
  capital:      { w: 28, h: 24 },
};

const DEFAULT_GRID_SIZE = { w: 14, h: 12 };

/**
 * Resolve grid dimensions from a location type string.
 * Falls back to keyword matching against the locationType then to DEFAULT_GRID_SIZE.
 */
export function gridSizeForLocationType(locationType) {
  if (!locationType) return DEFAULT_GRID_SIZE;
  const lower = locationType.toLowerCase().trim();
  if (LOCATION_TYPE_GRID_SIZES[lower]) return LOCATION_TYPE_GRID_SIZES[lower];
  for (const [key, size] of Object.entries(LOCATION_TYPE_GRID_SIZES)) {
    if (lower.includes(key)) return size;
  }
  return DEFAULT_GRID_SIZE;
}

/**
 * Validate an exploration board object. Returns { ok, data?, error? }.
 */
export function safeValidateBoard(board) {
  const result = ExplorationBoardSchema.safeParse(board);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error };
}

/**
 * Apply a list of board mutations (from quick-beat or scene stateChanges) to
 * the board in-place. Returns the mutated board (same reference).
 */
export function applyBoardMutations(board, mutations) {
  if (!board || !Array.isArray(mutations)) return board;
  for (const m of mutations) {
    switch (m.action) {
      case 'set_state': {
        const obj = board.objects.find((o) => o.x === m.x && o.y === m.y);
        if (obj) obj.state = m.state || 'open';
        break;
      }
      case 'remove': {
        board.objects = board.objects.filter((o) => !(o.x === m.x && o.y === m.y));
        break;
      }
      case 'add_object': {
        if (m.objectType && m.objectName) {
          board.objects.push({
            x: m.x, y: m.y,
            type: m.objectType,
            name: m.objectName,
            description: m.description || '',
            interactable: true,
            passable: true,
          });
        }
        break;
      }
      case 'set_tile': {
        if (m.tileId && board.tiles[m.x]) {
          board.tiles[m.x][m.y] = m.tileId;
        }
        break;
      }
    }
  }
  return board;
}
