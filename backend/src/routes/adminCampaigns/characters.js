// Admin panel — Character + nested inventory/skills/materials.
// Character isn't owned by Campaign so the snapshot wrapper takes the
// campaignId from a `?campaignId=...` query param (the admin tab's currently
// selected campaign — used purely for routing the snapshot under the right
// timeline). Character edits without a campaign context skip the snapshot.

import { prisma } from '../../lib/prisma.js';
import { withSnapshot } from '../../services/campaignSnapshot.js';
import {
  loadCharacterSnapshotById,
  persistCharacterSnapshot,
} from '../../services/characterRelations.js';

const CHAR_PARAM = {
  type: 'object',
  required: ['characterId'],
  properties: { characterId: { type: 'string', format: 'uuid' } },
};

const SNAPSHOT_QUERY = {
  type: 'object',
  properties: { campaignId: { type: 'string', format: 'uuid' } },
  additionalProperties: false,
};

async function maybeSnapshot(req, reason, fn) {
  const campaignId = req.query?.campaignId;
  if (!campaignId) return fn();
  return withSnapshot(campaignId, { reason, createdBy: req.user.id }, fn);
}

export async function adminCharacterRoutes(fastify) {
  // ── Get character (FE snapshot shape) ──
  fastify.get('/characters/:characterId', { schema: { params: CHAR_PARAM } }, async (request, reply) => {
    const { characterId } = request.params;
    const snap = await loadCharacterSnapshotById(characterId);
    if (!snap) return reply.code(404).send({ error: 'Character not found' });
    return snap;
  });

  // ── Replace character snapshot (FE-shape: scalars + skills + inventory + materials) ──
  fastify.put('/characters/:characterId', {
    schema: {
      params: CHAR_PARAM,
      querystring: SNAPSHOT_QUERY,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { characterId } = request.params;
    const exists = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Character not found' });

    const result = await maybeSnapshot(request, 'admin-edit-character', () =>
      persistCharacterSnapshot(characterId, request.body || {}),
    );
    return result;
  });

  // ── Inventory item CRUD ──
  fastify.post('/characters/:characterId/inventory', {
    schema: {
      params: CHAR_PARAM,
      querystring: SNAPSHOT_QUERY,
      body: { type: 'object', required: ['itemKey', 'displayName'], additionalProperties: true },
    },
  }, async (request) => {
    const { characterId } = request.params;
    const { itemKey, displayName, baseType, quantity = 1, props, imageUrl } = request.body;
    return maybeSnapshot(request, 'admin-add-inventory', () =>
      prisma.characterInventoryItem.create({
        data: {
          characterId, itemKey, displayName, baseType: baseType ?? null,
          quantity, props: props ?? {}, imageUrl: imageUrl ?? null,
        },
      }),
    );
  });

  fastify.patch('/characters/:characterId/inventory/:itemKey', {
    schema: {
      params: {
        type: 'object',
        required: ['characterId', 'itemKey'],
        properties: {
          characterId: { type: 'string', format: 'uuid' },
          itemKey: { type: 'string' },
        },
      },
      querystring: SNAPSHOT_QUERY,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { characterId, itemKey } = request.params;
    const data = {};
    for (const k of ['displayName', 'baseType', 'quantity', 'props', 'imageUrl']) {
      if (request.body[k] !== undefined) data[k] = request.body[k];
    }
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    return maybeSnapshot(request, 'admin-edit-inventory', () =>
      prisma.characterInventoryItem.update({
        where: { characterId_itemKey: { characterId, itemKey } },
        data,
      }),
    );
  });

  fastify.delete('/characters/:characterId/inventory/:itemKey', {
    schema: {
      params: {
        type: 'object',
        required: ['characterId', 'itemKey'],
        properties: {
          characterId: { type: 'string', format: 'uuid' },
          itemKey: { type: 'string' },
        },
      },
      querystring: SNAPSHOT_QUERY,
    },
  }, async (request) => {
    const { characterId, itemKey } = request.params;
    await maybeSnapshot(request, 'admin-delete-inventory', () =>
      prisma.characterInventoryItem.delete({
        where: { characterId_itemKey: { characterId, itemKey } },
      }),
    );
    return { ok: true };
  });
}
