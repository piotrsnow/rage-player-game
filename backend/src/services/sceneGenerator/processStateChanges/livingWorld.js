import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { appendEvent } from '../../livingWorld/worldEventLog.js';
import { findOrCreateWorldLocation } from '../../livingWorld/worldStateService.js';
import { markLocationHeardAbout } from '../../livingWorld/userDiscoveryService.js';
import { applyFameFromEvent } from '../../livingWorld/fameService.js';
import { runPostCampaignWorldWriteback } from '../../livingWorld/postCampaignWriteback.js';
import {
  parseLocationMentions,
  parseCampaignComplete,
} from './schemas.js';

const log = childLogger({ module: 'sceneGenerator' });

/**
 * Pure decision function — does the current scene earn global visibility?
 *
 * Gate: premium flags `worldImpact: 'major'` OR any deadly/dungeon flag
 * is set; AT LEAST ONE objective signal must be present:
 *   - named NPC killed in this scene
 *   - a main-type quest completed
 *   - explicit locationLiberated flag
 *   - defeatedDeadlyEncounter flag
 *   - dungeonComplete payload
 *
 * Returns `{ promote: bool, gate: string }`. `gate` identifies which
 * signal fired so the event payload can explain why this is gossip-worthy.
 * Exported so tests can exercise the gate without touching Prisma.
 */
export function shouldPromoteToGlobal(stateChanges, { mainQuestCompleted = false } = {}) {
  if (!stateChanges || typeof stateChanges !== 'object') {
    return { promote: false, gate: null };
  }
  const flaggedMajor = stateChanges.worldImpact === 'major';
  const deadly = stateChanges.defeatedDeadlyEncounter === true;
  const dungeon = stateChanges.dungeonComplete && typeof stateChanges.dungeonComplete === 'object';
  const liberated = stateChanges.locationLiberated === true;
  const namedKill = Array.isArray(stateChanges.npcs)
    && stateChanges.npcs.some((n) => n && n.alive === false && typeof n.name === 'string' && n.name.trim().length > 0);

  // Dungeon completion and deadly victory are self-gating (AI explicitly
  // marks them) — they promote regardless of worldImpact tag.
  if (dungeon) return { promote: true, gate: 'dungeon' };
  if (deadly) return { promote: true, gate: 'deadly' };

  // Everything else requires worldImpact='major' AND an objective signal.
  if (!flaggedMajor) return { promote: false, gate: null };
  if (liberated) return { promote: true, gate: 'liberation' };
  if (mainQuestCompleted) return { promote: true, gate: 'main_quest' };
  if (namedKill) return { promote: true, gate: 'named_kill' };

  return { promote: false, gate: null };
}

/**
 * Round B (Phase 4b) — hearsay policy handler.
 *
 * For each `{locationId, byNpcId}` the LLM emitted, resolve the NPC (by
 * CampaignNPC.npcId OR name), ensure the location sits in the NPC's
 * `resolveNpcKnownLocations` set, and only then mark it as heard-about for
 * the player (canonical → UserWorldKnowledge, non-canonical → Campaign).
 *
 * Violations (LLM made up a location or wrote one outside the NPC's scope)
 * are skipped with a warning — the mention doesn't propagate to fog state.
 *
 * Batched layout — the previous loop hit Prisma 4× per mention (location
 * findUnique + campaignNPC findFirst + worldNPC findUnique/findFirst +
 * edge findMany inside resolveNpcKnownLocations). With 20 mentions clamped
 * by Zod that was 80 round-trips. We now pre-fetch every location, NPC,
 * and edge in 3 queries total, then walk the mentions in memory.
 */
