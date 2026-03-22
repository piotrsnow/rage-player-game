import { apiClient } from './apiClient';

const BASE_URL = 'https://api.elevenlabs.io/v1';

function resolveMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('blob:')) return url;
  const base = `${apiClient.getBaseUrl()}${url}`;
  const token = apiClient.getToken();
  return token ? `${base}${base.includes('?') ? '&' : '?'}token=${token}` : base;
}

function parseAlignmentWords(alignment) {
  const chars = alignment?.characters || [];
  const startTimes = alignment?.character_start_times_seconds || [];
  const endTimes = alignment?.character_end_times_seconds || [];

  const words = [];
  let currentWord = '';
  let wordStart = null;
  let wordEnd = null;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      if (currentWord) {
        words.push({ word: currentWord, start: wordStart, end: wordEnd });
        currentWord = '';
        wordStart = null;
        wordEnd = null;
      }
    } else {
      if (wordStart === null) wordStart = startTimes[i];
      wordEnd = endTimes[i];
      currentWord += ch;
    }
  }
  if (currentWord) {
    words.push({ word: currentWord, start: wordStart, end: wordEnd });
  }

  return words;
}

export const elevenlabsService = {
  async getVoices(apiKey) {
    if (apiClient.isConnected()) {
      const data = await apiClient.get('/proxy/elevenlabs/voices');
      return data.voices.map((v) => ({
        voiceId: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels,
        previewUrl: v.preview_url,
      }));
    }

    const response = await fetch(`${BASE_URL}/voices`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail?.message || `ElevenLabs API error: ${response.status}`);
    }

    const data = await response.json();
    return data.voices.map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels,
      previewUrl: v.preview_url,
    }));
  },

  async generateSoundEffect(apiKey, text, durationSeconds = 4) {
    if (apiClient.isConnected()) {
      const data = await apiClient.post('/proxy/elevenlabs/sfx', { text, durationSeconds });
      return resolveMediaUrl(data.url);
    }

    const response = await fetch(`${BASE_URL}/sound-generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        duration_seconds: durationSeconds,
        prompt_influence: 0.3,
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail?.message || `ElevenLabs SFX error: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  async textToSpeechStream(apiKey, voiceId, text, modelId = 'eleven_multilingual_v2') {
    if (apiClient.isConnected()) {
      const data = await apiClient.post('/proxy/elevenlabs/tts-stream', { voiceId, text, modelId });
      return resolveMediaUrl(data.url);
    }

    const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail?.message || `ElevenLabs TTS error: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  async textToSpeechWithTimestamps(apiKey, voiceId, text, modelId = 'eleven_multilingual_v2') {
    if (apiClient.isConnected()) {
      const data = await apiClient.post('/proxy/elevenlabs/tts', { voiceId, text, modelId });
      const audioUrl = resolveMediaUrl(data.url);
      const words = data.alignment ? parseAlignmentWords(data.alignment) : [];
      return { audioUrl, words };
    }

    const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail?.message || `ElevenLabs TTS error: ${response.status}`);
    }

    const data = await response.json();
    const audioBytes = atob(data.audio_base64);
    const audioArray = new Uint8Array(audioBytes.length);
    for (let i = 0; i < audioBytes.length; i++) {
      audioArray[i] = audioBytes.charCodeAt(i);
    }
    const blob = new Blob([audioArray], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);
    const words = parseAlignmentWords(data.alignment);

    return { audioUrl, words };
  },

  splitIntoSentences(text) {
    const sentences = text.match(/[^.!?…]+[.!?…]+[\s]*/g);
    if (!sentences) return [text.trim()].filter(Boolean);
    const remaining = text.replace(/[^.!?…]+[.!?…]+[\s]*/g, '').trim();
    const result = sentences.map((s) => s.trim()).filter(Boolean);
    if (remaining) result.push(remaining);
    return result;
  },
};
