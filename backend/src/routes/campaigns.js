import { publicCampaignRoutes } from './campaigns/public.js';
import { crudCampaignRoutes } from './campaigns/crud.js';
import { sharingCampaignRoutes } from './campaigns/sharing.js';
import { recapCampaignRoutes } from './campaigns/recaps.js';

export {
  extractTotalCost,
  stripNormalizedFromCoreState,
} from '../services/campaignSerialize.js';

export async function campaignRoutes(fastify) {
  fastify.register(publicCampaignRoutes);

  fastify.register(async function authedCampaignRoutes(app) {
    app.addHook('onRequest', app.authenticate);
    app.register(crudCampaignRoutes);
    app.register(sharingCampaignRoutes);
    app.register(recapCampaignRoutes);
  });
}
