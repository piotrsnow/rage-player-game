// MapDoc schema — persisted map document in Map Editor.
// Layers are 2D arrays of local tile ids (uint-compatible). In this iteration
// we validate shape loosely: array of rows, each row is an array of integers
// or nulls. Compression lives in the future.

import { z } from 'zod';
import { ObjectIdSchema, TileSizeSchema } from './tilesetPack.js';

export const MAP_DIM_MIN = 1;
export const MAP_DIM_MAX = 512;

export const MapSizeSchema = z.tuple([
  z.number().int().min(MAP_DIM_MIN).max(MAP_DIM_MAX),
  z.number().int().min(MAP_DIM_MIN).max(MAP_DIM_MAX),
]);

// One layer cell: null (empty) or { packId, tilesetId, localId } or a packed int id.
export const LayerCellSchema = z.union([
  z.null(),
  z.number().int().nonnegative(),
  z.object({
    packId: ObjectIdSchema,
    tilesetId: ObjectIdSchema,
    localId: z.number().int().nonnegative(),
  }),
]);

export const LayerGridSchema = z.array(z.array(LayerCellSchema));

export const LayersSchema = z
  .object({
    ground: LayerGridSchema.optional(),
    overlay: LayerGridSchema.optional(),
    objects: LayerGridSchema.optional(),
  })
  .catchall(LayerGridSchema)
  .default({});

export const MapObjectSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  kind: z.string().default('generic'),
  data: z.any().optional(),
});

export const MapDocSchema = z.object({
  id: ObjectIdSchema.optional(),
  userId: ObjectIdSchema.optional(),
  name: z.string().trim().min(1).max(128),
  size: MapSizeSchema.default([64, 64]),
  projectTilesize: TileSizeSchema.default(24),
  packIds: z.array(ObjectIdSchema).default([]),
  layers: LayersSchema,
  collision: z.string().default(''),
  objects: z.array(MapObjectSchema).default([]),
  meta: z.record(z.string(), z.any()).default({}),
  campaignId: ObjectIdSchema.nullable().optional(),
});

export const MapDocCreateSchema = MapDocSchema.omit({ id: true, userId: true });
export const MapDocUpdateSchema = MapDocCreateSchema.partial();
