import { useEffect } from 'react';
import { useGameStore, flushPendingSave } from '../stores/gameStore';

export function GameProvider({ children }) {
  useEffect(() => {
    const handler = () => flushPendingSave();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return children;
}

export function useGame() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const autoSave = useGameStore((s) => s.autoSave);
  return { state, dispatch, autoSave };
}
