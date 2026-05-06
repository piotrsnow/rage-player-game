import { useCallback, useRef, useState } from 'react';
import { api } from '../api';
import { useConfigStore } from '../store';

export function useTestVoice() {
  const [testing, setTesting] = useState(null);
  const audioRef = useRef(null);

  const test = useCallback(async (voiceId, customText) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setTesting(voiceId);
    const { language, getVoiceParams } = useConfigStore.getState();
    const params = getVoiceParams(voiceId);
    const text = customText || (
      language === 'pl'
        ? 'Witaj, poszukiwaczu przygód. Jestem twoim Mistrzem Gry.'
        : 'Greetings, adventurer. I am your Dungeon Master.'
    );

    try {
      const blobUrl = await api.synthesize(voiceId, text, language, params);
      const audio = new Audio(blobUrl);
      audioRef.current = audio;
      const cleanup = () => {
        URL.revokeObjectURL(blobUrl);
        setTesting(null);
        audioRef.current = null;
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch {
      setTesting(null);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTesting(null);
  }, []);

  return { testing, test, stop };
}
