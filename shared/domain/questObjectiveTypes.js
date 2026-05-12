/**
 * Objective type taxonomy for quest objectives (visual badge + prompt hint).
 * Shared between frontend (UI badges) and backend (Zod validation + AI prompt).
 */

export const OBJECTIVE_TYPES = [
  'kill',
  'escort',
  'fetch',
  'deliver',
  'craft',
  'explore',
  'interact',
  'survive',
  'gather',
];

export const OBJECTIVE_TYPE_ENUM = /** @type {const} */ (OBJECTIVE_TYPES);
