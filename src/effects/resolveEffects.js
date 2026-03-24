import ParticleEffect from './layers/ParticleEffect';
import FogEffect from './layers/FogEffect';
import WeatherEffect from './layers/WeatherEffect';
import TransitionEffect from './layers/TransitionEffect';
import AmbientEffect from './layers/AmbientEffect';
import FilmGrainEffect from './layers/FilmGrainEffect';
import ColorGradeEffect from './layers/ColorGradeEffect';
import LightRaysEffect from './layers/LightRaysEffect';
import HeatDistortionEffect from './layers/HeatDistortionEffect';
import FireflyEffect from './layers/FireflyEffect';
import LensFlareEffect from './layers/LensFlareEffect';

/* ------------------------------------------------------------------ */
/*  Mood → fog / ambient config mapping                               */
/* ------------------------------------------------------------------ */

const MOOD_TINTS = {
  mystical: { ambientGlow: true },
  dark:     { ambientGlow: false },
  peaceful: { ambientGlow: true },
  tense:    { ambientGlow: false },
  chaotic:  { ambientGlow: true },
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
  Fantasy:   { weather: 'clear', particles: 'magic_dust', mood: 'mystical', lighting: 'natural' },
  'Sci-Fi':  { weather: 'clear', particles: 'sparks',     mood: 'tense',    lighting: 'bright' },
  Horror:    { weather: 'fog',   particles: 'embers',     mood: 'dark',     lighting: 'candlelight' },
};

const TONE_OVERRIDES = {
  dark:       { mood: 'dark',     lighting: 'night' },
  gritty:     { mood: 'tense' },
  epic:       { mood: 'chaotic',  particles: 'arcane', lighting: 'rays' },
  lightheart: { mood: 'peaceful' },
  mysterious: { mood: 'mystical', particles: 'arcane' },
};

/**
 * Derive a basic atmosphere object when the AI didn't provide one.
 * Uses campaign genre and tone as best-effort heuristics.
 */
function deriveAtmosphereFromCampaign(campaign) {
  const base = { weather: 'clear', particles: 'none', mood: 'mystical', lighting: 'natural', transition: 'fade' };

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
 *   Shape: { weather, particles, mood, lighting, transition }
 * @param {{ genre?: string, tone?: string }} [campaign]
 *   Fallback source when atmosphere is missing.
 * @returns {Array<{ init, update, draw, destroy }>}
 */
export default function resolveEffects(atmosphere, campaign) {
  const atm = atmosphere ?? deriveAtmosphereFromCampaign(campaign);
  const layers = [];
  const mood = atm.mood ?? 'mystical';
  const lighting = atm.lighting ?? 'natural';

  // --- Ambient (always-on: vignette + dust motes + conditional border glow) ---
  const moodCfg = MOOD_TINTS[mood] ?? MOOD_TINTS.mystical;
  layers.push(new AmbientEffect({ glow: moodCfg.ambientGlow }));

  // --- Film Grain (always-on, mood-scaled) ---
  layers.push(new FilmGrainEffect({ mood }));

  // --- Colour Grade (always-on, mood-tinted) ---
  layers.push(new ColorGradeEffect({ mood }));

  // --- Fog ---
  const needsFog = atm.weather === 'fog' || mood === 'mystical' || mood === 'dark';
  if (needsFog) {
    layers.push(new FogEffect({ mood }));
  }

  // --- Weather ---
  const weatherCfg = WEATHER_CONFIGS[atm.weather];
  if (weatherCfg) {
    layers.push(new WeatherEffect(weatherCfg));
  }

  // --- Heat Distortion (fire weather or chaotic mood) ---
  if (atm.weather === 'fire' || mood === 'chaotic') {
    layers.push(new HeatDistortionEffect());
  }

  // --- Particles ---
  if (atm.particles && atm.particles !== 'none') {
    layers.push(new ParticleEffect({ variant: atm.particles }));
  }

  // --- Light Rays (rays / dawn / bright lighting) ---
  if (lighting === 'rays' || lighting === 'dawn' || lighting === 'bright') {
    layers.push(new LightRaysEffect({ lighting }));
  }

  // --- Fireflies (night / candlelight / moonlight lighting) ---
  if (lighting === 'night' || lighting === 'candlelight' || lighting === 'moonlight') {
    layers.push(new FireflyEffect({ lighting }));
  }

  // --- Lens Flare (bright / dawn lighting) ---
  if (lighting === 'bright' || lighting === 'dawn') {
    layers.push(new LensFlareEffect({ lighting }));
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
