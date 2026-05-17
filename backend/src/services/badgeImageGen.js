import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { resolveApiKey } from './apiKeyService.js';
import { generateKey } from './hashService.js';
import { downscaleGeneratedImage, getGeneratedImageScale } from './imageResize.js';
import { createMediaStore } from './mediaStore.js';
import { config } from '../config.js';
import { resolveBadgeImageProvider } from '../../../shared/domain/badgeImageProvider.js';

const log = childLogger({ module: 'badgeImageGen' });
const store = createMediaStore(config);

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent';

const BADGE_NEGATIVE = 'text, watermark, signature, blurry, low quality, photo, realistic face, human face, person, character, face, hands';
const BADGE_SD_SIZE = 768;
const FETCH_TIMEOUT_MS = 180_000;

export { resolveBadgeImageProvider };

export function resolveBadgeImageProviderForUser(userSettings, userApiKeys = '{}') {
  return resolveBadgeImageProvider(userSettings, {
    sdWebuiConfigured: Boolean(config.sdWebui.url),
    stabilityConfigured: Boolean(
      config.apiKeys.stability || resolveApiKey(userApiKeys, 'stability'),
    ),
  });
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function alignDim(n) {
  return Math.max(64, Math.ceil(n / 8) * 8);
}

async function generateSdWebuiRaw(prompt) {
  if (!config.sdWebui.url) throw new Error('SD_WEBUI_URL is not configured');
  const baseUrl = config.sdWebui.url.replace(/\/$/, '');
  const size = alignDim(BADGE_SD_SIZE);
  const payload = {
    prompt,
    negative_prompt: BADGE_NEGATIVE,
    width: size,
    height: size,
    steps: config.sdWebui.steps,
    cfg_scale: config.sdWebui.cfg,
    sampler_name: config.sdWebui.sampler,
    seed: Math.floor(Math.random() * 0xffffffff),
    n_iter: 1,
    batch_size: 1,
    save_images: false,
  };
  const res = await fetchWithTimeout(`${baseUrl}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`sd-webui txt2img ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const b64 = Array.isArray(data.images) ? data.images[0] : null;
  if (!b64) throw new Error('sd-webui returned no image');
  return Buffer.from(b64, 'base64');
}

async function generateStabilityRaw(prompt, userApiKeys) {
  const apiKey = resolveApiKey(userApiKeys || '{}', 'stability');
  if (!apiKey) throw new Error('Stability API key not configured');

  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('negative_prompt', BADGE_NEGATIVE);
  formData.append('model', 'sd3.5-large-turbo');
  formData.append('aspect_ratio', '1:1');
  formData.append('output_format', 'jpeg');
  formData.append('none', '');

  const response = await fetchWithTimeout('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Stability API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.finish_reason === 'CONTENT_FILTERED') throw new Error('Stability content filtered');
  if (!data.image) throw new Error('Stability returned no image');
  return Buffer.from(data.image, 'base64');
}

async function generateOpenAiRaw(prompt, userApiKeys, variant) {
  const apiKey = resolveApiKey(userApiKeys || '{}', 'openai');
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const isGptImage = variant === 'gpt-image';
  const imageModel = isGptImage ? 'gpt-image-1.5' : 'dall-e-3';
  const bodyPayload = isGptImage
    ? { model: imageModel, prompt, n: 1, size: '1024x1024', quality: 'medium' }
    : {
      model: imageModel,
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'b64_json',
    };

  const response = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI images ${response.status}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image');
  return Buffer.from(b64, 'base64');
}

function extractGeminiImage(data) {
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  const imagePart = parts.find((p) => p.inlineData);
  if (!imagePart?.inlineData?.data) return null;
  return imagePart.inlineData;
}

async function generateGeminiRaw(prompt, userApiKeys) {
  const apiKey = resolveApiKey(userApiKeys || '{}', 'gemini');
  if (!apiKey) throw new Error('Gemini API key not configured');

  const response = await fetchWithTimeout(
    `${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const imageData = extractGeminiImage(data);
  if (!imageData) throw new Error('Gemini returned no image');
  return Buffer.from(imageData.data, 'base64');
}

async function fetchRawBadgeImage(imagePrompt, imageProvider, userApiKeys) {
  switch (imageProvider) {
    case 'sd-webui':
      return generateSdWebuiRaw(imagePrompt);
    case 'stability':
      return generateStabilityRaw(imagePrompt, userApiKeys);
    case 'dalle':
      return generateOpenAiRaw(imagePrompt, userApiKeys, 'dalle');
    case 'gpt-image':
      return generateOpenAiRaw(imagePrompt, userApiKeys, 'gpt-image');
    case 'gemini':
      return generateGeminiRaw(imagePrompt, userApiKeys);
    default:
      return null;
  }
}

async function persistBadgeImage(buffer, { userId, imagePrompt, imageProvider }) {
  const scale = imageProvider === 'gemini'
    ? getGeneratedImageScale('gemini')
    : undefined;
  const processed = await downscaleGeneratedImage(buffer, scale);

  const isJpeg = imageProvider === 'stability';
  const contentType = isJpeg ? 'image/jpeg' : 'image/png';
  const ext = isJpeg ? '.jpg' : '.png';

  const cacheKey = generateKey('image', {
    provider: imageProvider,
    type: 'badge',
    prompt: imagePrompt,
    ts: Date.now(),
  });
  const storagePath = cacheKey.replace('.png', ext);
  const storeResult = await store.put(storagePath, processed, contentType);

  await prisma.mediaAsset.upsert({
    where: { key: cacheKey },
    create: {
      userId,
      key: cacheKey,
      type: 'image',
      contentType,
      size: processed.length,
      backend: config.mediaBackend,
      path: storagePath,
      metadata: { provider: imageProvider, type: 'badge', prompt: imagePrompt },
    },
    update: {},
  });

  return storeResult.url;
}

/**
 * Generate a badge illustration and store it in media. Returns canonical URL or null.
 */
export async function generateBadgeImage(imagePrompt, { userId, userApiKeys = '{}', imageProvider }) {
  if (!imagePrompt?.trim() || !imageProvider) return null;

  try {
    const raw = await fetchRawBadgeImage(imagePrompt.trim(), imageProvider, userApiKeys);
    if (!raw) return null;
    return await persistBadgeImage(raw, { userId, imagePrompt, imageProvider });
  } catch (err) {
    log.warn({ err: err?.message, imageProvider }, 'Badge image generation failed (non-fatal)');
    return null;
  }
}
