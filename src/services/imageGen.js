import { buildImagePrompt, buildPortraitPrompt, getImageStyleNegative } from './prompts';
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

async function generateWithStability(prompt, apiKey, negativePrompt) {
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('negative_prompt', negativePrompt || 'blurry, low quality, text, watermark, signature');
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

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent';

async function generateWithGemini(prompt, apiKey) {
  const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `Gemini API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error('Gemini returned no content');

  const imagePart = parts.find((p) => p.inlineData);
  if (!imagePart) throw new Error('Gemini returned no image');

  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType || 'image/png'};base64,${b64}`;
}

async function generatePortraitWithGemini(prompt, apiKey) {
  return generateWithGemini(prompt, apiKey);
}

async function generatePortraitWithGeminiImg2Img(imageBlob, prompt, apiKey) {
  const buf = await imageBlob.arrayBuffer();
  const b64Image = btoa(String.fromCharCode(...new Uint8Array(buf)));

  const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: b64Image } },
          { text: prompt },
        ],
      }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error('Gemini returned no content');

  const imagePart = parts.find((p) => p.inlineData);
  if (!imagePart) throw new Error('Gemini returned no image');

  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType || 'image/png'};base64,${b64}`;
}

async function generateViaProxy(prompt, provider, campaignId) {
  const body = { prompt };
  if (campaignId) body.campaignId = campaignId;

  if (provider === 'stability') {
    const data = await apiClient.post('/proxy/stability/generate', body);
    return resolveMediaUrl(data.url);
  }
  if (provider === 'gemini') {
    const data = await apiClient.post('/proxy/gemini/generate', body);
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
  formData.append('negative_prompt', 'modern clothing, contemporary, photorealistic photo, plain background, blurry, low quality, text, watermark, signature, deformed face, extra limbs, bad anatomy, smooth airbrushed skin, plastic look, flat lighting, passport photo, ID photo, selfie');
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

async function generatePortraitViaProxyGemini(prompt) {
  const data = await apiClient.post('/proxy/gemini/portrait', { prompt });
  return resolveMediaUrl(data.url);
}

async function generatePortraitViaProxyGeminiImg2Img(imageBlob, prompt) {
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
  async generateSceneImage(narrative, genre, tone, apiKey, provider = 'dalle', imagePrompt = null, campaignId = null, imageStyle = 'painting') {
    const prompt = buildImagePrompt(narrative, genre, tone, imagePrompt, provider, imageStyle);

    if (apiClient.isConnected()) {
      return generateViaProxy(prompt, provider, campaignId);
    }

    if (!apiKey) {
      throw new Error('API key required for image generation.');
    }

    if (provider === 'stability') {
      const negativePrompt = getImageStyleNegative(imageStyle) + ', blurry, low quality, text, watermark, signature';
      return generateWithStability(prompt, apiKey, negativePrompt);
    }
    if (provider === 'gemini') {
      return generateWithGemini(prompt, apiKey);
    }
    return generateWithDalle(prompt, apiKey);
  },

  async generatePortrait(imageBlob, { species, gender, careerName, genre } = {}, apiKey, strength = 0.45, provider = 'stability', imageStyle = 'painting') {
    const prompt = buildPortraitPrompt(species, gender, careerName, genre, provider, imageStyle);

    if (provider === 'dalle') {
      if (apiClient.isConnected()) {
        return generatePortraitViaProxyDalle(prompt);
      }
      if (!apiKey) {
        throw new Error('OpenAI API key required for portrait generation.');
      }
      return generatePortraitWithDalle(prompt, apiKey);
    }

    if (provider === 'gemini') {
      if (apiClient.isConnected()) {
        return imageBlob
          ? generatePortraitViaProxyGeminiImg2Img(imageBlob, prompt)
          : generatePortraitViaProxyGemini(prompt);
      }
      if (!apiKey) {
        throw new Error('Google AI API key required for portrait generation.');
      }
      return imageBlob
        ? generatePortraitWithGeminiImg2Img(imageBlob, prompt, apiKey)
        : generatePortraitWithGemini(prompt, apiKey);
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
