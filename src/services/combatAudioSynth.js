/**
 * Organic "paper" combat SFX using Tone.js synthesis.
 *
 * Sounds are short (50-200ms), low-frequency, matte/organic — meant to
 * layer under the existing mp3 samples, not replace them. Think tabletop:
 * soft thunks, papery rustles, dull scrapes.
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

// ── Voice definitions ──
// Each voice builds a minimal signal chain on first use, then triggers
// a short envelope for each event.

const voices = {};

function getOrCreateVoice(name, factory) {
  if (voices[name]) return voices[name];
  voices[name] = factory();
  return voices[name];
}

export const SYNTH_CATEGORIES = {
  hit: 'hit',
  miss: 'miss',
  defend: 'defend',
  dodge: 'dodge',
  turnStart: 'turnStart',
  defeat: 'defeat',
  charge: 'charge',
};

function makeHitVoice(Tone, masterGain) {
  const synth = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.003, decay: 0.08, sustain: 0, release: 0.04 },
  });
  const filter = new Tone.Filter({ frequency: 600, type: 'lowpass', rolloff: -24 });
  synth.chain(filter, masterGain);
  return synth;
}

function makeMissVoice(Tone, masterGain) {
  const synth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.005, decay: 0.06, sustain: 0, release: 0.03 },
  });
  const filter = new Tone.Filter({ frequency: 2000, type: 'bandpass', Q: 2 });
  const vol = new Tone.Volume(-12);
  synth.chain(filter, vol, masterGain);
  return synth;
}

function makeDefendVoice(Tone, masterGain) {
  const synth = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.01, decay: 0.12, sustain: 0, release: 0.05 },
  });
  const filter = new Tone.Filter({ frequency: 400, type: 'lowpass', rolloff: -12 });
  const vol = new Tone.Volume(-6);
  synth.chain(filter, vol, masterGain);
  return synth;
}

function makeDodgeVoice(Tone, masterGain) {
  const synth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.002, decay: 0.04, sustain: 0, release: 0.02 },
  });
  const filter = new Tone.Filter({ frequency: 1200, type: 'highpass', rolloff: -12 });
  const vol = new Tone.Volume(-14);
  synth.chain(filter, vol, masterGain);
  return synth;
}

function makeTurnStartVoice(Tone, masterGain) {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 },
  });
  const vol = new Tone.Volume(-18);
  synth.chain(vol, masterGain);
  return synth;
}

function makeDefeatVoice(Tone, masterGain) {
  const synth = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.02, release: 0.15 },
  });
  const filter = new Tone.Filter({ frequency: 300, type: 'lowpass', rolloff: -24 });
  synth.chain(filter, masterGain);
  return synth;
}

function makeChargeVoice(Tone, masterGain) {
  const synth = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.01, release: 0.08 },
  });
  const filter = new Tone.Filter({ frequency: 800, type: 'lowpass', rolloff: -12 });
  synth.chain(filter, masterGain);
  return synth;
}

let masterGain = null;

function getMasterGain(Tone) {
  if (masterGain) return masterGain;
  masterGain = new Tone.Volume(-6).toDestination();
  return masterGain;
}

export function setGeneratedSfxVolume(db) {
  if (masterGain) masterGain.volume.value = db;
}

/**
 * Map a combat event category to its synthesized voice trigger.
 */
export async function playSynthSfx(category) {
  const ok = await startContext();
  if (!ok) return;
  const Tone = await ensureTone();
  const gain = getMasterGain(Tone);

  switch (category) {
    case SYNTH_CATEGORIES.hit:
      getOrCreateVoice('hit', () => makeHitVoice(Tone, gain)).triggerAttackRelease('16n');
      break;
    case SYNTH_CATEGORIES.miss:
      getOrCreateVoice('miss', () => makeMissVoice(Tone, gain)).triggerAttackRelease('32n');
      break;
    case SYNTH_CATEGORIES.defend:
      getOrCreateVoice('defend', () => makeDefendVoice(Tone, gain)).triggerAttackRelease('8n');
      break;
    case SYNTH_CATEGORIES.dodge:
      getOrCreateVoice('dodge', () => makeDodgeVoice(Tone, gain)).triggerAttackRelease('32n');
      break;
    case SYNTH_CATEGORIES.turnStart:
      getOrCreateVoice('turnStart', () => makeTurnStartVoice(Tone, gain)).triggerAttackRelease('C4', '16n');
      break;
    case SYNTH_CATEGORIES.defeat:
      getOrCreateVoice('defeat', () => makeDefeatVoice(Tone, gain)).triggerAttackRelease('4n');
      break;
    case SYNTH_CATEGORIES.charge:
      getOrCreateVoice('charge', () => makeChargeVoice(Tone, gain)).triggerAttackRelease('8n');
      break;
    default:
      break;
  }
}

/**
 * Map a combat result (from combatEngine) to a synth category.
 */
export function mapResultToSynthCategory(result) {
  if (!result) return null;
  if (result.outcome === 'hit') return SYNTH_CATEGORIES.hit;
  if (result.outcome === 'miss') return SYNTH_CATEGORIES.miss;
  if (result.outcome === 'defensive' && result.manoeuvreKey === 'defend') return SYNTH_CATEGORIES.defend;
  if (result.outcome === 'defensive' && result.manoeuvreKey === 'dodge') return SYNTH_CATEGORIES.dodge;
  if (result.outcome === 'fled' || result.outcome === 'failed_flee') return SYNTH_CATEGORIES.dodge;
  if (result.manoeuvreKey === 'charge') return SYNTH_CATEGORIES.charge;
  if (result.targetDefeated) return SYNTH_CATEGORIES.defeat;
  return null;
}

export function disposeSynth() {
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
