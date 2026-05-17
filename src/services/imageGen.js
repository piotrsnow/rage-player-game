import { buildImagePrompt, buildItemImagePrompt, buildSpellImagePrompt, buildPortraitPrompt, getModelPreset, getImageStyleSdNegative, REFERENCE_PHOTO_NEGATIVE } from './imagePrompts';
import { apiClient, toCanonicalStoragePath } from './apiClient';
import { ensureEnglish } from './translateImagePrompt';

// Image generation — FE-side direct provider calls were removed with the
// no-BYOK cleanup. Every request now goes through the backend proxy
// (`/v1/proxy/openai/*`, `/v1/proxy/stability/*`, `/v1/proxy/gemini/*`).
// The backend resolves the per-user API key from the authenticated user's
// encrypted bundle and falls back to env keys.

const GENERATED_IMAGE_SCALE = 0.75;
const GEMINI_IMAGE_SCALE_MULTIPLIER = 0.7;

export function getGeneratedImageScale(provider = 'dalle') {
  if (provider === 'gemini') {
    return GENERATED_IMAGE_SCALE * GEMINI_IMAGE_SCALE_MULTIPLIER;
  }
  return GENERATED_IMAGE_SCALE;
}

// Keep asset URLs canonical (`/v1/media/file/...`) when they flow out of the
// services layer — they get persisted to DB (character.portraitUrl, scene.image,
// item.imageUrl). `apiClient.resolveMediaUrl` (which appends origin + `?token`)
// must only run at render time.
function canonicalUrl(url) {
  if (!url) return null;
  return toCanonicalStoragePath(url);
}

const NODE_TYPE_LABELS = {
  generic: 'fantasy location',
  hamlet: 'tiny hamlet with a few houses',
  village: 'small fantasy village',
  town: 'medieval fantasy town',
  city: 'large walled fantasy city',
  capital: 'grand capital city with towers and walls',
  dungeon: 'dungeon entrance',
  forest: 'dense enchanted forest',
  wilderness: 'untamed wilderness landscape',
  mountain: 'rocky mountain highlands',
  ruin: 'ancient crumbling ruins',
  camp: 'makeshift camp or encampment',
  cave: 'underground cave entrance',
  interior: 'building interior',
  dungeon_room: 'dark dungeon chamber',
  campaignPlace: 'notable fantasy landmark',
  region: 'sweeping regional landscape',
  area: 'distinct fantasy area',
  district: 'town district',
  site: 'point of interest',
  room: 'single room interior',
  point: 'small point of interest',
};

const DANGER_LABELS = {
  moderate: 'eerie and somewhat ominous atmosphere',
  dangerous: 'dangerous and hostile atmosphere',
  deadly: 'deadly, terrifying atmosphere',
};

async function buildNodeImagePromptFromMeta(node) {
  const parts = ['Fantasy landscape illustration'];
  const typeLabel = NODE_TYPE_LABELS[node.locationType || node.type] || 'fantasy location';
  parts.push(`of a ${typeLabel}`);
  if (node.name) {
    const enName = await ensureEnglish(node.name);
    parts.push(`called "${enName}"`);
  }
  if (node.description) {
    const enDesc = await ensureEnglish(
      node.description.length > 200 ? node.description.slice(0, 200) + '…' : node.description,
    );
    parts.push(`. ${enDesc}`);
  }
  if (node.atmosphere) {
    const enAtmo = await ensureEnglish(node.atmosphere);
    parts.push(`. Atmosphere: ${enAtmo}`);
  }
  if (node.biome) parts.push(`. Biome: ${node.biome}`);
  const dangerPhrase = DANGER_LABELS[node.dangerLevel];
  if (dangerPhrase) parts.push(`. ${dangerPhrase}`);
  const tags = Array.isArray(node.tags) ? node.tags.filter(Boolean) : [];
  if (tags.length) parts.push(`. Features: ${tags.slice(0, 5).join(', ')}`);
  parts.push('. Richly detailed, dramatic lighting, painterly style, square composition');
  let result = parts.join(' ');
  if (result.length > 600) result = result.slice(0, 599) + '…';
  return result;
}

export { buildNodeImagePromptFromMeta };

// Attach SDXL preset hints (sampler/steps/cfg/width/height/negative) to the
// /proxy/sd-webui/generate body so each checkpoint runs at its sweet spot.
// Backend does the same lookup as a safety net — we send from FE so the UI
// can override individual fields later without backend changes. `kind` picks
// portrait vs scene bucket dimensions; omit width/height if the caller
// already set them explicitly.
function roundTo8(v) {
  return Math.max(256, Math.round(v / 8) * 8);
}

