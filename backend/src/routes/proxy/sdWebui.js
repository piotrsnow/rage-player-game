import multipart from '@fastify/multipart';
import { prisma } from '../../lib/prisma.js';
import { UUID_PATTERN } from '../../lib/validators.js';
import { generateKey, toUuid } from '../../services/hashService.js';
import { downscaleGeneratedImage, GENERATED_IMAGE_SCALE } from '../../services/imageResize.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { getModelPreset } from '../../services/sdPresets.js';
import { config } from '../../config.js';

const store = createMediaStore(config);

// Loading a checkpoint into VRAM can take 30-60s on a cold switch,
// so we allow up to 120s before the whole request gives up.
const ENSURE_MODEL_TIMEOUT_MS = 120_000;
const GENERATE_TIMEOUT_MS = 180_000;

const DEFAULT_NEGATIVE_PROMPT = 'blurry, lowres, worst quality, low quality, jpeg artifacts, text, watermark, signature, username, deformed, distorted, disfigured, bad anatomy, wrong anatomy, extra limbs, missing limbs, extra fingers, fewer fingers, mutated hands, poorly drawn hands, poorly drawn face, deformed face, bad proportions, out of frame, duplicate, cropped';

// SDXL leans hard on "Renaissance" / "heroic composition" / "sweeping vista"
// style scaffolding — even when the scene is a tavern or forest, those cues
// push the model toward castles, cathedrals, and fortress ruins. The style
// trim helps but isn't enough on its own, so we also guard via negatives.
// Only injected when the POSITIVE prompt mentions nothing architecture-y:
// if the user/LLM legitimately asked for a castle/cathedral/gothic scene,
// CASTLE_FAMILY_RE matches and this block is skipped so the scene renders.
const ANTI_CASTLE_BLEED_NEGATIVES = 'castle, fortress, citadel, cathedral, stone ruins, ruined wall, ivy-covered walls, gothic arches, keep tower, crenellations, battlements';
const CASTLE_FAMILY_RE = /\b(castle|fortress|citadel|cathedral|keep|palace|gothic|ruin|ruins|gatehouse|chapel|monastery|abbey|tower|bastion|stronghold)\b/i;

// Merge the caller's negative with the model preset's style-specific negative
// and the anatomy defaults. Preset value goes last so it can override — most
// preset negatives intentionally repeat "low quality, blurry" which is cheap.
// Deduplicate case-insensitive so we don't blow past A1111's prompt buffer.
function mergeNegatives(userNegative, preset, positivePrompt = '') {
  const antiCastle = CASTLE_FAMILY_RE.test(positivePrompt) ? '' : ANTI_CASTLE_BLEED_NEGATIVES;
  const parts = [userNegative || '', preset?.negative || '', antiCastle, DEFAULT_NEGATIVE_PROMPT]
    .filter(Boolean)
    .join(', ');
  const seen = new Set();
  const out = [];
  for (const token of parts.split(',').map((t) => t.trim()).filter(Boolean)) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out.join(', ');
}

const GENERATE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt'],
  properties: {
    prompt: { type: 'string', maxLength: 4000 },
    negativePrompt: { type: 'string', maxLength: 2000 },
    model: { type: 'string', maxLength: 256 },
    width: { type: 'integer', minimum: 256, maximum: 2048 },
    height: { type: 'integer', minimum: 256, maximum: 2048 },
    steps: { type: 'integer', minimum: 1, maximum: 150 },
    cfg: { type: 'number', minimum: 1, maximum: 30 },
    sampler: { type: 'string', maxLength: 64 },
    // Seed: 0..2^32-1. Absent/null → backend rolls a random one per request
    // (each call is unique → cache is effectively bypassed). Explicit value →
    // deterministic output for the same prompt+model, cache hits are correct.
    seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
    campaignId: { type: 'string', pattern: UUID_PATTERN },
    forceNew: { type: 'boolean' },
  },
};

