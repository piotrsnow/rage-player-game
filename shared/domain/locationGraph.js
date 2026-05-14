import { z } from 'zod';
import {
  TacticalGridSchema,
  defaultTacticalGrid,
  validateTacticalGrid,
  safeValidateTacticalGrid,
  TILE_TYPES,
} from './tacticalGrid.js';

// ── Edge categories ──────────────────────────────────────────────────
export const EDGE_CATEGORIES = {
  structural: 'structural',
  spatial: 'spatial',
  movement: 'movement',
  access: 'access',
  perception: 'perception',
  social: 'social',
  narrative: 'narrative',
  temporal: 'temporal',
};

// ── Edge types grouped by category ───────────────────────────────────
export const EDGE_TYPES = {
  // Structural
  contains: { category: 'structural', bidirectional: false },
  overlaps: { category: 'structural', bidirectional: true },
  above: { category: 'structural', bidirectional: false },
  below: { category: 'structural', bidirectional: false },

  // Spatial
  adjacent_to: { category: 'spatial', bidirectional: true },
  near: { category: 'spatial', bidirectional: true },
  across_from: { category: 'spatial', bidirectional: true },

  // Movement
  path_to: { category: 'movement', bidirectional: true },
  road_to: { category: 'movement', bidirectional: true },
  door_to: { category: 'movement', bidirectional: true },
  stairs_to: { category: 'movement', bidirectional: true },
  tunnel_to: { category: 'movement', bidirectional: true },
  bridge_to: { category: 'movement', bidirectional: true },
  portal_to: { category: 'movement', bidirectional: false },
  secret_path_to: { category: 'movement', bidirectional: false },
  one_way_to: { category: 'movement', bidirectional: false },
  dangerous_path_to: { category: 'movement', bidirectional: true },
  blocked_path_to: { category: 'movement', bidirectional: true },
  climb_to: { category: 'movement', bidirectional: false },
  swim_to: { category: 'movement', bidirectional: false },
  ferry_to: { category: 'movement', bidirectional: true },

  // Access
  requires_key: { category: 'access', bidirectional: false },
  requires_permission: { category: 'access', bidirectional: false },
  requires_skill_check: { category: 'access', bidirectional: false },
  requires_payment: { category: 'access', bidirectional: false },

  // Perception
  visible_from: { category: 'perception', bidirectional: false },
  audible_from: { category: 'perception', bidirectional: false },
  smell_from: { category: 'perception', bidirectional: false },

  // Social
  controlled_by: { category: 'social', bidirectional: false },
  patrolled_by: { category: 'social', bidirectional: false },
  inhabited_by: { category: 'social', bidirectional: false },

  // Narrative
  quest_related_to: { category: 'narrative', bidirectional: false },
  home_of: { category: 'narrative', bidirectional: false },
  workplace_of: { category: 'narrative', bidirectional: false },
  rumor_about: { category: 'narrative', bidirectional: false },

  // Temporal
  open_during: { category: 'temporal', bidirectional: false },
  accessible_during: { category: 'temporal', bidirectional: false },
};

export const EDGE_TYPE_NAMES = Object.keys(EDGE_TYPES);
export const EDGE_CATEGORY_NAMES = Object.keys(EDGE_CATEGORIES);

// ── Discovery states ─────────────────────────────────────────────────
export const DISCOVERY_STATES = {
  unknown: 'unknown',
  rumored: 'rumored',
  known: 'known',
  visited: 'visited',
  mapped: 'mapped',
  hidden: 'hidden',
};

const DISCOVERY_ORDER = ['unknown', 'rumored', 'known', 'visited', 'mapped'];

export function isValidDiscoveryPromotion(from, to) {
  if (to === 'hidden' || from === 'hidden') return true;
  const fromIdx = DISCOVERY_ORDER.indexOf(from);
  const toIdx = DISCOVERY_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx >= fromIdx;
}

// ── Composite location ref (Faza 0) ──────────────────────────────────
// Polymorphic ref używany wszędzie zamiast string-name lokacji:
//   - state: world.currentLocationRef, npc.locationRef, quest.locationRef
//   - AI schemas (po resolve przez aiResolver.js)
//   - WorldEvent.locationKind/locationId

export const LOCATION_KINDS = ['world', 'campaign'];

export const LocationKindSchema = z.enum(LOCATION_KINDS);

export const LocationRefSchema = z.object({
  kind: LocationKindSchema,
  id: z.string().uuid(),
});

/** Helper: porównanie composite refs (null-safe). */
export function refsEqual(a, b) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

/** Helper: serializacja "kind:id" (np. do AI prompt context). */
export function refToString(ref) {
  if (!ref) return null;
  return `${ref.kind}:${ref.id}`;
}

/** Helper: parsowanie "kind:id" → ref. Zwraca null przy błędzie. */
export function parseRef(str) {
  if (typeof str !== 'string') return null;
  const m = str.match(/^(world|campaign):([0-9a-f-]{36})$/i);
  if (!m) return null;
  return { kind: m[1], id: m[2] };
}

// ── Modification log entry ───────────────────────────────────────────
// Wpis w `node.modificationsLog[]`. Replace `world.mapState[].modifications[]`.
export const ModificationLogEntrySchema = z.object({
  timestamp: z.string().datetime(),
  sceneId: z.string().optional(),
  type: z.string().min(1).max(40), // np. 'visited', 'liberated', 'ai-redirect', 'description-change'
  summary: z.string().max(500),
}).passthrough();

