// Living World Phase 6 — admin observability routes (scoped).
//
// Scoped Phase 6: read-only endpoints for listing/filtering WorldNPCs,
// locations, events, + reputation. Basic moderation: release-lock, force-
// unpause, manual tick (Phase 5). All gated on `User.isAdmin`.
//
// DEFERRED to knowledge/ideas/living-world-admin-extras.md:
//   - 2D map graph view
//   - Bulk moderation (mass-release, purge stale events)
//   - Audit trail UI (WorldNpcAttribution browsing)
//   - Cost/analytics dashboard

import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { leaveParty } from '../services/livingWorld/companionService.js';
import { runNpcTick } from '../services/livingWorld/npcAgentLoop.js';
import { runTickBatch } from '../services/livingWorld/npcTickDispatcher.js';

const log = childLogger({ module: 'adminLivingWorld' });

export async function adminLivingWorldRoutes(fastify) {
  const guards = { preHandler: [fastify.authenticate, fastify.requireAdmin] };

  // ── NPCs ───────────────────────────────────────────────────────────
  fastify.get('/npcs', guards, async (request) => {
    const { alive, companion, locked, locationId, limit = 100, skip = 0 } = request.query || {};
    const where = {};
    if (alive === 'true') where.alive = true;
    if (alive === 'false') where.alive = false;
    if (companion === 'true') where.companionOfCampaignId = { not: null };
    if (companion === 'false') where.companionOfCampaignId = null;
    if (locked === 'true') where.lockedByCampaignId = { not: null };
    if (locked === 'false') where.lockedByCampaignId = null;
    if (locationId) where.currentLocationId = locationId;

    const [total, rows] = await Promise.all([
      prisma.worldNPC.count({ where }),
      prisma.worldNPC.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(Number(limit) || 100, 500),
        skip: Math.max(Number(skip) || 0, 0),
        select: {
          id: true,
          canonicalId: true,
          name: true,
          role: true,
          alignment: true,
          alive: true,
          currentLocationId: true,
          pausedAt: true,
          companionOfCampaignId: true,
          lockedByCampaignId: true,
          activeGoal: true,
          lastTickAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return { total, rows };
  });

  fastify.get('/npcs/:id', guards, async (request, reply) => {
    const { id } = request.params;
    const npc = await prisma.worldNPC.findUnique({ where: { id } });
    if (!npc) return reply.code(404).send({ error: 'Not found' });
    const [events, attributions] = await Promise.all([
      prisma.worldEvent.findMany({
        where: { worldNpcId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.worldNpcAttribution.findMany({
        where: { worldNpcId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      npc,
      events,
      attributions,
      goalProgress: npc.goalProgress ? safeJson(npc.goalProgress) : null,
      dialogHistory: safeJson(npc.dialogHistory),
      knowledgeBase: safeJson(npc.knowledgeBase),
      pauseSnapshot: npc.pauseSnapshot ? safeJson(npc.pauseSnapshot) : null,
      lockedSnapshot: npc.lockedSnapshot ? safeJson(npc.lockedSnapshot) : null,
    };
  });

  // ── Locations ──────────────────────────────────────────────────────
  fastify.get('/locations', guards, async (request) => {
    const { region, limit = 200 } = request.query || {};
    const where = {};
    if (region) where.region = region;
    const rows = await prisma.worldLocation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Number(limit) || 200, 1000),
      select: {
        id: true,
        canonicalName: true,
        region: true,
        category: true,
        description: true,
        aliases: true,
        createdAt: true,
      },
    });
    return { rows };
  });

  fastify.get('/locations/:id', guards, async (request, reply) => {
    const { id } = request.params;
    const location = await prisma.worldLocation.findUnique({ where: { id } });
    if (!location) return reply.code(404).send({ error: 'Not found' });
    const [npcs, events] = await Promise.all([
      prisma.worldNPC.findMany({
        where: { currentLocationId: id, alive: true },
        select: { id: true, name: true, role: true, companionOfCampaignId: true, pausedAt: true },
      }),
      prisma.worldEvent.findMany({
        where: { worldLocationId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { location, npcs, events, aliases: safeJson(location.aliases) };
  });

  // ── Events timeline ────────────────────────────────────────────────
  fastify.get('/events', guards, async (request) => {
    const { eventType, campaignId, npcId, locationId, visibility, limit = 100 } = request.query || {};
    const where = {};
    if (eventType) where.eventType = eventType;
    if (campaignId) where.campaignId = campaignId;
    if (npcId) where.worldNpcId = npcId;
    if (locationId) where.worldLocationId = locationId;
    if (visibility) where.visibility = visibility;

    const rows = await prisma.worldEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 100, 500),
    });
    return { rows };
  });

  // ── Reputation ─────────────────────────────────────────────────────
  fastify.get('/reputation', guards, async (request) => {
    const { characterId, vendetta, limit = 100 } = request.query || {};
    const where = {};
    if (characterId) where.characterId = characterId;
    if (vendetta === 'true') where.vendettaActive = true;
    const rows = await prisma.worldReputation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Number(limit) || 100, 500),
    });
    return { rows };
  });

  // ── Moderation: release lock ───────────────────────────────────────
  // Flushes the deferred outbox from the locking campaign (chronological
  // replay → canonical state), then nulls lock fields. Use when a companion
  // is stuck (abandoned campaign, zombified lock, etc.).
  fastify.post('/npcs/:id/release-lock', guards, async (request, reply) => {
    const { id } = request.params;
    try {
      const npc = await prisma.worldNPC.findUnique({
        where: { id },
        select: { lockedByCampaignId: true },
      });
      if (!npc?.lockedByCampaignId) {
        return reply.code(400).send({ error: 'NPC is not locked' });
      }
      const out = await leaveParty({
        worldNpcId: id,
        campaignId: npc.lockedByCampaignId,
        reason: 'admin_override',
      });
      return { ok: true, ...out };
    } catch (err) {
      log.error({ err, npcId: id }, 'release-lock failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Moderation: force unpause (re-activate offline NPC) ────────────
  fastify.post('/npcs/:id/force-unpause', guards, async (request, reply) => {
    const { id } = request.params;
    try {
      const updated = await prisma.worldNPC.update({
        where: { id },
        data: { pausedAt: null, pauseSnapshot: null },
      });
      return { ok: true, npc: updated };
    } catch (err) {
      log.error({ err, npcId: id }, 'force-unpause failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Phase 5: manual single-NPC tick ────────────────────────────────
  // Admin click → force=true so paused / too_soon don't silently skip.
  // Integrity guards (dead, companion, locked, no_goal) still enforce.
  fastify.post('/npcs/:id/tick', guards, async (request) => {
    const { id } = request.params;
    const force = request.body?.force !== false; // default ON for admin
    const result = await runNpcTick(id, { timeoutMs: 8000, force });
    log.info({ npcId: id, force, result }, 'Admin manual tick');
    return result;
  });

  // ── Phase 5: manual batch tick ─────────────────────────────────────
  fastify.post('/tick-batch', guards, async (request) => {
    const { limit = 10 } = request.body || {};
    const out = await runTickBatch({ limit: Math.min(Number(limit) || 10, 50) });
    return out;
  });

  // ── Phase 7: world graph for map view ──────────────────────────────
  // Returns nodes (top-level locations) + edges (overworld). Dungeons are
  // collapsed: the dungeon node itself is surfaced but child rooms + corridor
  // edges are aggregated as a `roomCount` on the node (not rendered).
  fastify.get('/graph', guards, async () => {
    const [locations, edges] = await Promise.all([
      prisma.worldLocation.findMany({
        where: { parentLocationId: null },
        select: {
          id: true,
          canonicalName: true,
          locationType: true,
          regionX: true,
          regionY: true,
          region: true,
          positionConfidence: true,
          maxKeyNpcs: true,
          maxSubLocations: true,
        },
      }),
      prisma.worldLocationEdge.findMany({
        where: { terrainType: { not: 'dungeon_corridor' } },
        select: {
          id: true,
          fromLocationId: true,
          toLocationId: true,
          distance: true,
          difficulty: true,
          terrainType: true,
          direction: true,
          gated: true,
          discoveredByCampaigns: true,
        },
      }),
    ]);

    const locationIds = new Set(locations.map((l) => l.id));
    const overworldEdges = edges.filter((e) =>
      locationIds.has(e.fromLocationId) && locationIds.has(e.toLocationId),
    );

    // Dungeons — count seeded rooms so the admin can tell "seeded vs not".
    const dungeonIds = locations
      .filter((l) => l.locationType === 'dungeon')
      .map((l) => l.id);
    let roomCounts = new Map();
    if (dungeonIds.length > 0) {
      const roomsGrouped = await prisma.worldLocation.groupBy({
        by: ['parentLocationId'],
        where: { parentLocationId: { in: dungeonIds }, locationType: 'dungeon_room' },
        _count: true,
      });
      roomCounts = new Map(
        roomsGrouped.map((r) => [r.parentLocationId, r._count]),
      );
    }

    // Children counts for settlements (informational: how filled is each parent)
    const topLevelIds = locations.map((l) => l.id);
    let childCounts = new Map();
    if (topLevelIds.length > 0) {
      const grouped = await prisma.worldLocation.groupBy({
        by: ['parentLocationId'],
        where: { parentLocationId: { in: topLevelIds }, locationType: { not: 'dungeon_room' } },
        _count: true,
      });
      childCounts = new Map(grouped.map((r) => [r.parentLocationId, r._count]));
    }

    const nodes = locations.map((l) => ({
      id: l.id,
      name: l.canonicalName,
      locationType: l.locationType || 'generic',
      region: l.region || null,
      x: l.regionX || 0,
      y: l.regionY || 0,
      positionConfidence: l.positionConfidence ?? 0.5,
      maxKeyNpcs: l.maxKeyNpcs || 0,
      maxSubLocations: l.maxSubLocations || 0,
      childCount: childCounts.get(l.id) || 0,
      roomCount: roomCounts.get(l.id) || 0,
    }));

    return {
      nodes,
      edges: overworldEdges.map((e) => {
        let campaignCount = 0;
        try {
          campaignCount = JSON.parse(e.discoveredByCampaigns || '[]').length;
        } catch { /* ignore */ }
        return {
          id: e.id,
          from: e.fromLocationId,
          to: e.toLocationId,
          distance: e.distance,
          difficulty: e.difficulty,
          terrainType: e.terrainType,
          direction: e.direction || null,
          gated: !!e.gated,
          discoveredCampaignCount: campaignCount,
        };
      }),
    };
  });

  // ── World Lore (Round A — Phase 0a) ───────────────────────────────
  // Hand-curated canonical world lore, editable from the admin panel.
  // Injected into scene-gen prompts via `buildWorldLorePreamble()`.
  // Scene-gen caches by `max(updatedAt)` so edits propagate on next scene.

  fastify.get('/lore', guards, async () => {
    const sections = await prisma.worldLoreSection.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return { sections };
  });

  fastify.put('/lore/:slug', guards, async (request, reply) => {
    const { slug } = request.params;
    if (!slug || !/^[a-z0-9_-]+$/i.test(slug)) {
      return reply.code(400).send({ error: 'slug must match [a-z0-9_-]+' });
    }
    const body = request.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const order = Number.isFinite(body.order) ? Math.trunc(body.order) : null;
    if (!title) return reply.code(400).send({ error: 'title required' });

    const updatedBy = request.user?.email || request.user?.id || null;
    const existing = await prisma.worldLoreSection.findUnique({ where: { slug } });
    const nextOrder = order !== null
      ? order
      : (existing?.order ?? await nextLoreOrder());
    const section = await prisma.worldLoreSection.upsert({
      where: { slug },
      update: { title, content, order: nextOrder, updatedBy },
      create: { slug, title, content, order: nextOrder, updatedBy },
    });
    return { section };
  });

  fastify.delete('/lore/:slug', guards, async (request, reply) => {
    const { slug } = request.params;
    const deleted = await prisma.worldLoreSection.deleteMany({ where: { slug } });
    if (deleted.count === 0) return reply.code(404).send({ error: 'Not found' });
    return { deleted: deleted.count };
  });

  // Bulk reorder. Body: { order: [{slug, order}, ...] }. Missing slugs are
  // ignored; duplicate order values are accepted (rendering does tie-break
  // by createdAt). Runs in a sequential loop rather than a transaction
  // because MongoDB transactions require a replicaSet — the upstream Atlas
  // connection does, but we keep it loop-based for local dev parity.
  fastify.post('/lore/reorder', guards, async (request, reply) => {
    const body = request.body || {};
    const list = Array.isArray(body.order) ? body.order : null;
    if (!list) return reply.code(400).send({ error: 'order[] required' });
    let updated = 0;
    for (const entry of list) {
      if (!entry?.slug || !Number.isFinite(entry.order)) continue;
      const res = await prisma.worldLoreSection.updateMany({
        where: { slug: entry.slug },
        data: { order: Math.trunc(entry.order) },
      });
      updated += res.count;
    }
    return { updated };
  });
}

async function nextLoreOrder() {
  try {
    const last = await prisma.worldLoreSection.findFirst({
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? -1) + 1;
  } catch {
    return 0;
  }
}

function safeJson(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return null; }
}
