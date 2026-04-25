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
import { runPostCampaignWorldWriteback } from '../services/livingWorld/postCampaignWriteback.js';
import { applyApprovedPendingChange } from '../services/livingWorld/postCampaignWorldChanges.js';
import { promoteCampaignNpcToWorld } from '../services/livingWorld/postCampaignPromotion.js';
import { promoteWorldLocationToCanonical } from '../services/livingWorld/postCampaignLocationPromotion.js';

const log = childLogger({ module: 'adminLivingWorld' });

// Fastify coerces querystring values into the declared JSON-Schema types, so
// declaring every filter as `type: 'string'` (or `integer`/`boolean`) rejects
// bracket-syntax attempts like `?locationId[$ne]=null` before they reach
// Prisma. Node's default querystring parser already flattens brackets into
// the key, but keeping the schemas tight is belt-and-braces.
const BOOL_STRING = { type: 'string', enum: ['true', 'false'] };
const ID_STRING = { type: 'string', maxLength: 128 };
const SHORT_STRING = { type: 'string', maxLength: 64 };

export async function adminLivingWorldRoutes(fastify) {
  const guards = { preHandler: [fastify.authenticate, fastify.requireAdmin] };
  const guard = (extras = {}) => ({ ...guards, ...extras });

  // ── NPCs ───────────────────────────────────────────────────────────
  fastify.get('/npcs', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          alive: BOOL_STRING,
          companion: BOOL_STRING,
          locked: BOOL_STRING,
          locationId: ID_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          skip: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }), async (request) => {
    const { alive, companion, locked, locationId, limit, skip } = request.query;
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
        take: limit,
        skip,
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

  fastify.get('/npcs/:id', guard(), async (request, reply) => {
    const { id } = request.params;
    const npc = await prisma.worldNPC.findUnique({ where: { id } });
    if (!npc) return reply.code(404).send({ error: 'Not found' });
    const [events, attributions, knowledgeBase, dialogHistory] = await Promise.all([
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
      prisma.worldNpcKnowledge.findMany({
        where: { npcId: id },
        orderBy: { addedAt: 'desc' },
        take: 50,
      }),
      prisma.worldNpcDialogTurn.findMany({
        where: { npcId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      npc,
      events,
      attributions,
      goalProgress: npc.goalProgress ? safeJson(npc.goalProgress) : null,
      dialogHistory,
      knowledgeBase,
      pauseSnapshot: npc.pauseSnapshot ? safeJson(npc.pauseSnapshot) : null,
      lockedSnapshot: npc.lockedSnapshot ? safeJson(npc.lockedSnapshot) : null,
    };
  });

  // ── Locations ──────────────────────────────────────────────────────
  fastify.get('/locations', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          region: SHORT_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 200 },
        },
      },
    },
  }), async (request) => {
    const { region, limit } = request.query;
    const where = {};
    if (region) where.region = region;
    const rows = await prisma.worldLocation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        canonicalName: true,
        region: true,
        category: true,
        description: true,
        aliases: true,
        createdAt: true,
        isCanonical: true,
        createdByCampaignId: true,
      },
    });
    return { rows };
  });

  fastify.get('/locations/:id', guard(), async (request, reply) => {
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
  fastify.get('/events', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          eventType: SHORT_STRING,
          campaignId: ID_STRING,
          npcId: ID_STRING,
          locationId: ID_STRING,
          visibility: SHORT_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        },
      },
    },
  }), async (request) => {
    const { eventType, campaignId, npcId, locationId, visibility, limit } = request.query;
    const where = {};
    if (eventType) where.eventType = eventType;
    if (campaignId) where.campaignId = campaignId;
    if (npcId) where.worldNpcId = npcId;
    if (locationId) where.worldLocationId = locationId;
    if (visibility) where.visibility = visibility;

    const rows = await prisma.worldEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { rows };
  });

  // ── Reputation ─────────────────────────────────────────────────────
  fastify.get('/reputation', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          characterId: ID_STRING,
          vendetta: BOOL_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        },
      },
    },
  }), async (request) => {
    const { characterId, vendetta, limit } = request.query;
    const where = {};
    if (characterId) where.characterId = characterId;
    if (vendetta === 'true') where.vendettaActive = true;
    const rows = await prisma.worldReputation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return { rows };
  });

  // ── Moderation: release lock ───────────────────────────────────────
  // Flushes the deferred outbox from the locking campaign (chronological
  // replay → canonical state), then nulls lock fields. Use when a companion
  // is stuck (abandoned campaign, zombified lock, etc.).
  fastify.post('/npcs/:id/release-lock', guard(), async (request, reply) => {
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
  fastify.post('/npcs/:id/force-unpause', guard(), async (request, reply) => {
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
  // Each tick fires a nano LLM call → tier rate-limit below the
  // 60 req/min admin default.
  fastify.post('/npcs/:id/tick', guard({
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { force: { type: 'boolean' } },
      },
    },
  }), async (request) => {
    const { id } = request.params;
    const force = request.body?.force !== false; // default ON for admin
    const result = await runNpcTick(id, { timeoutMs: 8000, force });
    log.info({ npcId: id, force, result }, 'Admin manual tick');
    return result;
  });

  // ── Phase 5: manual batch tick ─────────────────────────────────────
  // A single request can fan out to `limit` nano calls — even stricter tier.
  fastify.post('/tick-batch', guard({
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
      },
    },
  }), async (request) => {
    const limit = request.body?.limit ?? 10;
    const out = await runTickBatch({ limit });
    return out;
  });

  // ── Phase 7: world graph for map view ──────────────────────────────
  // Returns nodes (top-level locations) + edges (overworld). Dungeons are
  // collapsed: the dungeon node itself is surfaced but child rooms + corridor
  // edges are aggregated as a `roomCount` on the node (not rendered).
  fastify.get('/graph', guard(), async () => {
    const [locations, edges] = await Promise.all([
      prisma.worldLocation.findMany({
        where: { parentLocationId: null },
        select: {
          id: true,
          canonicalName: true,
          displayName: true,
          locationType: true,
          regionX: true,
          regionY: true,
          region: true,
          positionConfidence: true,
          maxKeyNpcs: true,
          maxSubLocations: true,
          dangerLevel: true,
          isCanonical: true,
          createdByCampaignId: true,
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
      displayName: l.displayName || l.canonicalName,
      locationType: l.locationType || 'generic',
      region: l.region || null,
      x: l.regionX || 0,
      y: l.regionY || 0,
      positionConfidence: l.positionConfidence ?? 0.5,
      maxKeyNpcs: l.maxKeyNpcs || 0,
      maxSubLocations: l.maxSubLocations || 0,
      childCount: childCounts.get(l.id) || 0,
      roomCount: roomCounts.get(l.id) || 0,
      dangerLevel: l.dangerLevel || 'safe',
      isCanonical: l.isCanonical !== false,
      createdByCampaignId: l.createdByCampaignId || null,
    }));

    return {
      nodes,
      edges: overworldEdges.map((e) => {
        const campaignCount = Array.isArray(e.discoveredByCampaigns) ? e.discoveredByCampaigns.length : 0;
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

  // Round E Phase 13b — canonical knowledge graph.
  // Everything canonical across the world in one payload: top-level locations,
  // overworld edges, all alive canonical NPCs keyed by their home/current
  // location. Frontend overlays the NPCs around their parent locations. Kept
  // separate from `/graph` so the existing map tab stays unchanged.
  fastify.get('/canon-graph', guard(), async () => {
    const [locations, edges, npcs] = await Promise.all([
      prisma.worldLocation.findMany({
        where: { parentLocationId: null, isCanonical: true },
        select: {
          id: true, canonicalName: true, displayName: true, locationType: true,
          regionX: true, regionY: true, region: true, dangerLevel: true,
          maxKeyNpcs: true, maxSubLocations: true,
        },
      }),
      prisma.worldLocationEdge.findMany({
        where: { terrainType: { not: 'dungeon_corridor' } },
        select: {
          id: true, fromLocationId: true, toLocationId: true,
          distance: true, difficulty: true, terrainType: true,
          direction: true, gated: true,
        },
      }),
      prisma.worldNPC.findMany({
        where: { alive: true },
        select: {
          id: true, canonicalId: true, name: true, role: true, category: true,
          keyNpc: true, alive: true,
          currentLocationId: true, homeLocationId: true,
        },
      }),
    ]);

    const locationIds = new Set(locations.map((l) => l.id));
    const overworldEdges = edges.filter(
      (e) => locationIds.has(e.fromLocationId) && locationIds.has(e.toLocationId),
    );

    const locationNodes = locations.map((l) => ({
      id: l.id,
      name: l.canonicalName,
      displayName: l.displayName || l.canonicalName,
      locationType: l.locationType || 'generic',
      region: l.region || null,
      x: l.regionX || 0,
      y: l.regionY || 0,
      dangerLevel: l.dangerLevel || 'safe',
      maxKeyNpcs: l.maxKeyNpcs || 0,
      maxSubLocations: l.maxSubLocations || 0,
    }));

    const npcNodes = npcs.map((n) => ({
      id: n.id,
      canonicalId: n.canonicalId,
      name: n.name,
      role: n.role || null,
      category: n.category || 'commoner',
      keyNpc: n.keyNpc !== false,
      alive: n.alive !== false,
      homeLocationId: n.homeLocationId || null,
      currentLocationId: n.currentLocationId || null,
    }));

    return {
      locations: locationNodes,
      edges: overworldEdges.map((e) => ({
        id: e.id,
        from: e.fromLocationId,
        to: e.toLocationId,
        distance: e.distance,
        difficulty: e.difficulty,
        terrainType: e.terrainType,
        direction: e.direction || null,
        gated: !!e.gated,
      })),
      npcs: npcNodes,
    };
  });

  // Round C Phase 8 — children of a single top-level location, used by the
  // admin tile-grid drill-down modal. Returns bare shape the FE sub-grid
  // renderer needs; no fog (admin view is unfiltered).
  fastify.get('/graph/sublocations/:parentId', guard({
    schema: {
      params: {
        type: 'object',
        required: ['parentId'],
        properties: { parentId: ID_STRING },
      },
    },
  }), async (request, reply) => {
    const { parentId } = request.params;
    const parent = await prisma.worldLocation.findUnique({
      where: { id: parentId },
      select: {
        id: true, canonicalName: true, displayName: true, locationType: true,
      },
    });
    if (!parent) {
      return reply.code(404).send({ error: 'parent not found' });
    }
    const children = await prisma.worldLocation.findMany({
      where: {
        parentLocationId: parentId,
        locationType: { not: 'dungeon_room' },
      },
      select: {
        id: true, canonicalName: true, displayName: true,
        locationType: true, slotType: true, slotKind: true,
        subGridX: true, subGridY: true,
        isCanonical: true, createdByCampaignId: true,
        dangerLevel: true, description: true,
      },
    });
    return reply.send({ parent, sublocations: children });
  });

  // ── World Lore (Round A — Phase 0a) ───────────────────────────────
  // Hand-curated canonical world lore, editable from the admin panel.
  // Injected into scene-gen prompts via `buildWorldLorePreamble()`.
  // Scene-gen caches by `max(updatedAt)` so edits propagate on next scene.

  fastify.get('/lore', guard(), async () => {
    const sections = await prisma.worldLoreSection.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return { sections };
  });

  fastify.put('/lore/:slug', guard({
    config: { idempotency: true },
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 200 },
          content: { type: 'string', maxLength: 100000 },
          order: { type: 'integer' },
        },
      },
    },
  }), async (request, reply) => {
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

  fastify.delete('/lore/:slug', guard(), async (request, reply) => {
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
  fastify.post('/lore/reorder', guard(), async (request, reply) => {
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

  // ── Round E Phase 13a — Pending world state changes ────────────────
  // Lists `PendingWorldStateChange` rows (Phase 12 MEDIUM/location/unsupported-HIGH
  // output). Approve routes through `applyApprovedPendingChange` which dispatches
  // to the per-entity writer (WorldNPC or WorldLocation knowledgeBase append),
  // then marks the row approved. Reject just stamps the decision with notes.
  fastify.get('/pending-world-state-changes', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          kind: SHORT_STRING,
          campaignId: ID_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        },
      },
    },
  }), async (request) => {
    const { status, kind, campaignId, limit } = request.query;
    const where = {};
    if (status) where.status = status;
    if (kind) where.kind = kind;
    if (campaignId) where.campaignId = campaignId;
    const rows = await prisma.pendingWorldStateChange.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return { rows };
  });

  fastify.post('/pending-world-state-changes/:id/approve', guard({
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { reviewNotes: { type: 'string', maxLength: 2000 } },
      },
    },
  }), async (request, reply) => {
    const { id } = request.params;
    const reviewNotes = typeof request.body?.reviewNotes === 'string' ? request.body.reviewNotes : null;
    const reviewedBy = request.user?.email || request.user?.id || null;
    try {
      const pending = await prisma.pendingWorldStateChange.findUnique({ where: { id } });
      if (!pending) return reply.code(404).send({ error: 'Not found' });
      if (pending.status !== 'pending') {
        return reply.code(409).send({ error: `already ${pending.status}` });
      }
      const applied = await applyApprovedPendingChange(pending);
      if (!applied.ok) {
        return reply.code(422).send({ error: 'apply_failed', reason: applied.reason });
      }
      const updated = await prisma.pendingWorldStateChange.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedBy,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });
      return { ok: true, pending: updated, applied };
    } catch (err) {
      log.error({ err, id }, 'approve pending world-state change failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/pending-world-state-changes/:id/reject', guard({
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { reviewNotes: { type: 'string', maxLength: 2000 } },
      },
    },
  }), async (request, reply) => {
    const { id } = request.params;
    const reviewNotes = typeof request.body?.reviewNotes === 'string' ? request.body.reviewNotes : null;
    const reviewedBy = request.user?.email || request.user?.id || null;
    try {
      const pending = await prisma.pendingWorldStateChange.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!pending) return reply.code(404).send({ error: 'Not found' });
      if (pending.status === 'approved') {
        return reply.code(409).send({ error: 'already approved' });
      }
      const updated = await prisma.pendingWorldStateChange.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedBy,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });
      return { ok: true, pending: updated };
    } catch (err) {
      log.error({ err, id }, 'reject pending world-state change failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Round E Phase 13a — NPC promotion candidates ───────────────────
  // Lists `NPCPromotionCandidate` rows (Phase 12b output). Approve creates a
  // canonical WorldNPC from the CampaignNPC shadow (or links to an existing
  // canonical match) via `promoteCampaignNpcToWorld`, then marks the row
  // approved. Reject just stamps the decision.
  fastify.get('/promotion-candidates', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          campaignId: ID_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        },
      },
    },
  }), async (request) => {
    const { status, campaignId, limit } = request.query;
    const where = {};
    if (status) where.status = status;
    if (campaignId) where.campaignId = campaignId;
    const rows = await prisma.nPCPromotionCandidate.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return { rows };
  });

  fastify.post('/promotion-candidates/:id/approve', guard({
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { reviewNotes: { type: 'string', maxLength: 2000 } },
      },
    },
  }), async (request, reply) => {
    const { id } = request.params;
    const reviewNotes = typeof request.body?.reviewNotes === 'string' ? request.body.reviewNotes : null;
    const reviewedBy = request.user?.email || request.user?.id || null;
    try {
      const candidate = await prisma.nPCPromotionCandidate.findUnique({ where: { id } });
      if (!candidate) return reply.code(404).send({ error: 'Not found' });
      if (candidate.status === 'approved') {
        return reply.code(409).send({ error: 'already approved' });
      }
      const promoted = await promoteCampaignNpcToWorld(candidate.campaignNpcId, { reviewedBy });
      if (!promoted.ok) {
        return reply.code(422).send({ error: 'promote_failed', reason: promoted.reason });
      }
      const updated = await prisma.nPCPromotionCandidate.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedBy,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });
      return {
        ok: true,
        candidate: updated,
        worldNpcId: promoted.worldNpc?.id,
        deduped: !!promoted.deduped,
      };
    } catch (err) {
      log.error({ err, id }, 'approve promotion candidate failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/promotion-candidates/:id/reject', guard({
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { reviewNotes: { type: 'string', maxLength: 2000 } },
      },
    },
  }), async (request, reply) => {
    const { id } = request.params;
    const reviewNotes = typeof request.body?.reviewNotes === 'string' ? request.body.reviewNotes : null;
    const reviewedBy = request.user?.email || request.user?.id || null;
    try {
      const candidate = await prisma.nPCPromotionCandidate.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!candidate) return reply.code(404).send({ error: 'Not found' });
      if (candidate.status === 'approved') {
        return reply.code(409).send({ error: 'already approved' });
      }
      const updated = await prisma.nPCPromotionCandidate.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedBy,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });
      return { ok: true, candidate: updated };
    } catch (err) {
      log.error({ err, id }, 'reject promotion candidate failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Round E Phase 12c/13a — Location promotion candidates ─────────
  fastify.get('/location-promotion-candidates', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          campaignId: ID_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        },
      },
    },
  }), async (request) => {
    const { status, campaignId, limit } = request.query;
    const where = {};
    if (status) where.status = status;
    if (campaignId) where.campaignId = campaignId;
    const rows = await prisma.locationPromotionCandidate.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return { rows };
  });

  fastify.post('/location-promotion-candidates/:id/approve', guard({
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { reviewNotes: { type: 'string', maxLength: 2000 } },
      },
    },
  }), async (request, reply) => {
    const { id } = request.params;
    const reviewNotes = typeof request.body?.reviewNotes === 'string' ? request.body.reviewNotes : null;
    const reviewedBy = request.user?.email || request.user?.id || null;
    try {
      const candidate = await prisma.locationPromotionCandidate.findUnique({ where: { id } });
      if (!candidate) return reply.code(404).send({ error: 'Not found' });
      if (candidate.status === 'approved') {
        return reply.code(409).send({ error: 'already approved' });
      }
      const promoted = await promoteWorldLocationToCanonical(candidate.worldLocationId);
      if (!promoted.ok) {
        return reply.code(422).send({ error: 'promote_failed', reason: promoted.reason });
      }
      const updated = await prisma.locationPromotionCandidate.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedBy,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });
      return {
        ok: true,
        candidate: updated,
        worldLocationId: promoted.worldLocation?.id,
      };
    } catch (err) {
      log.error({ err, id }, 'approve location promotion candidate failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/location-promotion-candidates/:id/reject', guard({
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { reviewNotes: { type: 'string', maxLength: 2000 } },
      },
    },
  }), async (request, reply) => {
    const { id } = request.params;
    const reviewNotes = typeof request.body?.reviewNotes === 'string' ? request.body.reviewNotes : null;
    const reviewedBy = request.user?.email || request.user?.id || null;
    try {
      const candidate = await prisma.locationPromotionCandidate.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!candidate) return reply.code(404).send({ error: 'Not found' });
      if (candidate.status === 'approved') {
        return reply.code(409).send({ error: 'already approved' });
      }
      const updated = await prisma.locationPromotionCandidate.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedBy,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });
      return { ok: true, candidate: updated };
    } catch (err) {
      log.error({ err, id }, 'reject location promotion candidate failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Round E Phase 13a — campaigns (admin picker) + writeback trigger ──
  // Lightweight list of all campaigns (admin-scope, not per-user) so the
  // PromotionsTab can pick a campaign to run post-campaign writeback against.
  fastify.get('/campaigns', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        },
      },
    },
  }), async (request) => {
    const { limit } = request.query;
    const rows = await prisma.campaign.findMany({
      orderBy: { lastSaved: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        userId: true,
        genre: true,
        tone: true,
        lastSaved: true,
        createdAt: true,
      },
    });
    return { rows };
  });

  // Trigger `runPostCampaignWorldWriteback` for a given campaign. Heavy — runs
  // LLM extraction + RAG resolver + Haiku verdict fan-out. Rate-limited on
  // top of the global admin tier. dryRun query flag passes through for
  // observability without writes.
  fastify.post('/campaigns/:id/run-writeback', guard({
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dryRun: { type: 'boolean' },
          skipExtraction: { type: 'boolean' },
          skipWorldChangePipeline: { type: 'boolean' },
          skipPromotion: { type: 'boolean' },
          skipPromotionVerdict: { type: 'boolean' },
          skipMemoryPromotion: { type: 'boolean' },
          skipLocationPromotion: { type: 'boolean' },
        },
      },
    },
  }), async (request, reply) => {
    const { id } = request.params;
    const body = request.body || {};
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, name: true },
      });
      if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
      const result = await runPostCampaignWorldWriteback(id, {
        dryRun: !!body.dryRun,
        skipExtraction: !!body.skipExtraction,
        skipWorldChangePipeline: !!body.skipWorldChangePipeline,
        skipPromotion: !!body.skipPromotion,
        skipPromotionVerdict: !!body.skipPromotionVerdict,
        skipMemoryPromotion: !!body.skipMemoryPromotion,
        skipLocationPromotion: !!body.skipLocationPromotion,
      });
      log.info({
        campaignId: id,
        dryRun: !!body.dryRun,
        triggeredBy: request.user?.email || request.user?.id || null,
      }, 'Admin-triggered post-campaign writeback');
      return { ok: true, campaign, result };
    } catch (err) {
      log.error({ err, campaignId: id }, 'run-writeback failed');
      return reply.code(500).send({ error: err.message });
    }
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
