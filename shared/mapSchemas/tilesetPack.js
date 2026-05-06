// Zod schemas for TilesetPack + Tileset + Region + Tile + AutotileGroup.
// These are the wire + DB shapes. Prisma Json columns store native JSONB;
// schemas validate the parsed object shape.

import { z } from 'zod';
import { TileAtomArraySchema } from './atoms.js';
import { TraitsSchema, TraitVocabSchema, FreeTagsSchema } from './traitVocab.js';

// ── Primitive guards ─────────────────────────────────────────────────
export const ObjectIdSchema = z.string().uuid();
export const SlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_\-]*$/i, 'slug: [a-z0-9_-]');

export const ScaleAlgoSchema = z.enum(['nearest', 'bilinear', 'lanczos3']);

export const TILE_SIZE_MIN = 4;
export const TILE_SIZE_MAX = 256;
export const TileSizeSchema = z.number().int().min(TILE_SIZE_MIN).max(TILE_SIZE_MAX);

// ── Region (embedded in Tileset.regions[]) ───────────────────────────
export const RegionRoleSchema = z.enum(['tiles', 'autotile_group', 'stamp_template']);

export const AutotileLayoutSchema = z.enum([
  'rpgmaker_a1',
  'rpgmaker_a2',
  'wang_2edge',
  'blob_47',
  'custom',
]);

export const RegionSchema = z.object({
  id: SlugSchema,
  name: z.string().trim().min(1).max(128),
  role: RegionRoleSchema.default('tiles'),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  nativeTilesize: TileSizeSchema.optional(),
  defaultTraits: TraitsSchema.optional(),
  autotileLayout: AutotileLayoutSchema.optional(),
});
export const RegionArraySchema = z.array(RegionSchema).default([]);

// ── Tileset ──────────────────────────────────────────────────────────
export const AtlasEntrySchema = z.object({
  regionId: z.string(),
  col: z.number().int().min(0),
  row: z.number().int().min(0),
  sx: z.number().int().min(0),
  sy: z.number().int().min(0),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export const AtlasSchema = z.record(z.string(), AtlasEntrySchema).default({});

export const RenderedVariantSchema = z.object({
  imageKey: z.string().min(1),
  algo: ScaleAlgoSchema,
  renderedAt: z.string().datetime().or(z.date()),
});
export const RenderedVariantsSchema = z
  .record(z.string().regex(/^\d+$/), RenderedVariantSchema)
  .default({});

export const SliceModeSchema = z.enum(['whole', 'regions']);

export const TilesetSchema = z.object({
  id: ObjectIdSchema.optional(),
  packId: ObjectIdSchema.optional(),
  name: z.string().trim().min(1).max(128),
  imageKey: z.string().min(1),
  imageWidth: z.number().int().nonnegative().default(0),
  imageHeight: z.number().int().nonnegative().default(0),
  nativeTilesize: TileSizeSchema.default(16),
  regions: RegionArraySchema,
  sliceMode: SliceModeSchema.default('whole'),
  atlas: AtlasSchema,
  renderedVariants: RenderedVariantsSchema,
});

// ── Tile ─────────────────────────────────────────────────────────────
export const AutotileRoleSchema = z.enum([
  'corner',
  'edge',
  'inner',
  'fill',
  'edge_N', 'edge_E', 'edge_S', 'edge_W',
  'edge_NE', 'edge_NW', 'edge_SE', 'edge_SW',
]);

export const TileSchema = z.object({
  id: ObjectIdSchema.optional(),
  tilesetId: ObjectIdSchema.optional(),
  regionId: z.string().default(''),
  localId: z.number().int().nonnegative(),
  col: z.number().int().nonnegative().default(0),
  row: z.number().int().nonnegative().default(0),
  nativeSize: TileSizeSchema.default(16),
  atoms: TileAtomArraySchema,
  traits: TraitsSchema,
  tags: FreeTagsSchema,
  autotileGroupId: ObjectIdSchema.nullable().optional(),
  autotileRole: AutotileRoleSchema.nullable().optional(),
  notes: z.string().default(''),
});

export const TilePatchSchema = TileSchema.pick({
  atoms: true,
  traits: true,
  tags: true,
  autotileGroupId: true,
  autotileRole: true,
  notes: true,
  regionId: true,
}).partial();

export const TileBulkPatchSchema = z.object({
  tilesetId: ObjectIdSchema,
  patches: z
    .array(
      z.object({
        localId: z.number().int().nonnegative(),
        patch: TilePatchSchema,
      })
    )
    .min(1)
    .max(5000),
});

// ── AutotileGroup ────────────────────────────────────────────────────
export const AutotileCellsSchema = z.record(
  z.string().regex(/^\d+,\d+$/),
  AutotileRoleSchema,
).default({});

export const AutotileGroupSchema = z.object({
  id: ObjectIdSchema.optional(),
  tilesetId: ObjectIdSchema.optional(),
  regionId: z.string().default(''),
  name: z.string().trim().min(1).max(128),
  layout: AutotileLayoutSchema.default('blob_47'),
  originCol: z.number().int().nonnegative().default(0),
  originRow: z.number().int().nonnegative().default(0),
  cols: z.number().int().positive().max(32).nullable().optional(),
  rows: z.number().int().positive().max(32).nullable().optional(),
  cells: AutotileCellsSchema,
  traits: TraitsSchema,
});

// ── TilesetPack ──────────────────────────────────────────────────────
export const TilesetPackOriginSchema = z
  .object({
    source: z.enum(['tset', 'png', 'tiled', 'manifest']).default('png'),
    checksum: z.string().optional(),
    importedFiles: z.array(z.string()).optional(),
  })
  .partial()
  .default({});

export const TilesetPackSchema = z.object({
  id: ObjectIdSchema.optional(),
  userId: ObjectIdSchema.optional(),
  name: z.string().trim().min(1).max(128),
  projectTilesize: TileSizeSchema.default(24),
  scaleAlgo: ScaleAlgoSchema.default('nearest'),
  origin: TilesetPackOriginSchema,
  traitVocab: TraitVocabSchema,
  schemaVersion: z.number().int().positive().default(1),
});

export const TilesetPackCreateSchema = TilesetPackSchema.pick({
  name: true,
  projectTilesize: true,
  scaleAlgo: true,
  origin: true,
  traitVocab: true,
});

export const TilesetPackUpdateSchema = TilesetPackCreateSchema.partial();
