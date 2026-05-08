import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { generatePixelSprite, scaleToSpriteSize } from './pixelLabClient.js';
import { buildCharacterSpriteDescription } from './pixelLabCharacterSpritePrompt.js';
import { createMediaStore } from './mediaStore.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'characterSpriteService' });

const SPRITE_SCALE = 5;
export const MAX_CHARACTER_SPRITE_BATCH = 24;

const SELECT_CHARACTER = {
  id: true,
  name: true,
  species: true,
  gender: true,
  spriteUrl: true,
};

const SELECT_CAMPAIGN_NPC = {
  id: true,
  name: true,
  role: true,
  category: true,
  race: true,
  creatureKind: true,
  gender: true,
  spriteUrl: true,
};

const SELECT_WORLD_NPC = {
  id: true,
  name: true,
  role: true,
  category: true,
  race: true,
  creatureKind: true,
  spriteUrl: true,
};

function mediaKey(kind, id) {
  return `character-sprite:${kind}:${id}`;
}

async function loadEntity(kind, id) {
  switch (kind) {
    case 'character':
      return prisma.character.findUnique({ where: { id }, select: SELECT_CHARACTER });
    case 'campaign-npc':
      return prisma.campaignNPC.findUnique({ where: { id }, select: SELECT_CAMPAIGN_NPC });
    case 'world-npc':
      return prisma.worldNPC.findUnique({ where: { id }, select: SELECT_WORLD_NPC });
    default:
      return null;
  }
}

async function writeSpriteUrl(kind, id, url) {
  switch (kind) {
    case 'character':
      return prisma.character.update({ where: { id }, data: { spriteUrl: url } });
    case 'campaign-npc':
      return prisma.campaignNPC.update({ where: { id }, data: { spriteUrl: url } });
    case 'world-npc':
      return prisma.worldNPC.update({ where: { id }, data: { spriteUrl: url } });
    default:
      throw new Error(`unknown kind: ${kind}`);
  }
}

/**
 * Generate or return cached PixelLab character sprite URL for DB + MediaAsset.
 * @returns {Promise<string|null>}
 */
export async function ensureCharacterSprite({
  kind,
  id,
  userId,
  campaignId,
  force = false,
}) {
  const entity = await loadEntity(kind, id);
  if (!entity) return null;

  if (entity.spriteUrl && !force) {
    return entity.spriteUrl;
  }

  if (!config.pixellabApiKey) {
    return null;
  }

  const key = mediaKey(kind, id);

  if (force) {
    const existing = await prisma.mediaAsset.findUnique({ where: { key } });
    if (existing) {
      const store = createMediaStore(config);
      await store.delete(existing.path).catch(() => {});
      await prisma.mediaAsset.delete({ where: { key } }).catch(() => {});
    }
  } else {
    const cached = await prisma.mediaAsset.findUnique({ where: { key } });
    if (cached?.path) {
      const url = `/v1/media/file/${cached.path}`;
      await writeSpriteUrl(kind, id, url).catch(() => {});
      return url;
    }
  }

  const description = buildCharacterSpriteDescription(entity, kind);
  const { width, height } = scaleToSpriteSize(SPRITE_SCALE);

  let result;
  try {
    result = await generatePixelSprite({
      apiKey: config.pixellabApiKey,
      description,
      width,
      height,
    });
  } catch (err) {
    log.warn({ err, kind, id }, 'PixelLab character sprite failed');
    return null;
  }

  const b64 = result.image.base64;
  const raw = b64.includes(',') ? b64.split(',')[1] : b64;
  const buffer = Buffer.from(raw, 'base64');

  const store = createMediaStore(config);
  const storagePath = `character-sprites/${kind}/${id}.png`;
  const storeResult = await store.put(storagePath, buffer, 'image/png');

  const metadata = { description, width, height, kind };

  await prisma.mediaAsset.upsert({
    where: { key },
    create: {
      userId,
      campaignId: campaignId || null,
      key,
      type: 'character-sprite',
      contentType: 'image/png',
      size: buffer.length,
      backend: config.mediaBackend,
      path: storagePath,
      metadata,
    },
    update: {
      size: buffer.length,
      path: storagePath,
      metadata,
      lastAccessedAt: new Date(),
      ...(campaignId ? { campaignId } : {}),
    },
  });

  const url = storeResult.url;
  await writeSpriteUrl(kind, id, url);
  return url;
}

/**
 * @param {Array<{ kind: string, id: string }>} items
 * @returns {Promise<Record<string, string|null>>} keyed by entity id
 */
export async function ensureCharacterSpritesBatch(items, {
  userId,
  campaignId,
  force = false,
} = {}) {
  const out = {};
  const slice = items.slice(0, MAX_CHARACTER_SPRITE_BATCH);
  for (const item of slice) {
    try {
      out[item.id] = await ensureCharacterSprite({
        kind: item.kind,
        id: item.id,
        userId,
        campaignId,
        force,
      });
    } catch (err) {
      log.warn({ err, item }, 'character sprite batch item failed');
      out[item.id] = null;
    }
  }
  return out;
}
