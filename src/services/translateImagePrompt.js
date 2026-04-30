import { apiClient } from './apiClient';

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
export async function ensureEnglish(text) {
  if (!text || typeof text !== 'string') return text || '';
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (!PL_RE.test(trimmed)) return text;

  const cached = cacheGet(trimmed);
  if (cached !== undefined) return cached;

  try {
    const { english } = await apiClient.post('/ai/translate-image-prompt', { text: trimmed });
    const out = typeof english === 'string' && english.trim() ? english.trim() : text;
    cacheSet(trimmed, out);
    return out;
  } catch {
    return text;
  }
}
