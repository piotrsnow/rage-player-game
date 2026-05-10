import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/apiClient.js';

const LS_KEY = 'rpgon:spriteJobId';
const POLL_INTERVAL = 3000;

/**
 * Manages bulk sprite generation job lifecycle for the admin world graph.
 * Persists jobId in localStorage so progress survives modal close + page reload.
 *
 * @param {{ onComplete?: () => void }} options
 */
export function useWorldGraphSpriteJob({ onComplete } = {}) {
  const [jobId, setJobId] = useState(() => localStorage.getItem(LS_KEY) || null);
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const fetchStatus = useCallback(async (id) => {
    try {
      const data = await apiClient.get(`/admin/livingWorld/world-graph/sprite-jobs/${id}`);
      setStatus(data);
      return data;
    } catch {
      setStatus(null);
      return null;
    }
  }, []);

  const clearJob = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setJobId(null);
    setStatus(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    const poll = async () => {
      const data = await fetchStatus(jobId);
      if (cancelled) return;
      if (!data) {
        clearJob();
        return;
      }
      if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (data.status === 'completed') {
          onCompleteRef.current?.();
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId, fetchStatus, clearJob]);

  const start = useCallback(async (nodes) => {
    const missing = nodes.filter((n) => !n.nodeImageUrl);
    if (missing.length === 0) return;

    setStarting(true);
    try {
      const payload = missing.map((n) => ({ kind: n.kind, id: n.id }));
      const data = await apiClient.post('/admin/livingWorld/world-graph/sprite-jobs', { nodes: payload });
      localStorage.setItem(LS_KEY, data.jobId);
      setJobId(data.jobId);
      setStatus({ status: 'pending', total: data.total, done: 0, failed: 0, recentErrors: [] });
    } finally {
      setStarting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    try {
      await apiClient.post(`/admin/livingWorld/world-graph/sprite-jobs/${jobId}/cancel`);
    } catch { /* ignore */ }
    clearJob();
  }, [jobId, clearJob]);

  const isActive = !!jobId && status && (status.status === 'pending' || status.status === 'running');

  return {
    start,
    cancel,
    clearJob,
    starting,
    isActive,
    jobId,
    status,
  };
}
