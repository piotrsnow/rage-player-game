import { buildImagePrompt, buildItemImagePrompt, buildPortraitPrompt } from './imagePrompts';
import { apiClient, toCanonicalStoragePath } from './apiClient';

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

async function generateSceneViaProxy(prompt, provider, campaignId, { forceNew = false, portraitUrl = null, sdModel = null } = {}) {
  const body = { prompt };
  if (campaignId) body.campaignId = campaignId;
  if (forceNew) body.forceNew = true;

  if (provider === 'stability') {
    const data = await apiClient.post('/proxy/stability/generate', body);
    return canonicalUrl(data.url);
  }
  if (provider === 'gemini') {
    const data = await apiClient.post('/proxy/gemini/generate', body);
    return canonicalUrl(data.url);
  }
  if (provider === 'sd-webui') {
    const payload = { ...body };
    if (sdModel) payload.model = sdModel;
    const data = await apiClient.post('/proxy/sd-webui/generate', payload);
    return canonicalUrl(data.url);
  }
  if (provider === 'gpt-image') {
    if (portraitUrl) {
      const data = await apiClient.post('/proxy/openai/images/edits', { ...body, portraitUrl, model: 'gpt-image-1.5' });
      return canonicalUrl(data.url);
    }
    const data = await apiClient.post('/proxy/openai/images', { ...body, model: 'gpt-image-1.5' });
    return canonicalUrl(data.url);
  }
  // Default: DALL-E
  const data = await apiClient.post('/proxy/openai/images', body);
  return canonicalUrl(data.url);
}

async function generatePortraitViaStabilityProxy(imageBlob, prompt, strength) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'photo.jpg');
  formData.append('prompt', prompt);
  formData.append('strength', String(strength));

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

async function generatePortraitViaSdWebuiProxy(imageBlob, prompt, strength, sdModel) {
  const formData = new FormData();
  if (imageBlob) formData.append('image', imageBlob, 'photo.jpg');
  formData.append('prompt', prompt);
  formData.append('strength', String(strength ?? 0.55));
  if (sdModel) formData.append('model', sdModel);

  const data = await apiClient.request('/proxy/sd-webui/portrait', {
    method: 'POST',
    body: formData,
  });
  return canonicalUrl(data.url);
}

export const imageService = {
  async generateSceneImage(narrative, genre, tone, _apiKeyIgnored, provider = 'dalle', imagePrompt = null, campaignId = null, imageStyle = 'painting', darkPalette = false, characterAge = null, characterGender = null, options = {}, seriousness = null, portraitUrl = null) {
    const hasPortrait = provider === 'gpt-image' && !!portraitUrl;
    const prompt = buildImagePrompt(narrative, genre, tone, imagePrompt, provider, imageStyle, darkPalette, characterAge, characterGender, seriousness, hasPortrait);
    return generateSceneViaProxy(prompt, provider, campaignId, {
      ...options,
      portraitUrl: hasPortrait ? portraitUrl : null,
    });
  },

  async generatePortrait(imageBlob, { species, age, gender, careerName, genre } = {}, _apiKeyIgnored, strength = 0.45, provider = 'stability', imageStyle = 'painting', darkPalette = false, seriousness = null, sdModel = null) {
    const prompt = buildPortraitPrompt(species, gender, age, careerName, genre, provider, imageStyle, Boolean(imageBlob), darkPalette, seriousness);

    if (provider === 'dalle') {
      return generatePortraitViaDalleProxy(prompt);
    }
    if (provider === 'gpt-image') {
      if (imageBlob) return generatePortraitViaGptImageEditsProxy(imageBlob, prompt);
      const data = await apiClient.post('/proxy/openai/images', { prompt, model: 'gpt-image-1.5', size: '1024x1024' });
      return canonicalUrl(data.url);
    }
    if (provider === 'gemini') {
      return imageBlob
        ? generatePortraitViaGeminiImg2ImgProxy(imageBlob, prompt)
        : generatePortraitViaGeminiProxy(prompt);
    }
    if (provider === 'sd-webui') {
      return generatePortraitViaSdWebuiProxy(imageBlob, prompt, strength, sdModel);
    }
    // Default: Stability
    return generatePortraitViaStabilityProxy(imageBlob, prompt, strength);
  },

  async generatePlaygroundImage({ prompt, provider = 'dalle', sdModel = null, referenceBlob = null, strength = 0.55 } = {}) {
    const rawPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (!rawPrompt) throw new Error('Prompt is required');

    if (referenceBlob) {
      if (provider === 'stability') return generatePortraitViaStabilityProxy(referenceBlob, rawPrompt, strength);
      if (provider === 'gpt-image') return generatePortraitViaGptImageEditsProxy(referenceBlob, rawPrompt);
      if (provider === 'gemini') return generatePortraitViaGeminiImg2ImgProxy(referenceBlob, rawPrompt);
      if (provider === 'sd-webui') return generatePortraitViaSdWebuiProxy(referenceBlob, rawPrompt, strength, sdModel);
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

  async generateItemImage(item, { genre, tone, provider = 'dalle', imageStyle = 'painting', darkPalette = false, seriousness = null, campaignId = null, sdModel = null } = {}) {
    const prompt = buildItemImagePrompt(item, {
      genre,
      tone,
      provider,
      imageStyle,
      darkPalette,
      seriousness,
    });
    return generateSceneViaProxy(prompt, provider, campaignId, { sdModel });
  },
};
