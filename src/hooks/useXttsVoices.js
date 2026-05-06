import { useState } from 'react';
import { xttsService } from '../services/xtts';
import { apiClient } from '../services/apiClient';

export function useXttsVoices({ language }) {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [testing, setTesting] = useState(false);

  const loadVoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const voiceList = await xttsService.getVoices();
      setVoices(
        voiceList.map((v) => ({
          voiceId: v.id,
          name: v.name,
          gender: v.gender,
          roles: v.roles || [],
        })),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearVoices = () => setVoices([]);

  const testVoice = async (voiceId) => {
    if (!voiceId) return;
    setTesting(true);
    try {
      const result = await xttsService.textToSpeech(
        voiceId,
        language === 'pl'
          ? 'Witaj, poszukiwaczu przygód. Jestem twoim Mistrzem Gry.'
          : 'Greetings, adventurer. I am your Dungeon Master.',
        language || 'pl',
      );
      const audioUrl = apiClient.resolveMediaUrl(result.audioUrl);
      const audio = new Audio(audioUrl);
      const cleanup = () => {
        URL.revokeObjectURL(audioUrl);
        setTesting(false);
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch {
      setTesting(false);
    }
  };

  return {
    voices,
    loadingVoices: loading,
    voiceError: error,
    testingVoice: testing,
    loadVoices,
    clearVoices,
    testVoice,
  };
}
