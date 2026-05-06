import { create } from 'zustand';

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function errToString(e) {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e.message) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

const MAX_LOGS = 200;

export const useAiCallLogStore = create((set, get) => ({
  logs: [],

  startCall: ({ type, label = '', provider = null, model = null, request = null, meta = null }) => {
    const id = genId();
    const entry = {
      id,
      type,
      label: label || type,
      provider,
      model,
      request,
      meta,
      response: null,
      error: null,
      status: 'pending',
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
    };
    set((s) => {
      const next = s.logs.length >= MAX_LOGS ? s.logs.slice(-MAX_LOGS + 1) : s.logs;
      return { logs: [...next, entry] };
    });
    return id;
  },

  finishCall: (id, response, extraMeta = null) => {
    if (!id) return;
    set((s) => ({
      logs: s.logs.map((l) =>
        l.id === id
          ? {
              ...l,
              response,
              meta: extraMeta ? { ...(l.meta || {}), ...extraMeta } : l.meta,
              status: 'success',
              finishedAt: Date.now(),
              durationMs: Date.now() - l.startedAt,
            }
          : l
      ),
    }));
  },

  failCall: (id, error) => {
    if (!id) return;
    set((s) => ({
      logs: s.logs.map((l) =>
        l.id === id
          ? {
              ...l,
              error: errToString(error),
              status: 'error',
              finishedAt: Date.now(),
              durationMs: Date.now() - l.startedAt,
            }
          : l
      ),
    }));
  },

  clearLogs: () => set({ logs: [] }),
}));

export const aiCallLog = {
  start: (...args) => useAiCallLogStore.getState().startCall(...args),
  finish: (...args) => useAiCallLogStore.getState().finishCall(...args),
  fail: (...args) => useAiCallLogStore.getState().failCall(...args),
  clear: () => useAiCallLogStore.getState().clearLogs(),
};
