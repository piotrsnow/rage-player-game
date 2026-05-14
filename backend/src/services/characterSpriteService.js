import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { generatePixelSprite, scaleToSpriteSize } from './pixelLabClient.js';
import { buildCharacterSpriteDescription } from './pixelLabCharacterSpritePrompt.js';
import { pickAppearanceWithAI, pickRandomAppearanceAsync } from './chargenAiPicker.js';
import { composeSheetServer } from './chargenCompositor.js';
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
  spriteSheetUrl: true,
  chargenAppearance: true,
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
  spriteSheetUrl: true,
  chargenAppearance: true,
  appearance: true,
};

const SELECT_WORLD_NPC = {
  id: true,
  name: true,
  role: true,
  category: true,
  race: true,
  creatureKind: true,
  spriteUrl: true,
  spriteSheetUrl: true,
  chargenAppearance: true,
  appearance: true,
};

function mediaKey(kind, id) {
  return `chargen-sheet:${kind}:${id}`;
}

function legacyMediaKey(kind, id) {
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

async function writeSheetFields(kind, id, data) {
  const update = { data };
  switch (kind) {
    case 'character':
      return prisma.character.update({ where: { id }, ...update });
    case 'campaign-npc':
      return prisma.campaignNPC.update({ where: { id }, ...update });
    case 'world-npc':
      return prisma.worldNPC.update({ where: { id }, ...update });
    default:
      throw new Error(`unknown kind: ${kind}`);
  }
}

async function ensureChargenSheet({ kind, id, userId, campaignId, force = false }) {
  const entity = await loadEntity(kind, id);
  if (!entity) return null;

  if (entity.spriteSheetUrl && entity.chargenAppearance && !force) {
    return { spriteSheetUrl: entity.spriteSheetUrl, chargenAppearance: entity.chargenAppearance };
  }

  const key = mediaKey(kind, id);

  if (!force && !entity.chargenAppearance) {
    const cached = await prisma.mediaAsset.findUnique({ where: { key } });
    if (cached?.path) {
      const sheetUrl = `/v1/media/file/${cached.path}`;
      const storedAppearance = cached.metadata?.chargenAppearance || null;
      await writeSheetFields(kind, id, {
        spriteSheetUrl: sheetUrl,
        ...(storedAppearance ? { chargenAppearance: storedAppearance } : {}),
      }).catch(() => {});
      return { spriteSheetUrl: sheetUrl, chargenAppearance: storedAppearance };
    }
  }

  if (force) {
    const existing = await prisma.mediaAsset.findUnique({ where: { key } });
    if (existing) {
      const store = createMediaStore(config);
      await store.delete(existing.path).catch(() => {});
      await prisma.mediaAsset.delete({ where: { key } }).catch(() => {});
    }
  }

  let appearance = entity.chargenAppearance;
  if (!appearance || force) {
    try {
      appearance = await pickAppearanceWithAI(entity, { userId });
    } catch (err) {
      log.warn({ err, kind, id }, 'AI picker failed, using random');
      appearance = await pickRandomAppearanceAsync(entity);
    }
  }

  log.info({ kind, id, appearance: JSON.stringify(appearance), slots: Object.keys(appearance?.slots || {}) }, 'composing spritesheet');

  let buffer;
  try {
    const result = await composeSheetServer(appearance);
    buffer = result.buffer;
    if (result.warnings.length) {
      log.warn({ kind, id, warnings: result.warnings }, 'chargen compose warnings');
    }
  } catch (err) {
    log.warn({ err, kind, id }, 'chargen compose failed');
    return null;
  }

  const store = createMediaStore(config);
  const storagePath = `chargen-sheets/${kind}/${id}.png`;
  const storeResult = await store.put(storagePath, buffer, 'image/png');

  await prisma.mediaAsset.upsert({
    where: { key },
    create: {
      userId,
      campaignId: campaignId || null,
      key,
      type: 'chargen-sheet',
      contentType: 'image/png',
      size: buffer.length,
      backend: config.mediaBackend,
      path: storagePath,
      metadata: { chargenAppearance: appearance, kind },
    },
    update: {
      size: buffer.length,
      path: storagePath,
      metadata: { chargenAppearance: appearance, kind },
      lastAccessedAt: new Date(),
      ...(campaignId ? { campaignId } : {}),
    },
  });

  const sheetUrl = `${storeResult.url}?v=${Date.now()}`;
  await writeSheetFields(kind, id, {
    chargenAppearance: appearance,
    spriteSheetUrl: sheetUrl,
  });

  return { spriteSheetUrl: sheetUrl, chargenAppearance: appearance };
}

// Legacy PixelLab path (kept as fallback if chargen assets are missing)
async function ensurePixelLabSprite({ kind, id, userId, campaignId, force = false }) {
  const entity = await loadEntity(kind, id);
  if (!entity) return null;
  if (entity.spriteUrl && !force) return entity.spriteUrl;
  if (!config.pixellabApiKey) return null;

  const key = legacyMediaKey(kind, id);
  if (!force) {
    const cached = await prisma.mediaAsset.findUnique({ where: { key } });
    if (cached?.path) {
      const spriteUrl = `/v1/media/file/${cached.path}`;
      await writeSheetFields(kind, id, { spriteUrl }).catch(() => {});
      return spriteUrl;
    }
  }

  const description = buildCharacterSpriteDescription(entity, kind);
  const { width, height } = scaleToSpriteSize(SPRITE_SCALE);
  let result;
  try {
    result = await generatePixelSprite({ apiKey: config.pixellabApiKey, description, width, height });
  } catch (err) {
    log.warn({ err, kind, id }, 'PixelLab sprite failed');
    return null;
  }

  const b64 = result.image.base64;
  const raw = b64.includes(',') ? b64.split(',')[1] : b64;
  const buffer = Buffer.from(raw, 'base64');
  const store = createMediaStore(config);
  const storagePath = `character-sprites/${kind}/${id}.png`;
  await store.put(storagePath, buffer, 'image/png');

  await prisma.mediaAsset.upsert({
    where: { key },
    create: { userId, campaignId: campaignId || null, key, type: 'character-sprite', contentType: 'image/png', size: buffer.length, backend: config.mediaBackend, path: storagePath, metadata: { description, width, height, kind } },
    update: { size: buffer.length, path: storagePath, metadata: { description, width, height, kind }, lastAccessedAt: new Date() },
  });

  const spriteUrl = `/v1/media/file/${storagePath}`;
  await writeSheetFields(kind, id, { spriteUrl }).catch(() => {});
  return spriteUrl;
}

/**
 * Generate or return cached character sprite (chargen sheet preferred, PixelLab fallback).
 * Returns { spriteSheetUrl, chargenAppearance } or string spriteUrl or null.
 */
export async function ensureCharacterSprite({ kind, id, userId, campaignId, force = false }) {
  try {
    const result = await ensureChargenSheet({ kind, id, userId, campaignId, force });
    if (result) return result;
  } catch (err) {
    log.debug({ err, kind, id }, 'chargen path unavailable, trying PixelLab');
  }
  const spriteUrl = await ensurePixelLabSprite({ kind, id, userId, campaignId, force });
  return spriteUrl ? { spriteSheetUrl: spriteUrl, chargenAppearance: null } : null;
}

/**
 * Batch version. Returns { [entityId]: { spriteSheetUrl, chargenAppearance } | string | null }
 */
export async function ensureCharacterSpritesBatch(items, { userId, campaignId, force = false } = {}) {
  const out = {};
  const slice = items.slice(0, MAX_CHARACTER_SPRITE_BATCH);
  for (const item of slice) {
    try {
      const result = await ensureChargenSheet({ kind: item.kind, id: item.id, userId, campaignId, force });
      if (result) {
        out[item.id] = result.spriteSheetUrl;
        continue;
      }
    } catch {
      // fall through to PixelLab
    }
    try {
      out[item.id] = await ensurePixelLabSprite({ kind: item.kind, id: item.id, userId, campaignId, force });
    } catch (err) {
      log.warn({ err, item }, 'sprite batch item failed');
      out[item.id] = null;
    }
  }
  return out;
}
