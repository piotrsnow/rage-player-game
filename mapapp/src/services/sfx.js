// Subtle UI sound effects for mapapp.
//
// Design notes (see plans/mapapp_subtle_sfx plan for the full rationale):
//   * Tone.js is loaded lazily on the FIRST user-gesture-driven playSfx call,
//     so it stays out of the initial Vite bundle (Tone is ~300 KB gzipped).
//   * Before the first gesture, calls to playSfx() are silent no-ops — this
//     also makes playSfx() safe to invoke in tests / SSR / environments
//     without an AudioContext.
//   * Every cue is short (≤ 60 ms), dry (no reverb / sustain), low-velocity.
//     `paint.tick` in particular is tuned to feel like a faint texture during
//     a brush drag rather than a buzz.
//   * Preferences (enabled + volume) persist in localStorage and can be
//     subscribed to with a Zustand-style hook (useSfxEnabled / useSfxVolume).
//
// Public API:
//   playSfx(name)            fire-and-forget, silent if disabled / pre-gesture
//   useSfxEnabled()          React hook → boolean
//   setSfxEnabled(bool)
//   useSfxVolume()           React hook → number 0..1
//   setSfxVolume(number)

import { useSyncExternalStore } from 'react';

const LS_ENABLED = 'mapapp.sfx.enabled';
const LS_VOLUME = 'mapapp.sfx.volume';

function readEnabled() {
  try {
    const raw = localStorage.getItem(LS_ENABLED);
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

function readVolume() {
  try {
    const raw = localStorage.getItem(LS_VOLUME);
    if (raw === null) return 0.5;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0.5;
    return Math.max(0, Math.min(1, n));
  } catch {
    return 0.5;
  }
}

// Minimal observable store so we can expose React hooks without pulling
// zustand into this file (the module is imported by non-React paths too).
function makeStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set: (next) => {
      if (next === value) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const enabledStore = makeStore(typeof window === 'undefined' ? true : readEnabled());
const volumeStore = makeStore(typeof window === 'undefined' ? 0.5 : readVolume());

export function setSfxEnabled(v) {
  const b = Boolean(v);
  enabledStore.set(b);
  try { localStorage.setItem(LS_ENABLED, b ? '1' : '0'); } catch { /* ignore */ }
}

export function setSfxVolume(v) {
  const n = Math.max(0, Math.min(1, Number(v) || 0));
  volumeStore.set(n);
  try { localStorage.setItem(LS_VOLUME, String(n)); } catch { /* ignore */ }
  // If synths are already live, push the new volume into the master node
  // right away so the slider feels responsive.
  if (synths && synths.masterVol) {
    // Tone.js Volume takes decibels; convert linear → dB. Treat 0 as -Infinity.
    synths.masterVol.volume.value = n <= 0.0001 ? -Infinity : 20 * Math.log10(n);
  }
}

export function useSfxEnabled() {
  return useSyncExternalStore(
    enabledStore.subscribe,
    enabledStore.get,
    enabledStore.get,
  );
}

export function useSfxVolume() {
  return useSyncExternalStore(
    volumeStore.subscribe,
    volumeStore.get,
    volumeStore.get,
  );
}

// Lazy Tone.js loader. `synthsPromise` is created on the first playSfx() call
// that isn't gated off. Subsequent calls reuse the same promise.
let synthsPromise = null;
let synths = null;

async function ensureSynths() {
  if (synths) return synths;
  if (synthsPromise) return synthsPromise;
  synthsPromise = (async () => {
    const Tone = await import('tone');
    // Tone.start() requires a user gesture; every call site that fires an SFX
    // is downstream of a click/keypress, so this resolves cleanly.
    try { await Tone.start(); } catch { /* ignore — best-effort */ }

    const masterVol = new Tone.Volume(0).toDestination();
    const v = volumeStore.get();
    masterVol.volume.value = v <= 0.0001 ? -Infinity : 20 * Math.log10(v);

    const blip = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.03, sustain: 0, release: 0.03 },
    }).connect(masterVol);

    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0, release: 0.12 },
    }).connect(masterVol);

    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.003, decay: 0.05, sustain: 0, release: 0.02 },
    });
    const noiseFilter = new Tone.Filter(1200, 'bandpass').connect(masterVol);
    noise.connect(noiseFilter);

    synths = { blip, pad, noise, masterVol, Tone };
    return synths;
  })().catch((err) => {
    // If Tone fails to load (e.g. offline during dev), don't try again.
    synthsPromise = null;
    if (typeof console !== 'undefined') {
      console.warn('[sfx] failed to initialise Tone.js:', err);
    }
    return null;
  });
  return synthsPromise;
}

