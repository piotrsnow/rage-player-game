import { apiClient, toCanonicalStoragePath } from './apiClient';

function isWhitespaceChar(ch) {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
}

export function splitTextForHighlight(text) {
  const source = String(text || '');
  const parts = [];
  let buffer = '';
  let whitespaceMode = null;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const isWhitespace = isWhitespaceChar(ch);
    if (whitespaceMode === null) {
      whitespaceMode = isWhitespace;
      buffer = ch;
      continue;
    }
    if (isWhitespace === whitespaceMode) {
      buffer += ch;
      continue;
    }
    parts.push(buffer);
    buffer = ch;
    whitespaceMode = isWhitespace;
  }

  if (buffer) parts.push(buffer);
  return parts;
}

export function countHighlightWords(text) {
  const parts = splitTextForHighlight(text);
  let count = 0;
  for (const part of parts) {
    if (!/^\s+$/.test(part)) count += 1;
  }
  return count;
}

// Audio URLs returned from the services layer are canonical
// (`/v1/media/file/...`). Playback-side code (useNarrator) must run them
// through `apiClient.resolveMediaUrl` to attach origin + auth token for
// `new Audio(src)`.
function canonicalAudioUrl(url) {
  if (!url) return null;
  return toCanonicalStoragePath(url);
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
    if (isWhitespaceChar(ch)) {
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
      return canonicalAudioUrl(data.url);
    }
    throw new Error('ElevenLabs requires backend connection');
  },

  async textToSpeechStream(_apiKey, voiceId, text, modelId = 'eleven_multilingual_v2', campaignId = null) {
    if (apiClient.isConnected()) {
      const body = { voiceId, text, modelId };
      if (campaignId) body.campaignId = campaignId;
      const data = await apiClient.post('/proxy/elevenlabs/tts-stream', body);
      return canonicalAudioUrl(data.url);
    }
    throw new Error('ElevenLabs requires backend connection');
  },

  async textToSpeechWithTimestamps(_apiKey, voiceId, text, modelId = 'eleven_multilingual_v2', campaignId = null, pacing = null) {
    if (apiClient.isConnected()) {
      const body = { voiceId, text, modelId };
      if (campaignId) body.campaignId = campaignId;
      if (pacing) body.pacing = pacing;
      const data = await apiClient.post('/proxy/elevenlabs/tts', body);
      const audioUrl = canonicalAudioUrl(data.url);
      const words = data.alignment ? parseAlignmentWords(data.alignment) : [];
      return { audioUrl, words };
    }
    throw new Error('ElevenLabs requires backend connection');
  },

  async textToSpeechFromCache(backendUrl, shareToken, voiceId, text, modelId = 'eleven_multilingual_v2', campaignId = null) {
    const base = (backendUrl || '').replace(/\/+$/, '');
    if (!base || !shareToken) return null;

    try {
      const res = await fetch(`${base}/v1/campaigns/share/${shareToken}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text, modelId, campaignId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      let audioUrl = data.url;
      if (audioUrl && audioUrl.startsWith('/')) {
        audioUrl = new URL(audioUrl, `${base}/`).href;
      }
      const words = data.alignment ? parseAlignmentWords(data.alignment) : [];
      return { audioUrl, words };
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
