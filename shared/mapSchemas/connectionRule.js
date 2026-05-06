// ConnectionRule: "leftTraits -> rightTraits via (autotile_group | wall_bitmask)".

import { z } from 'zod';
import { ObjectIdSchema } from './tilesetPack.js';
import { TraitsSchema } from './traitVocab.js';

export const ConnectionViaSchema = z.enum(['autotile_group', 'wall_bitmask']);

export const ConnectionViaRefSchema = z
  .object({
    groupId: ObjectIdSchema.optional(),
    // 9-cell center-masked bitmask for wall_bitmask rules, 0..511
    bitmask: z.number().int().min(0).max(511).optional(),
  })
  .default({});

export const ConnectionRuleSchema = z.object({
  id: ObjectIdSchema.optional(),
  packId: ObjectIdSchema.optional(),
  name: z.string().trim().max(128).default(''),
  leftTraits: TraitsSchema,
  rightTraits: TraitsSchema,
  via: ConnectionViaSchema.default('autotile_group'),
  viaRef: ConnectionViaRefSchema,
  priority: z.number().int().min(0).max(1000).default(0),
});

export const ConnectionRuleCreateSchema = ConnectionRuleSchema.omit({
  id: true,
  packId: true,
});
export const ConnectionRuleUpdateSchema = ConnectionRuleCreateSchema.partial();
