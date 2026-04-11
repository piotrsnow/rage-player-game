import { useEffect, useRef, useState } from 'react';
import { useGameDispatch, useGameSlice } from '../stores/gameSelectors';

/**
 * Session playtime tracker. Ticks a local counter every second for UI display
 * and flushes the accumulated total to game state every 30s (plus once on
 * unmount). Reads the initial total once from store to avoid resetting after
 * a reload.
 */
export function usePlayTimeTracker() {
  const dispatch = useGameDispatch();
  const initialTotal = useGameSlice((s) => s.totalPlayTime || 0);
  const initialTotalRef = useRef(initialTotal);
  const [sessionStartTime] = useState(() => Date.now());
  const [sessionSeconds, setSessionSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  useEffect(() => {
    const flush = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      dispatch({ type: 'SET_PLAY_TIME', payload: initialTotalRef.current + elapsed });
    }, 30000);
    return () => {
      clearInterval(flush);
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      dispatch({ type: 'SET_PLAY_TIME', payload: initialTotalRef.current + elapsed });
    };
  }, [sessionStartTime, dispatch]);

  return {
    sessionStartTime,
    sessionSeconds,
    totalPlayTime: initialTotalRef.current + sessionSeconds,
  };
}
