import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Stub config before importing the service module.
vi.mock('../config.js', () => ({
  config: { apiKeys: { openai: 'fake-key' } },
}));

// Mock the Redis client. Default state = disabled, so the existing L1-only
// TTL tests below run exactly as they did before the Redis migration (9b).
// Tests that exercise the L2 path flip `isRedisEnabled` + wire up a fake
// `client` per-test via `vi.mocked(...)`.
const fakeRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
};
vi.mock('./redisClient.js', () => ({
  isRedisEnabled: vi.fn(() => false),
  getRedisClient: vi.fn(() => null),
}));

import { embedText, embedBatch, __resetEmbeddingCacheForTests } from './embeddingService.js';
import { isRedisEnabled, getRedisClient } from './redisClient.js';

describe('embeddingService cache TTL', () => {
  const fakeEmbedding = Array.from({ length: 1536 }, (_, i) => i / 1536);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T12:00:00Z'));
    __resetEmbeddingCacheForTests();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: fakeEmbedding, index: 0 }] }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.fetch;
  });

  it('caches first result and serves from cache on second call', async () => {
    const first = await embedText('hello world');
    const second = await embedText('hello world');
    expect(first).toEqual(fakeEmbedding);
    expect(second).toEqual(fakeEmbedding);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('expires cache entry after TTL (1h) and re-fetches', async () => {
    await embedText('ttl check');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(59 * 60 * 1000);
    await embedText('ttl check');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    await embedText('ttl check');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('expired entry is removed from cache on read', async () => {
    await embedText('expiring');
    vi.advanceTimersByTime(61 * 60 * 1000);
    await embedText('expiring');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('updates expiresAt on re-set (touching with cacheSet refreshes TTL)', async () => {
    await embedText('freshen');
    vi.advanceTimersByTime(50 * 60 * 1000);
    await embedText('freshen'); // cache hit, moves to end but does NOT refresh expiresAt

    vi.advanceTimersByTime(15 * 60 * 1000);
    await embedText('freshen'); // TTL based on original insertion (65min > 60min), should re-fetch
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('trims input before caching/keying', async () => {
    await embedText('  trimmed  ');
    await embedText('trimmed');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('embeddingService L2 (Redis) path', () => {
  const fakeEmbedding = Array.from({ length: 1536 }, (_, i) => i / 1536);

  beforeEach(() => {
    __resetEmbeddingCacheForTests();
    fakeRedisClient.get.mockReset();
    fakeRedisClient.set.mockReset();
    vi.mocked(isRedisEnabled).mockReturnValue(true);
    vi.mocked(getRedisClient).mockReturnValue(fakeRedisClient);
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: fakeEmbedding, index: 0 }] }),
      }),
    );
  });

  afterEach(() => {
    vi.mocked(isRedisEnabled).mockReturnValue(false);
    vi.mocked(getRedisClient).mockReturnValue(null);
    delete globalThis.fetch;
  });

  it('writes to Redis after OpenAI miss with SHA256 key and EX TTL', async () => {
    fakeRedisClient.get.mockResolvedValue(null);
    fakeRedisClient.set.mockResolvedValue('OK');

    await embedText('first-time text');

    expect(fakeRedisClient.set).toHaveBeenCalledTimes(1);
    const [key, value, mode, ttl] = fakeRedisClient.set.mock.calls[0];
    // SHA256 hex is 64 chars; with "embed:" prefix → 70 chars total.
    expect(key).toMatch(/^embed:[0-9a-f]{64}$/);
    expect(JSON.parse(value)).toEqual(fakeEmbedding);
    expect(mode).toBe('EX');
    expect(ttl).toBe(60 * 60);
  });

  it('serves L2 hit without calling OpenAI and promotes to L1', async () => {
    fakeRedisClient.get.mockResolvedValue(JSON.stringify(fakeEmbedding));

    const first = await embedText('cached in redis');
    expect(first).toEqual(fakeEmbedding);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(fakeRedisClient.get).toHaveBeenCalledTimes(1);

    // Second call — should hit L1 now, no Redis read at all.
    const second = await embedText('cached in redis');
    expect(second).toEqual(fakeEmbedding);
    expect(fakeRedisClient.get).toHaveBeenCalledTimes(1);
  });

  it('L1 hit short-circuits before L2 is consulted', async () => {
    fakeRedisClient.get.mockResolvedValue(null);
    fakeRedisClient.set.mockResolvedValue('OK');

    await embedText('seed L1'); // OpenAI → L1 + L2 write
    expect(fakeRedisClient.set).toHaveBeenCalledTimes(1);

    fakeRedisClient.get.mockClear();
    await embedText('seed L1'); // L1 hit
    expect(fakeRedisClient.get).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls through to OpenAI when Redis GET throws', async () => {
    fakeRedisClient.get.mockRejectedValue(new Error('connection refused'));
    fakeRedisClient.set.mockResolvedValue('OK');

    const result = await embedText('redis down');
    expect(result).toEqual(fakeEmbedding);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not surface error when Redis SET throws (L1 still populated)', async () => {
    fakeRedisClient.get.mockResolvedValue(null);
    fakeRedisClient.set.mockRejectedValue(new Error('connection refused'));

    const first = await embedText('set fails');
    expect(first).toEqual(fakeEmbedding);

    // Second call hits L1 (SET throwing did not prevent local write).
    const second = await embedText('set fails');
    expect(second).toEqual(fakeEmbedding);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('batch path parallelizes L2 reads and hits Redis for each miss', async () => {
    // First two texts are in Redis, third is not.
    fakeRedisClient.get.mockImplementation((key) => {
      // Mock by call order — first two resolved, third null.
      const callIdx = fakeRedisClient.get.mock.calls.length - 1;
      if (callIdx < 2) return Promise.resolve(JSON.stringify(fakeEmbedding));
      return Promise.resolve(null);
    });
    fakeRedisClient.set.mockResolvedValue('OK');
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: fakeEmbedding, index: 0 }],
        }),
      }),
    );

    const results = await embedBatch(['a', 'b', 'c']);
    expect(results).toHaveLength(3);
    expect(fakeRedisClient.get).toHaveBeenCalledTimes(3);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // only 1 text uncached
  });
});
