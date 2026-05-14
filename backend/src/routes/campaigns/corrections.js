import { prisma } from '../../lib/prisma.js';

export async function correctionCampaignRoutes(app) {
  app.get('/:id/pending-correction', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { pendingStateCorrection: true },
    });
    if (!campaign) return { correction: null };

    const correction = campaign.pendingStateCorrection || null;
    if (correction) {
      await prisma.campaign.update({
        where: { id: request.params.id },
        data: { pendingStateCorrection: null },
      });
    }
    return { correction };
  });
}
