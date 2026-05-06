/**
 * Ensures only one "read aloud" preview plays at a time (multiple volume icons
 * in chat / character picker share one exclusive session).
 */
let sessionId = 0;
let heldAudio = null;
const listeners = new Set();

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

/** Stops any current read-aloud audio + speech synthesis; bumps session. */
export function claimExclusiveReadAloud() {
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
