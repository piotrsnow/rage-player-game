import { useState, useEffect } from 'react';

// Must match backend SOLO_ACTION_COOLDOWN_MS in backend/src/services/roomManager.js
const SOLO_COOLDOWN_MS = 3 * 60 * 1000;

export function useSoloActionCooldown(lastSoloActionAt) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!lastSoloActionAt) {
      setRemainingMs(0);
      return;
    }

    function tick() {
      const elapsed = Date.now() - lastSoloActionAt;
      const remaining = Math.max(0, SOLO_COOLDOWN_MS - elapsed);
      setRemainingMs(remaining);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSoloActionAt]);

  const isAvailable = remainingMs === 0;

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return { remainingMs, isAvailable, formattedTime };
}
