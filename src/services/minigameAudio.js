/**
 * Shared organic "paper" SFX for all minigames (beer duel, card game,
 * dice game, momentum dice-chase). Lazy-loads Tone.js on first play.
 *
 * Design brief: short (20-200ms), brown/pink noise through low-pass,
 * soft sine/triangle transients — tavern tabletop feel, no electronic edge.
 */

const BEER_SAMPLES = {
  gulp:        { url: '/beer_battle_sfx/gulp.mp3' },
  peeRelief:   { url: '/beer_battle_sfx/piss.mp3' },
  trapHit:     { url: '/beer_battle_sfx/trapped.mp3' },
  vomitRelief: { url: '/beer_battle_sfx/vomit.mp3', gain: 0.45 },
};

let sampleVolume = 0.6;
const sampleCache = {};

function getSampleAudio(url) {
  if (sampleCache[url]) return sampleCache[url];
  const audio = new Audio(url);
  audio.preload = 'auto';
  sampleCache[url] = audio;
  return audio;
}

function playSample(url, gain = 1) {
  const cached = getSampleAudio(url);
  const audio = cached.paused ? cached : new Audio(url);
  audio.volume = sampleVolume * gain;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

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
  sampleVolume = db <= -60 ? 0 : Math.pow(10, db / 20);
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
  const thud = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.003, decay: 0.09, sustain: 0, release: 0.04 },
  });
  thud.chain(
    new Tone.Filter({ frequency: 350, type: 'bandpass', Q: 2.5 }),
    new Tone.Volume(-4), g,
  );
  const glug = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.008, decay: 0.1, sustain: 0, release: 0.05 },
  });
  glug.chain(new Tone.Volume(-10), g);
  const fizz = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.01, decay: 0.04, sustain: 0, release: 0.02 },
  });
  fizz.chain(
    new Tone.Filter({ frequency: 4000, type: 'highpass', rolloff: -24 }),
    new Tone.Volume(-22), g,
  );
  return { thud, glug, fizz };
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

function mkPeeRelief(Tone, g) {
  const stream = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.02, decay: 0.25, sustain: 0.05, release: 0.15 },
  });
  stream.chain(
    new Tone.Filter({ frequency: 2800, type: 'bandpass', Q: 1.8 }),
    new Tone.Volume(-12), g,
  );
  const drip = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.002, decay: 0.03, sustain: 0, release: 0.01 },
  });
  drip.chain(new Tone.Volume(-16), g);
  return { stream, drip };
}

function mkVomitRelief(Tone, g) {
  const retch = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.03, release: 0.1 },
  });
  retch.chain(
    new Tone.Filter({ frequency: 500, type: 'lowpass', rolloff: -24 }),
    new Tone.Volume(-6), g,
  );
  const splatter = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.03, decay: 0.12, sustain: 0, release: 0.06 },
  });
  splatter.chain(
    new Tone.Filter({ frequency: 1500, type: 'bandpass', Q: 1.2 }),
    new Tone.Volume(-14), g,
  );
  const groan = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.08 },
  });
  groan.chain(
    new Tone.Filter({ frequency: 600, type: 'lowpass', rolloff: -12 }),
    new Tone.Volume(-18), g,
  );
  return { retch, splatter, groan };
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
  if (BEER_SAMPLES[category]) {
    const entry = BEER_SAMPLES[category];
    playSample(entry.url, entry.gain);
    return;
  }

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
      s.thud.triggerAttackRelease('16n', now);
      s.glug.triggerAttackRelease(180 + Math.random() * 40, 0.09, now + 0.01, 0.2);
      setTimeout(() => {
        s.glug.triggerAttackRelease(110 + Math.random() * 30, 0.07, Tone.now(), 0.15);
        s.fizz.triggerAttackRelease('32n', Tone.now());
      }, 50 + Math.random() * 20);
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
    case 'peeRelief': {
      const s = v('peeRelief', () => mkPeeRelief(Tone, g));
      s.stream.triggerAttackRelease('4n', now);
      setTimeout(() => s.drip.triggerAttackRelease('B5', 0.025, Tone.now(), 0.15), 120);
      setTimeout(() => s.drip.triggerAttackRelease('G5', 0.02, Tone.now(), 0.1), 200);
      break;
    }
    case 'vomitRelief': {
      const s = v('vomitRelief', () => mkVomitRelief(Tone, g));
      s.retch.triggerAttackRelease('8n', now);
      s.groan.triggerAttackRelease(90 + Math.random() * 30, 0.15, now + 0.02, 0.15);
      setTimeout(() => s.splatter.triggerAttackRelease('16n', Tone.now()), 100 + Math.random() * 50);
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
    case 'beerMilestone': {
      const s = v('chime', () => mkChime(Tone, g));
      s.triggerAttackRelease('E5', 0.08, now, 0.5);
      s.triggerAttackRelease('G5', 0.08, now + 0.09, 0.5);
      s.triggerAttackRelease('B5', 0.12, now + 0.18, 0.6);
      v('thunk', () => mkThunk(Tone, g)).triggerAttackRelease('16n', now + 0.02);
      break;
    }
    case 'burp': {
      const s = v('gulp', () => mkGulp(Tone, g));
      s.thud.triggerAttackRelease('8n', now);
      s.glug.triggerAttackRelease(80 + Math.random() * 20, 0.14, now, 0.2);
      setTimeout(() => s.glug.triggerAttackRelease(60 + Math.random() * 15, 0.1, Tone.now(), 0.12), 70);
      break;
    }
    case 'mugSlam': {
      v('thunk', () => mkThunk(Tone, g)).triggerAttackRelease('8n', now);
      v('woodenTap', () => mkWoodenTap(Tone, g)).triggerAttackRelease('A3', 0.05, now + 0.01, 0.35);
      break;
    }
    case 'tavernCheer': {
      const ch = v('chime', () => mkChime(Tone, g));
      ch.triggerAttackRelease('G4', 0.06, now, 0.25);
      ch.triggerAttackRelease('C5', 0.06, now + 0.07, 0.3);
      ch.triggerAttackRelease('E5', 0.08, now + 0.14, 0.35);
      v('rattle', () => mkRattle(Tone, g)).triggerAttackRelease('16n', now + 0.05);
      break;
    }
    case 'crowdGasp': {
      const r = v('relief', () => mkRelief(Tone, g));
      r.triggerAttackRelease('16n', now);
      v('chime', () => mkChime(Tone, g)).triggerAttackRelease('Eb4', 0.1, now + 0.03, 0.2);
      break;
    }
    case 'heartbeat': {
      const t = v('thunk', () => mkThunk(Tone, g));
      t.triggerAttackRelease('16n', now);
      setTimeout(() => t.triggerAttackRelease('32n', Tone.now()), 180);
      break;
    }
    case 'npcTaunt': {
      const w = v('woodenTap', () => mkWoodenTap(Tone, g));
      const note = ['E4', 'F4', 'G4', 'A4'][Math.floor(Math.random() * 4)];
      w.triggerAttackRelease(note, 0.03, now, 0.2);
      v('thunk', () => mkThunk(Tone, g)).triggerAttackRelease('32n', now + 0.02);
      break;
    }
    case 'trapHit': {
      v('softBoom', () => mkSoftBoom(Tone, g)).triggerAttackRelease('8n', now);
      const ch = v('chime', () => mkChime(Tone, g));
      ch.triggerAttackRelease('E4', 0.08, now + 0.05, 0.3);
      ch.triggerAttackRelease('C4', 0.1, now + 0.13, 0.25);
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
