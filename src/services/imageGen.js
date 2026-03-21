import { buildImagePrompt } from './prompts';

export const imageService = {
  async generateSceneImage(narrative, genre, tone, apiKey) {
    if (!apiKey) {
      throw new Error('OpenAI API key required for image generation.');
    }

    const prompt = buildImagePrompt(narrative, genre, tone);

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
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `DALL-E API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0]?.url || null;
  },
};
