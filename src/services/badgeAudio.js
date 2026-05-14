/**
 * Badge XP claim audio — papery/organic tick sounds using Tone.js.
 * Accompanies the animated XP counter with decelerating ticks.
 */

let toneModule = null;
let toneReady = false;
let masterGain = null;
let tickSynth = null;
let finalSynth = null;

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

function getMasterGain(Tone) {
  if (masterGain) return masterGain;
  masterGain = new Tone.Volume(-8).toDestination();
  return masterGain;
}

function getTickSynth(Tone, gain) {
  if (tickSynth) return tickSynth;
  tickSynth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.015 },
  });
  const filter = new Tone.Filter({ frequency: 3000, type: 'bandpass', Q: 1.5 });
  const vol = new Tone.Volume(-10);
  tickSynth.chain(filter, vol, gain);
  return tickSynth;
}

function getFinalSynth(Tone, gain) {
  if (finalSynth) return finalSynth;
  finalSynth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.2 },
  });
  const vol = new Tone.Volume(-6);
  finalSynth.chain(vol, gain);
  return finalSynth;
}

export async function playXpTick() {
  const ok = await startContext();
  if (!ok) return;
  const Tone = await ensureTone();
  const gain = getMasterGain(Tone);
  getTickSynth(Tone, gain).triggerAttackRelease('64n');
}

export async function playXpFinal() {
  const ok = await startContext();
  if (!ok) return;
  const Tone = await ensureTone();
  const gain = getMasterGain(Tone);
  const synth = getFinalSynth(Tone, gain);
  const now = Tone.now();
  synth.triggerAttackRelease('E5', '16n', now, 0.5);
  setTimeout(() => synth.triggerAttackRelease('A5', '8n', Tone.now(), 0.6), 80);
}
