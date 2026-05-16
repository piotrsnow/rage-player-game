// Facade over SD-WebUI / Stability for tile-sized PNG generation.
//
// Field-map visuals need small (~64-256 px) pixel-art tiles with a consistent
// style, not the 1344×512 scene framing the scene-gen path uses. Calling the
// existing /v1/proxy/sd-webui/generate route directly works, but goes through
// auth + cache + 1024-scale downscaling that's wrong for tiles. We bypass it
// and call SD-WebUI's REST API directly here, keeping the call shape close
// enough that whoever maintains both can keep them in sync.
//
// Stability path uses the v2beta SD3.5 endpoint (matching backend/src/routes/
// proxy/stability.js). Stability charges per generation and only allows
// 16-aspect outputs — we ask for the nearest aspect ratio and crop to spec.

import sharp from 'sharp';
import { config } from '../../config.js';
import { resolveApiKey } from '../apiKeyService.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'fieldMapVisual.imageGen' });

const FETCH_TIMEOUT_MS = 180_000;

async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildFullPrompt({ prompt, styleAnchor, styleSuffix }) {
  return [prompt, styleAnchor, styleSuffix]
    .filter((p) => typeof p === 'string' && p.trim())
    .join(', ');
}

const TILE_NEGATIVE = 'text, letters, watermark, signature, ui elements, frame border, photographic, 3d render, blurry, low quality, jpeg artifacts, anime face';

/**
 * Round up to nearest multiple of 8 — SDXL / SD3 both prefer dimensions
 * divisible by 8. For 64-px tiles this is a no-op; for 192-px stamps the
 * generator gets a clean 192×192 ask.
 */
function alignDim(n) {
  return Math.max(64, Math.ceil(n / 8) * 8);
}

async function generateSdWebui({ prompt, width, height, seed }) {
  if (!config.sdWebui.url) {
    throw new Error('SD_WEBUI_URL is not configured');
  }
  const baseUrl = config.sdWebui.url.replace(/\/$/, '');
  const payload = {
    prompt,
    negative_prompt: TILE_NEGATIVE,
    width: alignDim(width),
    height: alignDim(height),
    steps: config.sdWebui.tileSteps,
    cfg_scale: config.sdWebui.tileCfg,
    sampler_name: config.sdWebui.tileSampler || config.sdWebui.sampler,
    seed: seed ?? Math.floor(Math.random() * 0xffffffff),
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

async function generateStability({ prompt, userApiKeys }) {
  const apiKey = resolveApiKey(userApiKeys || '{}', 'stability') || config.apiKeys.stability;
  if (!apiKey) throw new Error('Stability API key not configured');

  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('negative_prompt', TILE_NEGATIVE);
  formData.append('model', 'sd3.5-large-turbo');
  // SD3.5 only supports a fixed set of aspect ratios — 1:1 is the only square
  // tile-friendly option. We rescale to the asked footprint after fetch.
  formData.append('aspect_ratio', '1:1');
  formData.append('output_format', 'png');
  formData.append('none', '');

  const res = await fetchWithTimeout('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Stability ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.image) throw new Error('Stability returned no image');
  return Buffer.from(data.image, 'base64');
}

/**
 * Generate a single asset PNG sized exactly to `width × height` (in px).
 *
 * Strategy: ask the provider for a buffer near the target size, then sharp-
 * resize+crop to the exact dimension. Nearest-neighbor keeps pixel-art crisp.
 */
export async function generateTilePng({
  prompt,
  styleAnchor,
  styleSuffix,
  width,
  height,
  provider,
  userApiKeys,
  seed,
}) {
  const fullPrompt = buildFullPrompt({ prompt, styleAnchor, styleSuffix });
  let raw;
  if (provider === 'stability') {
    raw = await generateStability({ prompt: fullPrompt, userApiKeys });
  } else {
    raw = await generateSdWebui({ prompt: fullPrompt, width, height, seed });
  }
  // Resize to exact target — kernel `nearest` for pixel-art crispness.
  const png = await sharp(raw)
    .resize(width, height, { fit: 'cover', kernel: 'nearest' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return png;
}

/**
 * Tiny solid-color fallback used when the configured provider is offline.
 * Keeps the worker pipeline from getting stuck on first run with no SD setup.
 */
export async function generatePlaceholderTile({ width, height, color }) {
  const r = color?.r ?? 90;
  const g = color?.g ?? 110;
  const b = color?.b ?? 90;
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export function isProviderConfigured(provider) {
  if (provider === 'stability') return Boolean(config.apiKeys.stability);
  return Boolean(config.sdWebui.url);
}
