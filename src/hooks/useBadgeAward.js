import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient } from '../services/apiClient';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10;

export function useBadgeAward({ campaignId, dispatch, autoSave }) {
  const [hasPendingBadge, setHasPendingBadge] = useState(false);
  const [pendingBadge, setPendingBadge] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const pollingRef = useRef(null);
  const pollCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const poll = useCallback(async () => {
    if (!campaignId || !apiClient.isConnected()) return;
    try {
      const { badge } = await apiClient.get(`/campaigns/${campaignId}/pending-badge`);
      if (badge) {
        setPendingBadge(badge);
        setHasPendingBadge(true);
        stopPolling();
      }
    } catch {
      // polling failure is not critical
    }
  }, [campaignId, stopPolling]);

  const startPolling = useCallback(() => {
    if (!campaignId || !apiClient.isConnected()) return;
    stopPolling();
    pollCountRef.current = 0;
    pollingRef.current = setInterval(() => {
      pollCountRef.current++;
      if (pollCountRef.current >= MAX_POLLS) {
        stopPolling();
        return;
      }
      poll();
    }, POLL_INTERVAL_MS);
  }, [campaignId, poll, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const openBadgeModal = useCallback(() => {
    if (pendingBadge) setModalOpen(true);
  }, [pendingBadge]);

  const dismissBadge = useCallback(async () => {
    if (!pendingBadge || !campaignId) return;
    if (dispatch) {
      dispatch({ type: 'ADD_BADGE_XP', payload: { xpValue: pendingBadge.xpValue, badge: pendingBadge } });
    }
    try {
      await apiClient.delete(`/campaigns/${campaignId}/pending-badge`);
    } catch {
      // non-critical
    }
    if (autoSave) autoSave();
    setModalOpen(false);
    setHasPendingBadge(false);
    setPendingBadge(null);
  }, [pendingBadge, campaignId, dispatch, autoSave]);

  return {
    hasPendingBadge,
    pendingBadge,
    modalOpen,
    openBadgeModal,
    dismissBadge,
    startPolling,
  };
}