function randomSeed() {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

function coerceSeed(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const int = Math.floor(n);
  if (int < 0 || int > 0xFFFF_FFFF) return null;
  return int;
}

function requireSdUrl(reply) {
  if (!config.sdWebui.url) {
    reply.code(503).send({
      error: 'SD_WEBUI_URL is not configured. Set it in backend/.env (e.g. http://host.docker.internal:7860).',
      code: 'SD_WEBUI_OFFLINE',
    });
    return null;
  }
  return config.sdWebui.url.replace(/\/$/, '');
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 30_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureModel(baseUrl, targetTitle) {
  if (!targetTitle) return;
  const optionsRes = await fetchWithTimeout(`${baseUrl}/sdapi/v1/options`, { method: 'GET' }, 15_000);
  if (!optionsRes.ok) throw new Error(`sd-webui GET /options failed: ${optionsRes.status}`);
  const opts = await optionsRes.json();
  if (opts.sd_model_checkpoint === targetTitle) return;

  const setRes = await fetchWithTimeout(
    `${baseUrl}/sdapi/v1/options`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sd_model_checkpoint: targetTitle }),
    },
    ENSURE_MODEL_TIMEOUT_MS,
  );
  if (!setRes.ok) {
    const body = await setRes.text().catch(() => '');
    throw new Error(`sd-webui POST /options failed: ${setRes.status} ${body.slice(0, 200)}`);
  }
}

async function persistGeneratedImage({ userId, campaignId, buffer, cacheParams }) {
  const cacheKey = generateKey('image', cacheParams, campaignId);
  const storagePath = cacheKey.replace('.png', '.jpg');
  const storeResult = await store.put(storagePath, buffer, 'image/jpeg');

  await prisma.mediaAsset.upsert({
    where: { key: cacheKey },
    create: {
      userId,
      campaignId: toUuid(campaignId),
      key: cacheKey,
      type: 'image',
      contentType: 'image/jpeg',
      size: buffer.length,
      backend: config.mediaBackend,
      path: storagePath,
      metadata: cacheParams,
    },
    update: {},
  });

  return { url: storeResult.url, key: cacheKey };
}

