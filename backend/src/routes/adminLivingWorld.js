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

import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { leaveParty } from '../services/livingWorld/companionService.js';
import { runNpcTick } from '../services/livingWorld/npcAgentLoop.js';
import { runTickBatch } from '../services/livingWorld/npcTickDispatcher.js';
import { runPostCampaignWorldWriteback } from '../services/livingWorld/postCampaignWriteback.js';
import { applyApprovedPendingChange } from '../services/livingWorld/postCampaignWorldChanges.js';
import { promoteCampaignNpcToWorld } from '../services/livingWorld/postCampaignPromotion.js';
import { promoteWorldLocationToCanonical } from '../services/livingWorld/postCampaignLocationPromotion.js';
import { migrateExistingCampaignGraph, runGraphConsistencyCheck, loadCampaignGraph, loadWorldGraph, createEdge } from '../services/locationGraph/index.js';
import { getExtractionStats } from '../services/locationGraph/graphExtractor.js';
import { reviseGraph } from '../services/locationGraph/graphRevisionService.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN } from '../services/locationRefs.js';
import { getModelOverrides, setModelOverrides, TASK_CATEGORIES } from '../services/serverConfig.js';
import { config } from '../config.js';
import { ensureCharacterSpritesBatch, MAX_CHARACTER_SPRITE_BATCH } from '../services/characterSpriteService.js';
import { startSpriteJob, getSpriteJobStatus, cancelSpriteJob, getActiveJobId, generateSpriteForNode } from '../services/locationGraph/spriteJobService.js';

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
          campaignId: ID_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          skip: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }), async (request) => {
    const { alive, companion, locked, locationId, campaignId, limit, skip } = request.query;
    const where = {};
    if (alive === 'true') where.alive = true;
    if (alive === 'false') where.alive = false;
    if (companion === 'true') where.companionOfCampaignId = { not: null };
    if (companion === 'false') where.companionOfCampaignId = null;
    if (locked === 'true') where.lockedByCampaignId = { not: null };
    if (locked === 'false') where.lockedByCampaignId = null;
    if (locationId) where.currentLocationId = locationId;
    if (campaignId) where.campaignShadows = { some: { campaignId } };

    const [total, rows] = await Promise.all([
      prisma.npc.count({ where }),
      prisma.npc.findMany({
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
          spriteUrl: true,
          category: true,
        },
      }),
    ]);

    return { total, rows };
  });

  // POST /character-sprites/generate — admin PixelLab batch for canonical NPC / character tokens
  fastify.post('/character-sprites/generate', guard({
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        additionalProperties: false,
        properties: {
          force: { type: 'boolean' },
          items: {
            type: 'array',
            maxItems: MAX_CHARACTER_SPRITE_BATCH,
            items: {
              type: 'object',
              required: ['kind', 'id'],
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['world-npc', 'campaign-npc', 'character'] },
                id: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
    },
  }), async (request, reply) => {
    if (!config.pixellabApiKey) {
      return reply.code(503).send({ error: 'PIXELLAB_API_KEY not configured' });
    }

    const { items, force } = request.body;
    const userId = request.user.id;

    const validated = [];
    for (const item of items) {
      if (item.kind === 'world-npc') {
        const row = await prisma.npc.findUnique({ where: { id: item.id }, select: { id: true } });
        if (row) validated.push(item);
      } else if (item.kind === 'campaign-npc') {
        const row = await prisma.npc.findUnique({ where: { id: item.id }, select: { id: true } });
        if (row) validated.push(item);
      } else if (item.kind === 'character') {
        const row = await prisma.character.findUnique({ where: { id: item.id }, select: { id: true } });
        if (row) validated.push(item);
      }
    }

    const sprites = await ensureCharacterSpritesBatch(validated, {
      userId,
      campaignId: null,
      force: !!force,
    });

    return { sprites };
  });

  fastify.get('/npcs/:id', guard(), async (request, reply) => {
    const { id } = request.params;
    const npc = await prisma.npc.findUnique({
      where: { id },
      include: {
        currentLocation: { select: { id: true, canonicalName: true } },
        homeLocation: { select: { id: true, canonicalName: true } },
      },
    });
    if (!npc) return reply.code(404).send({ error: 'Not found' });
    const [events, attributions, knowledgeBase, dialogHistory, knownLocations, campaignShadows] = await Promise.all([
      prisma.worldEvent.findMany({
        where: { worldNpcId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.npcAttribution.findMany({
        where: { worldNpcId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.npcKnowledge.findMany({
        where: { npcId: id },
        orderBy: { addedAt: 'desc' },
        take: 50,
      }),
      prisma.npcDialogTurn.findMany({
        where: { npcId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.npcKnownLocation.findMany({
        where: { npcId: id },
        include: { location: { select: { id: true, canonicalName: true } } },
      }),
      prisma.npc.findMany({
        where: { worldNpcId: id },
        select: {
          id: true, npcId: true, name: true, alive: true, disposition: true,
          activeGoal: true, lastLocationKind: true, lastLocationId: true,
          campaignId: true, interactionCount: true,
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    // Fetch quests where this NPC's campaign shadows are giver or turn-in.
    let relatedQuests = [];
    if (campaignShadows.length > 0) {
      const orClauses = campaignShadows.map((s) => ({
        campaignId: s.campaignId,
        OR: [{ questGiverId: s.npcId }, { turnInNpcId: s.npcId }],
      }));
      relatedQuests = await prisma.campaignQuest.findMany({
        where: { OR: orClauses },
        include: {
          objectives: { orderBy: { displayOrder: 'asc' } },
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
    }

    return {
      npc,
      events,
      attributions,
      goalProgress: npc.goalProgress ? safeJson(npc.goalProgress) : null,
      dialogHistory,
      knowledgeBase,
      knownLocations,
      campaignShadows,
      relatedQuests,
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
          campaignId: ID_STRING,
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 200 },
        },
      },
    },
  }), async (request) => {
    const { region, campaignId, limit } = request.query;
    const where = {};
    if (region) where.region = region;
    if (campaignId) {
      const discovered = await prisma.discoveredLocation.findMany({
        where: { campaignId, locationKind: 'world' },
        select: { locationId: true },
      });
      where.id = { in: discovered.map((d) => d.locationId) };
    }
    const rows = await prisma.location.findMany({
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
      },
    });
    return { rows };
  });

  fastify.get('/locations/:id', guard(), async (request, reply) => {
    const { id } = request.params;
    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, canonicalName: true } },
      },
    });
    if (!location) return reply.code(404).send({ error: 'Not found' });
    const [npcs, homeNpcs, events, knowledge, sublocations, roads, discoveryCount, relatedQuests, locationSummaries] = await Promise.all([
      prisma.npc.findMany({
        where: { currentLocationId: id, alive: true },
        select: { id: true, name: true, role: true, category: true, companionOfCampaignId: true, pausedAt: true },
      }),
      prisma.npc.findMany({
        where: { homeLocationId: id },
        select: { id: true, name: true, role: true, alive: true, category: true },
      }),
      prisma.worldEvent.findMany({
        where: { worldLocationId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.locationKnowledge.findMany({
        where: { locationId: id },
        orderBy: { addedAt: 'desc' },
        take: 50,
      }),
      prisma.location.findMany({
        where: { parentLocationId: id },
        select: { id: true, canonicalName: true, locationType: true, dangerLevel: true },
        orderBy: { canonicalName: 'asc' },
      }),
      prisma.road.findMany({
        where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
        include: {
          from: { select: { id: true, canonicalName: true } },
          to: { select: { id: true, canonicalName: true } },
        },
        take: 50,
      }),
      prisma.discoveredLocation.count({
        where: { locationKind: 'world', locationId: id },
      }),
      prisma.campaignQuest.findMany({
        where: { locationKind: 'world', locationId: id },
        include: {
          objectives: { orderBy: { displayOrder: 'asc' } },
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      prisma.locationSummary.findMany({
        where: { locationName: location.canonicalName },
        include: { campaign: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      location,
      npcs,
      homeNpcs,
      events,
      aliases: safeJson(location.aliases),
      knowledge,
      sublocations,
      roads,
      discoveryCount,
      relatedQuests,
      locationSummaries,
      parentLocation: location.parent || null,
    };
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
      const npc = await prisma.npc.findUnique({
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
      const updated = await prisma.npc.update({
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
      prisma.location.findMany({
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
        },
      }),
      prisma.road.findMany({
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
          _count: { select: { campaignDiscoveries: true } },
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
      const roomsGrouped = await prisma.location.groupBy({
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
      const grouped = await prisma.location.groupBy({
        by: ['parentLocationId'],
        where: { parentLocationId: { in: topLevelIds }, locationType: { not: 'dungeon_room' } },
        _count: true,
      });
      childCounts = new Map(grouped.map((r) => [r.parentLocationId, r._count]));
    }

    // F5b — every WorldLocation row IS canonical (the flag was dropped). The
    // legacy `isCanonical`/`createdByCampaignId` fields are kept on the
    // payload for FE back-compat (always true / always null) so existing
    // admin UI code doesn't choke on missing keys.
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
      isCanonical: true,
      createdByCampaignId: null,
    }));

    return {
      nodes,
      edges: overworldEdges.map((e) => {
        const campaignCount = e._count?.campaignDiscoveries || 0;
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
      prisma.location.findMany({
        where: { parentLocationId: null },
        select: {
          id: true, canonicalName: true, displayName: true, locationType: true,
          regionX: true, regionY: true, region: true, dangerLevel: true,
          maxKeyNpcs: true, maxSubLocations: true,
        },
      }),
      prisma.road.findMany({
        where: { terrainType: { not: 'dungeon_corridor' } },
        select: {
          id: true, fromLocationId: true, toLocationId: true,
          distance: true, difficulty: true, terrainType: true,
          direction: true, gated: true,
        },
      }),
      prisma.npc.findMany({
        where: { alive: true },
        select: {
          id: true, canonicalId: true, name: true, role: true, category: true,
          keyNpc: true, alive: true,
          currentLocationId: true, homeLocationId: true,
          spriteUrl: true,
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
      spriteUrl: n.spriteUrl || null,
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

  // Admin LocationGraph modal (world scope) — full LocationEdge graph + orphans,
  // canonical WorldNPC occupants, campaigns linked per discovery / current pose / sandbox.
  fastify.get('/world-graph', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          showOrphans: BOOL_STRING,
        },
      },
    },
  }), async (request) => {
    const showOrphans = request.query.showOrphans === 'true';
    let { nodes: nodeMap, edges } = await loadWorldGraph();

    const seenWorldIds = new Set();
    const seenCampaignLocIds = new Set();
    for (const [, row] of nodeMap) {
      if (row._kind === LOCATION_KIND_WORLD) seenWorldIds.add(row.id);
      else if (row._kind === LOCATION_KIND_CAMPAIGN) seenCampaignLocIds.add(row.id);
    }

    const orphanWorldWhere = {
      ...(seenWorldIds.size > 0 ? { id: { notIn: [...seenWorldIds] } } : {}),
      ...(!showOrphans ? {
        globallyActive: true,
        softDeletedAt: null,
        NOT: { canonicalName: { startsWith: '__draft::' } },
      } : {}),
    };
    const orphanWorldRows = await prisma.location.findMany({ where: orphanWorldWhere });

    for (const r of orphanWorldRows) {
      nodeMap.set(`${LOCATION_KIND_WORLD}:${r.id}`, { ...r, _kind: LOCATION_KIND_WORLD });
    }

    if (showOrphans) {
      const orphanCampaignWhere = seenCampaignLocIds.size > 0
        ? { id: { notIn: [...seenCampaignLocIds] } }
        : {};
      const orphanCampaignRows = await prisma.location.findMany({ where: orphanCampaignWhere });
      for (const r of orphanCampaignRows) {
        nodeMap.set(`${LOCATION_KIND_CAMPAIGN}:${r.id}`, { ...r, _kind: LOCATION_KIND_CAMPAIGN });
      }
    }

    /** @typedef {{ id: string, name: string, discoveredAt: string|null, relations: string[] }} CampaignRefMerged */
    /** @type Map<string, Map<string, CampaignRefMerged>> compositeKey -> cid -> merged */
    const campaignsByComposite = new Map();

    function touchCampaignMap(compositeKey) {
      if (!campaignsByComposite.has(compositeKey)) campaignsByComposite.set(compositeKey, new Map());
      return campaignsByComposite.get(compositeKey);
    }

    /** @param {string} compositeKey `"world:id"|"campaign:id"` */
    function mergeCampaignRef(compositeKey, campaignId, name, fragment) {
      if (!campaignId) return;
      const m = touchCampaignMap(compositeKey);
      let row = m.get(campaignId);
      if (!row) {
        row = { id: campaignId, name: name || '', discoveredAt: null, relations: [] };
        m.set(campaignId, row);
      } else if (name && !row.name) row.name = name;
      if (fragment.discoveredAt) {
        const iso = fragment.discoveredAt instanceof Date
          ? fragment.discoveredAt.toISOString()
          : String(fragment.discoveredAt);
        if (!row.discoveredAt || iso < row.discoveredAt) row.discoveredAt = iso;
      }
      if (fragment.relation && !row.relations.includes(fragment.relation)) row.relations.push(fragment.relation);
    }

    const worldIdsAll = [];
    const campaignLocIdsAll = [];
    const ownerCampaignIds = new Set();
    for (const [, row] of nodeMap) {
      if (row._kind === LOCATION_KIND_WORLD) worldIdsAll.push(row.id);
      else if (row._kind === LOCATION_KIND_CAMPAIGN) {
        campaignLocIdsAll.push(row.id);
        if (row.campaignId) ownerCampaignIds.add(row.campaignId);
      }
    }

    const ownerMeta = ownerCampaignIds.size > 0
      ? await prisma.campaign.findMany({
          where: { id: { in: [...ownerCampaignIds] } },
          select: { id: true, name: true },
        })
      : [];
    const nameByCampaignId = new Map(ownerMeta.map((c) => [c.id, c.name]));

    for (const [, row] of nodeMap) {
      if (row._kind === LOCATION_KIND_CAMPAIGN && row.campaignId) {
        mergeCampaignRef(
          `${LOCATION_KIND_CAMPAIGN}:${row.id}`,
          row.campaignId,
          nameByCampaignId.get(row.campaignId),
          { relation: 'owner' },
        );
      }
    }

    const discoveryWhereOr = [];
    if (worldIdsAll.length > 0) {
      discoveryWhereOr.push({
        locationKind: LOCATION_KIND_WORLD,
        locationId: { in: worldIdsAll },
        state: 'visited',
      });
    }
    if (campaignLocIdsAll.length > 0) {
      discoveryWhereOr.push({
        locationKind: LOCATION_KIND_CAMPAIGN,
        locationId: { in: campaignLocIdsAll },
        state: 'visited',
      });
    }
    const discoveries = discoveryWhereOr.length > 0
      ? await prisma.discoveredLocation.findMany({
          where: { OR: discoveryWhereOr },
          include: { campaign: { select: { id: true, name: true } } },
        })
      : [];
    for (const d of discoveries) {
      const compositeKey = `${d.locationKind}:${d.locationId}`;
      mergeCampaignRef(compositeKey, d.campaignId, d.campaign?.name ?? '', {
        relation: 'visited',
        discoveredAt: d.discoveredAt,
      });
    }

    const [atWorld, atSandbox] = await Promise.all([
      worldIdsAll.length > 0
        ? prisma.campaign.findMany({
            where: {
              currentLocationKind: LOCATION_KIND_WORLD,
              currentLocationId: { in: worldIdsAll },
            },
            select: { id: true, name: true, currentLocationId: true },
          })
        : [],
      campaignLocIdsAll.length > 0
        ? prisma.campaign.findMany({
            where: {
              currentLocationKind: LOCATION_KIND_CAMPAIGN,
              currentLocationId: { in: campaignLocIdsAll },
            },
            select: { id: true, name: true, currentLocationId: true },
          })
        : [],
    ]);

    for (const c of atWorld) {
      mergeCampaignRef(
        `${LOCATION_KIND_WORLD}:${c.currentLocationId}`,
        c.id,
        c.name,
        { relation: 'current_here' },
      );
    }
    for (const c of atSandbox) {
      mergeCampaignRef(
        `${LOCATION_KIND_CAMPAIGN}:${c.currentLocationId}`,
        c.id,
        c.name,
        { relation: 'current_here' },
      );
    }

    const dedupedEdges = edges;
    const nodeList = [];

    const tagsFromJson = (tags) => (Array.isArray(tags) ? tags : []);

    for (const [, node] of nodeMap) {
      const ck = `${node._kind}:${node.id}`;
      const campaignRefsRaw = [...(campaignsByComposite.get(ck)?.values() || [])];
      const campaignsSorted = campaignRefsRaw
        .map((cr) => ({
          id: cr.id,
          name: cr.name,
          discoveredAt: cr.discoveredAt,
          relations: [...cr.relations],
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pl'));

      const serialized = node._kind === LOCATION_KIND_WORLD
        ? {
            id: node.id,
            kind: LOCATION_KIND_WORLD,
            name: node.canonicalName || node.displayName || node.name || node.id,
            type: node.locationType || 'generic',
            scale: node.scale ?? 5,
            tags: tagsFromJson(node.tags),
            atmosphere: node.atmosphere ?? null,
            description: node.description ?? null,
            biome: node.biome ?? null,
            region: node.region ?? null,
            visitCount: node.visitCount ?? 0,
            dangerLevel: node.dangerLevel || 'safe',
            regionX: node.regionX ?? 0,
            regionY: node.regionY ?? 0,
            nodeShape: node.nodeShape ?? null,
            nodeIcon: node.nodeIcon ?? null,
            nodeImageUrl: node.nodeImageUrl ?? null,
            campaigns: campaignsSorted,
          }
        : {
            id: node.id,
            kind: LOCATION_KIND_CAMPAIGN,
            name: node.name,
            type: node.locationType || 'generic',
            scale: node.scale ?? 5,
            tags: tagsFromJson(node.tags),
            atmosphere: node.atmosphere ?? null,
            description: node.description ?? null,
            biome: node.biome ?? null,
            region: node.region ?? null,
            visitCount: node.visitCount ?? 0,
            dangerLevel: node.dangerLevel || 'safe',
            regionX: node.regionX ?? 0,
            regionY: node.regionY ?? 0,
            nodeShape: node.nodeShape ?? null,
            nodeIcon: node.nodeIcon ?? null,
            nodeImageUrl: node.nodeImageUrl ?? null,
            campaigns: campaignsSorted,
          };

      nodeList.push(serialized);
    }

    const edgeList = dedupedEdges.map((e) => ({
      id: e.id,
      fromKind: e.fromKind,
      fromId: e.fromId,
      toKind: e.toKind,
      toId: e.toId,
      edgeType: e.edgeType,
      category: e.category,
      bidirectional: e.bidirectional,
      weight: e.weight,
      metadata: e.metadata,
      discoveryState: e.discoveryState,
      createdBy: e.createdBy,
    }));

    const FACTION_EDGE_TYPES = new Set(['controlled_by', 'patrolled_by', 'contested_between']);
    const factionOverlay = dedupedEdges
      .filter((e) => e.category === 'social' && FACTION_EDGE_TYPES.has(e.edgeType))
      .map((e) => ({
        locationId: e.fromId,
        locationKind: e.fromKind,
        factionId: e.metadata?.factionId || null,
        factionName: e.metadata?.factionName || e.metadata?.factionId || null,
        strength: e.metadata?.strength ?? 50,
        type: e.edgeType,
        color: e.metadata?.color || null,
      }))
      .filter((f) => f.factionId);

    const worldNpcs = await prisma.npc.findMany({
      where: {
        alive: true,
        OR: [{ currentLocationId: { not: null } }, { homeLocationId: { not: null } }],
      },
      select: {
        id: true,
        name: true,
        role: true,
        category: true,
        currentLocationId: true,
        homeLocationId: true,
        spriteUrl: true,
        spriteSheetUrl: true,
      },
    });

    const occupants = [];
    for (const npc of worldNpcs) {
      const locId = npc.currentLocationId || npc.homeLocationId;
      if (!locId) continue;
      occupants.push({
        id: npc.id,
        name: npc.name,
        type: 'npc',
        role: npc.role,
        category: npc.category,
        locationKind: LOCATION_KIND_WORLD,
        locationId: locId,
        spriteUrl: npc.spriteUrl ?? null,
        spriteSheetUrl: npc.spriteSheetUrl ?? null,
      });
    }

    return {
      nodes: nodeList,
      edges: edgeList,
      factionOverlay,
      occupants,
    };
  });

  // ── AI graph revision ──────────────────────────────────────────────
  fastify.post('/world-graph/revise-graph', guard({
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['nodes', 'edges'],
        additionalProperties: false,
        properties: {
          nodes: {
            type: 'array',
            maxItems: 500,
            items: { type: 'object' },
          },
          edges: {
            type: 'array',
            maxItems: 2000,
            items: { type: 'object' },
          },
        },
      },
    },
  }), async (request) => {
    const { nodes, edges } = request.body;
    return reviseGraph({ nodes, edges, userId: request.user?.id });
  });

  // ── World-scope edge patch (for edges with campaignId=null) ────────
  fastify.patch('/edges/:edgeId', guard({
    schema: {
      params: {
        type: 'object',
        required: ['edgeId'],
        properties: { edgeId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          edgeType: { type: 'string', maxLength: 60 },
          category: { type: 'string', maxLength: 40 },
          weight: { type: 'number', minimum: 0 },
          bidirectional: { type: 'boolean' },
          metadata: { type: 'object' },
          discoveryState: { type: 'string', maxLength: 20 },
          isActive: { type: 'boolean' },
        },
      },
    },
  }), async (request, reply) => {
    const { edgeId } = request.params;
    const edge = await prisma.locationEdge.findUnique({ where: { id: edgeId }, select: { id: true, campaignId: true } });
    if (!edge) return reply.code(404).send({ error: 'LocationEdge not found' });
    const data = request.body;
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'No fields provided' });
    return prisma.locationEdge.update({ where: { id: edgeId }, data });
  });

  // ── World-graph node image patch (admin bulk-gen save target) ────────
  fastify.patch('/world-graph/nodes/:kind/:nodeId', guard({
    schema: {
      params: {
        type: 'object',
        required: ['kind', 'nodeId'],
        properties: {
          kind: { type: 'string', enum: ['world', 'campaign'] },
          nodeId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nodeImageUrl: { type: ['string', 'null'], maxLength: 500 },
        },
      },
    },
  }), async (request, reply) => {
    const { kind, nodeId } = request.params;
    const { nodeImageUrl } = request.body;
    if (nodeImageUrl === undefined) return reply.code(400).send({ error: 'nodeImageUrl required' });

    if (kind === 'world') {
      const row = await prisma.location.findUnique({ where: { id: nodeId }, select: { id: true } });
      if (!row) return reply.code(404).send({ error: 'WorldLocation not found' });
      await prisma.location.update({ where: { id: nodeId }, data: { nodeImageUrl: nodeImageUrl || null } });
    } else {
      const row = await prisma.location.findFirst({ where: { id: nodeId }, select: { id: true } });
      if (!row) return reply.code(404).send({ error: 'CampaignLocation not found' });
      await prisma.location.update({ where: { id: nodeId }, data: { nodeImageUrl: nodeImageUrl || null } });
    }

    return { ok: true, nodeImageUrl: nodeImageUrl || null };
  });

  // ── World-graph single node sprite generation (admin PixelLab) ─────
  fastify.post('/world-graph/nodes/:kind/:nodeId/generate-sprite', guard({
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      params: {
        type: 'object',
        required: ['kind', 'nodeId'],
        properties: {
          kind: { type: 'string', enum: ['world', 'campaign'] },
          nodeId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }), async (request, reply) => {
    if (!config.pixellabApiKey) {
      return reply.code(503).send({ error: 'PIXELLAB_API_KEY not configured' });
    }
    const { kind, nodeId } = request.params;
    try {
      const nodeImageUrl = await generateSpriteForNode(kind, nodeId);
      return { ok: true, nodeImageUrl };
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // ── Cleanup stale __draft:: WorldLocation registry entries ──────────
  fastify.delete('/draft-locations', guard({
    config: { rateLimit: { max: 1, timeWindow: '1 minute' } },
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          olderThanDays: { type: 'integer', minimum: 0, maximum: 3650, default: 30 },
        },
      },
    },
  }), async (request) => {
    const days = request.query.olderThanDays ?? 30;
    const cutoff = new Date(Date.now() - days * 86_400_000);

    const liveCampaignIds = new Set(
      (await prisma.campaign.findMany({ select: { id: true } })).map((c) => c.id),
    );

    const drafts = await prisma.location.findMany({
      where: {
        canonicalName: { startsWith: '__draft::' },
        createdAt: { lt: cutoff },
      },
      select: { id: true, canonicalName: true },
    });

    const toDelete = drafts.filter((d) => {
      const parts = d.canonicalName.split('::');
      const campaignId = parts[1];
      return !campaignId || !liveCampaignIds.has(campaignId);
    });

    if (toDelete.length > 0) {
      await prisma.location.deleteMany({
        where: { id: { in: toDelete.map((d) => d.id) } },
      });
    }

    return { deleted: toDelete.length };
  });

  // ── Bulk sprite generation jobs ─────────────────────────────────────
  // Admin kicks off a background PixelLab job for every node without a sprite.

  fastify.post('/world-graph/sprite-jobs', guard({
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['nodes'],
        additionalProperties: false,
        properties: {
          nodes: {
            type: 'array',
            maxItems: 2000,
            items: {
              type: 'object',
              required: ['kind', 'id'],
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['world', 'campaign'] },
                id: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
    },
  }), async (request, reply) => {
    const { nodes } = request.body;
    if (nodes.length === 0) {
      return reply.code(400).send({ error: 'No nodes provided' });
    }
    try {
      const result = await startSpriteJob(nodes, { userId: request.user.id });
      return reply.code(201).send(result);
    } catch (err) {
      log.error({ err }, 'start sprite job failed');
      if (err.message.includes('not configured')) {
        return reply.code(503).send({ error: err.message });
      }
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.get('/world-graph/sprite-jobs/active', guard(), async () => {
    const jobId = await getActiveJobId();
    if (!jobId) return { jobId: null };
    const status = await getSpriteJobStatus(jobId);
    return { jobId, ...status };
  });

  fastify.get('/world-graph/sprite-jobs/:jobId', guard({
    schema: {
      params: {
        type: 'object',
        required: ['jobId'],
        properties: { jobId: { type: 'string', format: 'uuid' } },
      },
    },
  }), async (request, reply) => {
    const status = await getSpriteJobStatus(request.params.jobId);
    if (!status) return reply.code(404).send({ error: 'Job not found' });
    return status;
  });

  fastify.post('/world-graph/sprite-jobs/:jobId/cancel', guard({
    schema: {
      params: {
        type: 'object',
        required: ['jobId'],
        properties: { jobId: { type: 'string', format: 'uuid' } },
      },
    },
  }), async (request, reply) => {
    const result = await cancelSpriteJob(request.params.jobId);
    if (!result) return reply.code(404).send({ error: 'Job not found' });
    return { ok: true, ...result };
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
    const parent = await prisma.location.findUnique({
      where: { id: parentId },
      select: {
        id: true, canonicalName: true, displayName: true, locationType: true,
      },
    });
    if (!parent) {
      return reply.code(404).send({ error: 'parent not found' });
    }
    const children = await prisma.location.findMany({
      where: {
        parentLocationId: parentId,
        locationType: { not: 'dungeon_room' },
      },
      select: {
        id: true, canonicalName: true, displayName: true,
        locationType: true, slotType: true, slotKind: true,
        subGridX: true, subGridY: true,
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
  // ignored; duplicate order values are accepted (rendering tie-breaks by
  // createdAt). Sequential loop — wrap in $transaction if partial-failure
  // rollback ever becomes a concern.
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
      // F5b — promote DESTRUCTIVELY copies the source CampaignLocation into a
      // new canonical WorldLocation, relinks polymorphic refs, deletes source.
      const promoted = await promoteWorldLocationToCanonical(candidate.sourceLocationId);
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

  // ── Location Graph migration + validation ────────────────────────────

  fastify.post('/campaigns/:id/migrate-graph', guard({
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }), async (request, reply) => {
    const { id } = request.params;
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, name: true },
      });
      if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
      const result = await migrateExistingCampaignGraph(id);
      log.info({ campaignId: id, triggeredBy: request.user?.email || request.user?.id }, 'Admin-triggered graph migration');
      return { ok: true, campaign, result };
    } catch (err) {
      log.error({ err, campaignId: id }, 'migrate-graph failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.get('/campaigns/:id/graph-health', guard(), async (request, reply) => {
    const { id } = request.params;
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, name: true },
      });
      if (!campaign) return reply.code(404).send({ error: 'campaign not found' });
      const report = await runGraphConsistencyCheck(id);
      const extractionStats = getExtractionStats();
      return { ok: true, campaign, report, extractionStats };
    } catch (err) {
      log.error({ err, campaignId: id }, 'graph-health failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Graph Export/Import ─────────────────────────────────────────────

  fastify.get('/campaigns/:id/export-graph', guard(), async (request, reply) => {
    const { id } = request.params;
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, name: true },
      });
      if (!campaign) return reply.code(404).send({ error: 'campaign not found' });

      const { nodes, edges } = await loadCampaignGraph(id);
      const npcs = await prisma.npc.findMany({
        where: { campaignId: id },
        select: { id: true, name: true, lastLocationKind: true, lastLocationId: true },
      });

      const nodeList = [];
      for (const [key, node] of nodes) {
        nodeList.push({
          id: node.id,
          kind: node._kind,
          name: node.canonicalName || node.displayName || node.name,
          type: node.locationType || 'generic',
          scale: node.scale ?? 5,
          tags: node.tags || [],
          atmosphere: node.atmosphere || null,
          regionX: node.regionX ?? 0,
          regionY: node.regionY ?? 0,
        });
      }

      const edgeList = edges.map((e) => ({
        id: e.id,
        fromKind: e.fromKind,
        fromId: e.fromId,
        toKind: e.toKind,
        toId: e.toId,
        edgeType: e.edgeType,
        category: e.category,
        bidirectional: e.bidirectional,
        weight: e.weight,
        metadata: e.metadata,
        discoveryState: e.discoveryState,
        createdBy: e.createdBy,
        campaignId: e.campaignId,
      }));

      return reply.send({
        exportedAt: new Date().toISOString(),
        campaignId: id,
        campaignName: campaign.name,
        nodes: nodeList,
        edges: edgeList,
        npcPositions: npcs.map((n) => ({
          npcId: n.id,
          npcName: n.name,
          locationKind: n.lastLocationKind,
          locationId: n.lastLocationId,
        })),
      });
    } catch (err) {
      log.error({ err, campaignId: id }, 'export-graph failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/campaigns/:id/import-graph', guard({
    schema: {
      body: {
        type: 'object',
        required: ['edges'],
        properties: {
          nodes: { type: 'array', maxItems: 500 },
          edges: { type: 'array', maxItems: 2000 },
          npcPositions: { type: 'array', maxItems: 200 },
        },
      },
    },
  }), async (request, reply) => {
    const { id } = request.params;
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!campaign) return reply.code(404).send({ error: 'campaign not found' });

      const { nodes = [], edges = [], npcPositions = [] } = request.body;
      const result = { nodesCreated: 0, edgesCreated: 0, npcsMoved: 0, errors: [] };

      // Upsert nodes as CampaignLocation
      const nameToId = new Map();
      for (const node of nodes) {
        if (node.kind === 'world') {
          nameToId.set(node.id, { kind: LOCATION_KIND_WORLD, id: node.id });
          continue;
        }
        try {
          const existing = await prisma.location.findFirst({
            where: { campaignId: id, name: node.name },
          });
          if (existing) {
            nameToId.set(node.id, { kind: LOCATION_KIND_CAMPAIGN, id: existing.id });
          } else {
            const row = await prisma.location.create({
              data: {
                campaignId: id,
                name: node.name,
                description: '',
                locationType: node.type || 'generic',
                tags: node.tags || [],
                scale: node.scale ?? 5,
                regionX: node.regionX ?? 0,
                regionY: node.regionY ?? 0,
              },
            });
            nameToId.set(node.id, { kind: LOCATION_KIND_CAMPAIGN, id: row.id });
            result.nodesCreated++;
          }
        } catch (err) {
          result.errors.push(`Node "${node.name}": ${err.message}`);
        }
      }

      // Create edges
      for (const edge of edges) {
        const from = nameToId.get(edge.fromId) || { kind: edge.fromKind, id: edge.fromId };
        const to = nameToId.get(edge.toId) || { kind: edge.toKind, id: edge.toId };
        if (!from.id || !to.id) { result.errors.push(`Edge missing endpoint`); continue; }

        try {
          const exists = await prisma.locationEdge.findFirst({
            where: {
              fromKind: from.kind, fromId: from.id,
              toKind: to.kind, toId: to.id,
              edgeType: edge.edgeType, isActive: true,
            },
          });
          if (!exists) {
            await createEdge({
              fromKind: from.kind, fromId: from.id,
              toKind: to.kind, toId: to.id,
              edgeType: edge.edgeType,
              category: edge.category || 'movement',
              bidirectional: edge.bidirectional ?? true,
              weight: edge.weight ?? 1.0,
              metadata: edge.metadata || {},
              discoveryState: edge.discoveryState || 'known',
              campaignId: id,
              createdBy: 'admin',
            });
            result.edgesCreated++;
          }
        } catch (err) {
          result.errors.push(`Edge ${edge.edgeType}: ${err.message}`);
        }
      }

      // Move NPCs
      for (const pos of npcPositions) {
        if (!pos.npcId || !pos.locationId) continue;
        try {
          await prisma.npc.updateMany({
            where: { id: pos.npcId, campaignId: id },
            data: { lastLocationKind: pos.locationKind || LOCATION_KIND_WORLD, lastLocationId: pos.locationId },
          });
          result.npcsMoved++;
        } catch (err) {
          result.errors.push(`NPC ${pos.npcId}: ${err.message}`);
        }
      }

      log.info({ campaignId: id, ...result, errors: result.errors.length }, 'Graph imported');
      return reply.send({ ok: true, result });
    } catch (err) {
      log.error({ err, campaignId: id }, 'import-graph failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Entity Browser (unified listing + cascade delete) ─────────────
  // Admin tool: query across all 8 entity tables in parallel, merge into
  // a unified shape for the entity browser UI. Single-entity + bulk delete
  // with FK cascade.

  const ENTITY_TYPES = [
    'WorldNPC', 'WorldLocation', 'Road',
    'CampaignNPC', 'CampaignLocation', 'CampaignEdge', 'CampaignQuest', 'Character',
  ];

  fastify.get('/entities', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ENTITY_TYPES },
          search: { type: 'string', maxLength: 200 },
          campaignId: ID_STRING,
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  }), async (request) => {
    const { type, search, campaignId, page, limit } = request.query;
    const skip = ((page || 1) - 1) * limit;
    const searchFilter = search ? { contains: search, mode: 'insensitive' } : undefined;

    const typesToQuery = type ? [type] : ENTITY_TYPES;
    const queries = {};

    const needsWorldLocFilter = campaignId && (typesToQuery.includes('WorldLocation'));
    const campaignWorldLocIds = needsWorldLocFilter
      ? (await prisma.discoveredLocation.findMany({
          where: { campaignId, locationKind: 'world' },
          select: { locationId: true },
        })).map((d) => d.locationId)
      : null;

    if (typesToQuery.includes('WorldNPC')) {
      const where = {};
      if (searchFilter) where.name = searchFilter;
      if (campaignId) where.campaignShadows = { some: { campaignId } };
      queries.WorldNPC = prisma.npc.findMany({
        where, take: limit, skip, orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, role: true, alive: true, category: true, currentLocationId: true, updatedAt: true, globallyActive: true, softDeletedAt: true, originCampaignId: true },
      });
    }
    if (typesToQuery.includes('WorldLocation')) {
      const where = {};
      if (searchFilter) where.canonicalName = searchFilter;
      if (campaignWorldLocIds) where.id = { in: campaignWorldLocIds };
      queries.WorldLocation = prisma.location.findMany({
        where, take: limit, skip, orderBy: { updatedAt: 'desc' },
        select: { id: true, canonicalName: true, locationType: true, region: true, parentLocationId: true, updatedAt: true, globallyActive: true, softDeletedAt: true, originCampaignId: true },
      });
    }
    if (typesToQuery.includes('Road')) {
      const where = {};
      queries.Road = prisma.road.findMany({
        where, take: limit, skip, orderBy: { createdAt: 'desc' },
        select: {
          id: true, distance: true, terrainType: true, difficulty: true,
          from: { select: { canonicalName: true } },
          to: { select: { canonicalName: true } },
          createdAt: true,
        },
      });
    }
    if (typesToQuery.includes('CampaignNPC')) {
      const where = {};
      if (searchFilter) where.name = searchFilter;
      if (campaignId) where.campaignId = campaignId;
      queries.CampaignNPC = prisma.npc.findMany({
        where, take: limit, skip, orderBy: { updatedAt: 'desc' },
        select: {
          id: true, name: true, campaignId: true, alive: true, worldNpcId: true,
          campaign: { select: { name: true } },
          updatedAt: true,
        },
      });
    }
    if (typesToQuery.includes('CampaignLocation')) {
      const where = {};
      if (searchFilter) where.name = searchFilter;
      if (campaignId) where.campaignId = campaignId;
      queries.CampaignLocation = prisma.location.findMany({
        where, take: limit, skip, orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, locationType: true, campaignId: true,
          campaign: { select: { name: true } },
          createdAt: true,
        },
      });
    }
    if (typesToQuery.includes('CampaignEdge')) {
      const where = {};
      if (campaignId) where.campaignId = campaignId;
      queries.CampaignEdge = prisma.campaignEdge.findMany({
        where, take: limit, skip, orderBy: { createdAt: 'desc' },
        select: {
          id: true, campaignId: true, relationType: true, fromKind: true, fromId: true,
          toKind: true, toId: true, distance: true, visibility: true,
          campaign: { select: { name: true } },
          createdAt: true,
        },
      });
    }
    if (typesToQuery.includes('CampaignQuest')) {
      const where = {};
      if (searchFilter) where.name = searchFilter;
      if (campaignId) where.campaignId = campaignId;
      queries.CampaignQuest = prisma.campaignQuest.findMany({
        where, take: limit, skip, orderBy: { updatedAt: 'desc' },
        select: {
          id: true, name: true, type: true, status: true, campaignId: true,
          campaign: { select: { name: true } },
          updatedAt: true,
        },
      });
    }
    if (typesToQuery.includes('Character')) {
      const where = {};
      if (searchFilter) where.name = searchFilter;
      queries.Character = prisma.character.findMany({
        where, take: limit, skip, orderBy: { updatedAt: 'desc' },
        select: {
          id: true, name: true, species: true, characterLevel: true,
          lockedCampaignId: true, lockedCampaignName: true,
          updatedAt: true,
        },
      });
    }

    // Sidebar counts must NOT depend on the active `type` filter — otherwise
    // clicking a type zeros out every other counter. They DO honor scope
    // filters (search + campaignId) so the sidebar tracks the search results.
    const countWhere = {
      WorldNPC: {
        ...(searchFilter ? { name: searchFilter } : {}),
        ...(campaignId ? { campaignShadows: { some: { campaignId } } } : {}),
      },
      WorldLocation: {
        ...(searchFilter ? { canonicalName: searchFilter } : {}),
        ...(campaignWorldLocIds ? { id: { in: campaignWorldLocIds } } : {}),
      },
      Road: {},
      CampaignNPC: {
        ...(searchFilter ? { name: searchFilter } : {}),
        ...(campaignId ? { campaignId } : {}),
      },
      CampaignLocation: {
        ...(searchFilter ? { name: searchFilter } : {}),
        ...(campaignId ? { campaignId } : {}),
      },
      CampaignEdge: campaignId ? { campaignId } : {},
      CampaignQuest: {
        ...(searchFilter ? { name: searchFilter } : {}),
        ...(campaignId ? { campaignId } : {}),
      },
      Character: searchFilter ? { name: searchFilter } : {},
    };

    const countQueries = ENTITY_TYPES.map((t) =>
      prisma[prismaModelName(t)].count({ where: countWhere[t] }),
    );

    const queryKeys = Object.keys(queries);
    const queryValues = Object.values(queries);

    const [countsArr, ...rowResults] = await Promise.all([
      Promise.all(countQueries),
      ...queryValues,
    ]);

    const counts = {};
    ENTITY_TYPES.forEach((t, i) => { counts[t] = countsArr[i]; });

    const resultByType = {};
    queryKeys.forEach((k, i) => { resultByType[k] = rowResults[i]; });

    const entities = [];
    for (const t of ENTITY_TYPES) {
      const rows = resultByType[t] || [];
      for (const row of rows) {
        entities.push(normalizeEntity(t, row));
      }
    }

    return { entities, counts, total: entities.length };
  });

  fastify.delete('/entities/:type/:id', guard(), async (request, reply) => {
    const { type, id } = request.params;
    if (!ENTITY_TYPES.includes(type)) {
      return reply.code(400).send({ error: `Invalid entity type: ${type}` });
    }
    try {
      const modelName = prismaModelName(type);
      await prisma[modelName].delete({ where: { id } });
      return { deleted: true, type, id };
    } catch (err) {
      if (err?.code === 'P2025') return reply.code(404).send({ error: 'Entity not found' });
      log.error({ err, type, id }, 'entity delete failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.delete('/entities/bulk', guard({
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'object',
              required: ['type', 'id'],
              properties: {
                type: { type: 'string' },
                id: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }), async (request, reply) => {
    const { items } = request.body;
    const invalid = items.filter((i) => !ENTITY_TYPES.includes(i.type));
    if (invalid.length) {
      return reply.code(400).send({ error: `Invalid types: ${invalid.map((i) => i.type).join(', ')}` });
    }
    const deleted = [];
    const errors = [];
    await prisma.$transaction(async (tx) => {
      for (const { type: t, id } of items) {
        try {
          const modelName = prismaModelName(t);
          await tx[modelName].delete({ where: { id } });
          deleted.push({ type: t, id });
        } catch (err) {
          errors.push({ type: t, id, error: err?.code === 'P2025' ? 'not_found' : err.message });
        }
      }
    });
    return { deleted, errors };
  });

  // ── Model overrides (global admin config) ──

  fastify.get('/model-overrides', guard(), async () => {
    return getModelOverrides();
  });

  fastify.put('/model-overrides', guard({
    schema: {
      body: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            openai: { type: 'string' },
            anthropic: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
  }), async (request, reply) => {
    const overrides = request.body;
    const keys = Object.keys(overrides);
    const invalid = keys.filter((k) => !TASK_CATEGORIES.includes(k));
    if (invalid.length) {
      return reply.code(400).send({ error: `Invalid task categories: ${invalid.join(', ')}` });
    }
    await setModelOverrides(overrides);
    return { ok: true, overrides };
  });

  // ── Entity registry moderation ──────────────────────────────────────
  // activate / deactivate / soft-delete / hard-delete for lifecycle-aware
  // entities (WorldNPC, WorldLocation, CustomSpell, WorldItemDefinition).

  const LIFECYCLE_TYPES = ['WorldNPC', 'WorldLocation', 'CustomSpell', 'WorldItemDefinition'];
  const lifecycleModelName = (t) => ({
    WorldNPC: 'worldNPC',
    WorldLocation: 'worldLocation',
    CustomSpell: 'customSpell',
    WorldItemDefinition: 'worldItemDefinition',
  })[t];
  const lifecycleIdField = (t) => (t === 'CustomSpell' ? 'name' : 'id');

  // GET /entity-registry — list lifecycle-aware entities with status filters
  fastify.get('/entity-registry', guard({
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: LIFECYCLE_TYPES },
          active: BOOL_STRING,
          deleted: BOOL_STRING,
          originCampaignId: ID_STRING,
          search: { type: 'string', maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          skip: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }), async (request) => {
    const { type, active, deleted, originCampaignId, search, limit, skip } = request.query;
    const types = type ? [type] : LIFECYCLE_TYPES;
    const results = {};

    for (const t of types) {
      const model = lifecycleModelName(t);
      if (!model) continue;
      const where = {};
      if (active === 'true') where.globallyActive = true;
      if (active === 'false') where.globallyActive = false;
      if (deleted === 'true') where.softDeletedAt = { not: null };
      if (deleted === 'false') where.softDeletedAt = null;
      if (originCampaignId) where.originCampaignId = originCampaignId;
      if (search) {
        const searchFilter = { contains: search, mode: 'insensitive' };
        if (t === 'WorldNPC') where.name = searchFilter;
        else if (t === 'WorldLocation') where.canonicalName = searchFilter;
        else if (t === 'CustomSpell') where.name = searchFilter;
        else if (t === 'WorldItemDefinition') where.displayName = searchFilter;
      }
      const [rows, total] = await Promise.all([
        prisma[model].findMany({ where, take: limit, skip, orderBy: { createdAt: 'desc' } }),
        prisma[model].count({ where }),
      ]);
      results[t] = { rows, total };
    }
    return results;
  });

  // POST /entity-registry/:type/:id/activate
  fastify.post('/entity-registry/:type/:id/activate', guard({
    schema: { params: { type: 'object', properties: { type: { type: 'string', enum: LIFECYCLE_TYPES }, id: { type: 'string', maxLength: 256 } }, required: ['type', 'id'] } },
  }), async (request, reply) => {
    const { type, id } = request.params;
    const model = lifecycleModelName(type);
    if (!model) return reply.code(400).send({ error: 'Invalid type' });
    const idField = lifecycleIdField(type);
    try {
      const row = await prisma[model].update({
        where: { [idField]: id },
        data: { globallyActive: true },
      });
      return { ok: true, row };
    } catch (err) {
      if (err?.code === 'P2025') return reply.code(404).send({ error: 'Not found' });
      throw err;
    }
  });

  // POST /entity-registry/:type/:id/deactivate
  fastify.post('/entity-registry/:type/:id/deactivate', guard({
    schema: { params: { type: 'object', properties: { type: { type: 'string', enum: LIFECYCLE_TYPES }, id: { type: 'string', maxLength: 256 } }, required: ['type', 'id'] } },
  }), async (request, reply) => {
    const { type, id } = request.params;
    const model = lifecycleModelName(type);
    if (!model) return reply.code(400).send({ error: 'Invalid type' });
    const idField = lifecycleIdField(type);
    try {
      const row = await prisma[model].update({
        where: { [idField]: id },
        data: { globallyActive: false },
      });
      return { ok: true, row };
    } catch (err) {
      if (err?.code === 'P2025') return reply.code(404).send({ error: 'Not found' });
      throw err;
    }
  });

  // POST /entity-registry/:type/:id/soft-delete
  fastify.post('/entity-registry/:type/:id/soft-delete', guard({
    schema: { params: { type: 'object', properties: { type: { type: 'string', enum: LIFECYCLE_TYPES }, id: { type: 'string', maxLength: 256 } }, required: ['type', 'id'] } },
  }), async (request, reply) => {
    const { type, id } = request.params;
    const model = lifecycleModelName(type);
    if (!model) return reply.code(400).send({ error: 'Invalid type' });
    const idField = lifecycleIdField(type);
    try {
      const row = await prisma[model].update({
        where: { [idField]: id },
        data: { softDeletedAt: new Date(), globallyActive: false },
      });
      return { ok: true, row };
    } catch (err) {
      if (err?.code === 'P2025') return reply.code(404).send({ error: 'Not found' });
      throw err;
    }
  });

  // POST /entity-registry/:type/:id/restore — undo soft-delete
  fastify.post('/entity-registry/:type/:id/restore', guard({
    schema: { params: { type: 'object', properties: { type: { type: 'string', enum: LIFECYCLE_TYPES }, id: { type: 'string', maxLength: 256 } }, required: ['type', 'id'] } },
  }), async (request, reply) => {
    const { type, id } = request.params;
    const model = lifecycleModelName(type);
    if (!model) return reply.code(400).send({ error: 'Invalid type' });
    const idField = lifecycleIdField(type);
    try {
      const row = await prisma[model].update({
        where: { [idField]: id },
        data: { softDeletedAt: null },
      });
      return { ok: true, row };
    } catch (err) {
      if (err?.code === 'P2025') return reply.code(404).send({ error: 'Not found' });
      throw err;
    }
  });

  // DELETE /entity-registry/:type/:id/hard-delete — permanent with FK guards
  fastify.delete('/entity-registry/:type/:id/hard-delete', guard({
    schema: { params: { type: 'object', properties: { type: { type: 'string', enum: LIFECYCLE_TYPES }, id: { type: 'string', maxLength: 256 } }, required: ['type', 'id'] } },
  }), async (request, reply) => {
    const { type, id } = request.params;
    const model = lifecycleModelName(type);
    if (!model) return reply.code(400).send({ error: 'Invalid type' });
    const idField = lifecycleIdField(type);
    try {
      await prisma[model].delete({ where: { [idField]: id } });
      return { ok: true };
    } catch (err) {
      if (err?.code === 'P2025') return reply.code(404).send({ error: 'Not found' });
      if (err?.code === 'P2003') {
        return reply.code(409).send({
          error: 'Cannot hard-delete: entity has dependent records (FK constraint). Use soft-delete instead.',
          code: 'FK_CONSTRAINT',
        });
      }
      throw err;
    }
  });

  // ── Available fonts (scan public/fonts/) ──

  const __dirnameLW = fileURLToPath(new URL('.', import.meta.url));
  const FONTS_DIR = findFontsDir(__dirnameLW);

  fastify.get('/available-fonts', guard(), async () => {
    let entries;
    try {
      entries = readdirSync(FONTS_DIR);
    } catch {
      return [];
    }
    const results = [];
    for (const entry of entries) {
      const entryPath = join(FONTS_DIR, entry);
      if (!statSync(entryPath).isDirectory()) continue;
      const files = collectTtfFiles(entryPath, entry);
      if (files.length > 0) results.push({ name: entry, files });
    }
    return results;
  });

  // ── Difficulty Scaling config ──

  const DIFFICULTY_SCALE_DEFAULTS = {
    low:    { attrMul: 1.0, woundsMul: 1.0, skillBonus: 0, armourBonus: 0 },
    medium: { attrMul: 1.2, woundsMul: 1.25, skillBonus: 1, armourBonus: 1 },
    high:   { attrMul: 1.4, woundsMul: 1.5, skillBonus: 2, armourBonus: 1 },
    deadly: { attrMul: 1.7, woundsMul: 1.8, skillBonus: 4, armourBonus: 2 },
  };

  const TIER_SCHEMA = {
    type: 'object',
    properties: {
      attrMul:     { type: 'number', minimum: 0.5, maximum: 3.0 },
      woundsMul:   { type: 'number', minimum: 0.5, maximum: 3.0 },
      skillBonus:  { type: 'integer', minimum: 0, maximum: 10 },
      armourBonus: { type: 'integer', minimum: 0, maximum: 5 },
    },
    additionalProperties: false,
  };

  fastify.get('/difficulty-scaling', guard(), async () => {
    const row = await prisma.serverSettings.findUnique({ where: { id: 'singleton' } });
    const raw = (row?.difficultyScaling && typeof row.difficultyScaling === 'object') ? row.difficultyScaling : {};
    const merged = {};
    for (const tier of Object.keys(DIFFICULTY_SCALE_DEFAULTS)) {
      merged[tier] = { ...DIFFICULTY_SCALE_DEFAULTS[tier], ...(raw[tier] || {}) };
    }
    return merged;
  });

  fastify.put('/difficulty-scaling', guard({
    schema: {
      body: {
        type: 'object',
        properties: {
          low: TIER_SCHEMA,
          medium: TIER_SCHEMA,
          high: TIER_SCHEMA,
          deadly: TIER_SCHEMA,
        },
        additionalProperties: false,
      },
    },
  }), async (request) => {
    const row = await prisma.serverSettings.findUnique({ where: { id: 'singleton' } });
    const current = (row?.difficultyScaling && typeof row.difficultyScaling === 'object') ? row.difficultyScaling : {};

    const updated = { ...current };
    for (const tier of Object.keys(DIFFICULTY_SCALE_DEFAULTS)) {
      if (request.body[tier]) {
        updated[tier] = { ...(current[tier] || {}), ...request.body[tier] };
      }
    }

    await prisma.serverSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', difficultyScaling: updated },
      update: { difficultyScaling: updated },
    });

    // Invalidate in-memory cache
    const { invalidateDifficultyScalingCache } = await import('../services/difficultyScalingConfig.js');
    invalidateDifficultyScalingCache();

    const merged = {};
    for (const tier of Object.keys(DIFFICULTY_SCALE_DEFAULTS)) {
      merged[tier] = { ...DIFFICULTY_SCALE_DEFAULTS[tier], ...(updated[tier] || {}) };
    }
    return merged;
  });
}

function collectTtfFiles(dir, baseName, prefix = '') {
  const results = [];
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    if (statSync(full).isDirectory()) {
      results.push(...collectTtfFiles(full, baseName, prefix ? `${prefix}/${item}` : item));
    } else if (item.endsWith('.ttf')) {
      results.push(prefix ? `${prefix}/${item}` : item);
    }
  }
  return results;
}

function findFontsDir(fromDir) {
  // Docker/prod: fonts baked into public/dist/fonts by Vite build
  const dockerPath = resolve(fromDir, '..', '..', 'public', 'dist', 'fonts');
  // Host dev: repo root public/fonts
  const hostPath = resolve(fromDir, '..', '..', '..', 'public', 'fonts');
  try { statSync(dockerPath); return dockerPath; } catch { /* noop */ }
  try { statSync(hostPath); return hostPath; } catch { /* noop */ }
  return hostPath;
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

function prismaModelName(entityType) {
  const map = {
    WorldNPC: 'worldNPC',
    WorldLocation: 'worldLocation',
    Road: 'road',
    CampaignNPC: 'campaignNPC',
    CampaignLocation: 'campaignLocation',
    CampaignEdge: 'campaignEdge',
    CampaignQuest: 'campaignQuest',
    Character: 'character',
  };
  return map[entityType] || entityType;
}

function normalizeEntity(type, row) {
  switch (type) {
    case 'WorldNPC':
      return { id: row.id, type, name: row.name, status: row.alive ? 'alive' : 'dead', details: row.role || '', source: 'world', campaignName: null };
    case 'WorldLocation':
      return { id: row.id, type, name: row.canonicalName, status: row.locationType, details: row.region || '', source: 'world', campaignName: null, parentId: row.parentLocationId };
    case 'Road':
      return { id: row.id, type, name: `${row.from?.canonicalName || '?'} ↔ ${row.to?.canonicalName || '?'}`, status: row.terrainType, details: `${row.distance || '?'} km`, source: 'world', campaignName: null };
    case 'CampaignNPC':
      return { id: row.id, type, name: row.name, status: row.alive ? 'alive' : 'dead', details: row.worldNpcId ? 'linked' : 'ephemeral', source: 'campaign', campaignId: row.campaignId, campaignName: row.campaign?.name || null };
    case 'CampaignLocation':
      return { id: row.id, type, name: row.name, status: row.locationType, details: '', source: 'campaign', campaignId: row.campaignId, campaignName: row.campaign?.name || null };
    case 'CampaignEdge':
      return { id: row.id, type, name: `${row.fromKind}:${row.fromId} ↔ ${row.toKind}:${row.toId}`, status: row.relationType, details: row.distance ? `${row.distance} km` : row.visibility, source: 'campaign', campaignId: row.campaignId, campaignName: row.campaign?.name || null };
    case 'CampaignQuest':
      return { id: row.id, type, name: row.name, status: row.status, details: row.type || '', source: 'campaign', campaignId: row.campaignId, campaignName: row.campaign?.name || null };
    case 'Character':
      return { id: row.id, type, name: row.name, status: `Lv.${row.characterLevel || 1}`, details: row.species || '', source: 'world', campaignName: row.lockedCampaignName || null };
    default:
      return { id: row.id, type, name: row.name || row.id, status: '', details: '', source: 'unknown', campaignName: null };
  }
}
