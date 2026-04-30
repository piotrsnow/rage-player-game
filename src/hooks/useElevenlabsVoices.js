import { useState } from 'react';
import { elevenlabsService } from '../services/elevenlabs';
import { apiClient } from '../services/apiClient';

/**
 * Owns the ElevenLabs voice catalog + test playback UI state for the
 * settings screen. Extracted from DMSettingsPage so the component can
 * focus on layout.
 *
 * The caller is responsible for gating the load call behind `hasApiKey`;
 * this hook assumes credentials are already configured when its actions
 * are invoked.
 */
export function useElevenlabsVoices({ language }) {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [testing, setTesting] = useState(false);

  const loadVoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const voiceList = await elevenlabsService.getVoices();
      setVoices(voiceList);
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
      const canonicalAudio = await elevenlabsService.textToSpeechStream(
        undefined,
        voiceId,
        language === 'pl'
          ? 'Witaj, poszukiwaczu przygód. Jestem twoim Mistrzem Gry.'
          : 'Greetings, adventurer. I am your Dungeon Master.',
      );
      const audioUrl = apiClient.resolveMediaUrl(canonicalAudio);
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
