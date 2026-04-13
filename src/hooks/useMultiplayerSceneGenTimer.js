import { useEffect, useState } from 'react';

/**
 * Tracks when a multiplayer scene generation started so the UI can display
 * elapsed time while waiting. Clears when generation finishes or when the
 * session leaves multiplayer mode.
 */
export function useMultiplayerSceneGenTimer({ isMultiplayer, isGenerating }) {
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    if (!isMultiplayer) {
      setStartTime(null);
      return;
    }
    if (isGenerating) {
      setStartTime((prev) => prev || Date.now());
      return;
    }
    setStartTime(null);
  }, [isMultiplayer, isGenerating]);

  return startTime;
}
