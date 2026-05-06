import { z } from 'zod';

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

// ── Zod schemas for graph extraction output ──────────────────────────

export const NewNodeEntrySchema = z.object({
  name: z.string().min(1).max(120),
  type: z.string().min(1).max(40),
  scale: z.number().int().min(0).max(7).optional().default(5),
  parentName: z.string().max(120).nullable().optional(),
  description: z.string().max(500).optional().default(''),
  tags: z.array(z.string().max(40)).max(10).optional().default([]),
  reason: z.string().max(200).optional().default(''),
}).passthrough();

export const NewEdgeEntrySchema = z.object({
  fromName: z.string().min(1).max(120),
  toName: z.string().min(1).max(120),
  edgeType: z.string().min(1).max(40),
  category: z.string().min(1).max(20),
  bidirectional: z.boolean().optional().default(true),
  metadata: z.record(z.unknown()).optional().default({}),
  reason: z.string().max(200).optional().default(''),
}).passthrough();

export const UpdatedEdgeEntrySchema = z.object({
  fromName: z.string().min(1).max(120),
  toName: z.string().min(1).max(120),
  edgeType: z.string().min(1).max(40),
  changes: z.record(z.unknown()),
  reason: z.string().max(200).optional().default(''),
}).passthrough();

export const NpcMoveSchema = z.object({
  npcName: z.string().min(1).max(120),
  toLocationName: z.string().min(1).max(120),
  reason: z.string().max(200).optional().default(''),
}).passthrough();

export const DiscoveryChangeSchema = z.object({
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
