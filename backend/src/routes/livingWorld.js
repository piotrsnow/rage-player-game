// Living World player-facing REST routes (Phase 2).
//
// Covers three families:
//   /companions/:worldNpcId/join   — atomic CAS claim
//   /companions/:worldNpcId/leave  — flush outbox + release lock
//   /companions                    — list for a campaign
//   /npc-dialog/:worldNpcId        — C2 1-on-1 reply (bypasses scene-gen)
//
// All routes require JWT auth + verify the caller owns the referenced
// campaign before acting on its companions.

import { createHash } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import {
  joinParty,
  leaveParty,
  getCompanions,
} from '../services/livingWorld/companionService.js';
import { generate as generateNpcDialog } from '../services/livingWorld/npcDialog.js';
import { listLocationsForCampaign } from '../services/livingWorld/locationQueries.js';
import { loadCampaignFog } from '../services/livingWorld/userDiscoveryService.js';
import { loadUserApiKeys } from '../services/apiKeyService.js';
import {
  loadCampaignGraph,
  createEdge,
  updateEdge,
  deactivateEdge,
  getNodeByRef,
} from '../services/locationGraph/graphService.js';
import {
  defaultLengthKmBetweenScales,
  directionDegForChildIndex,
  normalizeDirectionDeg,
} from '../../../shared/domain/locationGraphLayout.js';
import { EDGE_TYPES, safeValidateTacticalGrid } from '../../../shared/domain/locationGraph.js';
import { findSimilarNodeImage } from '../services/locationGraph/imageMatcher.js';
import { generatePixelSprite, scaleToSpriteSize } from '../services/pixelLabClient.js';
import { buildPixelSpriteDescription } from '../services/pixelLabSpritePrompt.js';
import { createMediaStore } from '../services/mediaStore.js';
import { config } from '../config.js';
import { callAIJson } from '../services/aiJsonCall.js';
import { reviseGraph } from '../services/locationGraph/graphRevisionService.js';
import { ensureCharacterSpritesBatch, MAX_CHARACTER_SPRITE_BATCH } from '../services/characterSpriteService.js';
import {
  appendCampaignNpcLocationMovement,
  NPC_LOCATION_MOVE_SOURCE_GRAPH,
} from '../services/livingWorld/campaignNpcLocationMovement.js';

const log = childLogger({ module: 'livingWorldRoutes' });

/**
 * Build a Prisma-ready patch for WorldLocation from the PUT body.
 * WorldLocation only supports position + visual fields from the player endpoint.
 */
export function buildWorldLocationPatch(b) {
  const data = {};
  if (b.regionX !== undefined) data.regionX = b.regionX;
  if (b.regionY !== undefined) data.regionY = b.regionY;
  if (b.scale !== undefined) data.scale = b.scale;
  if (b.shape !== undefined) data.nodeShape = b.shape || null;
  if (b.icon !== undefined) data.nodeIcon = b.icon || null;
  if (b.nodeImageUrl !== undefined) data.nodeImageUrl = b.nodeImageUrl || null;
  return data;
}

async function assertCampaignOwnership(request, reply, campaignId) {
  if (!campaignId || typeof campaignId !== 'string') {
    reply.code(400).send({ error: 'campaignId is required' });
    return false;
  }
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, userId: true, livingWorldEnabled: true },
  });
  if (!campaign || campaign.userId !== request.user.id) {
    reply.code(404).send({ error: 'Campaign not found' });
    return false;
  }
  if (!campaign.livingWorldEnabled) {
    reply.code(400).send({ error: 'Living World is not enabled for this campaign' });
    return false;
  }
  return campaign;
}