// ── Dungeon room state ───────────────────────────────────────────────
// `node.dungeonState`. Replace AI `dungeonRoom: {entryCleared, ...}` dispatch.
export const DungeonStateSchema = z.object({
  entryCleared: z.boolean().optional(),
  trapSprung: z.boolean().optional(),
  lootTaken: z.boolean().optional(),
}).passthrough();

// ── Zod schemas for graph extraction output ──────────────────────────

export const NewNodeEntrySchema = z.object({
  name: z.string().min(1).max(120),
  type: z.string().min(1).max(40),
  scale: z.number().int().min(1).max(7).optional(),
  parentName: z.string().max(120).nullable().optional(),
  description: z.string().max(500).optional().default(''),
  tags: z.array(z.string().max(40)).max(10).optional().default([]),
  reason: z.string().max(200).optional().default(''),
  // Faza 0 — opcjonalne metadane node, które AI może podpowiedzieć.
  biome: z.string().max(40).optional(),
  anchorType: z.string().max(40).optional(),
  tacticalGrid: TacticalGridSchema.optional(),
}).passthrough();

export const NewEdgeEntrySchema = z.object({
  fromRef: z.string().max(80).optional(),
  fromName: z.string().min(1).max(120),
  toRef: z.string().max(80).optional(),
  toName: z.string().min(1).max(120),
  edgeType: z.string().min(1).max(40),
  category: z.string().min(1).max(20),
  bidirectional: z.boolean().optional().default(true),
  metadata: z.record(z.unknown()).optional().default({}),
  reason: z.string().max(200).optional().default(''),
}).passthrough();

export const UpdatedEdgeEntrySchema = z.object({
  fromRef: z.string().max(80).optional(),
  fromName: z.string().min(1).max(120),
  toRef: z.string().max(80).optional(),
  toName: z.string().min(1).max(120),
  edgeType: z.string().min(1).max(40),
  changes: z.record(z.unknown()),
  reason: z.string().max(200).optional().default(''),
}).passthrough();

export const NpcMoveSchema = z.object({
  campaignNpcId: z.string().uuid().optional(),
  npcName: z.string().min(1).max(120),
  toLocationRef: z.string().max(80).optional(),
  toLocationName: z.string().min(1).max(120),
  reason: z.string().max(200).optional().default(''),
}).passthrough();

export const DiscoveryChangeSchema = z.object({
  locationRef: z.string().max(80).optional(),
  locationName: z.string().min(1).max(120),
  newState: z.enum(['unknown', 'rumored', 'known', 'visited', 'mapped', 'hidden']),
  reason: z.string().max(200).optional().default(''),
}).passthrough();

export const GraphUpdateSchema = z.object({
  newNodes: z.array(NewNodeEntrySchema).max(10).optional().default([]),
  newEdges: z.array(NewEdgeEntrySchema).max(20).optional().default([]),
  updatedEdges: z.array(UpdatedEdgeEntrySchema).max(10).optional().default([]),
  npcMoves: z.array(NpcMoveSchema).max(10).optional().default([]),
  discoveryChanges: z.array(DiscoveryChangeSchema).max(20).optional().default([]),
  summary: z.string().max(500).optional().default('No spatial changes'),
}).passthrough();

// ── Location Node Schema (full node returned from graphService) ──────
// Faza 0 — rozszerzony o tacticalGrid, biome, anchorType, visitCount,
// npcsEncountered, modificationsLog, dungeonState, liberatedAt.
export const LocationNodeSchema = z.object({
  id: z.string().uuid(),
  kind: LocationKindSchema,
  name: z.string(),
  canonicalName: z.string().optional(),
  displayName: z.string().nullable().optional(),
  description: z.string().optional().default(''),
  locationType: z.string().optional(),
  scale: z.number().int().min(1).max(7).optional(),
  tags: z.array(z.string()).optional().default([]),
  atmosphere: z.string().nullable().optional(),
  dangerLevel: z.enum(['safe', 'low', 'moderate', 'dangerous', 'deadly']).optional(),
  regionX: z.number().optional(),
  regionY: z.number().optional(),
  discoveryState: z.enum(['unknown', 'rumored', 'known', 'visited', 'mapped', 'hidden', 'heard_about']).optional(),
  nodeShape: z.string().nullable().optional(),
  nodeIcon: z.string().nullable().optional(),
  nodeImageUrl: z.string().nullable().optional(),
  // Faza 0 — nowe pola
  tacticalGrid: TacticalGridSchema.nullable().optional(),
  biome: z.string().nullable().optional(),
  anchorType: z.string().nullable().optional(),
  visitCount: z.number().int().min(0).optional().default(0),
  npcsEncountered: z.array(z.string()).optional().default([]),
  modificationsLog: z.array(ModificationLogEntrySchema).optional().default([]),
  dungeonState: DungeonStateSchema.nullable().optional(),
  liberatedAt: z.string().datetime().nullable().optional(),
}).passthrough();

// Re-export tacticalGrid helpers for convenience.
export { TacticalGridSchema, defaultTacticalGrid, validateTacticalGrid, safeValidateTacticalGrid, TILE_TYPES };
