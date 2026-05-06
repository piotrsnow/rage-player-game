import { apiClient, toCanonicalStoragePath } from './apiClient';

function canonicalAudioUrl(url) {
  if (!url) return null;
  return toCanonicalStoragePath(url);
}

export const xttsService = {
  async getVoices() {
    if (!apiClient.isConnected()) throw new Error('XTTS requires backend connection');
    return apiClient.get('/proxy/xtts/voices');
  },

  async checkHealth() {
    if (!apiClient.isConnected()) throw new Error('XTTS requires backend connection');
    return apiClient.get('/proxy/xtts/health');
  },

  async textToSpeech(voiceId, text, language = 'pl', campaignId = null) {
    if (!apiClient.isConnected()) throw new Error('XTTS requires backend connection');
    const body = { voiceId, text, language };
    if (campaignId) body.campaignId = campaignId;
    const data = await apiClient.post('/proxy/xtts/tts', body);
    const audioUrl = canonicalAudioUrl(data.url);
    return { audioUrl, words: [] };
  },
};
