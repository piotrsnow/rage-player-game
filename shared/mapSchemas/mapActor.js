// Zod schemas for MapActor — visual NPC/player presets generated in the
// mapapp CharGen page and stored in Prisma.

import { z } from 'zod';
import { ObjectIdSchema } from './tilesetPack.js';

export const ActorSlotSchema = z.object({
  id: z.string().min(1),
  color: z.string().default('none'),
});

export const ActorAppearanceSchema = z.object({
  race: z.string().min(1),
  config: z.string().min(1),
  bodyType: z.string().optional(),
  headType: z.string().optional(),
  slots: z.record(z.string(), ActorSlotSchema).default({}),
});

export const MapActorSchema = z.object({
  id: ObjectIdSchema.optional(),
  userId: ObjectIdSchema.optional(),
  name: z.string().trim().min(1).max(80),
  appearance: ActorAppearanceSchema,
  tags: z.array(z.string().min(1).max(40)).default([]),
});

export const MapActorCreateSchema = MapActorSchema.omit({ id: true, userId: true });
export const MapActorUpdateSchema = MapActorCreateSchema.partial();