export async function livingWorldRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // POST /companions/:worldNpcId/join
  fastify.post('/companions/:worldNpcId/join', {
    schema: {
      params: {
        type: 'object',
        properties: { worldNpcId: { type: 'string', minLength: 1 } },
        required: ['worldNpcId'],
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['campaignId'],
        properties: {
          campaignId: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { worldNpcId } = request.params;
    const { campaignId } = request.body;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;

    const result = await joinParty({
      worldNpcId,
      campaignId,
      userId: request.user.id,
    });
    if (!result.success) {
      const code = result.reason === 'not_found' ? 404 : result.reason === 'already_locked' ? 409 : 400;
      return reply.code(code).send({ error: result.reason });
    }
    return reply.send({ ok: true, npc: result.npc });
  });

  // POST /companions/:worldNpcId/leave
  fastify.post('/companions/:worldNpcId/leave', {
    schema: {
      params: {
        type: 'object',
        properties: { worldNpcId: { type: 'string', minLength: 1 } },
        required: ['worldNpcId'],
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['campaignId'],
        properties: {
          campaignId: { type: 'string', minLength: 1 },
          reason: { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { worldNpcId } = request.params;
    const { campaignId, reason } = request.body;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;

    const result = await leaveParty({
      worldNpcId,
      campaignId,
      reason: reason || 'manual',
      userId: request.user.id,
    });
    if (!result.success) {
      const code = result.reason === 'not_found' ? 404 : result.reason === 'not_owner' ? 403 : 500;
      return reply.code(code).send({ error: result.reason });
    }
    return reply.send({
      ok: true,
      alreadyReleased: !!result.alreadyReleased,
      replayed: result.replayed || 0,
      finalState: result.finalState || null,
    });
  });

  // GET /companions?campaignId=...
  fastify.get('/companions', {
    schema: {
      querystring: {
        type: 'object',
        required: ['campaignId'],
        properties: { campaignId: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    const campaignId = request.query.campaignId;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;
    const companions = await getCompanions(campaignId);
    return reply.send({ companions });
  });

  // GET /campaigns/:id/map — unified payload for the player world map
  // (Round C Phase 6). Merges canonical + campaign-specific locations, fog
  // state, edges, and resolves the player's current location to an id by
  // exact-matching coreState.world.currentLocation against displayName /
  // canonicalName. Mismatch → null + warn log (the tile-grid simply doesn't
  // pulse; safer than heuristic fuzzy match).
  fastify.get('/campaigns/:id/map', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    const campaignId = request.params.id;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;

    const [locations, fog, full] = await Promise.all([
      listLocationsForCampaign(campaignId, {
        // F5b — listLocationsForCampaign merges canonical WorldLocation +
        // per-campaign CampaignLocation; each row carries `kind` + a
        // normalized `displayName`. We omit `select` to take both shapes
        // wholesale; merge happens in locationQueries.
      }),
      loadCampaignFog({ userId: request.user.id, campaignId }),
      prisma.campaign.findUnique({
        where: { id: campaignId },
        // F5 — currentLocation lifted out of coreState into its own column.
        // F5b — polymorphic FK trio (kind + id + name) is BE-authoritative.
        // F5d — currentX/Y carry the player's continuous position when they
        // wander off the POI graph (free-vector movement: "1 km na północ").
        select: {
          coreState: true,
          currentLocationName: true,
          currentLocationId: true,
          currentX: true,
          currentY: true,
        },
      }),
    ]);

    // F5b — Roads connect canonical WorldLocation only. Filter the locations
    // list down to canonical IDs before querying so we don't ask Postgres for
    // edges involving CampaignLocation IDs (no rows would match anyway).
    const canonicalIds = locations.filter((l) => l.kind === 'world').map((l) => l.id);
    const edges = canonicalIds.length === 0 ? [] : await prisma.road.findMany({
      where: {
        fromLocationId: { in: canonicalIds },
        toLocationId: { in: canonicalIds },
      },
      select: {
        id: true, fromLocationId: true, toLocationId: true,
        terrainType: true, difficulty: true, direction: true, gated: true,
      },
    });

    // F5b — polymorphic FK is BE-authoritative; prefer it over the legacy
    // name-match lookup (which silently misses when displayName or aliases
    // drift). Name-match remains as a fallback for old rows / flavor names
    // that didn't resolve at write time.
    const core = full?.coreState || {};
    const currentName = full?.currentLocationName || core?.world?.currentLocation || null;
    let currentLocationId = full?.currentLocationId || null;
    if (!currentLocationId && currentName) {
      const match = locations.find(
        (l) => l.displayName === currentName || l.canonicalName === currentName
      );
      if (match) currentLocationId = match.id;
      else log.warn({ campaignId, currentName }, 'currentLocation name has no row match (and no FK)');
    }

    // NOTE: we intentionally do NOT return Campaign.worldBounds. The player
    // map is a global -10..10 grid (canonical world is the same across all
    // campaigns). `worldBounds` is a per-campaign AI/seeder placement
    // guardrail, not the viewport range. See knowledge/concepts/living-world.md.
    const payload = {
      locations,
      edges,
      fog: {
        visited: [...fog.visited],
        heardAbout: [...fog.heardAbout],
        discoveredEdgeIds: [...fog.discoveredEdgeIds],
        discoveredSubLocationIds: [...fog.discoveredSubLocationIds],
      },
      currentLocationId,
      // FE banner fallback when the player is in wilderness (no row match):
      // `currentLocationId=null` + `currentLocationName='Las'` → render banner
      // instead of pin. Always include the name so the FE never has to guess
      // which kind of "no pin" state it's in.
      currentLocationName: currentName || null,
      // F5d — continuous (km-scale) position. Set when player walks off the
      // POI graph via free-vector movement; null when anchored at a POI
      // (caller derives position from currentLocation* in that case).
      currentX: typeof full?.currentX === 'number' ? full.currentX : null,
      currentY: typeof full?.currentY === 'number' ? full.currentY : null,
    };

    // ETag based on the full serialized payload. The map is small (~5 KB for
    // heartland) so hashing the JSON is cheap and removes the risk of false
    // hits from a coarser fingerprint (e.g. one that only counted entries).
    // FE caches by ETag and sends `If-None-Match`; we answer 304 when nothing
    // material changed between scenes — most idle/talk/combat turns.
    const body = JSON.stringify(payload);
    const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).header('etag', etag).send();
    }
    reply.header('etag', etag);
    return reply.send(payload);
  });

  // GET /campaigns/:id/location-digests — per-location scene digests for GM panel
  fastify.get('/campaigns/:id/location-digests', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    const campaignId = request.params.id;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;

    const rows = await prisma.campaignLocationSummary.findMany({
      where: { campaignId },
      select: {
        locationName: true,
        sceneDigests: true,
        summary: true,
        sceneCount: true,
        keyNpcs: true,
      },
    });

    const digests = {};
    for (const row of rows) {
      digests[row.locationName] = {
        sceneDigests: Array.isArray(row.sceneDigests) ? row.sceneDigests : [],
        summary: row.summary,
        sceneCount: row.sceneCount,
        keyNpcs: Array.isArray(row.keyNpcs) ? row.keyNpcs : [],
      };
    }

    return reply.send({ digests });
  });

  // GET /campaigns/:id/location-detail?locationName=... — single-location summary + scene timeline
  fastify.get('/campaigns/:id/location-detail', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', minLength: 1 } },
      },
      querystring: {
        type: 'object',
        required: ['locationName'],
        properties: { locationName: { type: 'string', minLength: 1, maxLength: 200 } },
      },
    },
  }, async (request, reply) => {
    const campaignId = request.params.id;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;

    const { locationName } = request.query;

    const summary = await prisma.campaignLocationSummary.findUnique({
      where: { campaignId_locationName: { campaignId, locationName } },
      select: {
        locationName: true,
        summary: true,
        sceneDigests: true,
        keyNpcs: true,
        unresolvedHooks: true,
        sceneCount: true,
        lastVisitScene: true,
      },
    });

    if (!summary) {
      return reply.send({
        locationName,
        summary: '',
        sceneDigests: [],
        keyNpcs: [],
        unresolvedHooks: [],
        sceneCount: 0,
        lastVisitScene: 0,
        scenes: [],
      });
    }

    const digests = Array.isArray(summary.sceneDigests) ? summary.sceneDigests : [];
    const sceneIndices = digests.map((d) => d.sceneNum).filter((n) => typeof n === 'number');

    let scenes = [];
    if (sceneIndices.length > 0) {
      const rows = await prisma.campaignScene.findMany({
        where: { campaignId, sceneIndex: { in: sceneIndices } },
        select: { sceneIndex: true, chosenAction: true, narrative: true, imageUrl: true, createdAt: true },
        orderBy: { sceneIndex: 'asc' },
      });
      scenes = rows.map((r) => ({
        sceneIndex: r.sceneIndex,
        chosenAction: r.chosenAction || null,
        narrativePreview: r.narrative ? r.narrative.slice(0, 150) : '',
        imageUrl: r.imageUrl || null,
        createdAt: r.createdAt,
      }));
    }

    return reply.send({
      locationName: summary.locationName,
      summary: summary.summary || '',
      sceneDigests: digests,
      keyNpcs: Array.isArray(summary.keyNpcs) ? summary.keyNpcs : [],
      unresolvedHooks: Array.isArray(summary.unresolvedHooks) ? summary.unresolvedHooks : [],
      sceneCount: summary.sceneCount || 0,
      lastVisitScene: summary.lastVisitScene || 0,
      scenes,
    });
  });

  // POST /campaigns/:id/travel-check — nano AI decides if distant travel is feasible
  fastify.post('/campaigns/:id/travel-check', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        required: ['destinationName'],
        properties: {
          destinationName: { type: 'string', maxLength: 200, minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;

    const { destinationName } = request.body;

    const campaignFull = await prisma.campaign.findUnique({
      where: { id: request.params.id },
      select: {
        currentLocationName: true,
        coreState: true,
      },
    });

    const currentLoc = campaignFull?.currentLocationName || campaignFull?.coreState?.world?.currentLocation || 'nieznana';
    const worldState = campaignFull?.coreState?.world || {};
    const timeOfDay = worldState.timeState?.timeOfDay || 'dzień';
    const day = worldState.timeState?.day || 1;

    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);

    const systemPrompt = `Jesteś narratorem gry RPG. Gracz chce odbyć daleką podróż z "${currentLoc}" do "${destinationName}". Zdecyduj czy ta podróż jest teraz możliwa. Uwzględnij: odległość, porę dnia (${timeOfDay}), dzień kampanii (${day}), potencjalne zagrożenia na drodze, logikę narracyjną. Jeśli podróż NIE jest możliwa, podaj zabawny, kolorowy powód dlaczego (np. smok blokuje drogę, most się zawalił, ktoś ukradł buty gracza). Odpowiedz TYLKO valid JSON: {"allowed": true/false, "reason": "krótki opis"}`;

    const userPrompt = `Gracz w lokacji "${currentLoc}" chce podróżować do "${destinationName}". Pora: ${timeOfDay}, dzień ${day}. Czy może teraz tam dotrzeć?`;

    try {
      const { text } = await callAIJson({
        provider: 'openai',
        modelTier: 'nano',
        taskCategory: 'travelCheck',
        systemPrompt,
        userPrompt,
        maxTokens: 200,
        temperature: 0.9,
        userApiKeys,
        userId: request.user?.id,
        taskType: 'travel_check',
        taskLabel: `travel-check: ${currentLoc} → ${destinationName}`,
      });

      let parsed;
      try {
        parsed = JSON.parse(text.trim());
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : { allowed: true, reason: '' };
      }

      return reply.send({
        allowed: !!parsed.allowed,
        reason: parsed.reason || '',
      });
    } catch (err) {
      log.warn({ err }, 'travel-check AI call failed, allowing travel as fallback');
      return reply.send({ allowed: true, reason: '' });
    }
  });

  // GET /campaigns/:id/location-graph — graph view for the frontend modal
  fastify.get('/campaigns/:id/location-graph', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          focusKind: { type: 'string', enum: ['world', 'campaign'] },
          focusId: { type: 'string', format: 'uuid' },
          hops: { type: 'integer', minimum: 1, maximum: 5, default: 2 },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const { focusKind, focusId, hops = 2 } = request.query;
    let resolvedFocusKind = focusKind || null;
    let resolvedFocusId = focusId || null;
    if (!resolvedFocusKind || !resolvedFocusId) {
      const full = await prisma.campaign.findUnique({
        where: { id: request.params.id },
        select: { currentLocationId: true },
      });
      resolvedFocusKind = resolvedFocusKind || null;
      resolvedFocusId = resolvedFocusId || full?.currentLocationId || null;
    }
    const { nodes, edges } = await loadCampaignGraph(request.params.id, {
      focusKind: resolvedFocusKind,
      focusId: resolvedFocusId,
      hops,
    });

    const nodeList = [];
    const seenNodeIds = new Set();
    for (const [key, node] of nodes) {
      nodeList.push({
        id: node.id,
        kind: node._kind,
        name: node.canonicalName || node.displayName || node.name,
        type: node.locationType || 'generic',
        scale: node.scale ?? 5,
        tags: node.tags || [],
        atmosphere: node.atmosphere || null,
        description: node.description || null,
        biome: node.biome || null,
        region: node.region || null,
        visitCount: node.visitCount ?? 0,
        dangerLevel: node.dangerLevel || 'safe',
        regionX: node.regionX ?? 0,
        regionY: node.regionY ?? 0,
        nodeShape: node.nodeShape || null,
        nodeIcon: node.nodeIcon || null,
        nodeImageUrl: node.nodeImageUrl || null,
      });
      seenNodeIds.add(node.id);
    }

    // Surface CampaignLocations that aren't reached by the focused subgraph
    // traversal — newly-created nodes have no edges yet, so without this they
    // would be invisible in the modal even though they exist in DB.
    const orphanCampaignLocs = await prisma.location.findMany({
      where: { campaignId: request.params.id, id: { notIn: [...seenNodeIds] } },
      select: {
        id: true, displayName: true, locationType: true, scale: true, tags: true,
        atmosphere: true, description: true, biome: true, region: true,
        visitCount: true, dangerLevel: true, regionX: true, regionY: true,
        nodeShape: true, nodeIcon: true, nodeImageUrl: true,
      },
    });
    for (const node of orphanCampaignLocs) {
      nodeList.push({
        id: node.id,
        kind: 'campaign',
        name: node.displayName,
        type: node.locationType || 'generic',
        scale: node.scale ?? 5,
        tags: node.tags || [],
        atmosphere: node.atmosphere || null,
        description: node.description || null,
        biome: node.biome || null,
        region: node.region || null,
        visitCount: node.visitCount ?? 0,
        dangerLevel: node.dangerLevel || 'safe',
        regionX: node.regionX ?? 0,
        regionY: node.regionY ?? 0,
        nodeShape: node.nodeShape || null,
        nodeIcon: node.nodeIcon || null,
        nodeImageUrl: node.nodeImageUrl || null,
      });
    }

    const edgeList = edges.map((e) => ({
      id: e.id,
      fromLocationId: e.fromLocationId,
      toLocationId: e.toLocationId,
      edgeType: e.edgeType,
      category: e.category,
      bidirectional: e.bidirectional,
      weight: e.weight,
      metadata: e.metadata,
      discoveryState: e.discoveryState,
      createdBy: e.createdBy,
    }));

    // Faction overlay — extract from social edges (controlled_by, patrolled_by, contested_between)
    const FACTION_EDGE_TYPES = new Set(['controlled_by', 'patrolled_by', 'contested_between']);
    const factionOverlay = edges
      .filter((e) => e.category === 'social' && FACTION_EDGE_TYPES.has(e.edgeType))
      .map((e) => ({
        locationId: e.fromLocationId,
        locationKind: 'world',
        factionId: e.metadata?.factionId || null,
        factionName: e.metadata?.factionName || e.metadata?.factionId || null,
        strength: e.metadata?.strength ?? 50,
        type: e.edgeType,
        color: e.metadata?.color || null,
      }))
      .filter((f) => f.factionId);

    // Occupants overlay — NPCs + player characters positioned at graph nodes
    const campaignId = request.params.id;
    const [campaignNpcs, campaignFull, latestScene] = await Promise.all([
      prisma.npc.findMany({
        where: { campaignId, currentLocationId: { not: null } },
        select: {
          id: true, name: true, role: true, category: true,
          currentLocationId: true,
          lastInteractionSceneIndex: true,
          spriteUrl: true, spriteSheetUrl: true,
        },
      }),
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          currentLocationId: true,
          participants: {
            select: { character: { select: { id: true, name: true, species: true, spriteUrl: true, spriteSheetUrl: true } } },
          },
        },
      }),
      prisma.campaignScene.findFirst({
        where: { campaignId },
        orderBy: { sceneIndex: 'desc' },
        select: { sceneIndex: true },
      }),
    ]);

    const latestSceneIndex = latestScene?.sceneIndex ?? null;
    const campLocId = campaignFull?.currentLocationId;

    const occupants = [];
    for (const npc of campaignNpcs) {
      let locId = npc.currentLocationId;
      if (latestSceneIndex != null && campLocId
          && npc.lastInteractionSceneIndex === latestSceneIndex
          && locId !== campLocId) {
        locId = campLocId;
      }
      occupants.push({
        id: npc.id,
        name: npc.name,
        type: 'npc',
        role: npc.role,
        category: npc.category,
        locationId: locId,
        spriteUrl: npc.spriteUrl || null,
        spriteSheetUrl: npc.spriteSheetUrl || null,
      });
    }
    if (campaignFull?.currentLocationId) {
      for (const p of campaignFull.participants || []) {
        occupants.push({
          id: p.character.id,
          name: p.character.name,
          type: 'player',
          species: p.character.species,
          locationKind: 'world',
          locationId: campaignFull.currentLocationId,
          spriteUrl: p.character.spriteUrl || null,
          spriteSheetUrl: p.character.spriteSheetUrl || null,
        });
      }
    }

    return reply.send({ nodes: nodeList, edges: edgeList, factionOverlay, occupants });
  });

  // GET /campaigns/:id/location-graph/npcs/:npcId/details — inspector modal + movement history
  fastify.get('/campaigns/:id/location-graph/npcs/:npcId/details', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'npcId'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          npcId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const campaignId = request.params.id;
    const npcId = request.params.npcId;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;
    const limit = request.query.limit ?? 100;

    const npcRow = await prisma.npc.findFirst({
      where: { id: npcId, campaignId },
      select: {
        id: true, name: true, npcId: true,
        gender: true, role: true, personality: true, alignment: true,
        appearance: true, category: true, alive: true, level: true,
        race: true, creatureKind: true, portraitUrl: true, spriteUrl: true,
        stats: true, disposition: true,
        lastLocation: true, currentLocationId: true,
        lastInteractionAt: true, lastInteractionSceneIndex: true,
      },
    });
    if (!npcRow) {
      return reply.code(404).send({ error: 'NPC not found' });
    }

    const [movements, experienceRows] = await Promise.all([
      prisma.npcLocationMovement.findMany({
        where: { npcId },
        orderBy: { movedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          fromLocationId: true,
          toLocationId: true,
          source: true,
          sceneIndex: true,
          movedAt: true,
        },
      }),
      prisma.npcExperience.findMany({
        where: { npcId },
        orderBy: { addedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          content: true,
          importance: true,
          sceneIndex: true,
          addedAt: true,
        },
      }),
    ]);

    const movementLocationIds = new Set();
    for (const m of movements) {
      if (m.fromLocationId) movementLocationIds.add(m.fromLocationId);
      if (m.toLocationId) movementLocationIds.add(m.toLocationId);
    }
    const movementLocRows = movementLocationIds.size > 0
      ? await prisma.location.findMany({
          where: { id: { in: [...movementLocationIds] } },
          select: { id: true, canonicalName: true, displayName: true },
        })
      : [];
    const nameById = new Map();
    for (const loc of movementLocRows) nameById.set(loc.id, loc.displayName || loc.canonicalName);

    const movementsOut = movements.map((m) => ({
      ...m,
      movedAt: m.movedAt.toISOString(),
      fromName: m.fromLocationId ? (nameById.get(m.fromLocationId) || m.fromLocationId) : null,
      toName: m.toLocationId ? (nameById.get(m.toLocationId) || m.toLocationId) : null,
    }));

    const npc = {
      ...npcRow,
      attitude: npcRow.alignment,
      lastInteractionAt: npcRow.lastInteractionAt ? npcRow.lastInteractionAt.toISOString() : null,
    };

    const interactions = experienceRows.map((e) => ({
      id: String(e.id),
      content: e.content,
      importance: e.importance || 'minor',
      sceneIndex: e.sceneIndex ?? null,
      addedAt: e.addedAt.toISOString(),
    }));

    return reply.send({ npc, movements: movementsOut, interactions });
  });

  // POST /campaigns/:id/character-sprites/generate — PixelLab map tokens for graph occupants
  fastify.post('/campaigns/:id/character-sprites/generate', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
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
                kind: { type: 'string', enum: ['campaign-npc', 'character'] },
                id: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const campaignId = request.params.id;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;

    // No pixellab gate — service prefers chargen compositor (filesystem assets,
    // no external API) and only falls back to PixelLab if chargen fails.

    const { items, force } = request.body;
    const userId = request.user.id;

    const validated = [];
    for (const item of items) {
      if (item.kind === 'campaign-npc') {
        const row = await prisma.npc.findFirst({
          where: { id: item.id, campaignId },
          select: { id: true },
        });
        if (row) validated.push(item);
      } else if (item.kind === 'character') {
        const row = await prisma.campaignParticipant.findFirst({
          where: { campaignId, characterId: item.id },
          select: { characterId: true },
        });
        if (row) validated.push(item);
      }
    }

    const sprites = await ensureCharacterSpritesBatch(validated, {
      userId,
      campaignId,
      force: !!force,
    });

    return reply.send({ sprites });
  });

  // ── Location Graph CRUD (Phase 2) ──────────────────────────────────

  const campaignIdParam = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  };

  // POST /campaigns/:id/location-graph/nodes
  fastify.post('/campaigns/:id/location-graph/nodes', {
    schema: {
      params: campaignIdParam,
      body: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          type: { type: 'string', maxLength: 40 },
          description: { type: 'string', maxLength: 500 },
          tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 10 },
          scale: { type: 'integer', minimum: 0, maximum: 7 },
          atmosphere: { type: 'string', maxLength: 200 },
          dangerLevel: { type: 'string', maxLength: 20 },
          parentKind: { type: 'string', enum: ['world', 'campaign'] },
          parentId: { type: 'string', format: 'uuid' },
          shape: { type: ['string', 'null'], maxLength: 40 },
          icon: { type: ['string', 'null'], maxLength: 60 },
          nodeImageUrl: { type: ['string', 'null'], maxLength: 500 },
          // Faza 0 — nowe pola metadane na nodzie.
          biome: { type: ['string', 'null'], maxLength: 40 },
          anchorType: { type: ['string', 'null'], maxLength: 40 },
          tacticalGrid: { type: ['object', 'null'] },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const b = request.body;
    let node;
    try {
      node = await prisma.location.create({
        data: {
          campaignId: request.params.id,
          displayName: b.name,
          description: b.description || '',
          locationType: b.type || 'generic',
          tags: b.tags || [],
          scale: b.scale ?? 5,
          atmosphere: b.atmosphere || null,
          dangerLevel: b.dangerLevel || 'safe',
          parentLocationKind: b.parentKind || null,
          parentLocationId: b.parentId || null,
          nodeShape: b.shape || null,
          nodeIcon: b.icon || null,
          nodeImageUrl: b.nodeImageUrl || null,
          biome: b.biome || null,
          anchorType: b.anchorType || null,
          tacticalGrid: b.tacticalGrid ?? null,
        },
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        return reply.code(409).send({
          error: 'duplicate_name',
          message: `Lokacja o nazwie "${b.name}" już istnieje w tej kampanii. Wybierz inną nazwę.`,
        });
      }
      throw err;
    }

    // Auto-link to parent in the graph so the new node shows up in the
    // hierarchy tree (HierarchyTree filters strictly on edgeType='contains').
    // Works for both canonical (world) and sandbox (campaign) parents.
    if (b.parentKind && b.parentId) {
      try {
        const parentRow = await getNodeByRef(b.parentKind, b.parentId);
        const parentScale = parentRow?.scale ?? 5;
        const siblingIndex = await prisma.locationEdge.count({
          where: {
            isActive: true,
            edgeType: 'contains',
            fromLocationId: b.parentId,
            OR: [{ campaignId: null }, { campaignId: request.params.id }],
          },
        });
        const directionDeg = directionDegForChildIndex(siblingIndex);
        const lengthKm = defaultLengthKmBetweenScales(parentScale, node.scale ?? 5);
        await createEdge({
          fromLocationId: b.parentId,
          toLocationId: node.id,
          edgeType: 'contains',
          category: 'structural',
          bidirectional: false,
          weight: 1.0,
          metadata: { directionDeg, lengthKm },
          discoveryState: 'known',
          campaignId: request.params.id,
          createdBy: 'admin',
        });
      } catch (edgeErr) {
        // Non-fatal — node exists; user can wire the edge manually if needed.
        log.warn({ err: edgeErr, nodeId: node.id, parentKind: b.parentKind, parentId: b.parentId },
          'Failed to auto-create contains edge for new node');
      }
    }

    let matchedImageUrl = node.nodeImageUrl || null;
    if (!b.nodeImageUrl) {
      const url = await findSimilarNodeImage({
        locationType: b.type || 'generic',
        biome: b.biome || null,
        tags: b.tags || [],
      });
      if (url) {
        await prisma.location.update({
          where: { id: node.id },
          data: { nodeImageUrl: url },
        });
        matchedImageUrl = url;
      }
    }

    return reply.code(201).send({ node: { id: node.id, kind: 'campaign', name: node.displayName, nodeImageUrl: matchedImageUrl } });
  });

  // PUT /campaigns/:id/location-graph/nodes/:nodeId
  fastify.put('/campaigns/:id/location-graph/nodes/:nodeId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'nodeId'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          nodeId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          description: { type: 'string', maxLength: 500 },
          tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 10 },
          atmosphere: { type: 'string', maxLength: 200 },
          dangerLevel: { type: 'string', maxLength: 20 },
          scale: { type: 'integer', minimum: 0, maximum: 7 },
          shape: { type: ['string', 'null'], maxLength: 40 },
          icon: { type: ['string', 'null'], maxLength: 60 },
          nodeImageUrl: { type: ['string', 'null'], maxLength: 500 },
          // Faza 0 — nowe pola metadane na nodzie.
          biome: { type: ['string', 'null'], maxLength: 40 },
          anchorType: { type: ['string', 'null'], maxLength: 40 },
          tacticalGrid: { type: ['object', 'null'] },
          dungeonState: { type: ['object', 'null'] },
          regionX: { type: 'number' },
          regionY: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const { nodeId } = request.params;
    const b = request.body;

    let updated = null;
    const campaignLoc = await prisma.location.findFirst({
      where: { id: nodeId, campaignId: request.params.id },
    });
    if (campaignLoc) {
      const data = {};
      if (b.name !== undefined) { data.displayName = b.name; }
      if (b.description !== undefined) data.description = b.description;
      if (b.tags !== undefined) data.tags = b.tags;
      if (b.atmosphere !== undefined) data.atmosphere = b.atmosphere;
      if (b.dangerLevel !== undefined) data.dangerLevel = b.dangerLevel;
      if (b.scale !== undefined) data.scale = b.scale;
      if (b.shape !== undefined) data.nodeShape = b.shape || null;
      if (b.icon !== undefined) data.nodeIcon = b.icon || null;
      if (b.nodeImageUrl !== undefined) data.nodeImageUrl = b.nodeImageUrl || null;
      if (b.biome !== undefined) data.biome = b.biome || null;
      if (b.anchorType !== undefined) data.anchorType = b.anchorType || null;
      if (b.tacticalGrid !== undefined) {
        if (b.tacticalGrid === null) {
          data.tacticalGrid = null;
        } else {
          const r = safeValidateTacticalGrid(b.tacticalGrid);
          if (!r.success) {
            return reply.code(400).send({ error: 'invalid_tactical_grid', detail: r.error?.errors });
          }
          data.tacticalGrid = b.tacticalGrid;
        }
      }
      if (b.dungeonState !== undefined) data.dungeonState = b.dungeonState ?? null;
      if (b.regionX !== undefined) data.regionX = b.regionX;
      if (b.regionY !== undefined) data.regionY = b.regionY;
      if (Object.keys(data).length > 0) {
        updated = await prisma.location.update({ where: { id: nodeId }, data });
      }
    }
    if (!updated) {
      const worldLoc = await prisma.location.findFirst({
        where: { id: nodeId },
      });
      if (worldLoc) {
        const data = buildWorldLocationPatch(b);
        if (Object.keys(data).length > 0) {
          updated = await prisma.location.update({ where: { id: nodeId }, data });
        }
      }
    }
    if (!updated) return reply.code(404).send({ error: 'Node not found or not editable' });
    return reply.send({ ok: true });
  });

  // DELETE /campaigns/:id/location-graph/nodes/:nodeId (soft-delete via deactivating edges)
  fastify.delete('/campaigns/:id/location-graph/nodes/:nodeId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'nodeId'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          nodeId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const { nodeId } = request.params;

    // Deactivate all edges connected to this node
    await prisma.locationEdge.updateMany({
      where: {
        isActive: true,
        OR: [
          { fromLocationId: nodeId },
          { toLocationId: nodeId },
        ],
      },
      data: { isActive: false },
    });

    // Mark the CampaignLocation as inactive if it exists
    const cl = await prisma.location.findFirst({
      where: { id: nodeId, campaignId: request.params.id },
    });
    if (cl) {
      await prisma.location.update({
        where: { id: nodeId },
        data: { description: `[DEACTIVATED] ${cl.description || ''}` },
      });
    }
    return reply.send({ ok: true });
  });

  // GET /campaigns/:id/location-graph/node-images — list existing node images
  fastify.get('/campaigns/:id/location-graph/node-images', {
    schema: { params: campaignIdParam },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;

    const rows = await prisma.location.findMany({
      where: { campaignId: request.params.id, nodeImageUrl: { not: null } },
      select: { id: true, displayName: true, nodeImageUrl: true },
      orderBy: { updatedAt: 'desc' },
    });

    const worldRows = await prisma.$queryRaw`
      SELECT DISTINCT l."nodeImageUrl", l."canonicalName" AS name
      FROM "Location" l
      INNER JOIN "LocationEdge" le
        ON (le."fromLocationId" = l.id OR le."toLocationId" = l.id)
        AND (le."campaignId" IS NULL OR le."campaignId" = ${request.params.id}::uuid)
        AND le."isActive" = true
      WHERE l."nodeImageUrl" IS NOT NULL
    `;

    const seen = new Set(rows.map((r) => r.nodeImageUrl));
    const images = rows.map((r) => ({ url: r.nodeImageUrl, name: r.displayName }));
    for (const w of worldRows) {
      if (!seen.has(w.nodeImageUrl)) {
        images.push({ url: w.nodeImageUrl, name: w.name });
        seen.add(w.nodeImageUrl);
      }
    }

    return reply.send({ images });
  });

  // POST /campaigns/:id/location-graph/nodes/:nodeId/generate-sprite — PixelLab
  fastify.post('/campaigns/:id/location-graph/nodes/:nodeId/generate-sprite', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'nodeId'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          nodeId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          prompt: { type: 'string', maxLength: 300 },
        },
      },
    },
  }, async (request, reply) => {
    if (!config.pixellabApiKey) {
      return reply.code(503).send({ error: 'PIXELLAB_API_KEY not configured' });
    }

    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;

    let loc = await prisma.location.findFirst({
      where: { id: request.params.nodeId, campaignId: request.params.id },
      select: {
        id: true, displayName: true, description: true, locationType: true,
        scale: true, tags: true, atmosphere: true, biome: true, dangerLevel: true,
      },
    });
    let isWorldNode = false;
    if (loc) {
      loc.name = loc.displayName;
    } else {
      loc = await prisma.location.findFirst({
        where: { id: request.params.nodeId },
        select: {
          id: true, canonicalName: true, description: true, locationType: true,
          scale: true, tags: true, atmosphere: true, biome: true, dangerLevel: true,
        },
      });
      if (loc) { loc.name = loc.canonicalName; isWorldNode = true; }
    }
    if (!loc) return reply.code(404).send({ error: 'Node not found' });

    const { width, height } = scaleToSpriteSize(loc.scale ?? 5);
    const userHint = request.body?.prompt || null;
    const description = buildPixelSpriteDescription(loc, userHint);

    const result = await generatePixelSprite({
      apiKey: config.pixellabApiKey,
      description,
      width,
      height,
    });

    const b64 = result.image.base64;
    const raw = b64.includes(',') ? b64.split(',')[1] : b64;
    const buffer = Buffer.from(raw, 'base64');
    const store = createMediaStore(config);
    const storagePath = `campaigns/${request.params.id}/node-sprites/${loc.id}.png`;
    const storeResult = await store.put(storagePath, buffer, 'image/png');

    const key = `node-sprite:${loc.id}`;
    const metadata = { description, userHint, width, height };
    await prisma.mediaAsset.upsert({
      where: { key },
      create: {
        userId: request.user.id,
        campaignId: request.params.id,
        key,
        type: 'node-sprite',
        contentType: 'image/png',
        size: buffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata,
      },
      update: {
        size: buffer.length,
        path: storagePath,
        metadata,
        lastAccessedAt: new Date(),
      },
    });

    const nodeImageUrl = storeResult.url;
    if (isWorldNode) {
      await prisma.location.update({
        where: { id: loc.id },
        data: { nodeImageUrl },
      });
    } else {
      await prisma.location.update({
        where: { id: loc.id },
        data: { nodeImageUrl },
      });
    }

    return reply.send({ ok: true, nodeImageUrl, size: { width, height } });
  });

  // POST /campaigns/:id/location-graph/edges
  fastify.post('/campaigns/:id/location-graph/edges', {
    schema: {
      params: campaignIdParam,
      body: {
        type: 'object',
        required: ['fromLocationId', 'toLocationId', 'edgeType'],
        additionalProperties: false,
        properties: {
          fromLocationId: { type: 'string', format: 'uuid' },
          toLocationId: { type: 'string', format: 'uuid' },
          edgeType: { type: 'string', maxLength: 40 },
          category: { type: 'string', maxLength: 20 },
          bidirectional: { type: 'boolean' },
          weight: { type: 'number', minimum: 0 },
          metadata: { type: 'object' },
          discoveryState: { type: 'string', maxLength: 20 },
          directionDeg: { type: 'number' },
          lengthKm: { type: 'number', minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const b = request.body;
    const typeInfo = EDGE_TYPES[b.edgeType];
    if (!typeInfo) return reply.code(400).send({ error: `Unknown edge type: ${b.edgeType}` });

    const meta = { ...(b.metadata && typeof b.metadata === 'object' ? b.metadata : {}) };
    if (b.directionDeg !== undefined && Number.isFinite(b.directionDeg)) {
      meta.directionDeg = normalizeDirectionDeg(b.directionDeg);
    }
    if (b.lengthKm !== undefined && Number.isFinite(b.lengthKm) && b.lengthKm >= 0) {
      meta.lengthKm = b.lengthKm;
    }

    const edge = await createEdge({
      fromLocationId: b.fromLocationId,
      toLocationId: b.toLocationId,
      edgeType: b.edgeType,
      category: b.category || typeInfo.category,
      bidirectional: b.bidirectional ?? typeInfo.bidirectional ?? true,
      weight: b.weight ?? 1.0,
      metadata: meta,
      discoveryState: b.discoveryState || 'known',
      campaignId: request.params.id,
      createdBy: 'admin',
    });
    return reply.code(201).send({ edge: { id: edge.id } });
  });

  // PUT /campaigns/:id/location-graph/edges/:edgeId
  fastify.put('/campaigns/:id/location-graph/edges/:edgeId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'edgeId'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          edgeId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          edgeType: { type: 'string', maxLength: 40 },
          category: { type: 'string', maxLength: 20 },
          bidirectional: { type: 'boolean' },
          weight: { type: 'number', minimum: 0 },
          metadata: { type: 'object' },
          discoveryState: { type: 'string', maxLength: 20 },
          directionDeg: { type: 'number' },
          lengthKm: { type: 'number', minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const { edgeId } = request.params;
    const b = request.body;
    const data = {};
    if (b.edgeType !== undefined) {
      if (!EDGE_TYPES[b.edgeType]) return reply.code(400).send({ error: `Unknown edge type: ${b.edgeType}` });
      data.edgeType = b.edgeType;
      data.category = b.category || EDGE_TYPES[b.edgeType].category;
    }
    if (b.bidirectional !== undefined) data.bidirectional = b.bidirectional;
    if (b.weight !== undefined) data.weight = b.weight;
    if (b.discoveryState !== undefined) data.discoveryState = b.discoveryState;

    const needsMetaMerge = b.metadata !== undefined
      || b.directionDeg !== undefined
      || b.lengthKm !== undefined;
    if (needsMetaMerge) {
      const existing = await prisma.locationEdge.findUnique({ where: { id: edgeId } });
      if (!existing) return reply.code(404).send({ error: 'Edge not found' });
      const prev = existing.metadata && typeof existing.metadata === 'object' ? { ...existing.metadata } : {};
      const merged = { ...prev, ...(b.metadata && typeof b.metadata === 'object' ? b.metadata : {}) };
      if (b.directionDeg !== undefined && Number.isFinite(b.directionDeg)) {
        merged.directionDeg = normalizeDirectionDeg(b.directionDeg);
      }
      if (b.lengthKm !== undefined && Number.isFinite(b.lengthKm) && b.lengthKm >= 0) {
        merged.lengthKm = b.lengthKm;
      }
      data.metadata = merged;
    }

    if (Object.keys(data).length === 0) return reply.send({ ok: true });
    await updateEdge(edgeId, data);
    return reply.send({ ok: true });
  });

  // DELETE /campaigns/:id/location-graph/edges/:edgeId
  fastify.delete('/campaigns/:id/location-graph/edges/:edgeId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'edgeId'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          edgeId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    await deactivateEdge(request.params.edgeId);
    return reply.send({ ok: true });
  });

  // POST /campaigns/:id/location-graph/move-npc
  fastify.post('/campaigns/:id/location-graph/move-npc', {
    schema: {
      params: campaignIdParam,
      body: {
        type: 'object',
        required: ['npcId', 'toLocationId'],
        additionalProperties: false,
        properties: {
          npcId: { type: 'string', format: 'uuid' },
          toLocationId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const campaignId = request.params.id;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;
    const { npcId, toLocationId } = request.body;
    const before = await prisma.npc.findFirst({
      where: { id: npcId, campaignId },
      select: { id: true, currentLocationId: true },
    });
    if (!before) {
      return reply.code(404).send({ error: 'NPC not found' });
    }
    if (before.currentLocationId === toLocationId) {
      return reply.send({ ok: true });
    }
    await prisma.npc.update({
      where: { id: npcId },
      data: { currentLocationId: toLocationId },
    });
    await appendCampaignNpcLocationMovement(prisma, {
      campaignNpcId: before.id,
      fromId: before.currentLocationId,
      toId: toLocationId,
      source: NPC_LOCATION_MOVE_SOURCE_GRAPH,
      sceneIndex: null,
    });
    return reply.send({ ok: true });
  });

  // GET /campaigns/:id/location-graph/search?q=
  fastify.get('/campaigns/:id/location-graph/search', {
    schema: {
      params: campaignIdParam,
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const q = request.query.q.toLowerCase();

    const [worldLocs, campaignLocs] = await Promise.all([
      prisma.location.findMany({
        where: {
          OR: [
            { canonicalName: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, canonicalName: true, displayName: true, locationType: true, scale: true },
        take: 20,
      }),
      prisma.location.findMany({
        where: {
          campaignId: request.params.id,
          displayName: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, displayName: true, locationType: true, scale: true },
        take: 20,
      }),
    ]);

    const results = [
      ...worldLocs.map((l) => ({ id: l.id, kind: 'world', name: l.displayName || l.canonicalName, type: l.locationType })),
      ...campaignLocs.map((l) => ({ id: l.id, kind: 'campaign', name: l.displayName, type: l.locationType })),
    ];
    return reply.send({ results: results.slice(0, 30) });
  });

  // POST /campaigns/:id/location-graph/validate
  fastify.post('/campaigns/:id/location-graph/validate', {
    schema: { params: campaignIdParam },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const campaignId = request.params.id;
    const warnings = [];

    // Check for NPCs without valid location refs
    const npcsNoLoc = await prisma.npc.findMany({
      where: { campaignId, currentLocationId: null },
      select: { id: true, name: true },
    });
    for (const n of npcsNoLoc) {
      warnings.push({ type: 'npc_no_location', message: `NPC "${n.name}" has no location`, entityId: n.id });
    }

    // Check for orphan edges (edges referencing missing nodes)
    const edges = await prisma.locationEdge.findMany({
      where: { isActive: true, OR: [{ campaignId: null }, { campaignId }] },
      select: { id: true, fromLocationId: true, toLocationId: true, edgeType: true },
    });
    const referencedIds = new Set();
    for (const e of edges) {
      if (e.fromLocationId) referencedIds.add(e.fromLocationId);
      if (e.toLocationId) referencedIds.add(e.toLocationId);
    }
    const existingLocs = referencedIds.size > 0
      ? await prisma.location.findMany({ where: { id: { in: [...referencedIds] } }, select: { id: true } })
      : [];
    const validIds = new Set(existingLocs.map((r) => r.id));
    for (const e of edges) {
      if (!validIds.has(e.fromLocationId)) warnings.push({ type: 'orphan_edge', message: `Edge ${e.edgeType} references missing from-node`, entityId: e.id });
      if (!validIds.has(e.toLocationId)) warnings.push({ type: 'orphan_edge', message: `Edge ${e.edgeType} references missing to-node`, entityId: e.id });
    }

    return reply.send({ valid: warnings.length === 0, warnings: warnings.slice(0, 50) });
  });

  // POST /campaigns/:id/location-graph/revise-graph
  fastify.post('/campaigns/:id/location-graph/revise-graph', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      params: campaignIdParam,
      body: {
        type: 'object',
        required: ['nodes', 'edges'],
        additionalProperties: false,
        properties: {
          nodes: { type: 'array', maxItems: 500, items: { type: 'object' } },
          edges: { type: 'array', maxItems: 2000, items: { type: 'object' } },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const userApiKeys = await loadUserApiKeys(prisma, request.user.id);
    const { nodes, edges } = request.body;
    return reviseGraph({ nodes, edges, userApiKeys, userId: request.user.id });
  });

  // GET /news — recent global world events for the "world news" panel
  fastify.get('/news', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          since: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request, reply) => {
    const since = request.query.since
      ? new Date(request.query.since)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await prisma.worldEvent.findMany({
      where: {
        visibility: 'global',
        createdAt: { gt: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        eventType: true,
        payload: true,
        createdAt: true,
      },
    });

    const events = rows.map((row) => {
      const p = (row.payload && typeof row.payload === 'object') ? row.payload : {};
      return {
        id: String(row.id),
        title: p.title || p.summary || row.eventType,
        description: p.description || p.summary || '',
        createdAt: row.createdAt,
      };
    });

    return reply.send({ events });
  });

  // POST /npc-dialog/:worldNpcId — C2 1-on-1 dialog
  fastify.post('/npc-dialog/:worldNpcId', {
    schema: {
      params: {
        type: 'object',
        properties: { worldNpcId: { type: 'string', minLength: 1 } },
        required: ['worldNpcId'],
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['campaignId', 'playerMessage'],
        properties: {
          campaignId: { type: 'string', minLength: 1 },
          playerMessage: { type: 'string', minLength: 1, maxLength: 2000 },
          language: { type: 'string', enum: ['pl', 'en'] },
          provider: { type: 'string', enum: ['openai', 'anthropic'] },
        },
      },
    },
  }, async (request, reply) => {
    const { worldNpcId } = request.params;
    const { campaignId, playerMessage, language = 'pl', provider = 'openai' } = request.body;
    const campaign = await assertCampaignOwnership(request, reply, campaignId);
    if (!campaign) return;

    let userApiKeys = null;
    try {
      userApiKeys = await loadUserApiKeys(prisma, request.user.id);
    } catch (err) {
      log.warn({ err }, 'loadUserApiKeys failed for npc-dialog (using server keys)');
    }

    const reply_ = await generateNpcDialog({
      worldNpcId,
      campaignId,
      playerMessage,
      language,
      provider,
      userApiKeys,
    });
    return reply.send(reply_);
  });
}
