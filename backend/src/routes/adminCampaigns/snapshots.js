// Admin panel — campaign snapshot endpoints (create / list / restore / pin / delete).

import { prisma } from '../../lib/prisma.js';
import { createSnapshot, restoreSnapshot } from '../../services/campaignSnapshot.js';

const CAMPAIGN_PARAM = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

const SNAPSHOT_PARAM = {
  type: 'object',
  required: ['id', 'snapshotId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    snapshotId: { type: 'string', format: 'uuid' },
  },
};

export async function adminSnapshotRoutes(fastify) {
  // ── List snapshots for a campaign ──
  fastify.get('/:id/snapshots', { schema: { params: CAMPAIGN_PARAM } }, async (request) => {
    const { id } = request.params;
    return prisma.campaignSnapshot.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, reason: true, pinned: true, createdBy: true, createdAt: true,
      },
    });
  });

  // ── Manual snapshot (defaults to pinned: true so it survives FIFO trim) ──
  fastify.post('/:id/snapshots', {
    schema: {
      params: CAMPAIGN_PARAM,
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', maxLength: 200 },
          pinned: { type: 'boolean', default: true },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { reason, pinned = true } = request.body || {};
    const exists = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Campaign not found' });

    const snap = await createSnapshot(id, {
      reason: reason || 'manual',
      createdBy: request.user.id,
      pinned,
    });
    return { id: snap.id, reason: snap.reason, pinned: snap.pinned, createdAt: snap.createdAt };
  });

  // ── Restore snapshot ──
  fastify.post('/:id/snapshots/:snapshotId/restore', {
    schema: { params: SNAPSHOT_PARAM },
  }, async (request, reply) => {
    const { id, snapshotId } = request.params;
    const exists = await prisma.campaignSnapshot.findFirst({
      where: { id: snapshotId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Snapshot not found' });

    return restoreSnapshot(snapshotId, { createdBy: request.user.id });
  });

  // ── Toggle pin ──
  fastify.patch('/:id/snapshots/:snapshotId', {
    schema: {
      params: SNAPSHOT_PARAM,
      body: {
        type: 'object',
        properties: { pinned: { type: 'boolean' }, reason: { type: 'string', maxLength: 200 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id, snapshotId } = request.params;
    const exists = await prisma.campaignSnapshot.findFirst({
      where: { id: snapshotId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Snapshot not found' });

    return prisma.campaignSnapshot.update({
      where: { id: snapshotId },
      data: request.body || {},
      select: { id: true, reason: true, pinned: true, createdAt: true },
    });
  });

  // ── Delete snapshot ──
  fastify.delete('/:id/snapshots/:snapshotId', { schema: { params: SNAPSHOT_PARAM } }, async (request, reply) => {
    const { id, snapshotId } = request.params;
    const exists = await prisma.campaignSnapshot.findFirst({
      where: { id: snapshotId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Snapshot not found' });

    await prisma.campaignSnapshot.delete({ where: { id: snapshotId } });
    return { ok: true };
  });
}
