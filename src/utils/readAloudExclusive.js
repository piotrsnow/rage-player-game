/**
 * Ensures read-aloud preview clips (per-line volume icons) and the main scene
 * narrator do not speak over each other. Peer previews use session bumps +
 * optional held Audio; the narrator registers its hard stop separately.
 */
let sessionId = 0;
let heldAudio = null;
const listeners = new Set();

/** @type {null | (() => void)} */
let stopMainNarrator = null;

export function subscribeExclusiveReadAloud(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyExclusiveReadAloud() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

function bumpPeerSessionAndSilence() {
  sessionId += 1;
  if (heldAudio) {
    heldAudio.pause();
    heldAudio = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  notifyExclusiveReadAloud();
}

/**
 * Registers the narrator hook's stopCore (must NOT call silencePeerDialogAudio).
 * Last mounted narrator wins (gameplay + viewer share one coordinator).
 */
export function registerMainNarratorStop(fn) {
  stopMainNarrator = fn;
  return () => {
    if (stopMainNarrator === fn) stopMainNarrator = null;
  };
}

/** Peer read-aloud previews + browser synth only — does not stop main narrator. */
export function silencePeerDialogAudio() {
  bumpPeerSessionAndSilence();
}

/**
 * Stop scene narrator, then peer previews (read icons / speechSynthesis).
 * Returns the new session id — pass it to `isExclusiveReadAloudOwner` so only
 * the latest clipped preview considers itself active after async TTS fetch.
 */
export function claimExclusiveReadAloud() {
  try {
    stopMainNarrator?.();
  } catch {
    /* ignore */
  }
  bumpPeerSessionAndSilence();
  return sessionId;
}

export function isExclusiveReadAloudOwner(attemptId) {
  return attemptId === sessionId;
}

export function setExclusiveReadAloudAudio(audio) {
  heldAudio = audio;
}

export function clearExclusiveReadAloudAudio(audio) {
  if (heldAudio === audio) heldAudio = null;
}
