import { create } from 'zustand';

const STORAGE_KEY = 'xtts-voice-config';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const PRESETS = {
  stable: {
    label: 'Stable',
    desc: 'Fewer artifacts, more consistent',
    temperature: 0.55, top_p: 0.80, top_k: 40,
    repetition_penalty: 10.0, length_penalty: 1.0, speed: 1.0,
  },
  balanced: {
    label: 'Balanced',
    desc: 'Naturalness + stability',
    temperature: 0.65, top_p: 0.85, top_k: 50,
    repetition_penalty: 10.0, length_penalty: 1.0, speed: 1.0,
  },
  expressive: {
    label: 'Expressive',
    desc: 'More emotion, less stable',
    temperature: 0.75, top_p: 0.90, top_k: 50,
    repetition_penalty: 8.0, length_penalty: 1.0, speed: 1.0,
  },
};

export const DEFAULT_PARAMS = { ...PRESETS.balanced };
delete DEFAULT_PARAMS.label;
delete DEFAULT_PARAMS.desc;

function presetParams(presetId) {
  const p = PRESETS[presetId] || PRESETS.balanced;
  const { label, desc, ...params } = p;
  return params;
}

const defaults = {
  narratorVoiceId: null,
  maleNpcVoices: [],
  femaleNpcVoices: [],
  language: 'pl',
  voiceParams: {},
};

export const useConfigStore = create((set, get) => {
  const persisted = loadPersisted();
  const initial = { ...defaults, ...persisted };

  return {
    ...initial,

    setLanguage: (language) => {
      set({ language });
      persist(get());
    },

    setNarrator: (voiceId) => {
      set({ narratorVoiceId: voiceId });
      persist(get());
    },

    toggleNpcPool: (voiceId, voiceName, gender) => {
      const key = gender === 'female' ? 'femaleNpcVoices' : 'maleNpcVoices';
      const pool = get()[key];
      const exists = pool.some((v) => v.voiceId === voiceId);
      const next = exists
        ? pool.filter((v) => v.voiceId !== voiceId)
        : [...pool, { voiceId, voiceName }];
      set({ [key]: next });
      persist(get());
    },

    removeVoiceFromConfig: (voiceId) => {
      const s = get();
      const vp = { ...s.voiceParams };
      delete vp[voiceId];
      set({
        narratorVoiceId: s.narratorVoiceId === voiceId ? null : s.narratorVoiceId,
        maleNpcVoices: s.maleNpcVoices.filter((v) => v.voiceId !== voiceId),
        femaleNpcVoices: s.femaleNpcVoices.filter((v) => v.voiceId !== voiceId),
        voiceParams: vp,
      });
      persist(get());
    },

    getVoiceParams: (voiceId) => {
      return get().voiceParams[voiceId] || { ...DEFAULT_PARAMS };
    },

    setVoicePreset: (voiceId, presetId) => {
      const vp = { ...get().voiceParams, [voiceId]: presetParams(presetId) };
      set({ voiceParams: vp });
      persist(get());
    },

    setVoiceParam: (voiceId, key, value) => {
      const current = get().voiceParams[voiceId] || { ...DEFAULT_PARAMS };
      const vp = { ...get().voiceParams, [voiceId]: { ...current, [key]: value } };
      set({ voiceParams: vp });
      persist(get());
    },

    detectPreset: (voiceId) => {
      const params = get().voiceParams[voiceId] || DEFAULT_PARAMS;
      for (const [id, preset] of Object.entries(PRESETS)) {
        const { label, desc, ...vals } = preset;
        const match = Object.entries(vals).every(
          ([k, v]) => Math.abs((params[k] ?? DEFAULT_PARAMS[k]) - v) < 0.001,
        );
        if (match) return id;
      }
      return null;
    },
  };
});

function persist(state) {
  const { narratorVoiceId, maleNpcVoices, femaleNpcVoices, language, voiceParams } = state;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ narratorVoiceId, maleNpcVoices, femaleNpcVoices, language, voiceParams }),
  );
}
