import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { withRetry } from '../../services/campaignSync.js';

export async function sharingCampaignRoutes(app) {
  app.post('/:id/share', async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    if (existing.shareToken) {
      return { shareToken: existing.shareToken };
    }

    const shareToken = crypto.randomUUID();
    await withRetry(() =>
      prisma.campaign.update({
        where: { id: request.params.id },
        data: { shareToken },
      }),
    );
    return { shareToken };
  });

  app.delete('/:id/share', async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    await withRetry(() =>
      prisma.campaign.update({
        where: { id: request.params.id },
        data: { shareToken: null },
      }),
    );
    return { success: true };
  });

  app.patch('/:id/publish', async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    const { isPublic } = request.body;
    if (typeof isPublic !== 'boolean') {
      return reply.code(400).send({ error: 'isPublic must be a boolean' });
    }
    const campaign = await withRetry(() =>
      prisma.campaign.update({
        where: { id: request.params.id },
        data: { isPublic },
      }),
    );
    return { id: campaign.id, isPublic: campaign.isPublic };
  });
}
