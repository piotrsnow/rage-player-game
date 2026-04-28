import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '../services/apiClient';

// Module-level cache, keyed by campaignId. Survives component unmount/mount —
// reopening the map panel renders cached data instantly with no spinner, and
// only round-trips when triggerKey (sceneId) changes. Even on round-trips the
// server can answer 304 via ETag — `data` stays put and only `etag` rotates.
//
// Structure: campaignId → { triggerKey, data, etag, fetchedAt }
const _cache = new Map();

/**
 * Player world map fetcher with stale-while-revalidate + ETag.
 *
 * - First call (no cache): full fetch, render loading until response.
 * - Re-mount with same triggerKey: render cached data immediately, no fetch.
 * - triggerKey change (typically sceneId): render cached data immediately,
 *   fetch in background with `If-None-Match`. Server returns 304 (cheap) when
 *   nothing material changed (locations + edges + fog + currentLocation*
 *   + currentX/Y all stable). 200 swaps in fresh data.
 *
 * Errors are non-disruptive: on a failed background refetch we keep the
 * previously cached data and only surface `error` so the caller can flag it.
 */
export function useCampaignMap(campaignId, triggerKey) {
  const cached = campaignId ? _cache.get(campaignId) : null;
  const [data, setData] = useState(cached?.data || null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const staleTokenRef = useRef(0);

  const fetch = useCallback(async () => {
    if (!campaignId) {
      setData(null);
      return;
    }
    const token = ++staleTokenRef.current;
    setError(null);

    const cur = _cache.get(campaignId);
    // Cache hit on the same triggerKey — render-from-cache and skip the wire.
    if (cur && cur.triggerKey === triggerKey) {
      setData(cur.data);
      setLoading(false);
      return;
    }

    // Show cached data immediately while we revalidate. Spinner only when we
    // truly have nothing to render.
    if (cur?.data) {
      setData(cur.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const result = await apiClient.getWithEtag(
        `/v1/livingWorld/campaigns/${campaignId}/map`,
        cur?.etag || null,
      );
      if (token !== staleTokenRef.current) return;
      if (result.status === 304 && cur) {
        // Bump triggerKey marker so the next same-key call short-circuits.
        _cache.set(campaignId, {
          triggerKey,
          data: cur.data,
          etag: result.etag || cur.etag,
          fetchedAt: Date.now(),
        });
        setLoading(false);
        return;
      }
      _cache.set(campaignId, {
        triggerKey,
        data: result.data,
        etag: result.etag || null,
        fetchedAt: Date.now(),
      });
      setData(result.data);
    } catch (err) {
      if (token !== staleTokenRef.current) return;
      setError(err);
      // Keep `data` as the last good cache so the map stays usable.
    } finally {
      if (token === staleTokenRef.current) setLoading(false);
    }
  }, [campaignId, triggerKey]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

/**
 * Test/dev hook: drop the in-memory cache. Call from unit tests that need a
 * clean slate between cases.
 */
export function _clearCampaignMapCache() {
  _cache.clear();
}
