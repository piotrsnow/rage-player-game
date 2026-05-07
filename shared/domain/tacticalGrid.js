// Faza 0 — Tactical grid stored as metadata na nodzie grafu lokacji.
// Renderer (SceneGridMap) wczytuje grid z node.tacticalGrid podczas walki.
//
// TileType:
//   P — passable (default; postać może wejść)
//   F — floor    (passable, taktyczny "open ground")
//   W — wall     (impassable, blokuje LoS)
//   D — door     (passable z animacją; może być closed/locked w metadata)
//   S — special  (interaktywny obiekt: chest, altar, trap; metadata określa)

import { z } from 'zod';

export const TILE_TYPES = ['P', 'F', 'W', 'D', 'S'];

export const TileTypeSchema = z.enum(TILE_TYPES);

const MIN_DIM = 4;
const MAX_DIM = 32;

/**
 * Walidator wymaga, by tiles[y].length === width dla każdego y, oraz
 * tiles.length === height. Brak walidacji top-level — robi to validateTiles.
 */
export const TacticalGridSchema = z
  .object({
    width: z.number().int().min(MIN_DIM).max(MAX_DIM),
    height: z.number().int().min(MIN_DIM).max(MAX_DIM),
    tiles: z.array(z.array(TileTypeSchema)),
  })
  .refine(
    (data) => data.tiles.length === data.height,
    { message: 'tiles.length must equal height' }
  )
  .refine(
    (data) => data.tiles.every((row) => row.length === data.width),
    { message: 'every tiles[y].length must equal width' }
  );

/** Default 12×12 floor grid — używany gdy node nie ma własnego tacticalGrid. */
export function defaultTacticalGrid(width = 12, height = 12) {
  return {
    width,
    height,
    tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => 'F')),
  };
}

/** Helper: walidacja runtime (rzuca przy błędzie) — używać w graphValidator.js. */
export function validateTacticalGrid(grid) {
  return TacticalGridSchema.parse(grid);
}

/** Safe variant — zwraca { ok, data | error }. */
export function safeValidateTacticalGrid(grid) {
  return TacticalGridSchema.safeParse(grid);
}
