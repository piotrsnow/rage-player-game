import { config } from '../config.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 2048;

// LRU cache for recent embeddings with TTL.
// Short-term fix ahead of the Redis migration (see plans/post_merge_infra.md item 9).
// Cache is in-memory per-instance, lost on Cloud Run cold start. TTL prevents
// stale embeddings from persisting forever if the underlying content changes.
const cache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheSet(key, value) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (entry === undefined) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Move to end (most recently used)
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

// Test hook: reset cache between runs.
export function __resetEmbeddingCacheForTests() {
  cache.clear();
}

/**
 * Generate embedding for a single text using OpenAI text-embedding-3-small.
 * Uses server-level API key from config.
 */
export async function embedText(text, apiKey = null) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const cached = cacheGet(trimmed);
  if (cached) return cached;

  const key = apiKey || config.apiKeys.openai;
  if (!key) {
    throw new Error('No OpenAI API key configured for embeddings');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: trimmed,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Embedding API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const embedding = data.data[0].embedding;

  cacheSet(trimmed, embedding);
  return embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * Returns array of embeddings in the same order as input texts.
 */
export async function embedBatch(texts, apiKey = null) {
  const key = apiKey || config.apiKeys.openai;
  if (!key) {
    throw new Error('No OpenAI API key configured for embeddings');
  }

  const trimmed = texts.map((t) => t.trim()).filter(Boolean);
  if (trimmed.length === 0) return [];

  const results = new Array(trimmed.length);
  const uncachedIndices = [];
  const uncachedTexts = [];

  // Check cache first
  for (let i = 0; i < trimmed.length; i++) {
    const cached = cacheGet(trimmed[i]);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(trimmed[i]);
    }
  }

  // Batch embed uncached texts
  for (let start = 0; start < uncachedTexts.length; start += MAX_BATCH_SIZE) {
    const batch = uncachedTexts.slice(start, start + MAX_BATCH_SIZE);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Embedding API error ${response.status}: ${error}`);
    }

    const data = await response.json();

    // OpenAI returns embeddings sorted by index
    const sorted = data.data.sort((a, b) => a.index - b.index);
    for (let j = 0; j < sorted.length; j++) {
      const globalIdx = uncachedIndices[start + j];
      results[globalIdx] = sorted[j].embedding;
      cacheSet(trimmed[globalIdx], sorted[j].embedding);
    }
  }

  return results;
}

/**
 * Build embedding text for a scene document.
 */
export function buildSceneEmbeddingText(scene) {
  const parts = [];
  if (scene.chosenAction) parts.push(`Player: ${scene.chosenAction}`);
  if (scene.narrative) parts.push(scene.narrative);
  return parts.join('\n').slice(0, 8000); // Cap to avoid excessive token usage
}

/**
 * Build embedding text for a knowledge entry.
 */
export function buildKnowledgeEmbeddingText(entry) {
  const parts = [entry.summary || ''];
  const tags = typeof entry.tags === 'string' ? JSON.parse(entry.tags) : entry.tags || [];
  if (tags.length) parts.push(`Tags: ${tags.join(', ')}`);
  return parts.join('. ').slice(0, 4000);
}

/**
 * Build embedding text for an NPC.
 */
export function buildNPCEmbeddingText(npc) {
  const parts = [npc.name];
  if (npc.role) parts.push(npc.role);
  if (npc.personality) parts.push(npc.personality);
  if (npc.factionId) parts.push(`Faction: ${npc.factionId}`);
  if (npc.notes) parts.push(npc.notes);
  return parts.join(' - ').slice(0, 2000);
}

/**
 * Build embedding text for a codex entry.
 */
export function buildCodexEmbeddingText(codex) {
  const parts = [`${codex.name} [${codex.category}]`];
  const fragments =
    typeof codex.fragments === 'string' ? JSON.parse(codex.fragments) : codex.fragments || [];
  for (const f of fragments) {
    if (f.content) parts.push(f.content);
  }
  return parts.join('. ').slice(0, 4000);
}

export { EMBEDDING_DIMENSIONS };
