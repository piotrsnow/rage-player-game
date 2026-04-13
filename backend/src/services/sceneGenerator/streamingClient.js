import { childLogger } from '../../lib/logger.js';
import { config } from '../../config.js';
import { requireServerApiKey } from '../apiKeyService.js';
import { parseProviderError } from '../aiErrors.js';
import { buildContextSection } from './contextSection.js';
import { buildAnthropicSystemBlocks } from './systemPrompt.js';

const log = childLogger({ module: 'sceneGenerator' });

/**
 * Call OpenAI with streaming enabled. Yields text chunks via callback.
 * Returns the full accumulated text.
 */
async function callOpenAIStreaming(messages, { model, temperature = 0.8, maxTokens = 4096 } = {}, onChunk) {
  const apiKey = requireServerApiKey('openai', 'OpenAI');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || config.aiModels.premium.openai,
      messages,
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      stream: true,
    }),
  });

  if (!response.ok) {
    await parseProviderError(response, 'openai');
  }

  let accumulated = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const debug = process.env.OPENAI_STREAM_DEBUG === '1';

  const handleDataLine = (data) => {
    if (!data || data === '[DONE]') return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      if (debug) log.debug({ data }, 'openai-stream UNPARSEABLE');
      return;
    }
    const choice = parsed.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (!delta) return;
    if (debug) log.debug({ delta }, 'openai-stream delta');
    // `content` can be a plain string OR (on some models / via Responses-style
    // chunking) an array of content parts like [{type:'text', text:'...'}].
    let text = '';
    if (typeof delta.content === 'string') {
      text = delta.content;
    } else if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        if (typeof part === 'string') text += part;
        else if (part && typeof part.text === 'string') text += part.text;
        else if (part && typeof part.content === 'string') text += part.content;
      }
    } else if (delta.content && typeof delta.content === 'object') {
      if (typeof delta.content.text === 'string') text = delta.content.text;
    }
    if (text) {
      accumulated += text;
      if (onChunk) onChunk(text);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line.startsWith('data: ')) continue;
      handleDataLine(line.slice(6));
    }
  }

  if (buffer.startsWith('data: ')) {
    handleDataLine(buffer.slice(6));
  }

  return accumulated;
}

/**
 * Call Anthropic with streaming enabled. Yields text chunks via callback.
 * Returns the full accumulated text.
 */
async function callAnthropicStreaming(messages, { model, temperature = 0.8, maxTokens = 4096, system = null } = {}, onChunk) {
  const apiKey = requireServerApiKey('anthropic', 'Anthropic');

  const body = {
    model: model || config.aiModels.premium.anthropic,
    max_tokens: maxTokens,
    messages,
    temperature,
    stream: true,
  };
  if (system) body.system = system;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await parseProviderError(response, 'anthropic');
  }

  let accumulated = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleDataLine = (data) => {
    if (!data) return;
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        accumulated += parsed.delta.text;
        if (onChunk) onChunk(parsed.delta.text);
      }
      if (parsed.type === 'message_delta' && parsed.usage) {
        const u = parsed.usage;
        if (u.cache_read_input_tokens > 0 || u.cache_creation_input_tokens > 0) {
          log.debug({ cacheRead: u.cache_read_input_tokens || 0, cacheCreated: u.cache_creation_input_tokens || 0 }, 'anthropic-stream cache hit');
        }
      }
    } catch {
      // skip malformed SSE lines
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line.startsWith('data: ')) continue;
      handleDataLine(line.slice(6));
    }
  }

  if (buffer.startsWith('data: ')) {
    handleDataLine(buffer.slice(6));
  }

  return accumulated;
}

/**
 * Run the 2-stage pipeline with streaming. Returns parsed scene via callback events.
 */
export async function runTwoStagePipelineStreaming(systemPromptParts, userPrompt, contextBlocks, { provider = 'openai', model } = {}, onChunk) {
  const contextSection = buildContextSection(contextBlocks);
  const dynamicFull = (systemPromptParts.dynamicSuffix || '') + (contextSection || '');

  let fullText;
  if (provider === 'openai') {
    const combinedPrompt = systemPromptParts.staticPrefix + '\n\n' + dynamicFull;
    fullText = await callOpenAIStreaming(
      [
        { role: 'system', content: combinedPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model },
      onChunk,
    );
  } else {
    const systemBlocks = buildAnthropicSystemBlocks(systemPromptParts.staticPrefix, dynamicFull);
    fullText = await callAnthropicStreaming(
      [{ role: 'user', content: userPrompt }],
      { system: systemBlocks, model },
      onChunk,
    );
  }

  return parseAIResponse(fullText);
}

/**
 * Parse AI response text as JSON, with basic cleanup. Extracts from markdown
 * code blocks if the model wrapped the JSON in ``` fences. Derives `narrative`
 * from dialogueSegments narration text — the model no longer emits a separate
 * narrative field, but legacy cached responses may still have one.
 */
export function parseAIResponse(text) {
  if (!text) throw new Error('Empty AI response');

  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim());

    const derivedNarrative = Array.isArray(parsed.dialogueSegments)
      ? parsed.dialogueSegments
        .filter(s => s && s.type === 'narration' && typeof s.text === 'string')
        .map(s => s.text.trim())
        .filter(Boolean)
        .join(' ')
      : '';

    return {
      narrative: derivedNarrative || parsed.narrative || '',
      suggestedActions: parsed.suggestedActions || ['Look around', 'Move forward', 'Wait'],
      stateChanges: parsed.stateChanges || {},
      dialogueSegments: parsed.dialogueSegments || [],
      scenePacing: parsed.scenePacing || 'exploration',
      diceRoll: parsed.diceRoll || null,
      diceRolls: Array.isArray(parsed.diceRolls) ? parsed.diceRolls : undefined,
      creativityBonus: Number.isFinite(parsed.creativityBonus) ? parsed.creativityBonus : 0,
      atmosphere: parsed.atmosphere || { weather: 'clear', mood: 'peaceful', lighting: 'natural' },
      sceneGrid: parsed.sceneGrid || null,
      imagePrompt: parsed.imagePrompt || null,
      soundEffect: parsed.soundEffect || null,
      musicPrompt: parsed.musicPrompt || null,
      questOffers: parsed.questOffers || [],
      cutscene: parsed.cutscene || null,
      dilemma: parsed.dilemma || null,
    };
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}\nResponse: ${text.slice(0, 500)}`);
  }
}
