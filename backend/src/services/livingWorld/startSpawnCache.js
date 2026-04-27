// In-memory bridge between two requests in the campaign-creation flow:
//   1. SSE `POST /v1/ai/generate-campaign` → pickStartSpawn picks a canonical
//      settlement + sublocation + NPC and binds the AI prompt.
//   2. `POST /v1/campaigns` → needs the same trio to override the AI's
//      free-form output toward canonical (currentLocation, quest giver link).
//
// Why not round-trip via FE: the FE postProcess strips unknown fields so the
// reference would silently drop. Why not query the picker again on POST: it
// would pick a different random NPC than the one the AI was bound to, leading
// to narrative/data mismatch. Why not Redis: single-process Cloud Run, no
// shared infra needed; cache is best-effort, miss → fall through to default
// CampaignLocation seeding (no crash).
//
// TTL 10 min covers the typical premium scene-gen latency (~30-60s) with a
// generous safety buffer. Single-use: consume() removes the entry so a stale
// entry can't influence a later, unrelated POST.

const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // userId → { startSpawn, expiresAt }

export function rememberStartSpawn(userId, startSpawn) {
  if (!userId || !startSpawn) return;
  cache.set(userId, { startSpawn, expiresAt: Date.now() + TTL_MS });
}

export function consumeStartSpawn(userId) {
  if (!userId) return null;
  const entry = cache.get(userId);
  if (!entry) return null;
  cache.delete(userId);
  if (entry.expiresAt < Date.now()) return null;
  return entry.startSpawn;
}

// Read without removing — used by `applyInitialLocations` so it can resolve
// `relativeTo: 'questGiver'` anchors before the canonical override branch
// calls `consumeStartSpawn` and clears the entry. Returns null on miss or
// expiry (and clears the expired row, same as consume).
export function peekStartSpawn(userId) {
  if (!userId) return null;
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.startSpawn;
}

// Late-attach the AI-emitted `initialLocations` array to the cached
// startSpawn entry. The campaign-gen stream parses these AFTER the picker
// runs (and after the FE has already received the start_spawn SSE event),
// so we update the existing entry in place rather than re-issuing the
// initial `rememberStartSpawn` write. No-op when the entry is missing or
// expired — the next POST /v1/campaigns will fall through to the
// no-initialLocations path.
export function attachInitialLocations(userId, initialLocations) {
  if (!userId || !Array.isArray(initialLocations)) return;
  const entry = cache.get(userId);
  if (!entry) return;
  if (entry.expiresAt < Date.now()) {
    cache.delete(userId);
    return;
  }
  entry.startSpawn = { ...entry.startSpawn, initialLocations };
}
