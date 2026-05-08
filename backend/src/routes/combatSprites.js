import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { generatePixelSprite, scaleToSpriteSize } from '../services/pixelLabClient.js';
import { buildCombatSpriteDescription, buildSpriteCacheKey } from '../services/combatSpritePrompt.js';
import { createMediaStore } from '../services/mediaStore.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'combatSprites' });

const SPRITE_SCALE = 5;
const MAX_COMBATANTS = 12;

const GENERATE_BODY_SCHEMA = {
  type: 'object',
  required: ['combatants'],
  additionalProperties: false,
  properties: {
    force: { type: 'boolean', default: false },
    combatants: {
      type: 'array',
      maxItems: MAX_COMBATANTS,
      items: {
        type: 'object',
        required: ['id', 'name', 'type'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', maxLength: 128 },
          name: { type: 'string', maxLength: 100 },
          type: { type: 'string', enum: ['player', 'ally', 'enemy'] },
        },
      },
    },
  },
};

export async function combatSpritesRoutes(fastify) {
  fastify.post('/generate', {
    schema: { body: GENERATE_BODY_SCHEMA },
  }, async (request) => {
    const { combatants, force } = request.body;
    const userId = request.user.id;

    const hasPixelLab = Boolean(config.pixellabApiKey);
    const results = {};

    const store = createMediaStore(config);
    const { width, height } = scaleToSpriteSize(SPRITE_SCALE);

    await Promise.all(combatants.map(async (combatant) => {
      const cacheKey = buildSpriteCacheKey(combatant);

      try {
        const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });

        if (existing && force) {
          await store.delete(existing.path).catch(() => {});
          await prisma.mediaAsset.delete({ where: { key: cacheKey } }).catch(() => {});
        } else if (existing) {
          await prisma.mediaAsset.update({
            where: { key: cacheKey },
            data: { lastAccessedAt: new Date() },
          }).catch(() => {});
          results[combatant.id] = `/v1/media/file/${existing.path}`;
          return;
        }

        if (!hasPixelLab) {
          results[combatant.id] = null;
          return;
        }

        const description = buildCombatSpriteDescription(combatant);
        const result = await generatePixelSprite({
          apiKey: config.pixellabApiKey,
          description,
          width,
          height,
        });

        const b64 = result.image.base64;
        const raw = b64.includes(',') ? b64.split(',')[1] : b64;
        const buffer = Buffer.from(raw, 'base64');

        const safeName = combatant.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
        const storagePath = `combat-sprites/${safeName}_${Date.now()}.png`;
        await store.put(storagePath, buffer, 'image/png');

        const metadata = { description, width, height, combatantType: combatant.type };
        await prisma.mediaAsset.create({
          data: {
            userId,
            key: cacheKey,
            type: 'combat-sprite',
            contentType: 'image/png',
            size: buffer.length,
            backend: config.mediaBackend,
            path: storagePath,
            metadata,
          },
        });

        results[combatant.id] = `/v1/media/file/${storagePath}`;
      } catch (err) {
        log.warn({ err, combatantId: combatant.id }, 'Failed to generate combat sprite');
        results[combatant.id] = null;
      }
    }));

    return { sprites: results };
  });
}