function applyPresetToPayload(payload, sdModel, kind = 'scene', resolutionMultiplier = 1, { qualitySteps, qualityCfg } = {}) {
  const preset = getModelPreset(sdModel);
  if (!preset) return;
  if (payload.sampler == null) payload.sampler = preset.sampler;
  if (payload.steps == null) payload.steps = qualitySteps ?? preset.steps;
  if (payload.cfg == null) payload.cfg = qualityCfg ?? preset.cfg;
  if (payload.width == null) {
    payload.width = kind === 'portrait' ? preset.portraitWidth : preset.width;
  }
  if (payload.height == null) {
    payload.height = kind === 'portrait' ? preset.portraitHeight : preset.height;
  }
  if (payload.negativePrompt == null && preset.negative) {
    payload.negativePrompt = preset.negative;
  }
  if (kind !== 'portrait' && resolutionMultiplier !== 1 && resolutionMultiplier > 0) {
    payload.width = roundTo8(payload.width * resolutionMultiplier);
    payload.height = roundTo8(payload.height * resolutionMultiplier);
  }
}

async function fetchPortraitAsBase64(portraitUrl) {
  try {
    const res = await fetch(apiClient.resolveMediaUrl(portraitUrl));
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        resolve(dataUrl.split(',')[1] || null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const IPA_WEIGHT_BY_MODE = { speed: 0.15, balanced: 0.35, quality: 0.65 };

async function generateSceneViaProxy(prompt, provider, campaignId, { forceNew = false, portraitUrl = null, sdModel = null, sdSeed = null, shape = 'scene', negativePrompt = null, resolutionMultiplier = 1, ipaMode = 'balanced', qualitySteps, qualityCfg } = {}) {
  const body = { prompt };
  if (campaignId) body.campaignId = campaignId;
  if (forceNew) body.forceNew = true;

  const isSquare = shape === 'square';

  if (provider === 'stability') {
    const payload = isSquare ? { ...body, aspectRatio: '1:1' } : body;
    const data = await apiClient.post('/proxy/stability/generate', payload);
    return canonicalUrl(data.url);
  }
  if (provider === 'gemini') {
    const payload = isSquare ? { ...body, aspectRatio: '1:1' } : body;
    const data = await apiClient.post('/proxy/gemini/generate', payload);
    return canonicalUrl(data.url);
  }
  if (provider === 'sd-webui') {
    const payload = { ...body };
    if (sdModel) payload.model = sdModel;
    if (Number.isInteger(sdSeed)) payload.seed = sdSeed;
    if (isSquare) {
      payload.width = 1024;
      payload.height = 1024;
    }
    applyPresetToPayload(payload, sdModel, 'scene', resolutionMultiplier, { qualitySteps, qualityCfg });
    if (negativePrompt) {
      payload.negativePrompt = payload.negativePrompt
        ? `${negativePrompt}, ${payload.negativePrompt}`
        : negativePrompt;
    }
    if (portraitUrl && ipaMode !== 'off') {
      const b64 = await fetchPortraitAsBase64(portraitUrl);
      if (b64) {
        payload.portraitBase64 = b64;
        const weight = IPA_WEIGHT_BY_MODE[ipaMode];
        if (weight != null) payload.ipaWeight = weight;
      }
    }
    const data = await apiClient.post('/proxy/sd-webui/generate', payload);
    return canonicalUrl(data.url);
  }
  if (provider === 'gpt-image') {
    const squareSize = isSquare ? { size: '1024x1024' } : {};
    if (portraitUrl) {
      const data = await apiClient.post('/proxy/openai/images/edits', { ...body, portraitUrl, model: 'gpt-image-1.5', ...squareSize });
      return canonicalUrl(data.url);
    }
    const data = await apiClient.post('/proxy/openai/images', { ...body, model: 'gpt-image-1.5', ...squareSize });
    return canonicalUrl(data.url);
  }
  // Default: DALL-E
  const squareSize = isSquare ? { size: '1024x1024' } : {};
  const data = await apiClient.post('/proxy/openai/images', { ...body, ...squareSize });
  return canonicalUrl(data.url);
}

async function generatePortraitViaStabilityProxy(imageBlob, prompt, strength) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'photo.jpg');
  formData.append('prompt', prompt);
  formData.append('strength', String(strength));
  formData.append('negativePrompt', REFERENCE_PHOTO_NEGATIVE);

  const data = await apiClient.request('/proxy/stability/portrait', {
    method: 'POST',
    body: formData,
  });
  return canonicalUrl(data.url);
}

async function generatePortraitViaGptImageEditsProxy(imageBlob, prompt) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'photo.jpg');
  formData.append('prompt', prompt);
  formData.append('size', '1024x1024');
  formData.append('quality', 'medium');
  formData.append('inputFidelity', 'high');

  const data = await apiClient.request('/proxy/openai/portrait', {
    method: 'POST',
    body: formData,
  });
  return canonicalUrl(data.url);
}

