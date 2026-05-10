import { z } from 'zod';
import { NPC_RACES } from '../../../../../shared/domain/npcRaces.js';
import {
  MAX_NPC_APPEARANCE_STATE_CHANGE_CHARS,
  MAX_NPC_DIALECT_STATE_CHANGE_CHARS,
} from '../../../../../shared/domain/stateValidation.js';

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

// stateChanges.npcs bucket — introduces or updates. Only `action` + `name`
// are mandatory; everything else is optional. We enforce `gender` to be
// "male" / "female" when present so voice assignment has a reliable pool,
// but leave it optional — missing gender is coerced deterministically in
// `processNpcChanges` via `coerceGender`. `.passthrough()` keeps any extra
// LLM-authored fields (e.g. `notes`, `speechStyle`) flowing through to
// downstream persistence.
const NpcChangeSchema = z.object({
  action: z.enum(['introduce', 'update']).optional().default('introduce'),
  name: z.string().trim().min(1).max(120),
  gender: z.enum(['male', 'female']).optional(),
  role: z.string().max(200).optional().nullable(),
  personality: z.string().max(400).optional().nullable(),
  appearance: z.string().max(MAX_NPC_APPEARANCE_STATE_CHANGE_CHARS).optional().nullable(),
  dialect: z.string().max(MAX_NPC_DIALECT_STATE_CHANGE_CHARS).optional().nullable(),
  attitude: z.string().max(40).optional().nullable(),
  disposition: z.number().optional().nullable(),
  dispositionChange: z.number().optional().nullable(),
  alive: z.boolean().optional().nullable(),
  lastLocation: z.string().max(200).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  acknowledgedFame: z.boolean().optional(),
  factionId: z.string().nullable().optional(),
  relatedQuestIds: z.array(z.string()).optional(),
  relationships: z.array(z.object({
    npcName: z.string().min(1).max(120),
    type: z.string().max(60).optional(),
    strength: z.number().optional(),
    // rippleStrength (oś 2) — 0..100, jak mocno ten NPC reaguje na zmiany
    // u target. Optional — gdy pominięte, BE liczy z |strength| heurystycznie.
    rippleStrength: z.number().int().min(0).max(100).optional(),
  }).passthrough()).optional(),
  // NPC character card — regular NPCs get one of NPC_RACES, story creatures
  // (zjawy, sfinksy, demony, ...) use a free-text creatureKind tag instead.
  // level defaults from category; statsOverride lets the LLM nudge specific
  // fields on exceptional NPCs (arcymag, boss). Full sheet is generated
  // deterministically on the backend when absent.
  race: z.enum(NPC_RACES).nullable().optional(),
  creatureKind: z.string().trim().max(60).nullable().optional(),
  level: z.number().int().min(1).max(30).optional(),
  keyNpc: z.boolean().optional(),
  joinParty: z.boolean().optional(),
  statsOverride: z.object({
    attributes: z.record(z.number()).optional(),
    skills: z.record(z.number()).optional(),
    weapons: z.array(z.string().max(60)).max(4).optional(),
    traits: z.array(z.string().max(60)).max(8).optional(),
    armourDR: z.number().int().min(0).max(10).optional(),
    maxWounds: z.number().int().min(1).max(500).optional(),
    mana: z.object({
      current: z.number().int().min(0).max(500).optional(),
      max: z.number().int().min(0).max(500).optional(),
    }).partial().optional(),
  }).partial().optional(),
}).passthrough();

export const NpcChangesSchema = z.array(NpcChangeSchema).max(30);

// Stage 2 — NPC memory updates. Array of `{npcName, memory, importance?}`.
// Append-only into CampaignNPC.experienceLog. Caps: 20 updates per scene
// (prevents an overzealous LLM from stuffing every incidental interaction
// into memory), 300 chars per memory text. Importance defaults to 'minor'
// at apply-time if LLM omits it.
const MAX_NPC_MEMORY_UPDATES = 20;

