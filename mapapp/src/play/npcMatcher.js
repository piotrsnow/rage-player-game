// Match MapActors assigned to a map against the map's NPC-place markers
// by tags, then pick spawn positions. Pure function — easy to unit-test.
//
// Inputs:
//   - objects:  MapDoc.objects[] (flattened) — we filter by `kind`.
//   - mapNpcs:  MapDoc.meta.npcs ([{ actorId, tagsRequired? }]).
//   - actors:   MapActor[] (fetched from /v1/map-studio/actors).
//   - rng:      () => number, defaults to Math.random.
//
// Per-place data (edited in NpcPlaceInspector):
//   - tags:        string[] — only actors whose tags intersect may spawn.
//   - spawnChance: 0..1 — probability that *each* extra slot above minCount
//                  actually spawns. minCount slots are always filled.
//   - minCount:    integer — guaranteed spawn count (default 0).
//   - maxCount:    integer — upper bound on spawns at this place (default 1).
//
// For every place we resolve the pool of mapNpcs whose actor matches the
// place, then draw spawns from that pool (with replacement) until `count`
// slots are filled. If the pool is empty the place is skipped.
//
// Output: [{ actor, x, y, dir }].

export function matchActorsToPlaces({
  objects, mapNpcs, actors, rng = Math.random,
}) {
  if (!Array.isArray(objects) || !Array.isArray(mapNpcs) || !Array.isArray(actors)) {
    return [];
  }
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  const places = objects.filter((o) => o.kind === 'npc_place');
  if (places.length === 0) return [];

  const spawned = [];

  for (const place of places) {
    const data = place.data || {};
    const placeTags = Array.isArray(data.tags) ? data.tags : [];
    const placeTagSet = new Set(placeTags);

    const pool = [];
    for (const npc of mapNpcs) {
      const actor = actorMap.get(npc.actorId);
      if (!actor) continue;
      const actorTags = new Set(actor.tags || []);
      const required = new Set(npc.tagsRequired || []);

      // Constraint 1: extra tagsRequired on the assignment must match the place.
      if (required.size > 0) {
        let anyMatch = false;
        for (const t of required) if (placeTagSet.has(t)) { anyMatch = true; break; }
        if (!anyMatch) continue;
      }
      // Constraint 2: place tags ∩ actor tags (or place tags empty).
      if (placeTags.length === 0) {
        pool.push(actor);
        continue;
      }
      let match = false;
      for (const t of placeTags) if (actorTags.has(t)) { match = true; break; }
      if (match) pool.push(actor);
    }
    if (pool.length === 0) continue;

    const minCount = clampInt(data.minCount, 0, 0);
    const maxCountRaw = clampInt(data.maxCount, 1, 0);
    const maxCount = Math.max(minCount, maxCountRaw);
    const spawnChance = Number.isFinite(data.spawnChance) ? data.spawnChance : 1;

    let count = minCount;
    for (let slot = minCount; slot < maxCount; slot++) {
      if (rng() < spawnChance) count++;
    }
    if (count === 0) continue;

    for (let i = 0; i < count; i++) {
      const actor = pool[Math.floor(rng() * pool.length)];
      spawned.push({ actor, x: place.x, y: place.y, dir: 'down' });
    }
  }

  return spawned;
}

function clampInt(value, fallback, min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

export function findPlayerStart(objects) {
  const p = (objects || []).find((o) => o.kind === 'player_start');
  return p ? { x: p.x, y: p.y } : null;
}
