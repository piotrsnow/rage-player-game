import { buildImagePrompt, buildPortraitPrompt } from './prompts';
import { apiClient } from './apiClient';

async function generateWithDalle(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `DALL-E API error: ${response.status}`);
  }

  const data = await response.json();
  const b64 = data.data[0]?.b64_json;
  return b64 ? `data:image/png;base64,${b64}` : null;
}

async function generateWithStability(prompt, apiKey) {
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('negative_prompt', 'painting, drawing, illustration, cartoon, anime, sketch, watercolor, oil painting, digital art, unrealistic, blurry, low quality, text, watermark, signature');
  formData.append('model', 'sd3.5-large-turbo');
  formData.append('aspect_ratio', '16:9');
  formData.append('output_format', 'jpeg');
  formData.append('none', '');

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('Stability API error response:', err);
    const msg = err.errors?.join('; ') || err.message || err.name || `Stability API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  if (data.finish_reason === 'CONTENT_FILTERED') {
    console.warn('Stability: image was content-filtered');
  }
  return `data:image/jpeg;base64,${data.image}`;
}

async function generateViaProxy(prompt, provider, campaignId) {
  const body = { prompt };
  if (campaignId) body.campaignId = campaignId;

  if (provider === 'stability') {
    const data = await apiClient.post('/proxy/stability/generate', body);
    return resolveMediaUrl(data.url);
  }
  const data = await apiClient.post('/proxy/openai/images', body);
  return resolveMediaUrl(data.url);
}

function resolveMediaUrl(url) {
  if (!url) return null;
  return url;
}

async function generatePortraitWithDalle(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `DALL-E API error: ${response.status}`);
  }

  const data = await response.json();
  const b64 = data.data[0]?.b64_json;
  return b64 ? `data:image/png;base64,${b64}` : null;
}

async function generatePortraitWithStability(imageBlob, prompt, apiKey, strength = 0.45) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'photo.jpg');
  formData.append('prompt', prompt);
  formData.append('negative_prompt', 'blurry, low quality, text, watermark, signature, deformed face, extra limbs, bad anatomy');
  formData.append('strength', String(strength));
  formData.append('mode', 'image-to-image');
  formData.append('model', 'sd3.5-large-turbo');
  formData.append('output_format', 'jpeg');
  formData.append('none', '');

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('Stability portrait API error:', err);
    const msg = err.errors?.join('; ') || err.message || err.name || `Stability API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  if (data.finish_reason === 'CONTENT_FILTERED') {
    throw new Error('CONTENT_FILTERED');
  }
  return `data:image/jpeg;base64,${data.image}`;
}

async function generatePortraitViaProxy(imageBlob, prompt, strength) {
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

async function generatePortraitViaProxyDalle(prompt) {
  const data = await apiClient.post('/proxy/openai/images', {
    prompt,
    size: '1024x1024',
  });
  return resolveMediaUrl(data.url);
}

export const imageService = {
  async generateSceneImage(narrative, genre, tone, apiKey, provider = 'dalle', imagePrompt = null, campaignId = null) {
    const prompt = buildImagePrompt(narrative, genre, tone, imagePrompt, provider);

    if (apiClient.isConnected()) {
      return generateViaProxy(prompt, provider, campaignId);
    }

    if (!apiKey) {
      throw new Error('API key required for image generation.');
    }

    if (provider === 'stability') {
      return generateWithStability(prompt, apiKey);
    }
    return generateWithDalle(prompt, apiKey);
  },

  async generatePortrait(imageBlob, { species, gender, careerName, genre } = {}, apiKey, strength = 0.45, provider = 'stability') {
    const prompt = buildPortraitPrompt(species, gender, careerName, genre, provider);

    if (provider === 'dalle') {
      if (apiClient.isConnected()) {
        return generatePortraitViaProxyDalle(prompt);
      }
      if (!apiKey) {
        throw new Error('OpenAI API key required for portrait generation.');
      }
      return generatePortraitWithDalle(prompt, apiKey);
    }

    if (apiClient.isConnected()) {
      return generatePortraitViaProxy(imageBlob, prompt, strength);
    }

    if (!apiKey) {
      throw new Error('Stability AI API key required for portrait generation.');
    }

    return generatePortraitWithStability(imageBlob, prompt, apiKey, strength);
  },
};
