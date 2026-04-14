import crypto from 'crypto';
import { config } from '../config.js';
import { getRedisClient, isRedisEnabled } from './redisClient.js';
import { logger } from '../lib/logger.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 2048;

// Two-tier cache for recent embeddings.
//
// L1 — in-memory LRU per instance, capped at 100 entries, 1h TTL. Kept from
// the short-term fix in 9a so hot reads stay sub-microsecond without a
// network round trip. Small by design; purpose is "don't hit Redis for
// the same text 50 times in one scene".
//
// L2 — Redis (when enabled). Shared across instances, survives restarts,
// same 1h TTL enforced via EX. L2 is the long-term cache that makes embed
// reuse work across deploys and Cloud Run cold starts. If Redis is
// disabled or errors, L2 is a silent no-op and we fall back to L1-only
// behavior (which is exactly how 9a worked).
//
// Read path: L1 hit → return. L1 miss → try L2 → on hit, populate L1 → return.
// Full miss → OpenAI API → populate L1 + L2.

const cache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_TTL_SEC = 60 * 60;
const REDIS_KEY_PREFIX = 'embed:';

function redisKeyFor(text) {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return REDIS_KEY_PREFIX + hash;
}

function cacheSetLocal(key, value) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheGetLocal(key) {
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

async function cacheGetRedis(text) {
  if (!isRedisEnabled()) return undefined;
  const client = getRedisClient();
  if (!client) return undefined;
  try {
    const raw = await client.get(redisKeyFor(text));
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch (err) {
    logger.warn({ err }, '[embeddingService] redis get failed — falling back to L1/API');
    return undefined;
  }
}

async function cacheSetRedis(text, value) {
  if (!isRedisEnabled()) return;
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.set(redisKeyFor(text), JSON.stringify(value), 'EX', CACHE_TTL_SEC);
  } catch (err) {
    logger.warn({ err }, '[embeddingService] redis set failed — L1 only');
  }
}

async function cacheGet(key) {
  const local = cacheGetLocal(key);
  if (local !== undefined) return local;
  const remote = await cacheGetRedis(key);
  if (remote !== undefined) {
    cacheSetLocal(key, remote);
    return remote;
  }
  return undefined;
}

async function cacheSet(key, value) {
  cacheSetLocal(key, value);
  await cacheSetRedis(key, value);
}

// Test hook: reset in-memory cache between runs. Redis cache is NOT touched
// here — tests that exercise the Redis path should mock `./redisClient.js`
// at the module level so no real Redis traffic happens.
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

  const cached = await cacheGet(trimmed);
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

  await cacheSet(trimmed, embedding);
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

  // Check cache first — parallelize Redis GETs so batch throughput isn't
  // serialized on round-trip latency when many items miss L1.
  const cached = await Promise.all(trimmed.map((t) => cacheGet(t)));
  for (let i = 0; i < trimmed.length; i++) {
    if (cached[i]) {
      results[i] = cached[i];
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
    await Promise.all(sorted.map((entry, j) => {
      const globalIdx = uncachedIndices[start + j];
      results[globalIdx] = entry.embedding;
      return cacheSet(trimmed[globalIdx], entry.embedding);
    }));
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
