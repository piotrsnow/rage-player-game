import { create } from 'zustand';
import { apiClient } from '../services/apiClient';

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function errToString(e) {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e.message) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

const MAX_LOGS = 100;

export const useAiCallLogStore = create((set, get) => ({
  logs: [],
  backendLogs: [],

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
      source: 'client',
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

  setBackendLogs: (rows) => set({ backendLogs: rows }),

  fetchBackendLogs: async () => {
    try {
      const data = await apiClient.get('/ai/llm-call-log');
      const rows = (data?.calls || []).map((r) => ({
        id: `be_${r.id}`,
        type: r.type,
        label: r.label || r.type,
        provider: r.provider,
        model: r.model,
        request: r.request ?? null,
        response: r.response ?? null,
        status: r.status,
        durationMs: r.durationMs,
        error: r.error,
        startedAt: new Date(r.startedAt).getTime(),
        finishedAt: r.finishedAt ? new Date(r.finishedAt).getTime() : null,
        source: 'backend',
      }));
      set({ backendLogs: rows });
    } catch {
      // silent
    }
  },

  clearLogs: () => set({ logs: [], backendLogs: [] }),
}));

export const aiCallLog = {
  start: (...args) => useAiCallLogStore.getState().startCall(...args),
  finish: (...args) => useAiCallLogStore.getState().finishCall(...args),
  fail: (...args) => useAiCallLogStore.getState().failCall(...args),
  clear: () => useAiCallLogStore.getState().clearLogs(),
};
