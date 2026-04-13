/**
 * Short random ID generators shared by frontend, backend, and shared modules.
 * Not cryptographically random — use only for client-side/session IDs where
 * collision tolerance is ~1e-6 for the given length.
 */

export function shortId(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len);
}

/**
 * Build a prefixed time-salted short ID, e.g. "scene_1712345678901_ab3d9f".
 * This is the standard shape used across game state (campaigns, scenes,
 * quests, items, codex entries, rewards, etc.).
 */
export function prefixedId(prefix, len = 6) {
  return `${prefix}_${Date.now()}_${shortId(len)}`;
}
