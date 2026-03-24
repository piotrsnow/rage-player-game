import { apiClient } from './apiClient';

const BASE_URL = import.meta.env.DEV ? '/suno-api' : 'https://api.sunoapi.org';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60;

const log = (...args) => console.log('%c[Suno]', 'color:#a78bfa;font-weight:bold', ...args);
const logErr = (...args) => console.error('%c[Suno]', 'color:#f87171;font-weight:bold', ...args);

const STYLE_MAP = {
  'Fantasy-Dark': 'dark orchestral, ambient, medieval instruments, minor key, somber strings',
  'Fantasy-Epic': 'epic orchestral, heroic brass, sweeping strings, choir, triumphant',
  'Fantasy-Humorous': 'whimsical folk, playful flute, lighthearted medieval tavern music',
  'Sci-Fi-Dark': 'dark synthwave, ambient electronic, dystopian, pulsing bass, industrial',
  'Sci-Fi-Epic': 'epic electronic, cinematic synth, grandiose sci-fi orchestral hybrid',
  'Sci-Fi-Humorous': 'quirky retro electronic, chiptune-inspired, playful synth bleeps',
  'Horror-Dark': 'dark ambient, dissonant strings, eerie atmosphere, unsettling drones',
  'Horror-Epic': 'intense horror orchestral, dramatic tension, pounding percussion',
  'Horror-Humorous': 'campy horror organ, theremin, comedic spooky soundtrack',
};

const FALLBACK_STYLE = 'cinematic instrumental, atmospheric, immersive soundtrack';

export function buildMusicStyle(genre, tone) {
  const key = `${genre || 'Fantasy'}-${tone || 'Epic'}`;
  return STYLE_MAP[key] || FALLBACK_STYLE;
}

export const sunoService = {
  async generateMusic(apiKey, { style, title, model = 'V4_5' }) {
    if (apiClient.isConnected()) {
      log('generateMusic via proxy →', { style, title, model });
      const data = await apiClient.post('/proxy/suno/generate', { style, title, model });
      log('generateMusic via proxy ←', { taskId: data.taskId });
      return data.taskId;
    }

    const payload = {
      customMode: true,
      instrumental: true,
      style,
      title: (title || 'RPG Scene').substring(0, 80),
      model,
      callBackUrl: 'https://localhost/no-op',
    };
    log('generateMusic →', { style, title: payload.title, model });

    let response;
    try {
      response = await fetch(`${BASE_URL}/api/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      logErr('Network error on generate:', networkErr.message);
      throw new Error(`Suno network error: ${networkErr.message}`);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      logErr('Generate HTTP error:', response.status, err);
      throw new Error(err.msg || `Suno API error: ${response.status}`);
    }

    const data = await response.json();
    log('generateMusic ←', { code: data.code, taskId: data.data?.taskId, msg: data.msg });

    if (data.code !== 200) {
      logErr('Generate rejected:', data.code, data.msg);
      throw new Error(data.msg || 'Suno generation request failed');
    }

    return data.data.taskId;
  },

  async getTaskStatus(apiKey, taskId) {
    if (apiClient.isConnected()) {
      return apiClient.get(`/proxy/suno/status/${encodeURIComponent(taskId)}`);
    }

    let response;
    try {
      response = await fetch(
        `${BASE_URL}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
    } catch (networkErr) {
      logErr('Network error on poll:', networkErr.message);
      throw new Error(`Suno network error: ${networkErr.message}`);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      logErr('Poll HTTP error:', response.status, err);
      throw new Error(err.msg || `Suno status error: ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 200) {
      logErr('Poll rejected:', data.code, data.msg);
      throw new Error(data.msg || 'Failed to fetch task status');
    }

    return data.data;
  },

  async cacheTrack({ audioUrl, genre, tone, mood, style, title, duration, imageUrl, campaignId }) {
    if (!apiClient.isConnected()) return null;
    try {
      const body = { audioUrl, genre, tone, mood, style, title, duration, imageUrl };
      if (campaignId) body.campaignId = campaignId;
      const data = await apiClient.post('/proxy/suno/cache-track', body);
      if (data.url) {
        const resolved = data.url.startsWith('http') ? data.url : `${apiClient.getBaseUrl()}${data.url}`;
        return { ...data, url: resolved };
      }
      return data;
    } catch (err) {
      log('Failed to cache track:', err.message);
      return null;
    }
  },

  async pollUntilReady(apiKey, taskId, signal) {
    log(`Polling taskId=${taskId} (interval=${POLL_INTERVAL_MS}ms, max=${MAX_POLL_ATTEMPTS})`);

    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const status = await this.getTaskStatus(apiKey, taskId);
      const taskStatus = status?.status;
      log(`Poll #${i + 1}: status=${taskStatus}`);

      if (taskStatus === 'SUCCESS' || taskStatus === 'FIRST_SUCCESS') {
        const tracks = status.response?.data || status.data || [];
        log('Tracks received:', tracks.length, tracks.map((t) => ({ title: t.title, duration: t.duration, hasAudio: !!(t.stream_audio_url || t.audio_url) })));
        const track = tracks.find((t) => t.stream_audio_url || t.audio_url);
        if (track) {
          const result = {
            audioUrl: track.stream_audio_url || track.audio_url,
            title: track.title,
            duration: track.duration,
            imageUrl: track.image_url,
          };
          log('Ready ✓', { title: result.title, duration: result.duration, audioUrl: result.audioUrl?.substring(0, 80) + '...' });
          return result;
        }
        if (taskStatus === 'FIRST_SUCCESS') {
          log('FIRST_SUCCESS but track has no audio URL yet, continuing poll...');
          continue;
        }
        logErr('SUCCESS but no tracks in response:', JSON.stringify(status).substring(0, 500));
        throw new Error('Suno returned SUCCESS but no audio tracks');
      }

      if (taskStatus === 'FAILED' || taskStatus === 'CREATE_TASK_FAILED' || taskStatus === 'GENERATE_AUDIO_FAILED') {
        logErr('Generation failed:', taskStatus, status.errorMessage, JSON.stringify(status).substring(0, 300));
        throw new Error(status.errorMessage || `Suno generation failed: ${taskStatus}`);
      }

      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, POLL_INTERVAL_MS);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }

    logErr('Timed out after', MAX_POLL_ATTEMPTS, 'attempts');
    throw new Error('Suno generation timed out');
  },
};
