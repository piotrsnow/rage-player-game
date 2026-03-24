import ParticleEffect from './layers/ParticleEffect';
import FogEffect from './layers/FogEffect';
import WeatherEffect from './layers/WeatherEffect';
import TransitionEffect from './layers/TransitionEffect';
import AmbientEffect from './layers/AmbientEffect';

/* ------------------------------------------------------------------ */
/*  Mood → fog / ambient tint mapping                                 */
/* ------------------------------------------------------------------ */

const MOOD_TINTS = {
  mystical: { fog: 'purple', ambientGlow: true },
  dark:     { fog: 'grey',   ambientGlow: false },
  peaceful: { fog: 'green',  ambientGlow: true },
  tense:    { fog: 'red',    ambientGlow: false },
  chaotic:  { fog: 'orange', ambientGlow: true },
};

/* ------------------------------------------------------------------ */
/*  Weather → WeatherEffect config mapping                            */
/* ------------------------------------------------------------------ */

const WEATHER_CONFIGS = {
  rain:  { type: 'rain',  intensity: 0.7 },
  snow:  { type: 'snow',  intensity: 0.6 },
  storm: { type: 'storm', intensity: 0.9 },
  fire:  { type: 'fire',  intensity: 0.7 },
  fog:   null, // handled via FogEffect instead
  clear: null,
};

/* ------------------------------------------------------------------ */
/*  Genre / tone fallback heuristics                                  */
/* ------------------------------------------------------------------ */

const GENRE_DEFAULTS = {
  Fantasy:   { weather: 'clear', particles: 'magic_dust', mood: 'mystical' },
  'Sci-Fi':  { weather: 'clear', particles: 'sparks',     mood: 'tense' },
  Horror:    { weather: 'fog',   particles: 'embers',     mood: 'dark' },
};

const TONE_OVERRIDES = {
  dark:       { mood: 'dark' },
  gritty:     { mood: 'tense' },
  epic:       { mood: 'chaotic', particles: 'arcane' },
  lightheart: { mood: 'peaceful' },
  mysterious: { mood: 'mystical', particles: 'arcane' },
};

/**
 * Derive a basic atmosphere object when the AI didn't provide one.
 * Uses campaign genre and tone as best-effort heuristics.
 */
function deriveAtmosphereFromCampaign(campaign) {
  const base = { weather: 'clear', particles: 'none', mood: 'mystical', transition: 'fade' };

  if (!campaign) return base;

  const genreHint = GENRE_DEFAULTS[campaign.genre] ?? {};
  const toneHint = TONE_OVERRIDES[campaign.tone] ?? {};

  return { ...base, ...genreHint, ...toneHint };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Map an `atmosphere` descriptor (from the AI scene response) into an
 * array of concrete effect layer instances ready to be handed to
 * `EffectEngine.setEffects()`.
 *
 * @param {object|null|undefined} atmosphere
 *   Shape: { weather, particles, mood, transition }
 * @param {{ genre?: string, tone?: string }} [campaign]
 *   Fallback source when atmosphere is missing.
 * @returns {Array<{ init, update, draw, destroy }>}
 */
export default function resolveEffects(atmosphere, campaign) {
  const atm = atmosphere ?? deriveAtmosphereFromCampaign(campaign);
  const layers = [];

  // --- Ambient (always-on: vignette + dust motes + border glow) ---
  const moodCfg = MOOD_TINTS[atm.mood] ?? MOOD_TINTS.mystical;
  layers.push(new AmbientEffect({ glow: moodCfg.ambientGlow }));

  // --- Fog ---
  const needsFog = atm.weather === 'fog' || atm.mood === 'mystical' || atm.mood === 'dark';
  if (needsFog) {
    layers.push(new FogEffect({ tint: moodCfg.fog }));
  }

  // --- Weather ---
  const weatherCfg = WEATHER_CONFIGS[atm.weather];
  if (weatherCfg) {
    layers.push(new WeatherEffect(weatherCfg));
  }

  // --- Particles ---
  if (atm.particles && atm.particles !== 'none') {
    layers.push(new ParticleEffect({ variant: atm.particles }));
  }

  // --- Transition (one-shot, auto-removes via `finished` flag) ---
  if (atm.transition) {
    layers.push(new TransitionEffect({ type: atm.transition }));
  }

  return layers;
}

/**
 * Convenience re-export: derive atmosphere from campaign for callers
 * that want the raw descriptor without instantiated layers.
 */
export { deriveAtmosphereFromCampaign };
