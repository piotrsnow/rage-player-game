import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

/**
 * Fetches media cache summary from the backend when it's reachable.
 * Returns null if disconnected or on error — caller treats null as
 * "no stats to show" and hides the section.
 */
export function useMediaCacheStats({ useBackend, backendUrl }) {
  const [stats, setStats] = useState(null);

  const reload = useCallback(async () => {
    if (!apiClient.isConnected()) return;
    try {
      const next = await apiClient.get('/media/stats/summary');
      setStats(next);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    if (useBackend && backendUrl && apiClient.isConnected()) {
      reload();
    }
  }, [useBackend, backendUrl, reload]);

  return { cacheStats: stats, reloadCacheStats: reload };
}
