export const STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
};

export const PACING_SPEED_MULTIPLIERS = {
  combat: 1.12,
  chase: 1.15,
  stealth: 0.92,
  travel_montage: 1.18,
  celebration: 1.05,
  rest: 0.95,
  dramatic: 0.97,
  exploration: 1.0,
  dialogue: 1.0,
};

export const KNOWN_TTS_PROVIDERS = ['elevenlabs', 'xtts'];
export const DEFAULT_SEGMENT_PREFETCH_WINDOW = 3;
export const MAX_UTTERANCE_CHARS = 320;
export const CHARS_PER_SECOND_ESTIMATE = 14;
export const STREAMING_POLL_MS = 120;
export const MAX_NATURAL_PLAYBACK_RATE = 2;
export const MAX_FAST_FORWARD_PLAYBACK_RATE = 5;

export function clampRate(value, min = 0.5, max = 2) {
  return Math.max(min, Math.min(max, value));
}

// Starts playback only once the browser has buffered enough to play through,
// which eliminates the first-chunk stutter caused by calling .play()
// immediately after assigning src. Falls back to `canplay` + small delay if
// `canplaythrough` never fires (short clips over fast connections).
export function playAudioWithBuffer(audio) {
  return new Promise((resolve) => {
    let started = false;
    let resolved = false;

    const cleanup = () => {
      audio.removeEventListener('canplaythrough', onCanPlayThrough);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };

    const finish = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    };

    const start = () => {
      if (started || resolved) return;
      started = true;
      audio.play().catch(finish);
    };

    function onCanPlayThrough() { start(); }
    function onCanPlay() {
      setTimeout(start, 60);
    }
    function onEnded() { finish(); }
    function onError() { finish(); }

    audio.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
    audio.addEventListener('canplay', onCanPlay, { once: true });
    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });

    audio.preload = 'auto';
    audio.load();

    // Hard fallback: if neither canplay nor canplaythrough fires within 2s
    // (e.g. browser already cached the clip and fired events before we
    // attached listeners), try to play anyway.
    setTimeout(start, 2000);
  });
}

export function splitTextIntoUtterances(text, maxChars = MAX_UTTERANCE_CHARS) {
  const normalized = String(text || '').trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const source = paragraphs.length > 0 ? paragraphs : [normalized];
  const utterances = [];

  for (const paragraph of source) {
    if (paragraph.length <= maxChars) {
      utterances.push(paragraph);
      continue;
    }

    const sentences = paragraph
      .split(/(?<=[.!?…])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      utterances.push(paragraph);
      continue;
    }

    let chunk = '';
    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        if (chunk) {
          utterances.push(chunk);
          chunk = '';
        }
        utterances.push(sentence);
        continue;
      }

      const candidate = chunk ? `${chunk} ${sentence}` : sentence;
      if (candidate.length <= maxChars) {
        chunk = candidate;
      } else {
        if (chunk) utterances.push(chunk);
        chunk = sentence;
      }
    }
    if (chunk) utterances.push(chunk);
  }

  return utterances;
}
