import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import { loadUserApiKeys } from './apiKeyService.js';
import { generateBadgeImage, resolveBadgeImageProviderForUser } from './badgeImageGen.js';
import { SCENE_CLIENT_SELECT } from './campaignSerialize.js';

const log = childLogger({ module: 'badgeGenerator' });

const BADGE_ICONS = [
  'shield', 'military_tech', 'local_fire_department', 'bolt',
  'skull', 'diamond', 'star', 'whatshot', 'visibility', 'psychology',
  'swords', 'castle', 'forest', 'auto_awesome', 'emergency',
];

function pickIcon() {
  return BADGE_ICONS[Math.floor(Math.random() * BADGE_ICONS.length)];
}

async function loadBadgeImageContext(userId, userApiKeys, imageProvider) {
  let keys = userApiKeys;
  let settings = null;

  if (!keys || imageProvider === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { apiKeys: true, settings: true },
    });
    if (!keys) keys = user?.apiKeys || '{}';
    settings = user?.settings;
  }

  const resolvedProvider = imageProvider !== undefined
    ? imageProvider
    : resolveBadgeImageProviderForUser(settings, keys);

  return { userApiKeys: keys, imageProvider: resolvedProvider };
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
 * @param {string} [opts.provider]    - AI text provider (nano)
 * @param {object} [opts.userApiKeys] - pre-loaded encrypted key blob
 * @param {string|null} [opts.imageProvider] - image backend; null skips image
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
  imageProvider = undefined,
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
Return JSON with exactly five fields:
- "name": a short (2-4 words), punchy Polish badge name based on behavior (e.g. "Agresywny Palant", "Cień Nocy", "Mól Książkowy").
- "description": 1-3 witty Polish sentences — Pratchett-style commentary on the character's exploits. Sharp, mocking, memorable.
- "icon": one of these Material Symbols icon names that fits the badge: ${BADGE_ICONS.join(', ')}.
- "color": a vivid, saturated hex color (e.g. "#e63946", "#8b5cf6", "#f59e0b", "#10b981", "#3b82f6", "#ec4899") that represents the badge's mood/theme. MUST be a strong, vibrant color — never gray, never desaturated, never white or black. Think: fiery red for aggression, electric purple for magic, gold for achievement, emerald for nature, crimson for blood.
- "imagePrompt": An English description (1-2 sentences) for generating a CIRCULAR badge illustration in bold comic-book / graphic-novel style. Depict an epic symbolic scene or object from the character's recent adventures — a dramatic moment, a weapon, a creature, an explosion, a magical artifact, a burning building etc. Thick ink outlines, vivid saturated colors, dynamic composition, halftone dots. Fill the entire circle edge-to-edge. NO people, NO characters, NO faces, NO hands, NO text, NO letters. Objects and scenes only.`;

  const userPrompt = `CHARACTER:\n${charContext}\n\nRECENT SCENES:\n${sceneTexts || 'No scenes yet — invent brief backstory events.'}`;

  const keysForAi = userApiKeys ?? (await loadUserApiKeys(prisma, userId));

  const { text } = await callAIJson({
    provider,
    modelTier: 'nano',
    taskCategory: 'characterBadge',
    systemPrompt,
    userPrompt,
    maxTokens: 500,
    temperature: 0.9,
    userApiKeys: keysForAi,
    taskType: 'character-badge-gen',
    taskLabel: 'Badge generation',
  });

  const parsed = parseJsonOrNull(text);
  const name = (parsed?.name || 'Odznaka').trim().slice(0, 100);
  const description = (parsed?.description || '').trim().slice(0, 1000);
  const icon = BADGE_ICONS.includes(parsed?.icon) ? parsed.icon : pickIcon();
  const color = /^#[0-9a-fA-F]{6}$/.test(parsed?.color) ? parsed.color : null;
  const imagePrompt = (parsed?.imagePrompt || '').trim().slice(0, 2000) || null;

  const { userApiKeys: keysForImage, imageProvider: resolvedImageProvider } =
    await loadBadgeImageContext(userId, keysForAi, imageProvider);

  let imageUrl = null;
  if (imagePrompt && resolvedImageProvider) {
    imageUrl = await generateBadgeImage(imagePrompt, {
      userId,
      userApiKeys: keysForImage,
      imageProvider: resolvedImageProvider,
    });
  }

  const badge = await prisma.characterBadge.create({
    data: {
      characterId,
      campaignId: campaignId || (campaignIds.length === 1 ? campaignIds[0] : null),
      name,
      description,
      icon,
      color,
      imageUrl,
      imagePrompt,
      sceneFrom,
      sceneTo,
    },
  });

  log.info({
    badgeId: badge.id,
    characterId,
    name,
    hasImage: Boolean(imageUrl),
    imageProvider: resolvedImageProvider,
  }, 'Badge generated');
  return badge;
}

/**
 * Re-generate only the badge image using the stored imagePrompt.
 */
export async function regenerateBadgeImage(badgeId, userId, { userApiKeys = null, imageProvider = undefined } = {}) {
  const badge = await prisma.characterBadge.findUnique({ where: { id: badgeId } });
  if (!badge) throw new Error('Badge not found');

  const prompt = badge.imagePrompt;
  if (!prompt) throw new Error('No image prompt stored for this badge');

  const { userApiKeys: keys, imageProvider: resolvedProvider } =
    await loadBadgeImageContext(userId, userApiKeys, imageProvider);

  if (!resolvedProvider) throw new Error('Image generation disabled in user settings');

  const imageUrl = await generateBadgeImage(prompt, {
    userId,
    userApiKeys: keys,
    imageProvider: resolvedProvider,
  });
  if (!imageUrl) throw new Error('Image generation failed');

  await prisma.characterBadge.update({
    where: { id: badgeId },
    data: { imageUrl },
  });

  return { ...badge, imageUrl };
}
