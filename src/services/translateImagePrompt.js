import { apiClient } from './apiClient';
import { aiCallLog } from '../stores/aiCallLogStore';

// Cheap client-side detector for Polish text. False-positives are impossible
// (these characters only exist in PL/Lithuanian script), false-negatives only
// miss Polish sentences that happen to use no diacritics — rare in scene
// narratives, player actions, and item descriptions we route through here.
const PL_RE = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

const CACHE_CAP = 500;
const cache = new Map();

function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_CAP) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

// Translate a user-content fragment to English before it's embedded into an
// image-generation template. Graceful: returns the original text unchanged on
// empty input, already-English input, network error, or backend failure —
// image generation never blocks on this call.
/**
 * @param {string} text
 * @param {{ kind?: 'general'|'item'|'spell' }} [options]
 */
export async function ensureEnglish(text, { kind = 'general' } = {}) {
  if (!text || typeof text !== 'string') return text || '';
  const trimmed = text.trim();
  if (!trimmed) return text;

  const forceTranslate = kind === 'item' || kind === 'spell';
  if (!forceTranslate && !PL_RE.test(trimmed)) return text;

  const cacheKey = `${kind}:${trimmed}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const logId = aiCallLog.start({
    type: 'translate-prompt',
    label: `Translate (${kind}): ${trimmed.slice(0, 60)}`,
    provider: null,
    model: null,
  });
  try {
    const { english } = await apiClient.post('/ai/translate-image-prompt', { text: trimmed, kind });
    const out = typeof english === 'string' && english.trim() ? english.trim() : text;
    cacheSet(cacheKey, out);
    aiCallLog.finish(logId, { original: trimmed, translated: out });
    return out;
  } catch (e) {
    aiCallLog.fail(logId, e);
    return text;
  }
}
