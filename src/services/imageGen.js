import { buildImagePrompt } from './prompts';

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

export const imageService = {
  async generateSceneImage(narrative, genre, tone, apiKey, provider = 'dalle', imagePrompt = null) {
    if (!apiKey) {
      throw new Error('API key required for image generation.');
    }

    const prompt = buildImagePrompt(narrative, genre, tone, imagePrompt, provider);

    if (provider === 'stability') {
      return generateWithStability(prompt, apiKey);
    }
    return generateWithDalle(prompt, apiKey);
  },
};
