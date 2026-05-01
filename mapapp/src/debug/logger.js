// Lightweight debug logger for mapapp (Studio / Editor / CharGen).
//
// Gating:
//   - ?debug=1 in URL, or
//   - localStorage.mapappDebug === '1'
//
// When disabled:
//   - debug/info are no-ops (zero cost aside from the flag check)
//   - warn/error still reach the real console (they're real problems)
//
// When enabled:
//   - Every call appends to a FIFO ring buffer (cap 500) and is mirrored
//     to the native console with a `[mapapp:<ns>]` prefix.
//   - Subscribers (e.g. the overlay) are notified via microtask batching
//     so a burst of N log calls triggers one re-render, not N.
//   - `window.__mapappLog` exposes dump/export/clear/subscribe.

const RING_CAP = 500;
const LEVELS = ['debug', 'info', 'warn', 'error'];

const entries = [];
const subscribers = new Set();
let notifyQueued = false;
let enabled = computeEnabled();

function computeEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URLSearchParams(window.location.search);
    if (url.get('debug') === '1') return true;
  } catch {
    // URL parsing can throw in very unusual envs; fall through to LS.
  }
  try {
    if (window.localStorage && window.localStorage.getItem('mapappDebug') === '1') {
      return true;
    }
  } catch {
    // Private mode / disabled storage.
  }
  return false;
}

function push(entry) {
  entries.push(entry);
  while (entries.length > RING_CAP) entries.shift();
  if (!notifyQueued && subscribers.size) {
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      for (const fn of subscribers) {
        try { fn(entries); } catch { /* subscriber crashes never break logging */ }
      }
    });
  }
}

function writeConsole(level, ns, msg, data) {
  const method = typeof console[level] === 'function' ? console[level] : console.log;
  const prefix = `[mapapp:${ns}]`;
  if (data === undefined) method.call(console, prefix, msg);
  else method.call(console, prefix, msg, data);
}

function emit(ns, level, msg, data) {
  const isAlways = level === 'warn' || level === 'error';
  if (!enabled && !isAlways) return;
  const entry = {
    t: Date.now(),
    ns,
    level,
    msg: String(msg),
    data: data === undefined ? null : safeClone(data),
  };
  if (enabled) push(entry);
  writeConsole(level, ns, msg, data);
}

// Best-effort structured clone for log payloads — keeps Errors readable and
// avoids "[object Object]" in the overlay. Falls back to the original on
// weird cases (e.g. circular refs that structuredClone can't handle).
function safeClone(data) {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  if (data === null || typeof data !== 'object') return data;
  try {
    return structuredClone(data);
  } catch {
    try { return JSON.parse(JSON.stringify(data)); } catch { return String(data); }
  }
}

export function createLogger(namespace) {
  const ns = String(namespace || 'app');
  const api = {};
  for (const level of LEVELS) {
    api[level] = (msg, data) => emit(ns, level, msg, data);
  }
  // `time(label)` returns a `done(extraData?)` closure that emits a single
  // debug entry with `ms`. Preferred over `console.time` because it feeds
  // the ring buffer too.
  api.time = (label) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return (extraData) => {
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const ms = Math.round((t1 - t0) * 100) / 100;
      emit(ns, 'debug', label, extraData ? { ms, ...extraData } : { ms });
      return ms;
    };
  };
  return api;
}

export function isDebugEnabled() {
  return enabled;
}

export function setEnabled(v) {
  const next = !!v;
  if (next === enabled) return;
  enabled = next;
  try {
    if (next) window.localStorage?.setItem('mapappDebug', '1');
    else window.localStorage?.removeItem('mapappDebug');
  } catch { /* ignore */ }
  emit('logger', 'info', next ? 'debug enabled' : 'debug disabled');
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getEntries() {
  return entries.slice();
}

export function clearEntries() {
  entries.length = 0;
  // Broadcast immediately so the overlay reflects the clear without
  // waiting for the next log line.
  for (const fn of subscribers) {
    try { fn(entries); } catch { /* ignore */ }
  }
}

// Pretty-print the ring buffer for paste-into-bug-report. Copies to the
// clipboard when available and also returns the string.
export async function exportLog() {
  const payload = {
    exportedAt: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    count: entries.length,
    entries: entries.map((e) => ({
      t: new Date(e.t).toISOString(),
      ns: e.ns,
      level: e.level,
      msg: e.msg,
      data: e.data,
    })),
  };
  const text = JSON.stringify(payload, null, 2);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback: dump to the console so the user can copy from DevTools.
       
      console.log('[mapapp:logger] clipboard unavailable — copy from here:\n' + text);
    }
  } catch {
     
    console.log('[mapapp:logger] clipboard write failed — copy from here:\n' + text);
  }
  return text;
}

// Expose on window for ad-hoc DevTools use + the overlay. We only attach
// when debug is enabled — no global pollution in prod for regular users.
if (typeof window !== 'undefined') {
  if (enabled) {
    window.__mapappLog = {
      get entries() { return entries.slice(); },
      dump: () => entries.slice(),
      export: exportLog,
      clear: clearEntries,
      setEnabled,
      subscribe,
    };
    // Boot-time marker so the user can verify the flag caught.
    emit('logger', 'info', 'mapapp debug logger enabled', {
      source: new URLSearchParams(window.location.search).get('debug') === '1'
        ? 'query'
        : 'localStorage',
    });
  } else {
    // Keep a minimal API so `__mapappLog.setEnabled(true)` still works
    // from the console without a reload.
    window.__mapappLog = {
      get entries() { return entries.slice(); },
      setEnabled,
      subscribe,
    };
  }
}
