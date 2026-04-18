// Living World — frontend hook for Phase 2 companions.
//
// Backed by GET /v1/livingWorld/companions. Only fetches when the campaign
// has livingWorldEnabled=true — otherwise the hook returns empty state with
// no network traffic. Refetches on campaignId change + after join/leave.
//
// No background polling: companions change only on user-initiated actions
// (join/leave) or inside scene-gen (loyalty drift → scene narrates NPC
// departure). UI freshness is handled by explicit refresh() calls from the
// mutation paths, not a timer.

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

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
  }, [refresh]);

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
