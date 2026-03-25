import { apiClient } from './apiClient';

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
  async getVoices() {
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
    throw new Error('ElevenLabs requires backend connection');
  },

  async generateSoundEffect(_apiKey, text, durationSeconds = 4, campaignId = null) {
    if (apiClient.isConnected()) {
      const body = { text, durationSeconds };
      if (campaignId) body.campaignId = campaignId;
      const data = await apiClient.post('/proxy/elevenlabs/sfx', body);
      return resolveMediaUrl(data.url);
    }
    throw new Error('ElevenLabs requires backend connection');
  },

  async textToSpeechStream(_apiKey, voiceId, text, modelId = 'eleven_multilingual_v2', campaignId = null) {
    if (apiClient.isConnected()) {
      const body = { voiceId, text, modelId };
      if (campaignId) body.campaignId = campaignId;
      const data = await apiClient.post('/proxy/elevenlabs/tts-stream', body);
      return resolveMediaUrl(data.url);
    }
    throw new Error('ElevenLabs requires backend connection');
  },

  async textToSpeechWithTimestamps(_apiKey, voiceId, text, modelId = 'eleven_multilingual_v2', campaignId = null) {
    if (apiClient.isConnected()) {
      const body = { voiceId, text, modelId };
      if (campaignId) body.campaignId = campaignId;
      const data = await apiClient.post('/proxy/elevenlabs/tts', body);
      const audioUrl = resolveMediaUrl(data.url);
      const words = data.alignment ? parseAlignmentWords(data.alignment) : [];
      return { audioUrl, words };
    }
    throw new Error('ElevenLabs requires backend connection');
  },

  async textToSpeechFromCache(backendUrl, shareToken, voiceId, text, modelId = 'eleven_multilingual_v2', campaignId = null) {
    const base = (backendUrl || '').replace(/\/+$/, '');
    if (!base || !shareToken) return null;

    try {
      const res = await fetch(`${base}/campaigns/share/${shareToken}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text, modelId, campaignId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const words = data.alignment ? parseAlignmentWords(data.alignment) : [];
      return { audioUrl: data.url, words };
    } catch {
      return null;
    }
  },

  splitIntoParagraphs(text) {
    const paragraphs = text.split(/\n\s*\n/);
    const result = paragraphs.map((p) => p.trim()).filter(Boolean);
    return result.length > 0 ? result : [text.trim()].filter(Boolean);
  },
};
