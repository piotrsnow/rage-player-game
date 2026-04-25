import { prisma } from '../../../lib/prisma.js';
import { resolveNpcKnownLocations } from '../../livingWorld/campaignSandbox.js';

/**
 * Round B (Phase 4b) — hearsay knowledge surface.
 *
 * For each key NPC at the location, resolve the set of locations they're
 * authorized to reveal in dialog: own location + 1-hop edge neighbours +
 * explicit WorldNpcKnownLocation grants. Scene prompt renders this as
 * [NPC_KNOWLEDGE] blocks so premium respects scope ("ask the commoner about
 * the far dungeon → NPC says I don't know"). Post-scene policy in
 * `processStateChanges.processLocationMentions` rejects `locationMentioned`
 * entries that fall outside this set (prevents LLM from leaking hearsay
 * past intent).
 *
 * Batched:
 *   - ONE `findMany` collects all WorldNPC fallbacks for the ambient roster
 *     (previously: N-per-NPC findUnique in a loop = quadratic DB roundtrips)
 *   - ONE `findMany` resolves the union of known-location ids (previously:
 *     per-NPC findMany; still capped per-NPC at 12 in the render)
 */
export async function buildHearsayByNpc({ ambientNpcs, ambientNpcsWithGoals }) {
  if (!Array.isArray(ambientNpcs) || ambientNpcs.length === 0) return [];

  const keyNpcEntries = [];
  for (let i = 0; i < ambientNpcs.length; i += 1) {
    const nEnriched = ambientNpcs[i];
    const goalEntry = ambientNpcsWithGoals[i];
    if (!nEnriched || !goalEntry) continue;
    if (nEnriched.keyNpc === false) continue;
    keyNpcEntries.push({ nEnriched, goalEntry });
  }
  if (keyNpcEntries.length === 0) return [];

  // Batch 1 — collect all WorldNPC fallbacks in one roundtrip.
  const worldNpcIds = [...new Set(
    keyNpcEntries
      .map((e) => e.nEnriched.worldNpcId)
      .filter(Boolean),
  )];
  const worldNpcById = new Map();
  if (worldNpcIds.length > 0) {
    const rows = await prisma.worldNPC.findMany({
      where: { id: { in: worldNpcIds } },
    }).catch(() => []);
    for (const row of rows) worldNpcById.set(row.id, row);
  }

  // First pass — per NPC resolve the known-location id set. This still
  // calls resolveNpcKnownLocations per NPC (it has its own logic for
  // 1-hop edges + explicit grants) but no longer hits the DB N times
  // for the WorldNPC fallback.
  const perNpc = [];
  for (const { nEnriched, goalEntry } of keyNpcEntries) {
    const worldFallback = nEnriched.worldNpcId
      ? worldNpcById.get(nEnriched.worldNpcId) || null
      : null;
    const known = await resolveNpcKnownLocations({
      campaignNpc: nEnriched,
      worldNpc: worldFallback,
    });
    if (known.size === 0) continue;
    // Cap at 12 per NPC so the prompt block doesn't bloat — 1-hop neighbours
    // plus a handful of explicit grants shouldn't exceed that for named NPCs.
    const ids = [...known].slice(0, 12);
    perNpc.push({ goalEntry, ids });
  }
  if (perNpc.length === 0) return [];

  // Batch 2 — one findMany for the union of location ids; render per NPC
  // via a map lookup.
  const allLocIds = [...new Set(perNpc.flatMap((e) => e.ids))];
  const locRows = allLocIds.length > 0
    ? await prisma.worldLocation.findMany({
        where: { id: { in: allLocIds } },
        select: { id: true, canonicalName: true, locationType: true, dangerLevel: true },
      }).catch(() => [])
    : [];
  const locById = new Map(locRows.map((r) => [r.id, r]));

  const result = [];
  for (const { goalEntry, ids } of perNpc) {
    const locations = ids
      .map((id) => locById.get(id))
      .filter(Boolean)
      .map((r) => ({
        id: r.id,
        name: r.canonicalName,
        type: r.locationType,
        danger: r.dangerLevel || null,
      }));
    if (locations.length === 0) continue;
    result.push({ npcName: goalEntry.name, locations });
  }
  return result;
}
