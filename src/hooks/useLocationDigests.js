import { useEffect, useState, useRef } from 'react';
import { apiClient } from '../services/apiClient';

const _cache = new Map();

export function useLocationDigests(campaignId) {
  const cached = campaignId ? _cache.get(campaignId) : null;
  const [data, setData] = useState(cached?.data || null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!campaignId) {
      setData(null);
      setLoading(false);
      return;
    }
    const cur = _cache.get(campaignId);
    if (cur) {
      setData(cur.data);
      setLoading(false);
      return;
    }

    const token = ++tokenRef.current;
    setLoading(true);

    apiClient.get(`/v1/livingWorld/campaigns/${campaignId}/location-digests`)
      .then((result) => {
        if (token !== tokenRef.current) return;
        const digests = result?.digests || {};
        _cache.set(campaignId, { data: digests });
        setData(digests);
      })
      .catch((err) => {
        if (token !== tokenRef.current) return;
        setError(err);
      })
      .finally(() => {
        if (token === tokenRef.current) setLoading(false);
      });
  }, [campaignId]);

  return { data, loading, error };
}
