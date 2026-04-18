// Living World — frontend hook for Phase 2 companions.
//
// Backed by GET /v1/livingWorld/companions. Only fetches when the campaign
// has livingWorldEnabled=true — otherwise the hook returns empty state with
// no network traffic. Refetches on campaignId change + on demand.

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

const REFRESH_INTERVAL_MS = 30_000; // light polling — companions change slowly

export function useLivingWorldCompanions({ campaignId, enabled }) {
  const [companions, setCompanions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled || !campaignId) {
      setCompanions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/v1/livingWorld/companions?campaignId=${encodeURIComponent(campaignId)}`);
      setCompanions(Array.isArray(res?.companions) ? res.companions : []);
    } catch (err) {
      setError(err.message || 'Failed to load companions');
    } finally {
      setLoading(false);
    }
  }, [campaignId, enabled]);

  useEffect(() => {
    refresh();
    if (!enabled || !campaignId) return undefined;
    const t = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [refresh, campaignId, enabled]);

  const leaveParty = useCallback(async (worldNpcId, reason = 'manual') => {
    if (!campaignId || !worldNpcId) return { ok: false };
    try {
      const res = await apiClient.post(
        `/v1/livingWorld/companions/${encodeURIComponent(worldNpcId)}/leave`,
        { campaignId, reason },
      );
      await refresh();
      return res;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [campaignId, refresh]);

  const joinParty = useCallback(async (worldNpcId) => {
    if (!campaignId || !worldNpcId) return { ok: false };
    try {
      const res = await apiClient.post(
        `/v1/livingWorld/companions/${encodeURIComponent(worldNpcId)}/join`,
        { campaignId },
      );
      await refresh();
      return res;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [campaignId, refresh]);

  return { companions, loading, error, refresh, leaveParty, joinParty };
}