export async function sdWebuiProxyRoutes(fastify) {
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  fastify.addHook('onRequest', fastify.authenticate);

  // List installed checkpoints. FE calls this to populate the model dropdown.
  fastify.get('/models', async (_request, reply) => {
    const baseUrl = requireSdUrl(reply);
    if (!baseUrl) return;

    try {
      const res = await fetchWithTimeout(`${baseUrl}/sdapi/v1/sd-models`, { method: 'GET' }, 10_000);
      if (!res.ok) {
        return reply.code(502).send({
          error: `sd-webui returned ${res.status}`,
          code: 'SD_WEBUI_ERROR',
        });
      }
      const raw = await res.json();
      const models = Array.isArray(raw)
        ? raw.map((m) => ({ title: m.title, name: m.model_name, hash: m.hash || null }))
        : [];

      let current = null;
      try {
        const optRes = await fetchWithTimeout(`${baseUrl}/sdapi/v1/options`, { method: 'GET' }, 10_000);
        if (optRes.ok) {
          const opt = await optRes.json();
          current = opt.sd_model_checkpoint || null;
        }
      } catch { /* non-fatal */ }

      return { models, current };
    } catch (err) {
      return reply.code(503).send({
        error: `sd-webui unreachable at ${baseUrl}: ${err.message}`,
        code: 'SD_WEBUI_OFFLINE',
      });
    }
  });

  fastify.post('/generate', { schema: { body: GENERATE_BODY_SCHEMA } }, async (request, reply) => {
    const baseUrl = requireSdUrl(reply);
    if (!baseUrl) return;

    const {
      prompt,
      negativePrompt: rawNegativePrompt,
      model,
      width: rawWidth,
      height: rawHeight,
      steps: rawSteps,
      cfg: rawCfg,
      sampler: rawSampler,
      seed: bodySeed,
      campaignId,
      forceNew = false,
    } = request.body;

    // Parameter resolution chain: explicit body value > per-model preset >
    // backend config default. The preset values are tuned for each checkpoint
    // (see sdPresets.js); config defaults stay as the fallback for models
    // we don't have a preset for (e.g. DreamShaperXL Turbo defaults).
    const preset = getModelPreset(model);
    const sampler = rawSampler ?? preset?.sampler ?? config.sdWebui.sampler;
    const steps = rawSteps ?? preset?.steps ?? config.sdWebui.steps;
    const cfg = rawCfg ?? preset?.cfg ?? config.sdWebui.cfg;
    const width = rawWidth ?? preset?.width ?? config.sdWebui.sceneWidth;
    const height = rawHeight ?? preset?.height ?? config.sdWebui.sceneHeight;
    const negativePrompt = mergeNegatives(rawNegativePrompt, preset, prompt);

    // Fixed seed (from FE) → reproducible & cacheable. No seed → random,
    // and because the seed is part of cacheParams the cache key is unique
    // per request, which is exactly what we want for "always fresh".
    const userSuppliedSeed = Number.isInteger(bodySeed);
    const seed = userSuppliedSeed ? bodySeed : randomSeed();

    const cacheParams = {
      provider: 'sd-webui',
      prompt,
      model: model || null,
      width,
      height,
      seed,
      resolutionScale: GENERATED_IMAGE_SCALE,
      ...(forceNew ? { requestTs: Date.now() } : {}),
    };
    const cacheKey = generateKey('image', cacheParams, campaignId);

    if (!forceNew && userSuppliedSeed) {
      const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
      if (existing) {
        const url = await store.getUrl(existing.path);
        return { cached: true, url, key: cacheKey, seed };
      }
    }

    try {
      await ensureModel(baseUrl, model);
    } catch (err) {
      return reply.code(502).send({ error: `Failed to switch SD model: ${err.message}`, code: 'SD_WEBUI_ERROR' });
    }

    const payload = {
      prompt,
      negative_prompt: negativePrompt,
      width,
      height,
      steps,
      cfg_scale: cfg,
      sampler_name: sampler,
      seed,
      n_iter: 1,
      batch_size: 1,
      save_images: true,
    };

    // Opt-in hires fix (SD_WEBUI_HIRES_FIX=1) — ~2x generation time but
    // fixes blurry faces in wide scene framing. Skip for /portrait (768x1024
    // already gives faces ~1/3 of the frame, hires pass adds little there).
    if (config.sdWebui.hiresFix) {
      payload.enable_hr = true;
      payload.hr_scale = 1.5;
      payload.hr_upscaler = 'R-ESRGAN 4x+';
      payload.hr_second_pass_steps = Math.max(4, Math.round(steps * 0.7));
      payload.denoising_strength = 0.3;
    }

    let res;
    try {
      res = await fetchWithTimeout(
        `${baseUrl}/sdapi/v1/txt2img`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        GENERATE_TIMEOUT_MS,
      );
    } catch (err) {
      return reply.code(503).send({ error: `sd-webui unreachable: ${err.message}`, code: 'SD_WEBUI_OFFLINE' });
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return reply.code(res.status).send({ error: `sd-webui txt2img failed: ${body.slice(0, 500)}` });
    }

    const data = await res.json();
    const b64 = Array.isArray(data.images) ? data.images[0] : null;
    if (!b64) return reply.code(502).send({ error: 'sd-webui returned no image' });

    const originalBuffer = Buffer.from(b64, 'base64');
    const buffer = await downscaleGeneratedImage(originalBuffer);

    const result = await persistGeneratedImage({
      userId: request.user.id,
      campaignId,
      buffer,
      cacheParams,
    });
    return { cached: false, ...result, seed };
  });

  // img2img for portrait-from-photo (field `image`) or a txt2img fallback when
  // no file is uploaded. Accepts multipart so the FE can POST the user's photo.
  fastify.post('/portrait', async (request, reply) => {
    const baseUrl = requireSdUrl(reply);
    if (!baseUrl) return;

    const parts = request.parts();
    let imageBuffer = null;
    let prompt = '';
    let rawNegativePrompt = null;
    let strength = '0.55';
    let model = '';
    let seedRaw = null;

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'image') {
        imageBuffer = await part.toBuffer();
      } else if (part.type === 'field') {
        if (part.fieldname === 'prompt') prompt = part.value;
        if (part.fieldname === 'negativePrompt') rawNegativePrompt = part.value;
        if (part.fieldname === 'strength') strength = part.value;
        if (part.fieldname === 'model') model = part.value;
        if (part.fieldname === 'seed') seedRaw = part.value;
      }
    }

    if (!prompt) return reply.code(400).send({ error: 'prompt is required' });

    try {
      await ensureModel(baseUrl, model);
    } catch (err) {
      return reply.code(502).send({ error: `Failed to switch SD model: ${err.message}`, code: 'SD_WEBUI_ERROR' });
    }

    const coerced = coerceSeed(seedRaw);
    const seed = coerced === null ? randomSeed() : coerced;

    // Portrait dims come from the per-model preset (832x1216 = SDXL-native
    // 2:3 portrait bucket) instead of the legacy 768x1024 which sits
    // off-bucket and hurts Starlight/Painter's quality. For unknown models we
    // keep the old 768x1024 — safe across non-SDXL checkpoints too.
    const preset = getModelPreset(model);
    const width = preset?.portraitWidth ?? 768;
    const height = preset?.portraitHeight ?? 1024;
    const sampler = preset?.sampler ?? config.sdWebui.sampler;
    const steps = preset?.steps ?? config.sdWebui.steps;
    const cfg = preset?.cfg ?? config.sdWebui.cfg;
    const negativePrompt = mergeNegatives(rawNegativePrompt, preset, prompt);

    let res;
    try {
      if (imageBuffer) {
        const initImage = imageBuffer.toString('base64');
        const payload = {
          init_images: [initImage],
          prompt,
          negative_prompt: negativePrompt,
          denoising_strength: Math.max(0, Math.min(1, parseFloat(strength) || 0.55)),
          width,
          height,
          steps,
          cfg_scale: cfg,
          sampler_name: sampler,
          seed,
          n_iter: 1,
          batch_size: 1,
          save_images: true,
        };
        res = await fetchWithTimeout(
          `${baseUrl}/sdapi/v1/img2img`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          GENERATE_TIMEOUT_MS,
        );
      } else {
        const payload = {
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          steps,
          cfg_scale: cfg,
          sampler_name: sampler,
          seed,
          n_iter: 1,
          batch_size: 1,
          save_images: true,
        };
        res = await fetchWithTimeout(
          `${baseUrl}/sdapi/v1/txt2img`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          GENERATE_TIMEOUT_MS,
        );
      }
    } catch (err) {
      return reply.code(503).send({ error: `sd-webui unreachable: ${err.message}`, code: 'SD_WEBUI_OFFLINE' });
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return reply.code(res.status).send({ error: `sd-webui portrait failed: ${body.slice(0, 500)}` });
    }

    const data = await res.json();
    const b64 = Array.isArray(data.images) ? data.images[0] : null;
    if (!b64) return reply.code(502).send({ error: 'sd-webui returned no image' });

    const resultBuffer = Buffer.from(b64, 'base64');
    const cacheParams = {
      provider: 'sd-webui',
      type: 'portrait',
      prompt,
      model: model || null,
      seed,
      hasInit: !!imageBuffer,
    };
    const result = await persistGeneratedImage({
      userId: request.user.id,
      campaignId: null,
      buffer: resultBuffer,
      cacheParams,
    });
    return { ...result, seed };
  });
}
