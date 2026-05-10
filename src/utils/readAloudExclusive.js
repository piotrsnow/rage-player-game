/**
 * Central dialog-audio coordinator — single source of truth for whether any
 * dialog audio (narrator TTS, per-line read-aloud preview, browser synth) is
 * currently active, and which message / source owns it.
 *
 * Also preserves the legacy "exclusive read aloud" session-bump contract so
 * existing call sites continue to work unchanged.
 */

// ─── coordinator state ───────────────────────────────────────────────

let _nextSessionId = 1;

/** @type {{ state: 'idle'|'loading'|'playing'|'paused', source: string|null, messageId: string|null, segmentIndex: number, sessionId: number|null }} */
const _snapshot = {
  state: 'idle',
  source: null,
  messageId: null,
  segmentIndex: -1,
  sessionId: null,
};

const _coordinatorListeners = new Set();

function _notifyCoordinator() {
  _coordinatorListeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

function _setSnapshot(patch) {
  let changed = false;
  for (const k of Object.keys(patch)) {
    if (_snapshot[k] !== patch[k]) { _snapshot[k] = patch[k]; changed = true; }
  }
  if (changed) _notifyCoordinator();
}

// ─── public coordinator API ──────────────────────────────────────────

/** Start a playback session. Returns a numeric sessionId used as ownership token. */
export function beginDialogSession({ source, messageId = null, segmentIndex = -1 } = {}) {
  const id = _nextSessionId++;
  _setSnapshot({ state: 'loading', source: source ?? null, messageId: messageId ?? null, segmentIndex, sessionId: id });
  return id;
}

/** Transition the session's playback state and/or metadata. No-op if sessionId doesn't match the active session. */
export function setDialogSessionState(sessionId, state, extra) {
  if (sessionId !== _snapshot.sessionId) return;
  const patch = {};
  if (state !== undefined) patch.state = state;
  if (extra?.messageId !== undefined) patch.messageId = extra.messageId;
  if (extra?.segmentIndex !== undefined) patch.segmentIndex = extra.segmentIndex;
  if (Object.keys(patch).length > 0) _setSnapshot(patch);
}

/** End a session — resets to idle if sessionId still matches (or forced). */
export function endDialogSession(sessionId) {
  if (sessionId != null && sessionId !== _snapshot.sessionId) return;
  _setSnapshot({ state: 'idle', source: null, messageId: null, segmentIndex: -1, sessionId: null });
}

/** Immutable copy of the current coordinator snapshot. */
export function getDialogSnapshot() {
  return { ..._snapshot };
}

/** Subscribe to any coordinator state change. Returns an unsubscribe function. */
export function subscribeDialog(listener) {
  _coordinatorListeners.add(listener);
  return () => _coordinatorListeners.delete(listener);
}

// ─── derived helpers ─────────────────────────────────────────────────

export function isAnyDialoguePlaying() {
  return _snapshot.state === 'playing' || _snapshot.state === 'loading';
}

export function isNarratorActive() {
  return _snapshot.source === 'narrator' && (_snapshot.state === 'playing' || _snapshot.state === 'loading');
}

export function getActiveDialogSource() {
  return _snapshot.state === 'idle' ? null : _snapshot.source;
}

export function getActiveDialogMessageId() {
  return _snapshot.state === 'idle' ? null : _snapshot.messageId;
}

// ─── legacy exclusive read-aloud compat ──────────────────────────────

let _legacySessionId = 0;
let _heldAudio = null;
const _legacyListeners = new Set();

/** @type {null | (() => void)} */
let _stopMainNarrator = null;

export function subscribeExclusiveReadAloud(listener) {
  _legacyListeners.add(listener);
  return () => _legacyListeners.delete(listener);
}

function _notifyLegacy() {
  _legacyListeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

function _bumpPeerSessionAndSilence() {
  _legacySessionId += 1;
  if (_heldAudio) {
    _heldAudio.pause();
    _heldAudio = null;
  }
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  _notifyLegacy();
}

export function registerMainNarratorStop(fn) {
  _stopMainNarrator = fn;
  return () => { if (_stopMainNarrator === fn) _stopMainNarrator = null; };
}

export function silencePeerDialogAudio() {
  _bumpPeerSessionAndSilence();
}

export function stopAllDialogAudio() {
  try { _stopMainNarrator?.(); } catch { /* ignore */ }
  _bumpPeerSessionAndSilence();
  if (_snapshot.sessionId != null) {
    endDialogSession(_snapshot.sessionId);
  }
}

export function claimExclusiveReadAloud() {
  stopAllDialogAudio();
  return _legacySessionId;
}

export function isExclusiveReadAloudOwner(attemptId) {
  return attemptId === _legacySessionId;
}

export function setExclusiveReadAloudAudio(audio) {
  _heldAudio = audio;
}

export function clearExclusiveReadAloudAudio(audio) {
  if (_heldAudio === audio) _heldAudio = null;
}
