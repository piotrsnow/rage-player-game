import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import { resolveApiKey } from './apiKeyService.js';
import { generateKey } from './hashService.js';
import { downscaleGeneratedImage } from './imageResize.js';
import { createMediaStore } from './mediaStore.js';
import { config } from '../config.js';
import { SCENE_CLIENT_SELECT } from './campaignSerialize.js';

const log = childLogger({ module: 'badgeGenerator' });
const store = createMediaStore(config);

const BADGE_ICONS = [
  'shield', 'military_tech', 'local_fire_department', 'bolt',
  'skull', 'diamond', 'star', 'whatshot', 'visibility', 'psychology',
  'swords', 'castle', 'forest', 'auto_awesome', 'emergency',
];

function pickIcon() {
  return BADGE_ICONS[Math.floor(Math.random() * BADGE_ICONS.length)];
}

async function generateBadgeImage(imagePrompt, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKeys: true },
  });
  const apiKey = resolveApiKey(user?.apiKeys || '{}', 'stability');
  if (!apiKey) return null;

  try {
    const formData = new FormData();
    formData.append('prompt', imagePrompt);
    formData.append('negative_prompt', 'text, watermark, signature, blurry, low quality, photo, realistic face, human face');
    formData.append('model', 'sd3.5-large-turbo');
    formData.append('aspect_ratio', '1:1');
    formData.append('output_format', 'jpeg');
    formData.append('none', '');

    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      body: formData,
    });

    if (!response.ok) {
      log.warn({ status: response.status }, 'Stability API badge image generation failed');
      return null;
    }

    const data = await response.json();
    if (data.finish_reason === 'CONTENT_FILTERED') return null;

    const originalBuffer = Buffer.from(data.image, 'base64');
    const buffer = await downscaleGeneratedImage(originalBuffer);

    const cacheKey = generateKey('image', { provider: 'stability', type: 'badge', prompt: imagePrompt, ts: Date.now() });
    const storagePath = cacheKey.replace('.png', '.jpg');
    const storeResult = await store.put(storagePath, buffer, 'image/jpeg');

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId,
        key: cacheKey,
        type: 'image',
        contentType: 'image/jpeg',
        size: buffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata: { provider: 'stability', type: 'badge', prompt: imagePrompt },
      },
      update: {},
    });

    return storeResult.url;
  } catch (err) {
    log.warn({ err: err?.message }, 'Badge image generation failed (non-fatal)');
    return null;
  }
}

/**
 * Generate a new CharacterBadge row from recent scenes.
 *
 * @param {Object} opts
 * @param {string} opts.characterId
 * @param {string} opts.userId
 * @param {string} [opts.campaignId]  - scope to a single campaign
 * @param {number} [opts.sceneFrom]
 * @param {number} [opts.sceneTo]
 * @param {string} [opts.provider]    - AI provider
 * @param {object} [opts.userApiKeys] - pre-loaded encrypted key blob
 * @returns {Promise<Object>} The created CharacterBadge row
 */
export async function generateBadge({
  characterId,
  userId,
  campaignId = null,
  sceneFrom = null,
  sceneTo = null,
  provider = 'openai',
  userApiKeys = null,
}) {
  const char = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      id: true, name: true, species: true, characterLevel: true,
      backstory: true, attributes: true,
    },
  });
  if (!char) throw new Error('Character not found');

  const campaignIds = [];
  if (campaignId) {
    campaignIds.push(campaignId);
  } else {
    const rows = await prisma.campaignParticipant.findMany({
      where: { characterId },
      select: { campaignId: true },
    });
    campaignIds.push(...rows.map((r) => r.campaignId));
  }

  const hasRange = sceneFrom != null && sceneTo != null;
  let scenes = [];
  if (campaignIds.length > 0) {
    const where = { campaignId: { in: campaignIds } };
    if (hasRange) where.sceneIndex = { gte: sceneFrom, lte: sceneTo };
    scenes = await prisma.campaignScene.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(hasRange ? {} : { take: 10 }),
      select: SCENE_CLIENT_SELECT,
    });
  }

  const sceneTexts = scenes
    .slice(0, hasRange ? scenes.length : 5)
    .map((s, i) => `Scene ${s.sceneIndex ?? i + 1}: ${(s.narrative || '').slice(0, 300)}`)
    .join('\n');

  const attrs = typeof char.attributes === 'object' ? char.attributes : {};
  const charContext = [
    `Name: ${char.name}`,
    `Species: ${char.species}`,
    `Level: ${char.characterLevel}`,
    `Backstory: ${(char.backstory || '').slice(0, 300)}`,
    `Attributes: ${JSON.stringify(attrs)}`,
  ].join('\n');

  const systemPrompt = `You are a dark-fantasy RPG narrator who awards character badges.
Generate a badge for the character based on their recent scenes.
Return JSON with exactly four fields:
- "name": a short (2-4 words), punchy Polish badge name based on behavior (e.g. "Agresywny Palant", "Cień Nocy", "Mól Książkowy").
- "description": 1-3 witty Polish sentences — Pratchett-style commentary on the character's exploits. Sharp, mocking, memorable.
- "icon": one of these Material Symbols icon names that fits the badge: ${BADGE_ICONS.join(', ')}.
- "imagePrompt": An English description for generating a round heraldic medal/emblem badge artwork. Dark fantasy style, ornate frame, symbolic imagery. DO NOT include any text or letters on the badge. 1-2 sentences.`;

  const userPrompt = `CHARACTER:\n${charContext}\n\nRECENT SCENES:\n${sceneTexts || 'No scenes yet — invent brief backstory events.'}`;

  const { text } = await callAIJson({
    provider,
    modelTier: 'nano',
    taskCategory: 'characterBadge',
    systemPrompt,
    userPrompt,
    maxTokens: 500,
    temperature: 0.9,
    userApiKeys,
    taskType: 'character-badge-gen',
    taskLabel: 'Badge generation',
  });

  const parsed = parseJsonOrNull(text);
  const name = (parsed?.name || 'Odznaka').trim().slice(0, 100);
  const description = (parsed?.description || '').trim().slice(0, 1000);
  const icon = BADGE_ICONS.includes(parsed?.icon) ? parsed.icon : pickIcon();
  const imagePrompt = (parsed?.imagePrompt || '').trim().slice(0, 2000) || null;

  let imageUrl = null;
  if (imagePrompt) {
    imageUrl = await generateBadgeImage(imagePrompt, userId);
  }

  const badge = await prisma.characterBadge.create({
    data: {
      characterId,
      campaignId: campaignId || (campaignIds.length === 1 ? campaignIds[0] : null),
      name,
      description,
      icon,
      imageUrl,
      imagePrompt,
      sceneFrom,
      sceneTo,
    },
  });

  log.info({ badgeId: badge.id, characterId, name }, 'Badge generated');
  return badge;
}

/**
 * Re-generate only the badge image using the stored (or fresh) imagePrompt.
 */
export async function regenerateBadgeImage(badgeId, userId) {
  const badge = await prisma.characterBadge.findUnique({ where: { id: badgeId } });
  if (!badge) throw new Error('Badge not found');

  const prompt = badge.imagePrompt;
  if (!prompt) throw new Error('No image prompt stored for this badge');

  const imageUrl = await generateBadgeImage(prompt, userId);
  if (!imageUrl) throw new Error('Image generation failed');

  await prisma.characterBadge.update({
    where: { id: badgeId },
    data: { imageUrl },
  });

  return { ...badge, imageUrl };
}
