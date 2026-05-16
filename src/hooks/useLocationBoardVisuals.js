import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { useGameDispatch } from '../stores/gameSelectors';

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 30; // ~2 min ceiling
const ATLAS_CACHE = new Map(); // imageKey → Promise<HTMLImageElement>

function loadAtlasImage(imageKey) {
  if (!imageKey) return Promise.resolve(null);
  if (ATLAS_CACHE.has(imageKey)) return ATLAS_CACHE.get(imageKey);

  const promise = new Promise((resolve, reject) => {
    const src = apiClient.resolveMediaUrl(`/v1/media/file/${imageKey.replace(/^\/+/, '')}`);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  }).catch((err) => {
    ATLAS_CACHE.delete(imageKey);
    throw err;
  });

  ATLAS_CACHE.set(imageKey, promise);
  return promise;
}

/**
 * Load the visual-pack atlas image for a v2 ExplorationBoard, and poll the
 * backend while the worker is still busy (visualStatus === "pending").
 *
 * Returns { atlasImage, status }.
 *   atlasImage — HTMLImageElement once decoded, null until ready.
 *   status — visualStatus snapshot ("pending" | "ready" | "failed" | "absent").
 *
 * When polling lands a fresh `visualPack`, the hook dispatches
 * SET_LOCATION_BOARD so the rest of the FE picks up the new pack metadata
 * (renderer reads it from store).
 */
export function useLocationBoardVisuals({ campaignId, locationBoard }) {
  const dispatch = useGameDispatch();
  const [atlasImage, setAtlasImage] = useState(null);
  const [status, setStatus] = useState('absent');
  const pollAttemptsRef = useRef(0);
  const pollTimerRef = useRef(null);

  // Track which imageKey we already decoded so a re-render doesn't loop.
  const decodedKeyRef = useRef(null);

  useEffect(() => {
    if (locationBoard?.version !== 2) {
      setAtlasImage(null);
      setStatus(locationBoard?.version === 1 ? 'absent' : locationBoard ? 'absent' : 'absent');
      return undefined;
    }

    setStatus(locationBoard.visualStatus || 'pending');

    const imageKey = locationBoard.visualPack?.imageKey;
    if (locationBoard.visualStatus === 'ready' && imageKey && decodedKeyRef.current !== imageKey) {
      let cancelled = false;
      loadAtlasImage(imageKey)
        .then((img) => {
          if (cancelled) return;
          decodedKeyRef.current = imageKey;
          setAtlasImage(img);
        })
        .catch(() => {
          if (cancelled) return;
          decodedKeyRef.current = null;
          setAtlasImage(null);
        });
      return () => { cancelled = true; };
    }
    return undefined;
  }, [locationBoard]);

  // Poll backend while pending — re-POSTing location-board returns the cached
  // board immediately, which is exactly what we want as a status probe.
  useEffect(() => {
    if (!campaignId) return undefined;
    if (locationBoard?.version !== 2) return undefined;
    if (locationBoard.visualStatus !== 'pending') {
      pollAttemptsRef.current = 0;
      return undefined;
    }

    let cancelled = false;
    pollAttemptsRef.current = 0;

    const tick = async () => {
      if (cancelled) return;
      if (pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) return;
      pollAttemptsRef.current += 1;

      try {
        const fresh = await apiClient.generateLocationBoard(campaignId);
        if (cancelled) return;
        if (fresh?.version === 2) {
          dispatch({ type: 'SET_LOCATION_BOARD', payload: fresh });
          if (fresh.visualStatus !== 'pending') return; // useEffect[locationBoard] will continue
        }
      } catch (err) {
        // Soft-fail — keep polling. A persistent 500 means the worker died;
        // the FE simply stays on the colored-tile fallback.
      }
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [campaignId, locationBoard, dispatch]);

  return { atlasImage, status };
}
