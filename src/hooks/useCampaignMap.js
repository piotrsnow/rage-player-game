import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '../services/apiClient';

// Fetches the unified player map payload (locations + edges + fog + currentLocationId).
// Refetches whenever `triggerKey` changes — pass the current scene id so the
// map refreshes after each scene (fog bits may have moved).
export function useCampaignMap(campaignId, triggerKey) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const staleTokenRef = useRef(0);

  const fetch = useCallback(async () => {
    if (!campaignId) {
      setData(null);
      return;
    }
    const token = ++staleTokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/v1/livingWorld/campaigns/${campaignId}/map`);
      if (token !== staleTokenRef.current) return;
      setData(res);
    } catch (err) {
      if (token !== staleTokenRef.current) return;
      setError(err);
    } finally {
      if (token === staleTokenRef.current) setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetch();
  }, [fetch, triggerKey]);

  return { data, loading, error, refetch: fetch };
}
