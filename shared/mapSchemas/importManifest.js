// Import manifest: optional sidecar JSON that rides alongside PNGs when the
// user has no .tset. Parsed by engine/slicer.js server-side and client-side.

import { z } from 'zod';
import {
  ScaleAlgoSchema,
  TileSizeSchema,
  RegionArraySchema,
  TilesetPackOriginSchema,
} from './tilesetPack.js';

export const ManifestTilesetSchema = z.object({
  name: z.string().trim().min(1).max(128),
  image: z.string().min(1), // file name or imageKey already uploaded
  imageBase64: z.string().optional(), // when bundled inline
  imageKey: z.string().optional(),    // when already uploaded
  nativeTilesize: TileSizeSchema.default(16),
  regions: RegionArraySchema,
});

export const ImportManifestSchema = z.object({
  version: z.literal(1).default(1),
  name: z.string().trim().max(128).default('Imported Pack'),
  projectTilesize: TileSizeSchema.default(24),
  scaleAlgo: ScaleAlgoSchema.default('nearest'),
  origin: TilesetPackOriginSchema,
  tilesets: z.array(ManifestTilesetSchema).min(1),
});

export const ImportRequestSchema = z.object({
  // When provided, append tilesets to this existing pack instead of creating
  // a new one. `packMeta` is ignored in that case (the existing pack keeps
  // its name / projectTilesize / scaleAlgo).
  targetPackId: z.string().min(1).optional(),
  packMeta: z
    .object({
      name: z.string().trim().min(1).max(128).default('New Pack'),
      projectTilesize: TileSizeSchema.default(24),
      scaleAlgo: ScaleAlgoSchema.default('nearest'),
      origin: TilesetPackOriginSchema,
    })
    .default({}),
  tilesets: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(128),
        imageBase64: z.string().min(1),
        contentType: z.string().default('image/png'),
        nativeTilesize: TileSizeSchema.default(16),
        regions: RegionArraySchema,
        // Pre-computed tile inventory (optional — BE will fill-in from the
        // atlas if omitted).
        tiles: z
          .array(
            z.object({
              localId: z.number().int().nonnegative(),
              regionId: z.string().default(''),
              col: z.number().int().nonnegative().default(0),
              row: z.number().int().nonnegative().default(0),
              nativeSize: TileSizeSchema.default(16),
            })
          )
          .optional(),
        autotileGroups: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(128),
              layout: z
                .enum([
                  'rpgmaker_a1',
                  'rpgmaker_a2',
                  'wang_2edge',
                  'blob_47',
                  'custom',
                ])
                .default('blob_47'),
              regionId: z.string().default(''),
              originCol: z.number().int().nonnegative().default(0),
              originRow: z.number().int().nonnegative().default(0),
            })
          )
          .optional(),
      })
    )
    .min(1),
});
