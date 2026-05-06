// Tile atoms — closed enum known to the engine. Shared by FE + BE + CLI.
// Keep this list tight; new meaning should be encoded as a trait first and
// only promoted to an atom when the engine needs to reason about it.

import { z } from 'zod';

export const TILE_ATOMS = [
  // Passability / physics
  'solid',
  'walkable',
  'water',
  'hazard',

  // Structural roles
  'wall',
  'floor',
  'door',
  'window',
  'stairs',

  // Edges for wall/corner tools (8-direction)
  'edge_N',
  'edge_E',
  'edge_S',
  'edge_W',
  'edge_NE',
  'edge_NW',
  'edge_SE',
  'edge_SW',

  // Autotile roles (tool-driven selection)
  'autotile_role_corner',
  'autotile_role_edge',
  'autotile_role_inner',
  'autotile_role_fill',

  // Layer hints for the editor's default placement
  'layer_hint_ground',
  'layer_hint_overlay',
  'layer_hint_object',
];

export const TileAtomSchema = z.enum(TILE_ATOMS);
export const TileAtomArraySchema = z.array(TileAtomSchema).default([]);

export const EDGE_ATOMS = TILE_ATOMS.filter((a) => a.startsWith('edge_'));
export const AUTOTILE_ROLE_ATOMS = TILE_ATOMS.filter((a) =>
  a.startsWith('autotile_role_')
);
export const LAYER_HINT_ATOMS = TILE_ATOMS.filter((a) =>
  a.startsWith('layer_hint_')
);
