/**
 * Synthesized SFX for the beer duel minigame.
 * Lazy-loads Tone.js on first play. All sounds are short, tavern-y/organic.
 */

let toneReady = false;
let toneModule = null;

async function ensureTone() {
  if (toneModule) return toneModule;
  toneModule = await import('tone');
  return toneModule;
}

async function startContext() {
  if (toneReady) return true;
  try {
    const Tone = await ensureTone();
    await Tone.start();
    toneReady = true;
    return true;
  } catch {
    return false;
  }
}

let masterGain = null;

function getMasterGain(Tone) {
  if (masterGain) return masterGain;
  masterGain = new Tone.Volume(-6).toDestination();
  return masterGain;
}

export function setBeerDuelVolume(db) {
  if (masterGain) masterGain.volume.value = db;
}

// ── Voice cache ──
const voices = {};

function getOrCreate(name, factory) {
  if (voices[name]) return voices[name];
  voices[name] = factory();
  return voices[name];
}

// ── Voice factories ──

function makeGulpVoice(Tone, gain) {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.08, sustain: 0, release: 0.03 },
  });
  const vol = new Tone.Volume(-8);
  synth.chain(vol, gain);
  return synth;
}

function makeDripVoice(Tone, gain) {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.003, decay: 0.025, sustain: 0, release: 0.01 },
  });
  const vol = new Tone.Volume(-20);
  synth.chain(vol, gain);
  return synth;
}

function makeSplatVoice(Tone, gain) {
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.003, decay: 0.03, sustain: 0, release: 0.015 },
  });
  const vol = new Tone.Volume(-20);
  synth.chain(vol, gain);
  return synth;
}

function makeReliefVoice(Tone, gain) {
  const synth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.04 },
  });
  const filter = new Tone.Filter({ frequency: 2000, type: 'lowpass', rolloff: -24 });
  const vol = new Tone.Volume(-10);
  synth.chain(filter, vol, gain);
  return synth;
}

function makeDangerVoice(Tone, gain) {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.06, sustain: 0, release: 0.03 },
  });
  const vol = new Tone.Volume(-6);
  synth.chain(vol, gain);
  return synth;
}

function makeEliminatedVoice(Tone, gain) {
  const synth = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.02, release: 0.12 },
  });
  const filter = new Tone.Filter({ frequency: 400, type: 'lowpass', rolloff: -24 });
  synth.chain(filter, gain);
  return synth;
}

function makeCountdownVoice(Tone, gain) {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.035, sustain: 0, release: 0.015 },
  });
  const vol = new Tone.Volume(-10);
  synth.chain(vol, gain);
  return synth;
}

function makeVictoryVoice(Tone, gain) {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.02, release: 0.1 },
  });
  const vol = new Tone.Volume(-8);
  synth.chain(vol, gain);
  return synth;
}

// ── Public API ──

export async function playBeerSfx(category) {
  const ok = await startContext();
  if (!ok) return;
  const Tone = await ensureTone();
  const gain = getMasterGain(Tone);
  const now = Tone.now();

  switch (category) {
    case 'gulp': {
      const s = getOrCreate('gulp', () => makeGulpVoice(Tone, gain));
      s.triggerAttackRelease(200, 0.08, now, 0.3);
      setTimeout(() => s.triggerAttackRelease(120, 0.05, Tone.now(), 0.2), 40);
      break;
    }
    case 'drip': {
      const s = getOrCreate('drip', () => makeDripVoice(Tone, gain));
      s.triggerAttackRelease('B4', 0.025, now, 0.12);
      break;
    }
    case 'splat': {
      const s = getOrCreate('splat', () => makeSplatVoice(Tone, gain));
      s.triggerAttackRelease('G3', 0.03, now, 0.12);
      break;
    }
    case 'relief': {
      const s = getOrCreate('relief', () => makeReliefVoice(Tone, gain));
      s.triggerAttackRelease('8n', now);
      break;
    }
    case 'danger': {
      const s = getOrCreate('danger', () => makeDangerVoice(Tone, gain));
      s.triggerAttackRelease('A5', 0.05, now, 0.45);
      s.triggerAttackRelease('E5', 0.05, now + 0.07, 0.4);
      break;
    }
    case 'eliminated': {
      const s = getOrCreate('eliminated', () => makeEliminatedVoice(Tone, gain));
      s.triggerAttackRelease('4n', now);
      break;
    }
    case 'countdown': {
      const s = getOrCreate('countdown', () => makeCountdownVoice(Tone, gain));
      s.triggerAttackRelease('A4', 0.035, now, 0.25);
      break;
    }
    case 'countdownLast': {
      const s = getOrCreate('countdown', () => makeCountdownVoice(Tone, gain));
      s.triggerAttackRelease('E5', 0.05, now, 0.55);
      s.triggerAttackRelease('A5', 0.07, now + 0.05, 0.55);
      break;
    }
    case 'victory': {
      const s = getOrCreate('victory', () => makeVictoryVoice(Tone, gain));
      s.triggerAttackRelease('C5', 0.12, now, 0.4);
      s.triggerAttackRelease('D5', 0.12, now + 0.13, 0.4);
      s.triggerAttackRelease('G5', 0.18, now + 0.26, 0.5);
      break;
    }
    default:
      break;
  }
}

export function disposeBeerDuelAudio() {
  for (const v of Object.values(voices)) {
    try { v.dispose(); } catch { /* ignore */ }
  }
  for (const k of Object.keys(voices)) delete voices[k];
  if (masterGain) {
    try { masterGain.dispose(); } catch { /* ignore */ }
    masterGain = null;
  }
  toneReady = false;
}
