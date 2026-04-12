import { apiClient } from './apiClient';
import { parsePartialJson } from './partialJsonParser';

/**
 * Call a backend SSE endpoint and process streaming events.
 *
 * @param {string} endpoint - Backend path (e.g. '/ai/generate-campaign')
 * @param {object} body - POST body
 * @param {object} options
 * @param {function} [options.onChunk] - (partialText: string) => void — raw text chunk
 * @param {function} [options.onPartialJson] - (partial: object) => void — progressively parsed JSON
 * @param {import('zod').ZodSchema} [options.schema] - Zod schema for final validation
 * @returns {Promise<object>} The complete parsed response
 */
export async function callBackendStream(endpoint, body, { onChunk, onPartialJson, schema } = {}) {
  const baseUrl = apiClient.getBaseUrl();
  const token = apiClient.getToken();

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Stream error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = null;
  let sseBuffer = '';
  let rawAccumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));

        if (event.type === 'chunk' && event.text) {
          rawAccumulated += event.text;
          if (onChunk) onChunk(event.text);

          if (onPartialJson) {
            const partial = parsePartialJson(rawAccumulated);
            if (partial) onPartialJson(partial);
          }
        } else if (event.type === 'complete') {
          result = event.data;
        } else if (event.type === 'error') {
          throw new Error(event.error || 'Stream generation failed');
        }
      } catch (e) {
        if (e.message && !e.message.includes('JSON')) throw e;
      }
    }
  }

  if (!result) throw new Error('Stream ended without complete event');

  if (schema) {
    const validated = schema.safeParse(result);
    if (!validated.success) {
      console.warn('[aiStream] Schema validation failed on complete:', validated.error?.message);
    }
  }

  return result;
}
