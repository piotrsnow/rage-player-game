const BASE = '/api';

async function handleResponse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || body.message || `HTTP ${res.status}`);
  }
  return res;
}

export const api = {
  getHealth: () =>
    fetch(`${BASE}/health`).then(handleResponse).then((r) => r.json()),

  getVoices: () =>
    fetch(`${BASE}/voices`).then(handleResponse).then((r) => r.json()),

  uploadVoice: async (file, name, gender) => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('gender', gender);
    const res = await fetch(`${BASE}/voices`, { method: 'POST', body: form });
    return handleResponse(res).then((r) => r.json());
  },

  patchVoice: async (id, data) => {
    const res = await fetch(`${BASE}/voices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res).then((r) => r.json());
  },

  deleteVoice: async (id) => {
    const res = await fetch(`${BASE}/voices/${id}`, { method: 'DELETE' });
    return handleResponse(res).then((r) => r.json());
  },

  synthesize: async (voiceId, text, language, params) => {
    const res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id: voiceId, text, language, params }),
    });
    await handleResponse(res);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