// `actionType` (oś 2) — opcjonalny semantyczny tag akcji. Gdy obecny,
// `relationshipRippleService` używa go do propagacji disposition na
// powiązane NPC (brat, kochanek, rywal). Pominięcie = brak ripple,
// zapisuje się tylko zwykły wpis pamięci.
export const NPC_ACTION_TYPES = [
  'killed', 'saved', 'betrayed', 'aided', 'insulted',
  'broke_promise', 'kept_promise',
];

const NpcMemoryUpdateSchema = z.object({
  npcName: z.string().trim().min(1).max(120),
  memory: z.string().trim().min(1).max(300),
  importance: z.enum(['minor', 'major']).optional(),
  actionType: z.enum(NPC_ACTION_TYPES).nullable().optional(),
}).passthrough();

export const NpcMemoryUpdatesSchema = z.array(NpcMemoryUpdateSchema).max(MAX_NPC_MEMORY_UPDATES);

// ── Quest graph (oś 1) — branching, parents, branchChoice ──────────────
//
// Quest update — oprócz legacy `objectiveId` (numeric index string) i
// `completed`/`addProgress` dodajemy `nodeKey` (preferred) i `branchChoice`
// (XOR lock-in). Resolver w processQuestObjectiveUpdates próbuje nodeKey
// pierwsze, fallback do objectiveId.
const NODE_KEY_RE = /^[a-z0-9_]{1,40}$/;
const NodeKeySchema = z.string().regex(NODE_KEY_RE, 'nodeKey must match [a-z0-9_]{1,40}');

const BranchChoiceSchema = z.object({
  group: z.string().trim().min(1).max(60),
  chosen: NodeKeySchema,
}).passthrough();

const QuestUpdateSchema = z.object({
  questId: z.string().trim().min(1).max(120),
  nodeKey: NodeKeySchema.optional(),
  objectiveId: z.union([z.string(), z.number()]).optional(),
  completed: z.boolean().optional(),
  addProgress: z.number().optional(),
  branchChoice: BranchChoiceSchema.optional(),
}).passthrough();

export const QuestUpdatesSchema = z.array(QuestUpdateSchema).max(20);

// Quest objective shape w questOffers — pełny graf node-a.
const QuestObjectiveOfferSchema = z.object({
  nodeKey: NodeKeySchema,
  description: z.string().trim().min(1).max(400),
  parents: z.array(NodeKeySchema).max(8).optional(),
  unlocks: z.array(NodeKeySchema).max(8).optional(),
  branchType: z.enum(['and', 'path', 'or']).optional(),
  branchGroup: z.string().trim().min(1).max(60).optional(),
  choiceLabel: z.string().trim().max(120).optional(),
  placeholderHint: z.string().trim().max(120).optional(),
  failsOn: z.object({
    npcDead: z.array(z.string().trim().max(120)).max(8).optional(),
    locationDestroyed: z.array(z.string().trim().max(200)).max(4).optional(),
    deadline: z.string().trim().max(40).nullable().optional(),  // ISO game time
  }).passthrough().optional(),
  // metadata.discovered jest ZAWSZE false dla nowo materializowanych nodes —
  // BE ustawia explicit. LLM nie kontroluje tego pola w questOffers.
}).passthrough();

const QuestOfferSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(800).optional().default(''),
  type: z.enum(['main', 'side', 'personal']).optional().default('side'),
  questGiverId: z.string().trim().max(120).nullable().optional(),
  turnInNpcId: z.string().trim().max(120).nullable().optional(),
  relatedHookId: z.string().trim().max(120).nullable().optional(),
  relatedNpcRefs: z.array(z.string().trim().max(120)).max(8).optional(),
  completionCondition: z.string().trim().max(400).nullable().optional(),
  reward: z.record(z.unknown()).nullable().optional(),
  objectives: z.array(QuestObjectiveOfferSchema).min(1).max(12),
}).passthrough();

export const QuestOffersSchema = z.array(QuestOfferSchema).max(5);

