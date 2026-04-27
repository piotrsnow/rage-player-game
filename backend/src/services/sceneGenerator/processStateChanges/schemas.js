import { z } from 'zod';

/**
 * Zod schemas for Living World `stateChanges` buckets on the BACKEND path.
 *
 * Why here: the FE already has Zod in `src/services/aiResponse/schemas.js`,
 * but scene generation is server-side — the LLM output hits `processStateChanges`
 * before the FE validator ever sees it. Without these guards, an LLM can
 * write oversized strings, wrong-shape objects, or huge arrays straight
 * into WorldEventLog / Prisma. Each handler calls `parseFoo()` before it
 * touches the DB; parse failures log a warning and the bucket is skipped.
 */

// Cap array-of-mentions at 20 so a runaway LLM cannot trigger N findUnique
// queries per scene. 20 is generous — real scenes emit 3–5 mentions tops.
const MAX_LOCATION_MENTIONS = 20;

const LocationMentionSchema = z.object({
  locationName: z.string().min(1),
  byNpcId: z.string().min(1).optional(),
  npcId: z.string().min(1).optional(),
  byNpc: z.string().min(1).optional(),
}).passthrough().refine(
  (m) => Boolean(m.byNpcId || m.npcId || m.byNpc),
  { message: 'locationMention requires byNpcId/npcId/byNpc' },
);

export const LocationMentionsSchema = z.array(LocationMentionSchema).max(MAX_LOCATION_MENTIONS);

// Mirrors the FE shape in `src/services/aiResponse/schemas.js`.
// majorAchievements is REQUIRED and non-empty — if the LLM writes a
// campaign_complete event at all, it has to justify it with at least one
// named achievement. Omission → reject the whole bucket.
export const CampaignCompleteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(800),
  majorAchievements: z.array(z.string().trim().max(200)).min(1).max(3),
}).passthrough();

export const DungeonCompleteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(400).optional().default(''),
}).passthrough();

export const WorldImpactFlagsSchema = z.object({
  worldImpact: z.enum(['minor', 'major']).nullable().optional(),
  worldImpactReason: z.string().trim().max(300).nullable().optional(),
  locationLiberated: z.boolean().nullable().optional(),
  defeatedDeadlyEncounter: z.boolean().nullable().optional(),
  dungeonComplete: DungeonCompleteSchema.nullable().optional(),
}).passthrough();

export const DungeonRoomFlagsSchema = z.object({
  entryCleared: z.boolean().optional(),
  trapSprung: z.boolean().optional(),
  lootTaken: z.boolean().optional(),
}).passthrough();

// Stage 2 — NPC memory updates. Array of `{npcName, memory, importance?}`.
// Append-only into CampaignNPC.experienceLog. Caps: 20 updates per scene
// (prevents an overzealous LLM from stuffing every incidental interaction
// into memory), 300 chars per memory text. Importance defaults to 'minor'
// at apply-time if LLM omits it.
const MAX_NPC_MEMORY_UPDATES = 20;

const NpcMemoryUpdateSchema = z.object({
  npcName: z.string().trim().min(1).max(120),
  memory: z.string().trim().min(1).max(300),
  importance: z.enum(['minor', 'major']).optional(),
}).passthrough();

export const NpcMemoryUpdatesSchema = z.array(NpcMemoryUpdateSchema).max(MAX_NPC_MEMORY_UPDATES);

/**
 * Safe parse helpers. Each returns `{ ok, data, error }`. Handlers use these
 * instead of raw `.parse()` so a schema violation downgrades to a logged
 * warning + skipped bucket, not a thrown error that kills the whole
 * post-scene pipeline.
 */
function safeParse(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error };
}

export const parseLocationMentions = (input) => safeParse(LocationMentionsSchema, input);
export const parseCampaignComplete = (input) => safeParse(CampaignCompleteSchema, input);
export const parseDungeonComplete = (input) => safeParse(DungeonCompleteSchema, input);
export const parseWorldImpactFlags = (input) => safeParse(WorldImpactFlagsSchema, input);
export const parseDungeonRoomFlags = (input) => safeParse(DungeonRoomFlagsSchema, input);
export const parseNpcMemoryUpdates = (input) => safeParse(NpcMemoryUpdatesSchema, input);
