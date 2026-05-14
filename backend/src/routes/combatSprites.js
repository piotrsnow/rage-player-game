import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { generatePixelSprite, scaleToSpriteSize } from '../services/pixelLabClient.js';
import { buildCombatSpriteDescription, buildSpriteCacheKey } from '../services/combatSpritePrompt.js';
import { pickAppearanceWithAI, pickRandomAppearanceAsync } from '../services/chargenAiPicker.js';
import { composeSheetServer } from '../services/chargenCompositor.js';
import { createMediaStore } from '../services/mediaStore.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'combatSprites' });

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

async function generateChargenSheetForCombatant(combatant, userId, force) {
  const cacheKey = `chargen-combat:${buildSpriteCacheKey(combatant)}`;

  if (!force) {
    const cached = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (cached?.path) {
      await prisma.mediaAsset.update({
        where: { key: cacheKey },
        data: { lastAccessedAt: new Date() },
      }).catch(() => {});
      return {
        spriteSheetUrl: `/v1/media/file/${cached.path}`,
        chargenAppearance: cached.metadata?.chargenAppearance || null,
      };
    }
  } else {
    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const store = createMediaStore(config);
      await store.delete(existing.path).catch(() => {});
      await prisma.mediaAsset.delete({ where: { key: cacheKey } }).catch(() => {});
    }
  }

  let appearance;
  try {
    appearance = await pickAppearanceWithAI({
      name: combatant.name,
      race: combatant.species || combatant.race,
      gender: combatant.gender,
      role: combatant.type === 'enemy' ? 'enemy combatant' : 'ally',
      category: combatant.type,
      appearance: combatant.description,
    }, { userId });
  } catch {
    appearance = await pickRandomAppearanceAsync({
      race: combatant.species || combatant.race,
      gender: combatant.gender,
    });
  }

  const { buffer, warnings } = await composeSheetServer(appearance);
  if (warnings.length) {
    log.debug({ combatantId: combatant.id, warnings }, 'combat chargen compose warnings');
  }

  const store = createMediaStore(config);
  const safeName = combatant.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const storagePath = `chargen-sheets/combat/${safeName}_${Date.now()}.png`;
  await store.put(storagePath, buffer, 'image/png');

  await prisma.mediaAsset.create({
    data: {
      userId,
      key: cacheKey,
      type: 'chargen-sheet',
      contentType: 'image/png',
      size: buffer.length,
      backend: config.mediaBackend,
      path: storagePath,
      metadata: { chargenAppearance: appearance, combatantType: combatant.type },
    },
  });

  return {
    spriteSheetUrl: `/v1/media/file/${storagePath}`,
    chargenAppearance: appearance,
  };
}

export async function combatSpritesRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/generate', {
    schema: { body: GENERATE_BODY_SCHEMA },
  }, async (request) => {
    const { combatants, force } = request.body;
    const userId = request.user.id;

    const sprites = {};
    const spriteSheets = {};

    await Promise.all(combatants.map(async (combatant) => {
      try {
        const result = await generateChargenSheetForCombatant(combatant, userId, force);
        spriteSheets[combatant.id] = result.spriteSheetUrl;
        sprites[combatant.id] = result.spriteSheetUrl;
      } catch (err) {
        log.warn({ err, combatantId: combatant.id }, 'combat chargen sheet failed, trying PixelLab');

        if (!config.pixellabApiKey) {
          sprites[combatant.id] = null;
          return;
        }

        try {
          const cacheKey = buildSpriteCacheKey(combatant);
          const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
          if (existing && !force) {
            sprites[combatant.id] = `/v1/media/file/${existing.path}`;
            return;
          }
          const description = buildCombatSpriteDescription(combatant);
          const { width, height } = scaleToSpriteSize(5);
          const result = await generatePixelSprite({ apiKey: config.pixellabApiKey, description, width, height });
          const b64 = result.image.base64;
          const raw = b64.includes(',') ? b64.split(',')[1] : b64;
          const buffer = Buffer.from(raw, 'base64');
          const store = createMediaStore(config);
          const safeName = combatant.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
          const storagePath = `combat-sprites/${safeName}_${Date.now()}.png`;
          await store.put(storagePath, buffer, 'image/png');
          await prisma.mediaAsset.create({
            data: { userId, key: cacheKey, type: 'combat-sprite', contentType: 'image/png', size: buffer.length, backend: config.mediaBackend, path: storagePath, metadata: { description, width, height, combatantType: combatant.type } },
          });
          sprites[combatant.id] = `/v1/media/file/${storagePath}`;
        } catch (pixelErr) {
          log.warn({ err: pixelErr, combatantId: combatant.id }, 'PixelLab fallback also failed');
          sprites[combatant.id] = null;
        }
      }
    }));

    return { sprites, spriteSheets };
  });
}
