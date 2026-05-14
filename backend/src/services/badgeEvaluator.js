import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { callAIJson } from './aiJsonCall.js';
import { requireServerApiKey } from './apiKeyService.js';
import { generateKey } from './hashService.js';
import { downscaleGeneratedImage } from './imageResize.js';
import { createMediaStore } from './mediaStore.js';
import { config } from '../config.js';
import { getCampaignCharacterIds } from './campaignSync.js';

const log = childLogger({ module: 'badgeEvaluator' });

function charLevelCost(targetLevel) {
  return 5 * targetLevel * targetLevel;
}

function cumulativeCharXpThreshold(targetLevel) {
  if (targetLevel <= 1) return 0;
  let sum = 0;
  for (let k = 2; k <= targetLevel; k++) sum += charLevelCost(k);
  return sum;
}

const BadgeResponseSchema = z.object({
  name: z.string().max(60),
  description: z.string().max(200),
  xpValue: z.number().int().min(0),
});

const ImagePromptSchema = z.object({
  prompt: z.string().max(500),
  negativePrompt: z.string().max(300).optional().default(''),
});

// ── Prompts ─────────────────────────────────────────────────────────

const BADGE_SYSTEM_PROMPT = `Jesteś sędzią osiągnięć w grze RPG. Na podstawie ostatnich scen gry musisz wymyślić medal (odznakę) dla gracza.

Zasady:
- Medal ZAWSZE jest przyznawany -- nawet jeśli gracz nie zrobił nic spektakularnego, wymyśl coś zabawnego lub nawiązującego do tego, co robił
- Nazwa medalu: krótka, po polsku, brzmiąca jak tytuł honorowy lub nazwa odznaczenia wojskowego/rycerskiego (np. "Medal Niezłomnego Ducha", "Order Szczęśliwego Przypadku", "Odznaka Mistrza Negocjacji")
- Opis: 1-2 zdania po polsku wyjaśniające za co przyznano medal
- xpValue: liczba od 0 do {maxXp}, proporcjonalna do jakości i epickowości czynów gracza:
  - 0-20% maxXp: gracz nie robił nic szczególnego, rutynowe akcje
  - 20-50% maxXp: przyzwoite działania, pomysłowość, odwaga
  - 50-80% maxXp: epickie czyny, heroizm, genialne rozwiązania
  - 80-100% maxXp: legendarne dokonania, zachwycające pomysły, przełomowe momenty

Odpowiedz JSON: { "name": "...", "description": "...", "xpValue": N }`;

const IMAGE_PROMPT_SYSTEM = `You write image generation prompts for fantasy RPG medal/badge icons. Given a medal name and description, compose a prompt for a detailed circular metallic medal/coin.

Style requirements:
- Circular medallion shape with ornate metallic frame (gold, silver, or bronze)
- Central motif representing the achievement theme
- Dark moody background for game UI contrast
- Fantasy RPG aesthetic, detailed metalwork engraving
- No text or letters on the medal
- Square composition, centered medal filling 80% of frame

Respond with JSON: { "prompt": "...", "negativePrompt": "..." }`;

// ── Main evaluator ──────────────────────────────────────────────────

