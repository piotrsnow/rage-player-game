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
        select: {
          id: true, canonicalName: true, displayName: true,
          locationType: true, dangerLevel: true,
          regionX: true, regionY: true,
          parentLocationId: true, isCanonical: true,
          description: true, region: true,
          subGridX: true, subGridY: true,
          slotType: true, slotKind: true,
        },
      }),
      loadCampaignFog({ userId: request.user.id, campaignId }),
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { coreState: true },
      }),
    ]);

    const locationIds = locations.map((l) => l.id);
    const edges = locationIds.length === 0 ? [] : await prisma.worldLocationEdge.findMany({
      where: {
        fromLocationId: { in: locationIds },
        toLocationId: { in: locationIds },
      },
      select: {
        id: true, fromLocationId: true, toLocationId: true,
        terrainType: true, difficulty: true, direction: true, gated: true,
      },
    });

    let currentLocationId = null;
    const core = full?.coreState || {};
    const currentName = core?.world?.currentLocation || null;
    if (currentName) {
      const match = locations.find(
        (l) => l.displayName === currentName || l.canonicalName === currentName
      );
      if (match) currentLocationId = match.id;
      else log.warn({ campaignId, currentName }, 'currentLocation name has no exact WorldLocation match');
    }

    // NOTE: we intentionally do NOT return Campaign.worldBounds. The player
    // map is a global -10..10 grid (canonical world is the same across all
    // campaigns). `worldBounds` is a per-campaign AI/seeder placement
    // guardrail, not the viewport range. See knowledge/concepts/living-world.md.
    return reply.send({
      locations,
      edges,
      fog: {
        visited: [...fog.visited],
        heardAbout: [...fog.heardAbout],
        discoveredEdgeIds: [...fog.discoveredEdgeIds],
        discoveredSubLocationIds: [...fog.discoveredSubLocationIds],
      },
      currentLocationId,
    });
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
