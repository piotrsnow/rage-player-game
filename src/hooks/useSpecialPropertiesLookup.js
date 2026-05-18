import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';

const cache = new Map();
const inflight = new Map();

function fetchBatch(ids) {
  const key = ids.sort().join(',');
  if (inflight.has(key)) return inflight.get(key);

  const promise = apiClient
    .get(`/special-properties?ids=${encodeURIComponent(ids.join(','))}`)
    .then((rows) => {
      if (Array.isArray(rows)) {
        for (const row of rows) cache.set(row.id, row);
      }
      return rows;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/**
 * Resolves `[{ id }]` refs into `[{ id, name, description }]` for display.
 * Uses an in-memory module-level cache so repeated renders are instant.
 */
export function useSpecialPropertiesLookup(refs) {
  const [resolved, setResolved] = useState([]);
  const cancelledRef = useRef(false);

  const ids = Array.isArray(refs)
    ? refs.map((r) => r?.id).filter(Boolean)
    : [];
  const idsKey = ids.join(',');

  useEffect(() => {
    cancelledRef.current = false;
    if (ids.length === 0) {
      setResolved([]);
      return;
    }

    const allCached = ids.every((id) => cache.has(id));
    if (allCached) {
      setResolved(ids.map((id) => cache.get(id)));
      return;
    }

    const missing = ids.filter((id) => !cache.has(id));
    fetchBatch(missing).then(() => {
      if (!cancelledRef.current) {
        setResolved(ids.map((id) => cache.get(id)).filter(Boolean));
      }
    });

    return () => { cancelledRef.current = true; };
  }, [idsKey]);

  return resolved;
}