async function generatePortraitViaDalleProxy(prompt) {
  const data = await apiClient.post('/proxy/openai/images', {
    prompt,
    size: '1024x1024',
  });
  return canonicalUrl(data.url);
}

async function generatePortraitViaGeminiProxy(prompt) {
  const data = await apiClient.post('/proxy/gemini/portrait', { prompt });
  return canonicalUrl(data.url);
}

async function generatePortraitViaGeminiImg2ImgProxy(imageBlob, prompt) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'photo.jpg');
  formData.append('prompt', prompt);

  const data = await apiClient.request('/proxy/gemini/portrait', {
    method: 'POST',
    body: formData,
  });
  return canonicalUrl(data.url);
}

async function generatePortraitViaSdWebuiProxy(imageBlob, prompt, strength, sdModel, sdSeed, ipaWeight = null) {
  const formData = new FormData();
  if (imageBlob) formData.append('image', imageBlob, 'photo.jpg');
  formData.append('prompt', prompt);
  formData.append('strength', String(strength ?? 0.55));
  if (sdModel) formData.append('model', sdModel);
  if (Number.isInteger(sdSeed)) formData.append('seed', String(sdSeed));
  if (imageBlob && ipaWeight != null) formData.append('ipaWeight', String(ipaWeight));
  if (imageBlob) formData.append('negativePrompt', REFERENCE_PHOTO_NEGATIVE);

  const data = await apiClient.request('/proxy/sd-webui/portrait', {
    method: 'POST',
    body: formData,
  });
  return canonicalUrl(data.url);
}

// --- Image request queue: max 1 concurrent, 1s cooldown ---
const _imgQueue = [];
let _imgQueueBusy = false;

function enqueueImageRequest(fn) {
  return new Promise((resolve, reject) => {
    _imgQueue.push({ fn, resolve, reject });
    if (!_imgQueueBusy) _drainImageQueue();
  });
}

