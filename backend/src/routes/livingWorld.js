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
} from '../services/locationGraph/graphService.js';
import { EDGE_TYPES, safeValidateTacticalGrid } from '../../../shared/domain/locationGraph.js';
import { slugifyLocationName } from '../services/locationRefs.js';
import { findSimilarNodeImage } from '../services/locationGraph/imageMatcher.js';
import { generatePixelSprite, scaleToSpriteSize } from '../services/pixelLabClient.js';
import { buildPixelSpriteDescription } from '../services/pixelLabSpritePrompt.js';
import { createMediaStore } from '../services/mediaStore.js';
import { config } from '../config.js';
import { callAIJson } from '../services/aiJsonCall.js';
import { ensureCharacterSpritesBatch, MAX_CHARACTER_SPRITE_BATCH } from '../services/characterSpriteService.js';

const log = childLogger({ module: 'livingWorldRoutes' });

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
          currentLocationKind: true,
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
        taskCategory: 'travel_check',
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
        select: { currentLocationKind: true, currentLocationId: true },
      });
      resolvedFocusKind = resolvedFocusKind || full?.currentLocationKind || null;
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
    const orphanCampaignLocs = await prisma.campaignLocation.findMany({
      where: { campaignId: request.params.id, id: { notIn: [...seenNodeIds] } },
      select: {
        id: true, name: true, locationType: true, scale: true, tags: true,
        atmosphere: true, description: true, biome: true, region: true,
        visitCount: true, dangerLevel: true, regionX: true, regionY: true,
        nodeShape: true, nodeIcon: true, nodeImageUrl: true,
      },
    });
    for (const node of orphanCampaignLocs) {
      nodeList.push({
        id: node.id,
        kind: 'campaign',
        name: node.name,
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

    // Faction overlay — extract from social edges (controlled_by, patrolled_by, contested_between)
    const FACTION_EDGE_TYPES = new Set(['controlled_by', 'patrolled_by', 'contested_between']);
    const factionOverlay = edges
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

    // Occupants overlay — NPCs + player characters positioned at graph nodes
    const campaignId = request.params.id;
    const [campaignNpcs, campaignFull, latestScene] = await Promise.all([
      prisma.campaignNPC.findMany({
        where: { campaignId, lastLocationKind: { not: null }, lastLocationId: { not: null } },
        select: {
          id: true, name: true, role: true, category: true,
          lastLocationKind: true, lastLocationId: true,
          lastInteractionSceneIndex: true,
          spriteUrl: true,
        },
      }),
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          currentLocationKind: true,
          currentLocationId: true,
          participants: {
            select: { character: { select: { id: true, name: true, species: true, spriteUrl: true } } },
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
    const campLocKind = campaignFull?.currentLocationKind;
    const campLocId = campaignFull?.currentLocationId;

    const occupants = [];
    for (const npc of campaignNpcs) {
      // Self-healing display fallback: NPCs who participated in the latest
      // scene but whose FK pair still points elsewhere get projected onto
      // the campaign's current location. Underlying DB row stays untouched —
      // next scene with this NPC will permanently relocate them via
      // processNpcChanges.
      let locKind = npc.lastLocationKind;
      let locId = npc.lastLocationId;
      if (latestSceneIndex != null && campLocKind && campLocId
          && npc.lastInteractionSceneIndex === latestSceneIndex
          && (locKind !== campLocKind || locId !== campLocId)) {
        locKind = campLocKind;
        locId = campLocId;
      }
      occupants.push({
        id: npc.id,
        name: npc.name,
        type: 'npc',
        role: npc.role,
        category: npc.category,
        locationKind: locKind,
        locationId: locId,
        spriteUrl: npc.spriteUrl || null,
      });
    }
    if (campaignFull?.currentLocationKind && campaignFull?.currentLocationId) {
      for (const p of campaignFull.participants || []) {
        occupants.push({
          id: p.character.id,
          name: p.character.name,
          type: 'player',
          species: p.character.species,
          locationKind: campaignFull.currentLocationKind,
          locationId: campaignFull.currentLocationId,
          spriteUrl: p.character.spriteUrl || null,
        });
      }
    }

    return reply.send({ nodes: nodeList, edges: edgeList, factionOverlay, occupants });
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

    if (!config.pixellabApiKey) {
      return reply.code(503).send({ error: 'PIXELLAB_API_KEY not configured' });
    }

    const { items, force } = request.body;
    const userId = request.user.id;

    const validated = [];
    for (const item of items) {
      if (item.kind === 'campaign-npc') {
        const row = await prisma.campaignNPC.findFirst({
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
      node = await prisma.campaignLocation.create({
        data: {
          campaignId: request.params.id,
          name: b.name,
          canonicalSlug: slugifyLocationName(b.name),
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
        await createEdge({
          fromKind: b.parentKind,
          fromId: b.parentId,
          toKind: 'campaign',
          toId: node.id,
          edgeType: 'contains',
          category: 'structural',
          bidirectional: false,
          weight: 1.0,
          metadata: {},
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
        await prisma.campaignLocation.update({
          where: { id: node.id },
          data: { nodeImageUrl: url },
        });
        matchedImageUrl = url;
      }
    }

    return reply.code(201).send({ node: { id: node.id, kind: 'campaign', name: node.name, nodeImageUrl: matchedImageUrl } });
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
    const campaignLoc = await prisma.campaignLocation.findFirst({
      where: { id: nodeId, campaignId: request.params.id },
    });
    if (campaignLoc) {
      const data = {};
      if (b.name !== undefined) { data.name = b.name; data.canonicalSlug = slugifyLocationName(b.name); }
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
        updated = await prisma.campaignLocation.update({ where: { id: nodeId }, data });
      }
    }
    if (!updated) {
      const worldLoc = await prisma.worldLocation.findFirst({
        where: { id: nodeId },
      });
      if (worldLoc) {
        const data = {};
        if (b.regionX !== undefined) data.regionX = b.regionX;
        if (b.regionY !== undefined) data.regionY = b.regionY;
        if (Object.keys(data).length > 0) {
          updated = await prisma.worldLocation.update({ where: { id: nodeId }, data });
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
          { fromId: nodeId },
          { toId: nodeId },
        ],
      },
      data: { isActive: false },
    });

    // Mark the CampaignLocation as inactive if it exists
    const cl = await prisma.campaignLocation.findFirst({
      where: { id: nodeId, campaignId: request.params.id },
    });
    if (cl) {
      await prisma.campaignLocation.update({
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

    const rows = await prisma.campaignLocation.findMany({
      where: { campaignId: request.params.id, nodeImageUrl: { not: null } },
      select: { id: true, name: true, nodeImageUrl: true },
      orderBy: { updatedAt: 'desc' },
    });

    const worldRows = await prisma.$queryRaw`
      SELECT DISTINCT wl."nodeImageUrl", wl."canonicalName" AS name
      FROM "WorldLocation" wl
      INNER JOIN "LocationEdge" le
        ON ((le."fromKind" = 'world' AND le."fromId" = wl.id) OR (le."toKind" = 'world' AND le."toId" = wl.id))
        AND (le."campaignId" IS NULL OR le."campaignId" = ${request.params.id}::uuid)
        AND le."isActive" = true
      WHERE wl."nodeImageUrl" IS NOT NULL
    `;

    const seen = new Set(rows.map((r) => r.nodeImageUrl));
    const images = rows.map((r) => ({ url: r.nodeImageUrl, name: r.name }));
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

    let loc = await prisma.campaignLocation.findFirst({
      where: { id: request.params.nodeId, campaignId: request.params.id },
      select: {
        id: true, name: true, description: true, locationType: true,
        scale: true, tags: true, atmosphere: true, biome: true, dangerLevel: true,
      },
    });
    let isWorldNode = false;
    if (!loc) {
      loc = await prisma.worldLocation.findFirst({
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
      await prisma.worldLocation.update({
        where: { id: loc.id },
        data: { nodeImageUrl },
      });
    } else {
      await prisma.campaignLocation.update({
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
        required: ['fromKind', 'fromId', 'toKind', 'toId', 'edgeType'],
        additionalProperties: false,
        properties: {
          fromKind: { type: 'string', enum: ['world', 'campaign'] },
          fromId: { type: 'string', format: 'uuid' },
          toKind: { type: 'string', enum: ['world', 'campaign'] },
          toId: { type: 'string', format: 'uuid' },
          edgeType: { type: 'string', maxLength: 40 },
          category: { type: 'string', maxLength: 20 },
          bidirectional: { type: 'boolean' },
          weight: { type: 'number', minimum: 0 },
          metadata: { type: 'object' },
          discoveryState: { type: 'string', maxLength: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const b = request.body;
    const typeInfo = EDGE_TYPES[b.edgeType];
    if (!typeInfo) return reply.code(400).send({ error: `Unknown edge type: ${b.edgeType}` });

    const edge = await createEdge({
      fromKind: b.fromKind,
      fromId: b.fromId,
      toKind: b.toKind,
      toId: b.toId,
      edgeType: b.edgeType,
      category: b.category || typeInfo.category,
      bidirectional: b.bidirectional ?? typeInfo.bidirectional ?? true,
      weight: b.weight ?? 1.0,
      metadata: b.metadata || {},
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
    if (b.metadata !== undefined) data.metadata = b.metadata;
    if (b.discoveryState !== undefined) data.discoveryState = b.discoveryState;
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
        required: ['npcId', 'toKind', 'toId'],
        additionalProperties: false,
        properties: {
          npcId: { type: 'string', format: 'uuid' },
          toKind: { type: 'string', enum: ['world', 'campaign'] },
          toId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const campaign = await assertCampaignOwnership(request, reply, request.params.id);
    if (!campaign) return;
    const { npcId, toKind, toId } = request.body;
    await prisma.campaignNPC.update({
      where: { id: npcId },
      data: { lastLocationKind: toKind, lastLocationId: toId },
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
      prisma.worldLocation.findMany({
        where: {
          OR: [
            { canonicalName: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, canonicalName: true, displayName: true, locationType: true, scale: true },
        take: 20,
      }),
      prisma.campaignLocation.findMany({
        where: {
          campaignId: request.params.id,
          name: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, name: true, locationType: true, scale: true },
        take: 20,
      }),
    ]);

    const results = [
      ...worldLocs.map((l) => ({ id: l.id, kind: 'world', name: l.displayName || l.canonicalName, type: l.locationType })),
      ...campaignLocs.map((l) => ({ id: l.id, kind: 'campaign', name: l.name, type: l.locationType })),
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
    const npcsNoLoc = await prisma.campaignNPC.findMany({
      where: { campaignId, OR: [{ lastLocationId: null }, { lastLocationKind: null }] },
      select: { id: true, name: true },
    });
    for (const n of npcsNoLoc) {
      warnings.push({ type: 'npc_no_location', message: `NPC "${n.name}" has no location`, entityId: n.id });
    }

    // Check for orphan edges (edges referencing missing nodes)
    const edges = await prisma.locationEdge.findMany({
      where: { isActive: true, OR: [{ campaignId: null }, { campaignId }] },
      select: { id: true, fromKind: true, fromId: true, toKind: true, toId: true, edgeType: true },
    });
    const nodeIds = new Set();
    const worldIds = new Set();
    const campIds = new Set();
    for (const e of edges) {
      if (e.fromKind === 'world') worldIds.add(e.fromId); else campIds.add(e.fromId);
      if (e.toKind === 'world') worldIds.add(e.toId); else campIds.add(e.toId);
    }
    const [existingWorld, existingCamp] = await Promise.all([
      worldIds.size > 0 ? prisma.worldLocation.findMany({ where: { id: { in: [...worldIds] } }, select: { id: true } }) : [],
      campIds.size > 0 ? prisma.campaignLocation.findMany({ where: { id: { in: [...campIds] } }, select: { id: true } }) : [],
    ]);
    const validIds = new Set([...existingWorld.map((r) => r.id), ...existingCamp.map((r) => r.id)]);
    for (const e of edges) {
      if (!validIds.has(e.fromId)) warnings.push({ type: 'orphan_edge', message: `Edge ${e.edgeType} references missing from-node`, entityId: e.id });
      if (!validIds.has(e.toId)) warnings.push({ type: 'orphan_edge', message: `Edge ${e.edgeType} references missing to-node`, entityId: e.id });
    }

    return reply.send({ valid: warnings.length === 0, warnings: warnings.slice(0, 50) });
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