export async function processLocationMentions(campaignId, mentions) {
  const parsed = parseLocationMentions(mentions);
  if (!parsed.ok) {
    log.warn(
      { campaignId, error: parsed.error?.message, count: Array.isArray(mentions) ? mentions.length : 0 },
      'locationMentioned: schema rejected — skipping entire bucket',
    );
    return;
  }
  const validMentions = parsed.data;
  if (validMentions.length === 0) return;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { userId: true },
  }).catch(() => null);
  if (!campaign?.userId) return;

  // Normalize + uniq the mention inputs so batched queries don't pull
  // duplicates and the loop below can do constant-time map lookups.
  const normalized = validMentions
    .map((entry) => ({
      locationId: String(entry.locationId || '').trim(),
      byNpcIdent: String(entry.byNpcId || entry.npcId || entry.byNpc || '').trim(),
    }))
    .filter((m) => m.locationId && m.byNpcIdent);
  if (normalized.length === 0) return;

  const uniqLocationIds = [...new Set(normalized.map((m) => m.locationId))];
  const uniqIdents = [...new Set(normalized.map((m) => m.byNpcIdent))];

  // 1. All referenced locations in one query.
  const locationRows = await prisma.worldLocation.findMany({
    where: { id: { in: uniqLocationIds } },
    select: { id: true },
  }).catch(() => []);
  const existingLocationIds = new Set(locationRows.map((l) => l.id));

  // 2. All candidate CampaignNPCs in one query. `mode: 'insensitive'` isn't
  // available on `in:` with Mongo, so we OR-together per-ident clauses —
  // still a single round-trip.
  const identOrClauses = uniqIdents.flatMap((ident) => [
    { npcId: ident },
    { name: { equals: ident, mode: 'insensitive' } },
  ]);
  const campaignNpcRows = identOrClauses.length > 0
    ? await prisma.campaignNPC.findMany({
      where: { campaignId, OR: identOrClauses },
    }).catch(() => [])
    : [];

  // Map each ident → best CampaignNPC (exact-npcId match wins over name).
  const campaignNpcByIdent = new Map();
  for (const ident of uniqIdents) {
    const exact = campaignNpcRows.find((r) => r.npcId === ident);
    const byName = campaignNpcRows.find(
      (r) => r.name && r.name.toLowerCase() === ident.toLowerCase(),
    );
    if (exact || byName) campaignNpcByIdent.set(ident, exact || byName);
  }

  // 3. WorldNPCs — pull via campaignNpc.worldNpcId OR fallback name match in
  // a single query. Idents that resolved via CampaignNPC take the FK path;
  // the rest fall back to a canonical-name lookup.
  const worldNpcIdsFromCampaign = [...new Set(
    [...campaignNpcByIdent.values()]
      .map((c) => c?.worldNpcId)
      .filter(Boolean),
  )];
  const fallbackNameIdents = uniqIdents.filter((ident) => !campaignNpcByIdent.has(ident));
  const worldNpcOrClauses = [
    ...(worldNpcIdsFromCampaign.length > 0
      ? [{ id: { in: worldNpcIdsFromCampaign } }]
      : []),
    ...fallbackNameIdents.map((ident) => ({ name: { equals: ident, mode: 'insensitive' } })),
  ];
  const worldNpcRows = worldNpcOrClauses.length > 0
    ? await prisma.worldNPC.findMany({ where: { OR: worldNpcOrClauses } }).catch(() => [])
    : [];
  const worldNpcById = new Map(worldNpcRows.map((n) => [n.id, n]));

  // 4. All edges touching any NPC's anchor location, in a single query.
  const anchorLocationIds = new Set();
  for (const ident of uniqIdents) {
    const cNpc = campaignNpcByIdent.get(ident);
    const wNpc = cNpc?.worldNpcId
      ? worldNpcById.get(cNpc.worldNpcId)
      : worldNpcRows.find((n) => n.name && n.name.toLowerCase() === ident.toLowerCase());
    const anchor = cNpc?.lastLocationId || wNpc?.currentLocationId || null;
    if (anchor) anchorLocationIds.add(anchor);
  }
  const edgeRows = anchorLocationIds.size > 0
    ? await prisma.worldLocationEdge.findMany({
      where: {
        OR: [
          { fromLocationId: { in: [...anchorLocationIds] } },
          { toLocationId: { in: [...anchorLocationIds] } },
        ],
      },
      select: { fromLocationId: true, toLocationId: true },
    }).catch(() => [])
    : [];
  const adjacencyByAnchor = new Map();
  for (const anchor of anchorLocationIds) adjacencyByAnchor.set(anchor, new Set([anchor]));
  for (const e of edgeRows) {
    const fromSet = adjacencyByAnchor.get(e.fromLocationId);
    const toSet = adjacencyByAnchor.get(e.toLocationId);
    if (fromSet) { fromSet.add(e.toLocationId); }
    if (toSet) { toSet.add(e.fromLocationId); }
  }

  // Resolve each ident → Set<knownLocationId>. Edge adjacency + explicit
  // knownLocationIds on the WorldNPC (seed + admin authored).
  const knownByIdent = new Map();
  for (const ident of uniqIdents) {
    const cNpc = campaignNpcByIdent.get(ident);
    const wNpc = cNpc?.worldNpcId
      ? worldNpcById.get(cNpc.worldNpcId)
      : worldNpcRows.find((n) => n.name && n.name.toLowerCase() === ident.toLowerCase());
    if (!cNpc && !wNpc) continue;

    const anchor = cNpc?.lastLocationId || wNpc?.currentLocationId || null;
    const known = new Set(anchor ? adjacencyByAnchor.get(anchor) || [anchor] : []);
    if (wNpc?.knownLocationIds) {
      try {
        const extra = JSON.parse(wNpc.knownLocationIds);
        if (Array.isArray(extra)) for (const id of extra) if (id) known.add(id);
      } catch { /* ignore malformed authored JSON */ }
    }
    knownByIdent.set(ident, known);
  }

  // Walk the original mentions and fire markLocationHeardAbout only for
  // policy-passing pairs. Duplicates in the input collapse naturally via
  // the knownByIdent / existingLocationIds sets.
  for (const { locationId, byNpcIdent } of normalized) {
    try {
      if (!existingLocationIds.has(locationId)) {
        log.warn({ campaignId, locationId, byNpcIdent }, 'locationMentioned: location not found — skipping');
        continue;
      }
      const known = knownByIdent.get(byNpcIdent);
      if (!known) {
        log.warn({ campaignId, byNpcIdent }, 'locationMentioned: NPC not found — skipping');
        continue;
      }
      if (!known.has(locationId)) {
        log.warn(
          { campaignId, locationId, byNpcIdent, knownCount: known.size },
          'locationMentioned: location outside NPC knowledge scope — policy violation, skipping',
        );
        continue;
      }
      await markLocationHeardAbout({ userId: campaign.userId, locationId, campaignId });
    } catch (err) {
      log.warn({ err: err?.message, campaignId, locationId, byNpcIdent }, 'locationMentioned: handler failed');
    }
  }
}

