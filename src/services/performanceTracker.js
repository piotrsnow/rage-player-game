const SCENE_GEN_DURATION_HISTORY_KEY = 'rpgon_scene_gen_durations_ms';
const SCENE_GEN_DURATION_HISTORY_LEGACY_KEY = 'rpgon_last_scene_gen_ms';
const SCENE_GEN_HISTORY_MAX = 5;
const SCENE_GEN_ESTIMATE_PADDING_MS = 3000;

function isValidDurationEntry(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

export function loadSceneGenDurationHistory() {
  try {
    const raw = localStorage.getItem(SCENE_GEN_DURATION_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const nums = parsed.filter(isValidDurationEntry);
        if (nums.length) return nums.slice(-SCENE_GEN_HISTORY_MAX);
      }
    }
    const legacy = localStorage.getItem(SCENE_GEN_DURATION_HISTORY_LEGACY_KEY);
    if (legacy) {
      const v = Number(legacy);
      if (isValidDurationEntry(v)) return [v];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function appendSceneGenDuration(history, elapsedMs) {
  if (!isValidDurationEntry(elapsedMs)) return history;
  return [...history, elapsedMs].slice(-SCENE_GEN_HISTORY_MAX);
}

export function historyToSceneGenEstimateMs(history) {
  if (!history.length) return null;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  return Math.round(avg + SCENE_GEN_ESTIMATE_PADDING_MS);
}

export function persistSceneGenDurationHistory(history) {
  try {
    localStorage.setItem(SCENE_GEN_DURATION_HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
}