async function _drainImageQueue() {
  _imgQueueBusy = true;
  while (_imgQueue.length > 0) {
    const { fn, resolve, reject } = _imgQueue.shift();
    try {
      resolve(await fn());
    } catch (err) {
      reject(err);
    }
    if (_imgQueue.length > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  _imgQueueBusy = false;
}

const _imageServiceImpl = {
  async generateSceneImage(narrative, genre, tone, _apiKeyIgnored, provider = 'dalle', imagePrompt = null, campaignId = null, imageStyle = 'painting', darkPalette = false, characterAge = null, characterGender = null, options = {}, seriousness = null, portraitUrl = null) {
    const hasGptPortrait = provider === 'gpt-image' && !!portraitUrl;
    const hasSdPortrait = provider === 'sd-webui' && !!portraitUrl;
    const sdModel = provider === 'sd-webui' ? (options?.sdModel || null) : null;

    let prompt;
    if (options?.preBuiltPrompt) {
      prompt = options.preBuiltPrompt;
    } else {
      const [enImagePrompt, enNarrative] = await Promise.all([
        ensureEnglish(imagePrompt),
        imagePrompt ? Promise.resolve(narrative || '') : ensureEnglish((narrative || '').substring(0, 300)),
      ]);
      prompt = buildImagePrompt(enNarrative, genre, tone, enImagePrompt, provider, imageStyle, darkPalette, characterAge, characterGender, seriousness, hasGptPortrait, sdModel);
    }

    let negativePrompt = options?.preBuiltNegativePrompt || options?.negativePrompt || null;
    if (!negativePrompt && provider === 'sd-webui') {
      negativePrompt = getImageStyleSdNegative(imageStyle);
    }
    const url = await generateSceneViaProxy(prompt, provider, campaignId, {
      ...options,
      portraitUrl: (hasGptPortrait || hasSdPortrait) ? portraitUrl : null,
      negativePrompt,
    });
    return { url, prompt };
  },

  async generatePortrait(imageBlob, { species, age, gender, careerName, genre, subjectOverride = null, appearanceText = null } = {}, _apiKeyIgnored, strength = 0.45, provider = 'stability', imageStyle = 'painting', darkPalette = false, seriousness = null, sdModel = null, extras = {}, sdSeed = null) {
    // NPC pipeline supplies a fully-formed English subject from the LLM
    // prompt builder (see services/npcPortraitPromptLlm.js). When present we
    // skip the per-field translation + species/career templating entirely —
    // the override IS the subject. Player creator does not pass an override
    // so it still routes through ensureEnglish + buildPortraitPrompt's
    // humanoid/creature switch below.
    //
    // `appearanceText` (PL) is the canonical NPC physical description from
    // CampaignNPC.appearance. When provided we translate it and feed it as
    // an extra appearance directive so retries/regenerations stay visually
    // consistent — works alongside subjectOverride or the heuristic path.
    const trimmedOverride = typeof subjectOverride === 'string' ? subjectOverride.trim() : '';
    const enAppearance = appearanceText ? await ensureEnglish(appearanceText) : null;
    const enrichedExtras = enAppearance ? { ...extras, appearance: enAppearance } : extras;
    let prompt;
    if (trimmedOverride) {
      prompt = buildPortraitPrompt(null, gender, age, null, genre, provider, imageStyle, Boolean(imageBlob), darkPalette, seriousness, enrichedExtras, sdModel, trimmedOverride);
    } else {
      // `careerName` is the only free-form user-content field here for the
      // player creator (species comes from an English enum). NPC portraits
      // without an LLM override fall back to the heuristic path and need both
      // species and careerName translated; ensureEnglish is a no-op for
      // English text.
      const [enCareerName, enSpecies] = await Promise.all([
        ensureEnglish(careerName),
        ensureEnglish(species),
      ]);
      prompt = buildPortraitPrompt(enSpecies, gender, age, enCareerName, genre, provider, imageStyle, Boolean(imageBlob), darkPalette, seriousness, enrichedExtras, sdModel);
    }

    let url;
    if (provider === 'dalle') {
      url = await generatePortraitViaDalleProxy(prompt);
    } else if (provider === 'gpt-image') {
      if (imageBlob) {
        url = await generatePortraitViaGptImageEditsProxy(imageBlob, prompt);
      } else {
        const data = await apiClient.post('/proxy/openai/images', { prompt, model: 'gpt-image-1.5', size: '1024x1024' });
        url = canonicalUrl(data.url);
      }
    } else if (provider === 'gemini') {
      url = imageBlob
        ? await generatePortraitViaGeminiImg2ImgProxy(imageBlob, prompt)
        : await generatePortraitViaGeminiProxy(prompt);
    } else if (provider === 'sd-webui') {
      const ipaWeight = extras?.ipaWeight ?? null;
      url = await generatePortraitViaSdWebuiProxy(imageBlob, prompt, strength, sdModel, sdSeed, ipaWeight);
    } else {
      if (imageBlob) {
        url = await generatePortraitViaStabilityProxy(imageBlob, prompt, strength);
      } else {
        const data = await apiClient.post('/proxy/stability/generate', { prompt, aspectRatio: '1:1' });
        url = canonicalUrl(data.url);
      }
    }
    return { url, prompt };
  },

  async generatePlaygroundImage({ prompt, provider = 'dalle', sdModel = null, sdSeed = null, referenceBlob = null, strength = 0.55, resolutionMultiplier = 1 } = {}) {
    const rawPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (!rawPrompt) throw new Error('Prompt is required');

    if (referenceBlob) {
      if (provider === 'stability') return generatePortraitViaStabilityProxy(referenceBlob, rawPrompt, strength);
      if (provider === 'gpt-image') return generatePortraitViaGptImageEditsProxy(referenceBlob, rawPrompt);
      if (provider === 'gemini') return generatePortraitViaGeminiImg2ImgProxy(referenceBlob, rawPrompt);
      if (provider === 'sd-webui') return generatePortraitViaSdWebuiProxy(referenceBlob, rawPrompt, strength, sdModel, sdSeed);
      // `dalle` and unknown providers: fall through to text-only.
    }

    if (provider === 'stability') {
      const data = await apiClient.post('/proxy/stability/generate', { prompt: rawPrompt });
      return canonicalUrl(data.url);
    }
    if (provider === 'gemini') {
      const data = await apiClient.post('/proxy/gemini/generate', { prompt: rawPrompt });
      return canonicalUrl(data.url);
    }
    if (provider === 'sd-webui') {
      const payload = { prompt: rawPrompt };
      if (sdModel) payload.model = sdModel;
      if (Number.isInteger(sdSeed)) payload.seed = sdSeed;
      applyPresetToPayload(payload, sdModel, 'scene', resolutionMultiplier);
      const data = await apiClient.post('/proxy/sd-webui/generate', payload);
      return canonicalUrl(data.url);
    }
    if (provider === 'gpt-image') {
      const data = await apiClient.post('/proxy/openai/images', { prompt: rawPrompt, model: 'gpt-image-1.5' });
      return canonicalUrl(data.url);
    }
    const data = await apiClient.post('/proxy/openai/images', { prompt: rawPrompt });
    return canonicalUrl(data.url);
  },

  async generateItemImage(item, { genre, tone, provider = 'dalle', imageStyle = 'painting', darkPalette = false, seriousness = null, campaignId = null, sdModel = null, sdSeed = null, forceNew = false, resolutionMultiplier = 1 } = {}) {
    // Item name/description are in the campaign language (PL). Translate fully
    // into English for the image model — including fantasy object names.
    const [enName, enDescription] = await Promise.all([
      ensureEnglish(item?.name, { kind: 'item' }),
      ensureEnglish(item?.description, { kind: 'item' }),
    ]);
    const translatedItem = item ? { ...item, name: enName, description: enDescription } : item;
    const prompt = buildItemImagePrompt(translatedItem, {
      genre,
      tone,
      provider,
      imageStyle,
      darkPalette,
      seriousness,
      sdModel,
    });
    let itemNegative = null;
    if (provider === 'sd-webui') {
      const styleNeg = getImageStyleSdNegative(imageStyle);
      const baseItemNeg = 'person, human, character, hand, hands, fingers, holding, wielding, figure, body, face, portrait, full body, half body, scene, environment, landscape, room, table, multiple items';
      itemNegative = styleNeg ? `${baseItemNeg}, ${styleNeg}` : baseItemNeg;
    }
    const url = await generateSceneViaProxy(prompt, provider, campaignId, { sdModel, sdSeed, forceNew, shape: 'square', negativePrompt: itemNegative, resolutionMultiplier });
    return { url, prompt };
  },

  async generateNodeImage(node, { provider = 'dalle', campaignId = null, sdModel = null, forceNew = true, customPrompt = null } = {}) {
    let prompt;
    if (customPrompt?.trim()) {
      prompt = await ensureEnglish(customPrompt.trim());
    } else {
      prompt = await buildNodeImagePromptFromMeta(node);
    }
    const url = await generateSceneViaProxy(prompt, provider, campaignId, {
      sdModel,
      forceNew,
      shape: 'square',
    });
    return { url, prompt };
  },

  async generateSpellImage(spell, { genre, tone, provider = 'dalle', imageStyle = 'painting', darkPalette = false, seriousness = null, campaignId = null, sdModel = null, sdSeed = null, forceNew = false, resolutionMultiplier = 1 } = {}) {
    const [enName, enDescription] = await Promise.all([
      ensureEnglish(spell?.name, { kind: 'spell' }),
      ensureEnglish(spell?.description || spell?.name, { kind: 'spell' }),
    ]);
    const translatedSpell = spell ? { ...spell, name: enName, description: enDescription } : spell;
    const prompt = buildSpellImagePrompt(translatedSpell, { genre, tone, provider, imageStyle, darkPalette, seriousness, sdModel });
    let spellNegative = null;
    if (provider === 'sd-webui') {
      const styleNeg = getImageStyleSdNegative(imageStyle);
      const baseSpellNeg = 'person, people, human, man, woman, 1girl, 1boy, wizard, mage, sorcerer, sorceress, caster, character, figure, body, face, portrait, full body, half body, hand, hands, fingers, arm, arms, holding, wielding, casting, silhouette, item, weapon, inventory icon, text, UI, watermark';
      spellNegative = styleNeg ? `${baseSpellNeg}, ${styleNeg}` : baseSpellNeg;
    }
    const url = await generateSceneViaProxy(prompt, provider, campaignId, { sdModel, sdSeed, forceNew, shape: 'square', negativePrompt: spellNegative, resolutionMultiplier });
    return { url, prompt };
  },
};

export const imageService = {
  generateSceneImage(...args) {
    return enqueueImageRequest(() => _imageServiceImpl.generateSceneImage(...args));
  },
  generatePortrait(...args) {
    return enqueueImageRequest(() => _imageServiceImpl.generatePortrait(...args));
  },
  generatePlaygroundImage(...args) {
    return enqueueImageRequest(() => _imageServiceImpl.generatePlaygroundImage(...args));
  },
  generateItemImage(...args) {
    return enqueueImageRequest(() => _imageServiceImpl.generateItemImage(...args));
  },
  generateSpellImage(...args) {
    return enqueueImageRequest(() => _imageServiceImpl.generateSpellImage(...args));
  },
  generateNodeImage(...args) {
    return enqueueImageRequest(() => _imageServiceImpl.generateNodeImage(...args));
  },
};