/**
 * Write a GLOBAL WorldEvent when the current scene clears the gate.
 * Caller resolves `mainQuestCompleted` (requires a Prisma query against
 * completedQuests). Payload is meta-only.
 */
export async function processWorldImpactEvent({
  campaignId,
  stateChanges,
  ownerUserId,
  sceneGameTime,
  mainQuestCompleted,
  characterIds = [],
}) {
  const { promote, gate } = shouldPromoteToGlobal(stateChanges, { mainQuestCompleted });
  if (!promote) return;

  const currentLocationName = stateChanges.currentLocation || null;
  let worldLocationId = null;
  if (currentLocationName) {
    try {
      const loc = await findOrCreateWorldLocation(currentLocationName);
      worldLocationId = loc?.id || null;
    } catch {
      // Non-fatal — event still attaches via campaignId
    }
  }

  const eventType = gate === 'dungeon' ? 'dungeon_cleared'
    : gate === 'deadly' ? 'deadly_victory'
    : 'major_deed';

  // worldImpactReason is caller-provided raw LLM text. Cap at 300 chars
  // defensively — the FE Zod schema enforces this too, but BE shouldn't
  // trust the caller.
  const reasonRaw = typeof stateChanges.worldImpactReason === 'string'
    ? stateChanges.worldImpactReason.trim().slice(0, 300)
    : null;

  await appendEvent({
    worldLocationId,
    campaignId,
    userId: ownerUserId,
    eventType,
    payload: {
      gate,
      reason: reasonRaw || null,
      locationName: currentLocationName,
      dungeonName: stateChanges.dungeonComplete?.name || null,
      dungeonSummary: stateChanges.dungeonComplete?.summary || null,
    },
    visibility: 'global',
    gameTime: sceneGameTime,
  });
  log.info({ campaignId, gate, eventType, locationName: currentLocationName }, 'worldImpact event promoted to global');

  await applyFameFromEvent(characterIds, {
    eventType,
    visibility: 'global',
    payload: { gate },
  });
}

/**
 * Write a GLOBAL WorldEvent when the player resolves a campaign's main
 * conflict. Visible cross-campaign via `forLocation` (worldEventLog reads
 * `visibility='global'` without campaignId filter). Payload is meta-only
 * — title, summary, achievements, locationName — so no character-private
 * data leaks into other players' contexts.
 */
export async function processCampaignComplete({
  campaignId,
  data,
  ownerUserId,
  sceneGameTime,
  currentLocationName,
}) {
  const parsed = parseCampaignComplete(data);
  if (!parsed.ok) {
    log.warn(
      { campaignId, error: parsed.error?.message },
      'campaignComplete: schema rejected — skipping bucket',
    );
    return;
  }
  const safe = parsed.data;

  let worldLocationId = null;
  if (currentLocationName) {
    try {
      const loc = await findOrCreateWorldLocation(currentLocationName);
      worldLocationId = loc?.id || null;
    } catch {
      // Non-fatal — event can still attach via campaignId
    }
  }
  await appendEvent({
    worldLocationId,
    campaignId,
    userId: ownerUserId,
    eventType: 'campaign_complete',
    payload: {
      title: safe.title,
      summary: safe.summary,
      majorAchievements: safe.majorAchievements,
      locationName: currentLocationName || null,
    },
    visibility: 'global',
    gameTime: sceneGameTime,
  });
  log.info({ campaignId, locationName: currentLocationName, title: safe.title }, 'campaign_complete global event written');

  // Auto-trigger post-campaign writeback — surfaces NPC/location promotion
  // candidates + extracts world facts for admin review. Fire-and-forget: the
  // pipeline runs LLM-heavy extraction (~30s+) and must not block post-scene
  // processing. Idempotent — safe to re-run manually from the admin panel if
  // this one fails.
  runPostCampaignWorldWriteback(campaignId).catch((err) => {
    log.warn({ err: err?.message, campaignId }, 'auto-triggered post-campaign writeback failed (non-fatal)');
  });
}
