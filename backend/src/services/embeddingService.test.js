import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Stub config before importing the service module.
vi.mock('../config.js', () => ({
  config: { apiKeys: { openai: 'fake-key' } },
}));

import { embedText, __resetEmbeddingCacheForTests } from './embeddingService.js';

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
