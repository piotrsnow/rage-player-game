import { buildImagePrompt, buildItemImagePrompt, buildPortraitPrompt } from './imagePrompts';
import { apiClient } from './apiClient';

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

function resolveMediaUrl(url) {
  if (!url) return null;
  return apiClient.resolveMediaUrl(url);
}

async function generateSceneViaProxy(prompt, provider, campaignId, { forceNew = false, portraitUrl = null } = {}) {
  const body = { prompt };
  if (campaignId) body.campaignId = campaignId;
  if (forceNew) body.forceNew = true;

  if (provider === 'stability') {
    const data = await apiClient.post('/proxy/stability/generate', body);
    return resolveMediaUrl(data.url);
  }
  if (provider === 'gemini') {
    const data = await apiClient.post('/proxy/gemini/generate', body);
    return resolveMediaUrl(data.url);
  }
  if (provider === 'gpt-image') {
    if (portraitUrl) {
      const data = await apiClient.post('/proxy/openai/images/edits', { ...body, portraitUrl, model: 'gpt-image-1.5' });
      return resolveMediaUrl(data.url);
    }
    const data = await apiClient.post('/proxy/openai/images', { ...body, model: 'gpt-image-1.5' });
    return resolveMediaUrl(data.url);
  }
  // Default: DALL-E
  const data = await apiClient.post('/proxy/openai/images', body);
  return resolveMediaUrl(data.url);
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
  return resolveMediaUrl(data.url);
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
  return resolveMediaUrl(data.url);
}

async function generatePortraitViaDalleProxy(prompt) {
  const data = await apiClient.post('/proxy/openai/images', {
    prompt,
    size: '1024x1024',
  });
  return resolveMediaUrl(data.url);
}

async function generatePortraitViaGeminiProxy(prompt) {
  const data = await apiClient.post('/proxy/gemini/portrait', { prompt });
  return resolveMediaUrl(data.url);
}

async function generatePortraitViaGeminiImg2ImgProxy(imageBlob, prompt) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'photo.jpg');
  formData.append('prompt', prompt);

  const data = await apiClient.request('/proxy/gemini/portrait', {
    method: 'POST',
    body: formData,
  });
  return resolveMediaUrl(data.url);
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

  async generatePortrait(imageBlob, { species, age, gender, careerName, genre } = {}, _apiKeyIgnored, strength = 0.45, provider = 'stability', imageStyle = 'painting', darkPalette = false, seriousness = null) {
    const prompt = buildPortraitPrompt(species, gender, age, careerName, genre, provider, imageStyle, Boolean(imageBlob), darkPalette, seriousness);

    if (provider === 'dalle') {
      return generatePortraitViaDalleProxy(prompt);
    }
    if (provider === 'gpt-image') {
      if (imageBlob) return generatePortraitViaGptImageEditsProxy(imageBlob, prompt);
      const data = await apiClient.post('/proxy/openai/images', { prompt, model: 'gpt-image-1.5', size: '1024x1024' });
      return resolveMediaUrl(data.url);
    }
    if (provider === 'gemini') {
      return imageBlob
        ? generatePortraitViaGeminiImg2ImgProxy(imageBlob, prompt)
        : generatePortraitViaGeminiProxy(prompt);
    }
    // Default: Stability
    return generatePortraitViaStabilityProxy(imageBlob, prompt, strength);
  },

  async generateItemImage(item, { genre, tone, provider = 'dalle', imageStyle = 'painting', darkPalette = false, seriousness = null, campaignId = null } = {}) {
    const prompt = buildItemImagePrompt(item, {
      genre,
      tone,
      provider,
      imageStyle,
      darkPalette,
      seriousness,
    });
    return generateSceneViaProxy(prompt, provider, campaignId);
  },
};
