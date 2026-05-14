import { prisma } from '../../lib/prisma.js';

export async function badgeCampaignRoutes(app) {
  app.get('/:id/pending-badge', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { pendingBadgeAward: true },
    });
    return { badge: campaign?.pendingBadgeAward || null };
  });

  app.delete('/:id/pending-badge', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (request) => {
    await prisma.campaign.updateMany({
      where: { id: request.params.id, userId: request.user.id },
      data: { pendingBadgeAward: null },
    });
    return { ok: true };
  });
}
