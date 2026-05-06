// Trait vocabulary — closed keys, open values.
// Values per pack are curated in TilesetPack.traitVocab; the FE autocomplete
// pulls from that bag so `biome:grass` vs `biome:Grass` gets surfaced by the
// ontology lint rather than silently forking.

import { z } from 'zod';

export const TRAIT_KEYS = ['biome', 'material', 'theme', 'style', 'climate'];
export const TraitKeySchema = z.enum(TRAIT_KEYS);

// Values are free strings but we keep them kebab/slug-ish for stable diffs.
const TraitValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_\-:]*$/i, 'trait values use letters/digits/_/-/:');

export const TraitsSchema = z.record(TraitKeySchema, TraitValueSchema).default({});

// Vocab is per-pack: { biome: ["grass","sand",...], ... }
export const TraitVocabSchema = z
  .record(TraitKeySchema, z.array(TraitValueSchema))
  .default({});

export const FreeTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(48);
export const FreeTagsSchema = z.array(FreeTagSchema).default([]);
