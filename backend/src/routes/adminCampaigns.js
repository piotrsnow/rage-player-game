// Admin panel — campaign editor routes.
//
// All endpoints sit behind `fastify.authenticate + fastify.requireAdmin`.
// Mutations auto-snapshot via `withSnapshot` from campaignSnapshot.js, and
// soft-validate via adminConsistencyValidator (the FE decides whether to
// honour warnings).
//
// Mounted at /v1/admin/campaigns by server.js.

import { adminCrudRoutes } from './adminCampaigns/crud.js';
import { adminQuestRoutes } from './adminCampaigns/quests.js';
import { adminNpcRoutes } from './adminCampaigns/npcs.js';
import { adminLocationRoutes } from './adminCampaigns/locations.js';
import { adminEdgeRoutes } from './adminCampaigns/edges.js';
import { adminCharacterRoutes } from './adminCampaigns/characters.js';
import { adminSceneRoutes } from './adminCampaigns/scenes.js';
import { adminIncidentRoutes } from './adminCampaigns/incidents.js';
import { adminSnapshotRoutes } from './adminCampaigns/snapshots.js';
import { adminValidateRoutes } from './adminCampaigns/validate.js';

export async function adminCampaignRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('onRequest', fastify.requireAdmin);

  await fastify.register(adminCrudRoutes);
  await fastify.register(adminQuestRoutes);
  await fastify.register(adminNpcRoutes);
  await fastify.register(adminLocationRoutes);
  await fastify.register(adminEdgeRoutes);
  await fastify.register(adminCharacterRoutes);
  await fastify.register(adminSceneRoutes);
  await fastify.register(adminIncidentRoutes);
  await fastify.register(adminSnapshotRoutes);
  await fastify.register(adminValidateRoutes);
}
