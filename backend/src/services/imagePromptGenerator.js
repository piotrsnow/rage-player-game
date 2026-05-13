import { requireServerApiKey } from './apiKeyService.js';
import { parseProviderError } from './aiErrors.js';
import { config } from '../config.js';
import { resolveModelForTask } from './serverConfig.js';

const MAX_TAGS_LENGTH = 1000;
const MAX_NARRATIVE_LENGTH = 600;
const MAX_CUSTOM_STYLE_LENGTH = 1000;

function clamp(str, max) {
  return typeof str === 'string' ? str.trim().slice(0, max) : '';
}

function buildSystemPrompt({ imageProvider, imageStyle, darkPalette, seriousness, customStyleEnabled, customStyle }) {
  const providerHints = {
    'sd-webui': 'Target: local Stable Diffusion (SDXL). Output comma-separated tags/keywords. Keep it concise — SDXL CLIP has a ~75 token window. Put the most important subject tokens first. Also return a negativePrompt field with things to avoid.',
    dalle: 'Target: DALL-E 3. Output a natural-language scene description (1-3 sentences). No negative prompt needed.',
    'gpt-image': 'Target: GPT Image. Output a natural-language scene description (1-3 sentences). No negative prompt needed.',
    stability: 'Target: Stability AI SD3. Output a natural-language scene description (1-3 sentences). No negative prompt needed.',
    gemini: 'Target: Gemini image generation. Output a vivid natural-language scene description (1-3 sentences). No negative prompt needed.',
  };

  const base = [
    'You are an expert image-generation prompt writer.',
    'Given scene tags and narrative context, compose the optimal prompt for the specified image generator.',
    providerHints[imageProvider] || providerHints.dalle,
    `Art style: ${imageStyle || 'painting'}.`,
    darkPalette ? 'Color palette: dark, moody, deep shadows.' : '',
    seriousness != null ? `Mood intensity: ${seriousnessLabel(seriousness)}.` : '',
    'Do NOT include meta-instructions or explanations — output ONLY the JSON.',
    'Always write prompts in English regardless of input language.',
    'Respond with valid JSON: { "prompt": "...", "negativePrompt": "..." }',
    'If no negative prompt is appropriate for the target, set negativePrompt to empty string.',
  ].filter(Boolean).join(' ');

  if (customStyleEnabled && customStyle) {
    return `${base}\n\nUser style instructions (follow these when composing the prompt):\n${clamp(customStyle, MAX_CUSTOM_STYLE_LENGTH)}`;
  }
  return base;
}

function seriousnessLabel(value) {
  const val = Number.isFinite(value) ? value : 50;
  if (val < 25) return 'silly/whimsical';
  if (val < 50) return 'lighthearted';
  if (val < 75) return 'serious';
  return 'grave/somber';
}

export async function generateImagePrompt({
  imagePromptTags,
  narrative,
  imageProvider = 'dalle',
  imageStyle = 'painting',
  darkPalette = false,
  seriousness = null,
  genre = 'Fantasy',
  tone = 'Epic',
  characterAge = null,
  characterGender = null,
  customStyleEnabled = false,
  customStyle = '',
  provider = 'openai',
  model = null,
  userApiKeys = null,
} = {}) {
  const tags = clamp(imagePromptTags, MAX_TAGS_LENGTH);
  const narrativeExcerpt = clamp(narrative, MAX_NARRATIVE_LENGTH);

  if (!tags && !narrativeExcerpt) {
    return { prompt: '', negativePrompt: '' };
  }

  const resolvedProvider = provider === 'anthropic' ? 'anthropic' : 'openai';
  const apiKey = requireServerApiKey(
    resolvedProvider,
    userApiKeys,
    resolvedProvider === 'anthropic' ? 'Anthropic' : 'OpenAI',
  );
  const overrideModel = await resolveModelForTask('imagePrompt', resolvedProvider);
  const resolvedModel = overrideModel || model || config.aiModels.nano[resolvedProvider];

  const systemPrompt = buildSystemPrompt({
    imageProvider,
    imageStyle,
    darkPalette,
    seriousness,
    customStyleEnabled,
    customStyle,
  });

  const contextParts = [
    `Genre: ${genre}. Tone: ${tone}.`,
    characterAge != null ? `Character age: ${characterAge}.` : '',
    characterGender ? `Character gender: ${characterGender}.` : '',
  ].filter(Boolean).join(' ');

  const userPrompt = [
    'Compose an image generation prompt from the following scene data.',
    contextParts,
    tags ? `Scene tags: ${tags}` : '',
    narrativeExcerpt ? `Narrative context: ${narrativeExcerpt}` : '',
    'Return JSON only: { "prompt": "...", "negativePrompt": "..." }',
  ].filter(Boolean).join('\n');

  const content = resolvedProvider === 'anthropic'
    ? await callAnthropic(apiKey, systemPrompt, userPrompt, resolvedModel)
    : await callOpenAI(apiKey, systemPrompt, userPrompt, resolvedModel);

  try {
    const parsed = JSON.parse(content);
    return {
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '',
      negativePrompt: typeof parsed.negativePrompt === 'string' ? parsed.negativePrompt.trim() : '',
    };
  } catch {
    const trimmed = content.trim();
    return { prompt: trimmed, negativePrompt: '', meta: { degraded: true, reason: 'json_parse_failed' } };
  }
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 400,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) await parseProviderError(response, 'openai');
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: `${userPrompt}\n\nRespond with ONLY valid JSON, no other text.` }],
    }),
  });

  if (!response.ok) await parseProviderError(response, 'anthropic');
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : text;
}