// Quest mutation (oś 4) — explicit override z narracji. Zwykle quest
// dynamics service to robi automatycznie po world tickach; LLM emituje
// tylko gdy narracja ostro przerywa quest (śmierć questgivera on-screen).
const QuestMutationSchema = z.object({
  questId: z.string().trim().min(1).max(120),
  mutation: z.enum(['stall', 'fail', 'reroute']),
  reason: z.string().trim().min(1).max(300),
}).passthrough();

export const QuestMutationsSchema = z.array(QuestMutationSchema).max(10);

// Diegetic discovery (oś 5) — explicit reveal sparowany z wydarzeniem
// narracyjnym. revealSource jest opcjonalny ale silnie zalecany (audit).
const ObjectiveRevealSchema = z.object({
  questId: z.string().trim().min(1).max(120),
  nodeKey: NodeKeySchema,
  revealSource: z.string().trim().max(300).optional(),
}).passthrough();

export const ObjectiveRevealsSchema = z.array(ObjectiveRevealSchema).max(20);

const BranchGroupRevealSchema = z.object({
  questId: z.string().trim().min(1).max(120),
  branchGroup: z.string().trim().min(1).max(60),
  revealedNodeKeys: z.array(NodeKeySchema).min(1).max(8),
  revealSource: z.string().trim().max(300).optional(),
}).passthrough();

export const BranchGroupRevealsSchema = z.array(BranchGroupRevealSchema).max(10);

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

// ── Graph system — AI-emitted graph updates ─────────────────────────
// Each entry describes a single mutation to the location graph: discovering
// an edge, creating a new campaign edge, updating metadata, or revealing a
// perception link. Max 10 per scene — keeps the post-scene pipeline bounded.

const GraphUpdateActionSchema = z.object({
  action: z.enum([
    'discover_location',    // player learns about a location
    'discover_edge',        // player discovers an existing edge
    'create_edge',          // AI creates a new campaign edge (narrative → graph)
    'update_edge',          // modify metadata on an existing edge
    'remove_edge',          // edge destroyed (bridge collapsed, path blocked)
    'add_perception',       // new perception relation (visible/audible/smell)
    'update_discovery',     // change a location's discoveryState
  ]),
  locationName: z.string().trim().max(200).optional(),
  fromLocation: z.string().trim().max(200).optional(),
  toLocation: z.string().trim().max(200).optional(),
  relationType: z.string().trim().max(60).optional(),
  bidirectional: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  description: z.string().trim().max(300).optional(),
  visibility: z.enum(['visible', 'hidden', 'secret']).optional(),
  discoveryState: z.enum(['rumored', 'heard_about', 'visited', 'mapped']).optional(),
  distance: z.number().nonnegative().optional(),
  difficulty: z.enum(['safe', 'moderate', 'dangerous', 'deadly']).optional(),
  risk: z.enum(['none', 'low', 'moderate', 'high', 'extreme']).optional(),
}).passthrough();

export const GraphUpdatesSchema = z.array(GraphUpdateActionSchema).max(10);

export const parseLocationMentions = (input) => safeParse(LocationMentionsSchema, input);
export const parseCampaignComplete = (input) => safeParse(CampaignCompleteSchema, input);
export const parseDungeonComplete = (input) => safeParse(DungeonCompleteSchema, input);
export const parseWorldImpactFlags = (input) => safeParse(WorldImpactFlagsSchema, input);
export const parseDungeonRoomFlags = (input) => safeParse(DungeonRoomFlagsSchema, input);
export const parseNpcMemoryUpdates = (input) => safeParse(NpcMemoryUpdatesSchema, input);
export const parseNpcChanges = (input) => safeParse(NpcChangesSchema, input);
export const parseGraphUpdates = (input) => safeParse(GraphUpdatesSchema, input);
export const parseQuestUpdates = (input) => safeParse(QuestUpdatesSchema, input);
export const parseQuestOffers = (input) => safeParse(QuestOffersSchema, input);
export const parseQuestMutations = (input) => safeParse(QuestMutationsSchema, input);
export const parseObjectiveReveals = (input) => safeParse(ObjectiveRevealsSchema, input);
export const parseBranchGroupReveals = (input) => safeParse(BranchGroupRevealsSchema, input);