// Throttle for paint.tick so a drag across 200 cells doesn't spam the audio
// graph. ~8 ticks/sec feels like texture, more starts to buzz.
const THROTTLE_MS = {
  'paint.tick': 125,
};
const lastFired = new Map();

// Per-cue dispatcher. Each entry receives the live synth bundle and fires a
// short sequence of notes. Kept data-driven so velocities/pitches live in
// one place and match the plan's SFX table.
function firePreset(name, s) {
  const { blip, pad, noise, Tone } = s;
  const now = Tone.now();
  switch (name) {
    case 'toast.info':
      blip.triggerAttackRelease('A4', 0.04, now, 0.18);
      break;
    case 'toast.success':
      blip.triggerAttackRelease('C5', 0.03, now, 0.22);
      blip.triggerAttackRelease('E5', 0.05, now + 0.03, 0.22);
      break;
    case 'toast.warning':
      blip.triggerAttackRelease('F4', 0.04, now, 0.25);
      blip.triggerAttackRelease('Ab4', 0.05, now + 0.04, 0.25);
      break;
    case 'toast.error':
      pad.triggerAttackRelease(['G3', 'E3'], 0.12, now, 0.35);
      break;
    case 'tool.switch':
      blip.triggerAttackRelease('A4', 0.02, now, 0.12);
      break;
    case 'tool.undo':
      blip.triggerAttackRelease('D5', 0.03, now, 0.15);
      blip.triggerAttackRelease('B4', 0.04, now + 0.03, 0.15);
      break;
    case 'tool.redo':
      blip.triggerAttackRelease('B4', 0.03, now, 0.15);
      blip.triggerAttackRelease('D5', 0.04, now + 0.03, 0.15);
      break;
    case 'layer.switch':
      blip.triggerAttackRelease('B4', 0.03, now, 0.12);
      break;
    case 'paint.tick':
      blip.triggerAttackRelease('E5', 0.012, now, 0.06);
      break;
    case 'paint.commit':
      blip.triggerAttackRelease('A4', 0.03, now, 0.2);
      blip.triggerAttackRelease('E5', 0.04, now + 0.03, 0.2);
      break;
    case 'save.ok':
      blip.triggerAttackRelease('D5', 0.04, now, 0.3);
      blip.triggerAttackRelease('A5', 0.06, now + 0.04, 0.3);
      break;
    case 'save.fail':
      pad.triggerAttackRelease(['G3', 'E3'], 0.12, now, 0.35);
      break;
    case 'load.ok':
      blip.triggerAttackRelease('G5', 0.04, now, 0.22);
      blip.triggerAttackRelease('D5', 0.05, now + 0.04, 0.22);
      break;
    case 'nav.switch':
      noise.triggerAttackRelease(0.05, now, 0.1);
      break;
    case 'modal.open':
      blip.triggerAttackRelease('A4', 0.04, now, 0.15);
      break;
    case 'modal.close':
      blip.triggerAttackRelease('A3', 0.04, now, 0.15);
      break;
    default:
      // Unknown cue names are silent — easier to iterate on than a throw.
      break;
  }
}

export function playSfx(name) {
  if (!name) return;
  if (typeof window === 'undefined') return;
  if (!enabledStore.get()) return;
  if (volumeStore.get() <= 0) return;

  const throttle = THROTTLE_MS[name];
  if (throttle) {
    const now = performance.now();
    const prev = lastFired.get(name) || 0;
    if (now - prev < throttle) return;
    lastFired.set(name, now);
  }

  // Fire-and-forget. If synths aren't ready yet, await the promise but
  // don't block the caller.
  const ready = ensureSynths();
  if (ready && typeof ready.then === 'function') {
    ready.then((s) => { if (s) firePreset(name, s); }).catch(() => { /* ignore */ });
  } else if (synths) {
    firePreset(name, synths);
  }
}