export async function evaluatePeriodicBadge({
  campaignId,
  sceneIndex,
  freq,
  provider,
  timeoutMs,
  userId,
}) {
  const scenes = await prisma.campaignScene.findMany({
    where: { campaignId },
    orderBy: { sceneIndex: 'desc' },
    take: freq,
    select: { chosenAction: true, dialogueSegments: true, sceneIndex: true },
  });
  if (scenes.length === 0) return;

  const transcriptSummary = scenes
    .sort((a, b) => a.sceneIndex - b.sceneIndex)
    .map((s) => {
      const action = s.chosenAction || '';
      const dialogue = Array.isArray(s.dialogueSegments)
        ? s.dialogueSegments
            .filter((seg) => seg?.text)
            .map((seg) => (seg.type === 'dialogue' ? `${seg.character || 'NPC'}: "${seg.text}"` : seg.text))
            .join('\n')
        : '';
      return `[Scena ${s.sceneIndex + 1}] Gracz: ${action}\n${dialogue}`;
    })
    .join('\n\n');

  const charIds = await getCampaignCharacterIds(campaignId);
  if (charIds.length === 0) return;
  const characterId = charIds[0];

  const char = await prisma.character.findUnique({
    where: { id: characterId },
    select: { name: true, characterLevel: true, characterXp: true, attributePoints: true, skillBadges: true },
  });
  if (!char) return;

  const characterLevel = char.characterLevel || 1;
  const maxXp = charLevelCost(characterLevel + 1);

  // 1. Nano LLM: invent medal
  const systemPrompt = BADGE_SYSTEM_PROMPT.replace('{maxXp}', String(maxXp));
  const userPrompt = `Ostatnie ${freq} scen gracza "${char.name}" (poziom ${characterLevel}):\n${transcriptSummary}\n\nmaxXp = ${maxXp}\nPrzyznaj medal.`;

  const { text } = await callAIJson({
    provider,
    modelTier: 'nano',
    taskCategory: 'badgeEvaluation',
    systemPrompt,
    userPrompt,
    maxTokens: 300,
    temperature: 0.8,
    userId,
  });

  let parsed;
  try {
    parsed = BadgeResponseSchema.parse(JSON.parse(text));
  } catch (err) {
    log.warn({ err: err?.message, text }, 'Badge LLM response failed Zod validation');
    return;
  }
  parsed.xpValue = Math.max(0, Math.min(maxXp, parsed.xpValue));

  // 2. Apply XP to character
  let charXp = (char.characterXp || 0) + parsed.xpValue;
  let charLevel = characterLevel;
  let attrPoints = char.attributePoints || 0;
  while (charXp >= cumulativeCharXpThreshold(charLevel + 1)) {
    charLevel++;
    attrPoints++;
  }

  // 3. Build badge object
  const badge = {
    name: parsed.name,
    description: parsed.description,
    xpValue: parsed.xpValue,
    earnedAt: new Date().toISOString(),
    campaignId,
    sceneIndex,
    imageUrl: null,
  };

  const existingBadges = Array.isArray(char.skillBadges) ? char.skillBadges : [];

  await prisma.character.update({
    where: { id: characterId },
    data: {
      characterXp: charXp,
      characterLevel: charLevel,
      attributePoints: attrPoints,
      skillBadges: [...existingBadges, badge],
    },
  });

  // 4. Generate medal image (best-effort)
  let imageUrl = null;
  try {
    imageUrl = await generateBadgeImage({
      badgeName: parsed.name,
      badgeDescription: parsed.description,
      provider,
      userId,
      campaignId,
      sceneIndex,
    });
    if (imageUrl) {
      badge.imageUrl = imageUrl;
      // Re-read to avoid stale skillBadges
      const fresh = await prisma.character.findUnique({
        where: { id: characterId },
        select: { skillBadges: true },
      });
      const badges = Array.isArray(fresh?.skillBadges) ? [...fresh.skillBadges] : [];
      if (badges.length > 0) {
        badges[badges.length - 1] = { ...badges[badges.length - 1], imageUrl };
      }
      await prisma.character.update({
        where: { id: characterId },
        data: { skillBadges: badges },
      });
    }
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'Badge image generation failed (non-fatal)');
  }

  // 5. Write pendingBadgeAward on Campaign
  const pendingBadgeAward = {
    name: badge.name,
    description: badge.description,
    xpValue: badge.xpValue,
    imageUrl: badge.imageUrl,
    earnedAt: badge.earnedAt,
    sceneIndex: badge.sceneIndex,
    newLevel: charLevel > characterLevel ? charLevel : null,
  };
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { pendingBadgeAward },
  });

  log.info(
    { campaignId, sceneIndex, badgeName: badge.name, xpValue: badge.xpValue, levelUp: charLevel > characterLevel },
    'Periodic badge awarded',
  );
}

// ── Badge image generation ──────────────────────────────────────────

async function generateBadgeImage({ badgeName, badgeDescription, provider, userId, campaignId, sceneIndex }) {
  // Step 1: Generate image prompt via nano
  const { text: promptText } = await callAIJson({
    provider,
    modelTier: 'nano',
    taskCategory: 'badgeImagePrompt',
    systemPrompt: IMAGE_PROMPT_SYSTEM,
    userPrompt: `Medal name: ${badgeName}\nDescription: ${badgeDescription}`,
    maxTokens: 300,
    temperature: 0.7,
    userId,
  });

  let imagePromptData;
  try {
    imagePromptData = ImagePromptSchema.parse(JSON.parse(promptText));
  } catch {
    log.warn({ promptText }, 'Badge image prompt LLM response failed Zod');
    return null;
  }

  // Step 2: Call OpenAI DALL-E / gpt-image
  let apiKey;
  try {
    apiKey = requireServerApiKey('openai', 'OpenAI');
  } catch {
    log.debug('OpenAI key not available for badge image — skipping');
    return null;
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: imagePromptData.prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    log.warn({ status: response.status }, 'Badge image generation API error');
    return null;
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return null;

  const buffer = await downscaleGeneratedImage(Buffer.from(b64, 'base64'));
  const store = createMediaStore(config);
  const cacheKey = generateKey('image', {
    provider: 'dalle',
    type: 'badge',
    campaignId,
    sceneIndex,
    name: badgeName,
  });

  const storeResult = await store.put(cacheKey, buffer, 'image/png');

  await prisma.mediaAsset.upsert({
    where: { key: cacheKey },
    create: {
      userId,
      campaignId,
      key: cacheKey,
      type: 'image',
      contentType: 'image/png',
      path: storeResult.path,
      provider: 'dalle',
    },
    update: {
      path: storeResult.path,
    },
  });

  return storeResult.url || storeResult.path;
}
