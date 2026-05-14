/**
 * Shared organic "paper" SFX for all minigames (beer duel, card game,
 * dice game, momentum dice-chase). Lazy-loads Tone.js on first play.
 *
 * Design brief: short (20-200ms), brown/pink noise through low-pass,
 * soft sine/triangle transients — tavern tabletop feel, no electronic edge.
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

export function setMinigameVolume(db) {
  if (masterGain) masterGain.volume.value = db;
}

const voices = {};

function v(name, factory) {
  if (voices[name]) return voices[name];
  voices[name] = factory();
  return voices[name];
}

// ── Voice factories ──

function mkCountdown(Tone, g) {
  const s = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.004, decay: 0.035, sustain: 0, release: 0.015 },
  });
  s.chain(new Tone.Volume(-10), g);
  return s;
}

function mkCardSlide(Tone, g) {
  const s = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.003, decay: 0.06, sustain: 0, release: 0.03 },
  });
  s.chain(new Tone.Filter({ frequency: 1800, type: 'bandpass', Q: 1.2 }), new Tone.Volume(-14), g);
  return s;
}

function mkCardFlip(Tone, g) {
  const s = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 },
  });
  s.chain(new Tone.Filter({ frequency: 3000, type: 'bandpass', Q: 1.5 }), new Tone.Volume(-18), g);
  return s;
}

function mkThunk(Tone, g) {
  const s = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.002, decay: 0.07, sustain: 0, release: 0.03 },
  });
  s.chain(new Tone.Filter({ frequency: 500, type: 'lowpass', rolloff: -24 }), new Tone.Volume(-8), g);
  return s;
}

function mkWoodenTap(Tone, g) {
  const s = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.015 },
  });
  s.chain(new Tone.Volume(-12), g);
  return s;
}

function mkRattle(Tone, g) {
  const s = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0.02, release: 0.06 },
  });
  s.chain(new Tone.Filter({ frequency: 2200, type: 'bandpass', Q: 0.8 }), new Tone.Volume(-10), g);
  return s;
}

function mkSoftBoom(Tone, g) {
  const s = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.003, decay: 0.15, sustain: 0.01, release: 0.08 },
  });
  s.chain(new Tone.Filter({ frequency: 350, type: 'lowpass', rolloff: -24 }), new Tone.Volume(-6), g);
  return s;
}

function mkChime(Tone, g) {
  const s = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.008, decay: 0.14, sustain: 0.01, release: 0.1 },
  });
  s.chain(new Tone.Volume(-10), g);
  return s;
}

function mkGulp(Tone, g) {
  const s = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.08, sustain: 0, release: 0.03 },
  });
  s.chain(new Tone.Volume(-8), g);
  return s;
}

function mkDrip(Tone, g) {
  const s = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.003, decay: 0.025, sustain: 0, release: 0.01 },
  });
  s.chain(new Tone.Volume(-20), g);
  return s;
}

function mkSplat(Tone, g) {
  const s = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.003, decay: 0.03, sustain: 0, release: 0.015 },
  });
  s.chain(new Tone.Volume(-20), g);
  return s;
}

function mkRelief(Tone, g) {
  const s = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.04 },
  });
  s.chain(new Tone.Filter({ frequency: 2000, type: 'lowpass', rolloff: -24 }), new Tone.Volume(-10), g);
  return s;
}

function mkDanger(Tone, g) {
  const s = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.06, sustain: 0, release: 0.03 },
  });
  s.chain(new Tone.Volume(-6), g);
  return s;
}

function mkEliminated(Tone, g) {
  const s = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.02, release: 0.12 },
  });
  s.chain(new Tone.Filter({ frequency: 400, type: 'lowpass', rolloff: -24 }), g);
  return s;
}

function mkPop(Tone, g) {
  const s = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.015 },
  });
  s.chain(new Tone.Volume(-10), g);
  return s;
}

// ── Public API ──

export async function playMinigameSfx(category) {
  const ok = await startContext();
  if (!ok) return;
  const Tone = await ensureTone();
  const g = getMasterGain(Tone);
  const now = Tone.now();

  switch (category) {
    // ── Shared ──
    case 'countdown': {
      v('countdown', () => mkCountdown(Tone, g)).triggerAttackRelease('A4', 0.035, now, 0.25);
      break;
    }
    case 'countdownLast': {
      const s = v('countdown', () => mkCountdown(Tone, g));
      s.triggerAttackRelease('E5', 0.05, now, 0.55);
      s.triggerAttackRelease('A5', 0.07, now + 0.05, 0.55);
      break;
    }
    case 'success': {
      const s = v('chime', () => mkChime(Tone, g));
      s.triggerAttackRelease('C5', 0.12, now, 0.4);
      s.triggerAttackRelease('E5', 0.10, now + 0.13, 0.4);
      s.triggerAttackRelease('G5', 0.16, now + 0.26, 0.5);
      break;
    }
    case 'failure': {
      const s = v('chime', () => mkChime(Tone, g));
      s.triggerAttackRelease('E4', 0.12, now, 0.35);
      s.triggerAttackRelease('Eb4', 0.14, now + 0.14, 0.3);
      s.triggerAttackRelease('D4', 0.18, now + 0.28, 0.25);
      break;
    }

    // ── Card game ──
    case 'cardDeal': {
      v('cardSlide', () => mkCardSlide(Tone, g)).triggerAttackRelease('16n', now);
      break;
    }
    case 'cardFlip': {
      v('cardFlip', () => mkCardFlip(Tone, g)).triggerAttackRelease('32n', now);
      break;
    }
    case 'cardHit': {
      v('cardSlide', () => mkCardSlide(Tone, g)).triggerAttackRelease('16n', now);
      v('woodenTap', () => mkWoodenTap(Tone, g)).triggerAttackRelease('G4', 0.03, now + 0.02, 0.2);
      break;
    }
    case 'cardStand': {
      v('woodenTap', () => mkWoodenTap(Tone, g)).triggerAttackRelease('D4', 0.04, now, 0.25);
      break;
    }
    case 'cardBust': {
      v('softBoom', () => mkSoftBoom(Tone, g)).triggerAttackRelease('8n', now);
      break;
    }
    case 'roundWin': {
      const s = v('woodenTap', () => mkWoodenTap(Tone, g));
      s.triggerAttackRelease('C5', 0.035, now, 0.3);
      s.triggerAttackRelease('E5', 0.035, now + 0.06, 0.3);
      break;
    }
    case 'roundLose': {
      const s = v('woodenTap', () => mkWoodenTap(Tone, g));
      s.triggerAttackRelease('E4', 0.04, now, 0.25);
      s.triggerAttackRelease('C4', 0.05, now + 0.07, 0.2);
      break;
    }

    // ── Dice game ──
    case 'diceShake': {
      v('rattle', () => mkRattle(Tone, g)).triggerAttackRelease('8n', now);
      break;
    }
    case 'diceLand': {
      v('thunk', () => mkThunk(Tone, g)).triggerAttackRelease('16n', now);
      v('woodenTap', () => mkWoodenTap(Tone, g)).triggerAttackRelease('F4', 0.025, now + 0.03, 0.15);
      break;
    }
    case 'diceComboGood': {
      const s = v('chime', () => mkChime(Tone, g));
      s.triggerAttackRelease('G5', 0.08, now, 0.45);
      s.triggerAttackRelease('B5', 0.1, now + 0.1, 0.5);
      break;
    }
    case 'diceComboBad': {
      v('softBoom', () => mkSoftBoom(Tone, g)).triggerAttackRelease('4n', now);
      break;
    }
    case 'raise': {
      const s = v('woodenTap', () => mkWoodenTap(Tone, g));
      s.triggerAttackRelease('A4', 0.03, now, 0.3);
      s.triggerAttackRelease('D5', 0.03, now + 0.05, 0.35);
      break;
    }
    case 'fold': {
      v('cardSlide', () => mkCardSlide(Tone, g)).triggerAttackRelease('8n', now);
      break;
    }

    // ── Momentum ──
    case 'targetAppear': {
      v('pop', () => mkPop(Tone, g)).triggerAttackRelease('E5', 0.03, now, 0.3);
      break;
    }
    case 'targetHit': {
      v('thunk', () => mkThunk(Tone, g)).triggerAttackRelease('16n', now);
      v('pop', () => mkPop(Tone, g)).triggerAttackRelease('A5', 0.025, now + 0.02, 0.35);
      break;
    }
    case 'timeout': {
      v('softBoom', () => mkSoftBoom(Tone, g)).triggerAttackRelease('8n', now);
      break;
    }

    // ── Beer duel (migrated from beerDuelAudio.js) ──
    case 'gulp': {
      const s = v('gulp', () => mkGulp(Tone, g));
      s.triggerAttackRelease(200, 0.08, now, 0.3);
      setTimeout(() => s.triggerAttackRelease(120, 0.05, Tone.now(), 0.2), 40);
      break;
    }
    case 'drip': {
      v('drip', () => mkDrip(Tone, g)).triggerAttackRelease('B4', 0.025, now, 0.12);
      break;
    }
    case 'splat': {
      v('splat', () => mkSplat(Tone, g)).triggerAttackRelease('G3', 0.03, now, 0.12);
      break;
    }
    case 'relief': {
      v('relief', () => mkRelief(Tone, g)).triggerAttackRelease('8n', now);
      break;
    }
    case 'danger': {
      const s = v('danger', () => mkDanger(Tone, g));
      s.triggerAttackRelease('A5', 0.05, now, 0.45);
      s.triggerAttackRelease('E5', 0.05, now + 0.07, 0.4);
      break;
    }
    case 'eliminated': {
      v('eliminated', () => mkEliminated(Tone, g)).triggerAttackRelease('4n', now);
      break;
    }
    case 'victory': {
      const s = v('chime', () => mkChime(Tone, g));
      s.triggerAttackRelease('C5', 0.12, now, 0.4);
      s.triggerAttackRelease('D5', 0.12, now + 0.13, 0.4);
      s.triggerAttackRelease('G5', 0.18, now + 0.26, 0.5);
      break;
    }

    default:
      break;
  }
}

export function disposeMinigameAudio() {
  for (const val of Object.values(voices)) {
    try { val.dispose(); } catch { /* ignore */ }
  }
  for (const k of Object.keys(voices)) delete voices[k];
  if (masterGain) {
    try { masterGain.dispose(); } catch { /* ignore */ }
    masterGain = null;
  }
  toneReady = false;
}
