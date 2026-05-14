import { useCallback, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { playMinigameSfx, setMinigameVolume } from '../services/minigameAudio';

/**
 * Thin wrapper around playMinigameSfx that respects user SFX settings.
 * Returns a stable `play(category)` callback that no-ops when SFX are off.
 */
export function useMinigameAudio() {
  const { settings } = useSettings();
  const enabled = !!settings.sfxEnabled;
  const genVolume = settings.generatedSfxVolume ?? 60;

  useEffect(() => {
    const db = genVolume <= 0 ? -60 : -30 + (genVolume / 100) * 30;
    setMinigameVolume(db);
  }, [genVolume]);

  const play = useCallback(
    (category) => {
      if (!enabled) return;
      void playMinigameSfx(category);
    },
    [enabled],
  );

  return play;
}
