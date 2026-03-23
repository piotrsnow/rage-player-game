/**
 * Weather and environment engine: types, seasonal weights, transitions,
 * test modifiers, and mapping to the atmosphere shape consumed by resolveEffects.
 */

/* -------------------------------------------------------------------------- */
/*  Weather type definitions                                                  */
/* -------------------------------------------------------------------------- */

/** @typedef {{ visibilityMod: number, movementMod: number, combatMod: number, socialMod: number, description: string }} MechanicalEffects */

/**
 * Modifiers are rough penalties/bonuses for relevant situations (−20 … +10).
 * visibility/movement/combat/social describe generic environmental pressure.
 */
export const WEATHER_TYPES = {
  clear: {
    name: 'Clear skies',
    severity: 1,
    mechanicalEffects: {
      visibilityMod: 0,
      movementMod: 0,
      combatMod: 0,
      socialMod: 0,
      description: 'Open sight lines and easy travel; no environmental hindrance.',
    },
  },
  cloudy: {
    name: 'Cloudy',
    severity: 1,
    mechanicalEffects: {
      visibilityMod: 0,
      movementMod: 0,
      combatMod: 0,
      socialMod: 0,
      description: 'Grey cover; light may be flat but conditions remain manageable.',
    },
  },
  overcast: {
    name: 'Overcast',
    severity: 2,
    mechanicalEffects: {
      visibilityMod: -5,
      movementMod: 0,
      combatMod: 0,
      socialMod: -5,
      description: 'Dim, uniform light; distance and mood feel slightly muted.',
    },
  },
  drizzle: {
    name: 'Drizzle',
    severity: 2,
    mechanicalEffects: {
      visibilityMod: -5,
      movementMod: -5,
      combatMod: 0,
      socialMod: -5,
      description: 'Persistent fine rain; surfaces slick, gear damp.',
    },
  },
  rain: {
    name: 'Rain',
    severity: 3,
    mechanicalEffects: {
      visibilityMod: -10,
      movementMod: -10,
      combatMod: -5,
      socialMod: -10,
      description: 'Steady rainfall reduces visibility and footing; noise masks subtle sounds.',
    },
  },
  heavy_rain: {
    name: 'Heavy rain',
    severity: 4,
    mechanicalEffects: {
      visibilityMod: -20,
      movementMod: -15,
      combatMod: -10,
      socialMod: -15,
      description: 'Sheets of water, flooded ground, shouting to be heard.',
    },
  },
  thunderstorm: {
    name: 'Thunderstorm',
    severity: 5,
    mechanicalEffects: {
      visibilityMod: -25,
      movementMod: -20,
      combatMod: -15,
      socialMod: -20,
      description: 'Violent wind, lightning, and rain; travel and ranged work suffer badly.',
    },
  },
  snow: {
    name: 'Snow',
    severity: 3,
    mechanicalEffects: {
      visibilityMod: -15,
      movementMod: -15,
      combatMod: -5,
      socialMod: -10,
      description: 'Falling snow limits sight and slows movement; cold bites.',
    },
  },
  blizzard: {
    name: 'Blizzard',
    severity: 5,
    mechanicalEffects: {
      visibilityMod: -35,
      movementMod: -30,
      combatMod: -15,
      socialMod: -25,
      description: 'Near-whiteout; extreme cold and wind make outdoor activity dangerous.',
    },
  },
  fog: {
    name: 'Fog',
    severity: 3,
    mechanicalEffects: {
      visibilityMod: -20,
      movementMod: -5,
      combatMod: -10,
      socialMod: -10,
      description: 'Local mist; nearby objects vanish, navigation and ambush play shift.',
    },
  },
  dense_fog: {
    name: 'Dense fog',
    severity: 4,
    mechanicalEffects: {
      visibilityMod: -35,
      movementMod: -10,
      combatMod: -15,
      socialMod: -15,
      description: 'Arm’s-length visibility; easy to get lost or surprised.',
    },
  },
  hail: {
    name: 'Hail',
    severity: 4,
    mechanicalEffects: {
      visibilityMod: -15,
      movementMod: -15,
      combatMod: -10,
      socialMod: -15,
      description: 'Hard ice pellets; painful and distracting in the open.',
    },
  },
  scorching_heat: {
    name: 'Scorching heat',
    severity: 4,
    mechanicalEffects: {
      visibilityMod: -10,
      movementMod: -20,
      combatMod: -10,
      socialMod: -10,
      description: 'Blistering sun and haze; exhaustion and thirst mount quickly outside.',
    },
  },
  freezing_cold: {
    name: 'Freezing cold',
    severity: 4,
    mechanicalEffects: {
      visibilityMod: -5,
      movementMod: -15,
      combatMod: -5,
      socialMod: -10,
      description: 'Bitter temperatures numb hands and slow reactions without protection.',
    },
  },
  wind: {
    name: 'Strong wind',
    severity: 2,
    mechanicalEffects: {
      visibilityMod: -5,
      movementMod: -10,
      combatMod: -5,
      socialMod: -5,
      description: 'Gusts throw dust and debris; ranged shots and balance suffer.',
    },
  },
  gale: {
    name: 'Gale',
    severity: 5,
    mechanicalEffects: {
      visibilityMod: -15,
      movementMod: -25,
      combatMod: -15,
      socialMod: -20,
      description: 'Dangerous gusts; hard to stand, hear, or aim in the open.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/*  Season × region weights (higher = more likely)                            */
/* -------------------------------------------------------------------------- */

export const SEASON_WEATHER_WEIGHTS = {
  spring: {
    temperate: {
      clear: 12, cloudy: 18, overcast: 14, drizzle: 16, rain: 14, heavy_rain: 6,
      thunderstorm: 5, snow: 2, blizzard: 0, fog: 10, dense_fog: 3, hail: 4,
      scorching_heat: 2, freezing_cold: 3, wind: 12, gale: 4,
    },
    northern: {
      clear: 8, cloudy: 16, overcast: 16, drizzle: 10, rain: 12, heavy_rain: 5,
      thunderstorm: 2, snow: 8, blizzard: 1, fog: 12, dense_fog: 5, hail: 3,
      scorching_heat: 0, freezing_cold: 10, wind: 14, gale: 6,
    },
    coastal: {
      clear: 10, cloudy: 14, overcast: 12, drizzle: 14, rain: 16, heavy_rain: 8,
      thunderstorm: 6, snow: 1, blizzard: 0, fog: 14, dense_fog: 5, hail: 3,
      scorching_heat: 2, freezing_cold: 4, wind: 16, gale: 7,
    },
    mountain: {
      clear: 14, cloudy: 12, overcast: 14, drizzle: 8, rain: 10, heavy_rain: 6,
      thunderstorm: 5, snow: 12, blizzard: 4, fog: 14, dense_fog: 6, hail: 6,
      scorching_heat: 1, freezing_cold: 14, wind: 16, gale: 8,
    },
    wasteland: {
      clear: 18, cloudy: 10, overcast: 8, drizzle: 2, rain: 4, heavy_rain: 2,
      thunderstorm: 3, snow: 2, blizzard: 1, fog: 6, dense_fog: 4, hail: 2,
      scorching_heat: 16, freezing_cold: 8, wind: 20, gale: 12,
    },
  },
  summer: {
    temperate: {
      clear: 22, cloudy: 14, overcast: 10, drizzle: 8, rain: 10, heavy_rain: 6,
      thunderstorm: 12, snow: 0, blizzard: 0, fog: 6, dense_fog: 2, hail: 5,
      scorching_heat: 10, freezing_cold: 0, wind: 10, gale: 5,
    },
    northern: {
      clear: 18, cloudy: 14, overcast: 12, drizzle: 10, rain: 12, heavy_rain: 6,
      thunderstorm: 8, snow: 0, blizzard: 0, fog: 10, dense_fog: 3, hail: 4,
      scorching_heat: 4, freezing_cold: 2, wind: 12, gale: 5,
    },
    coastal: {
      clear: 16, cloudy: 12, overcast: 10, drizzle: 10, rain: 14, heavy_rain: 8,
      thunderstorm: 10, snow: 0, blizzard: 0, fog: 12, dense_fog: 4, hail: 3,
      scorching_heat: 6, freezing_cold: 1, wind: 14, gale: 6,
    },
    mountain: {
      clear: 20, cloudy: 10, overcast: 10, drizzle: 6, rain: 8, heavy_rain: 5,
      thunderstorm: 8, snow: 4, blizzard: 1, fog: 12, dense_fog: 5, hail: 8,
      scorching_heat: 3, freezing_cold: 6, wind: 14, gale: 8,
    },
    wasteland: {
      clear: 24, cloudy: 8, overcast: 6, drizzle: 1, rain: 2, heavy_rain: 1,
      thunderstorm: 4, snow: 0, blizzard: 0, fog: 4, dense_fog: 3, hail: 2,
      scorching_heat: 28, freezing_cold: 4, wind: 18, gale: 10,
    },
  },
  autumn: {
    temperate: {
      clear: 10, cloudy: 16, overcast: 16, drizzle: 12, rain: 14, heavy_rain: 8,
      thunderstorm: 6, snow: 2, blizzard: 0, fog: 14, dense_fog: 6, hail: 3,
      scorching_heat: 2, freezing_cold: 5, wind: 12, gale: 6,
    },
    northern: {
      clear: 8, cloudy: 14, overcast: 14, drizzle: 8, rain: 10, heavy_rain: 6,
      thunderstorm: 3, snow: 10, blizzard: 2, fog: 14, dense_fog: 8, hail: 3,
      scorching_heat: 0, freezing_cold: 12, wind: 14, gale: 8,
    },
    coastal: {
      clear: 10, cloudy: 12, overcast: 12, drizzle: 12, rain: 16, heavy_rain: 10,
      thunderstorm: 8, snow: 1, blizzard: 0, fog: 16, dense_fog: 6, hail: 3,
      scorching_heat: 2, freezing_cold: 4, wind: 14, gale: 8,
    },
    mountain: {
      clear: 12, cloudy: 10, overcast: 12, drizzle: 6, rain: 8, heavy_rain: 6,
      thunderstorm: 5, snow: 14, blizzard: 5, fog: 14, dense_fog: 8, hail: 6,
      scorching_heat: 1, freezing_cold: 12, wind: 14, gale: 9,
    },
    wasteland: {
      clear: 14, cloudy: 10, overcast: 8, drizzle: 3, rain: 5, heavy_rain: 3,
      thunderstorm: 5, snow: 2, blizzard: 1, fog: 8, dense_fog: 5, hail: 2,
      scorching_heat: 10, freezing_cold: 10, wind: 18, gale: 12,
    },
  },
  winter: {
    temperate: {
      clear: 8, cloudy: 12, overcast: 14, drizzle: 4, rain: 8, heavy_rain: 4,
      thunderstorm: 1, snow: 18, blizzard: 4, fog: 12, dense_fog: 8, hail: 2,
      scorching_heat: 0, freezing_cold: 16, wind: 12, gale: 8,
    },
    northern: {
      clear: 5, cloudy: 10, overcast: 12, drizzle: 2, rain: 4, heavy_rain: 2,
      thunderstorm: 0, snow: 22, blizzard: 10, fog: 10, dense_fog: 8, hail: 1,
      scorching_heat: 0, freezing_cold: 22, wind: 14, gale: 10,
    },
    coastal: {
      clear: 6, cloudy: 10, overcast: 12, drizzle: 6, rain: 10, heavy_rain: 6,
      thunderstorm: 2, snow: 8, blizzard: 2, fog: 14, dense_fog: 8, hail: 2,
      scorching_heat: 0, freezing_cold: 12, wind: 16, gale: 10,
    },
    mountain: {
      clear: 10, cloudy: 8, overcast: 10, drizzle: 3, rain: 5, heavy_rain: 4,
      thunderstorm: 2, snow: 20, blizzard: 12, fog: 12, dense_fog: 10, hail: 4,
      scorching_heat: 0, freezing_cold: 18, wind: 14, gale: 10,
    },
    wasteland: {
      clear: 12, cloudy: 8, overcast: 8, drizzle: 2, rain: 3, heavy_rain: 2,
      thunderstorm: 2, snow: 6, blizzard: 4, fog: 8, dense_fog: 6, hail: 2,
      scorching_heat: 4, freezing_cold: 18, wind: 20, gale: 14,
    },
  },
};

/* -------------------------------------------------------------------------- */
/*  Transition graph (symmetric adjacency for gradual changes)                */
/* -------------------------------------------------------------------------- */

const WEATHER_ADJACENCY = {
  clear: ['cloudy', 'wind', 'scorching_heat'],
  cloudy: ['clear', 'overcast', 'wind', 'drizzle'],
  overcast: ['cloudy', 'drizzle', 'fog', 'snow', 'rain', 'wind'],
  drizzle: ['overcast', 'rain', 'fog', 'cloudy'],
  rain: ['drizzle', 'heavy_rain', 'hail', 'thunderstorm', 'overcast'],
  heavy_rain: ['rain', 'thunderstorm', 'hail', 'gale'],
  thunderstorm: ['heavy_rain', 'rain', 'hail', 'gale'],
  snow: ['overcast', 'blizzard', 'freezing_cold', 'drizzle'],
  blizzard: ['snow', 'freezing_cold', 'gale', 'dense_fog'],
  fog: ['overcast', 'drizzle', 'dense_fog', 'rain'],
  dense_fog: ['fog', 'rain', 'blizzard'],
  hail: ['rain', 'heavy_rain', 'thunderstorm'],
  scorching_heat: ['clear', 'wind', 'overcast'],
  freezing_cold: ['snow', 'blizzard', 'overcast', 'wind'],
  wind: ['clear', 'cloudy', 'gale', 'scorching_heat', 'freezing_cold'],
  gale: ['wind', 'thunderstorm', 'heavy_rain', 'blizzard'],
};

const ALL_WEATHER_TYPES = Object.keys(WEATHER_TYPES);

const DEFAULT_REGION = 'temperate';
const DEFAULT_SEASON = 'spring';

function normalizeSeason(season) {
  const s = String(season || '').toLowerCase();
  if (SEASON_WEATHER_WEIGHTS[s]) return s;
  return DEFAULT_SEASON;
}

function normalizeRegion(regionType) {
  const r = String(regionType || '').toLowerCase();
  const firstSeason = SEASON_WEATHER_WEIGHTS[DEFAULT_SEASON];
  if (firstSeason && firstSeason[r]) return r;
  return DEFAULT_REGION;
}

function isAdjacent(a, b) {
  if (!a || !b || a === b) return true;
  const n = WEATHER_ADJACENCY[a];
  return !!(n && n.includes(b));
}

/** Same “family” allows slightly softer jumps than unrelated types. */
function sameFamily(a, b) {
  const precip = new Set(['drizzle', 'rain', 'heavy_rain', 'hail', 'thunderstorm']);
  const cold = new Set(['snow', 'blizzard', 'freezing_cold']);
  const mist = new Set(['fog', 'dense_fog']);
  const air = new Set(['wind', 'gale']);
  const mild = new Set(['clear', 'cloudy', 'overcast']);
  const families = [precip, cold, mist, air, mild, new Set(['scorching_heat'])];
  for (const f of families) {
    if (f.has(a) && f.has(b)) return true;
  }
  return false;
}

/**
 * @param {string} previous
 * @param {string} candidate
 * @returns {number}
 */
function transitionMultiplier(previous, candidate) {
  if (!previous) return 1;
  if (candidate === previous) return 2.4;
  if (isAdjacent(previous, candidate)) return 1.75;
  if (sameFamily(previous, candidate)) return 1.25;
  return 0.32;
}

function weightedPick(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0 && Number.isFinite(w));
  if (entries.length === 0) return 'clear';
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function cloneWeights(raw) {
  const out = {};
  for (const k of ALL_WEATHER_TYPES) {
    const v = raw[k];
    out[k] = v != null && v > 0 ? v : 0;
  }
  return out;
}

function getBaseWeights(season, regionType) {
  const s = normalizeSeason(season);
  const r = normalizeRegion(regionType);
  const table = SEASON_WEATHER_WEIGHTS[s]?.[r];
  if (table) return cloneWeights(table);
  return cloneWeights(SEASON_WEATHER_WEIGHTS[DEFAULT_SEASON][DEFAULT_REGION]);
}

/**
 * Hours until the next weather evaluation; volatile weather tends to break sooner.
 */
function pickDurationHours(weatherType) {
  const volatile = new Set(['thunderstorm', 'hail', 'gale', 'heavy_rain', 'blizzard']);
  const stable = new Set(['clear', 'cloudy', 'overcast', 'fog', 'dense_fog']);
  let min = 3;
  let max = 10;
  if (volatile.has(weatherType)) {
    min = 1;
    max = 4;
  } else if (stable.has(weatherType)) {
    min = 6;
    max = 18;
  }
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * @param {string} season
 * @param {string} regionType
 * @param {{ type?: string, duration?: number } | null} [previousWeather]
 * @returns {{ type: string, severity: number, duration: number, description: string, mechanicalEffects: MechanicalEffects, atmosphereMapping: { weather: string, particles: string, mood: string, transition?: string } }}
 */
export function generateWeather(season, regionType, previousWeather = null) {
  const base = getBaseWeights(season, regionType);
  const prevType = previousWeather?.type && WEATHER_TYPES[previousWeather.type]
    ? previousWeather.type
    : null;

  const adjusted = {};
  for (const type of ALL_WEATHER_TYPES) {
    adjusted[type] = base[type] * transitionMultiplier(prevType, type);
  }

  let chosen = weightedPick(adjusted);

  // Second pass: if we jumped “too far” from previous, sometimes snap to a neighbor instead.
  if (prevType && chosen !== prevType && !isAdjacent(prevType, chosen) && !sameFamily(prevType, chosen)) {
    if (Math.random() < 0.55) {
      const neighbors = WEATHER_ADJACENCY[prevType] || [];
      const neighborWeights = {};
      for (const n of neighbors) {
        if (adjusted[n] > 0) neighborWeights[n] = adjusted[n];
      }
      if (Object.keys(neighborWeights).length > 0) {
        chosen = weightedPick(neighborWeights);
      }
    }
  }

  const def = WEATHER_TYPES[chosen];
  const mechanicalEffects = { ...def.mechanicalEffects };

  return {
    type: chosen,
    severity: def.severity,
    duration: pickDurationHours(chosen),
    description: mechanicalEffects.description,
    mechanicalEffects,
    atmosphereMapping: mapWeatherToAtmosphere(chosen),
  };
}

/** @type {Record<string, { perception: number, ranged: number, movement: number, outdoor: number, social: number }>} */
const WEATHER_TEST_MODIFIERS = {
  clear: { perception: 0, ranged: 0, movement: 0, outdoor: 0, social: 0 },
  cloudy: { perception: 0, ranged: 0, movement: 0, outdoor: 0, social: 0 },
  overcast: { perception: -5, ranged: -5, movement: 0, outdoor: -5, social: -5 },
  drizzle: { perception: -5, ranged: -5, movement: -5, outdoor: -10, social: -5 },
  rain: { perception: -10, ranged: -15, movement: -10, outdoor: -15, social: -10 },
  heavy_rain: { perception: -20, ranged: -25, movement: -15, outdoor: -25, social: -15 },
  thunderstorm: { perception: -25, ranged: -30, movement: -20, outdoor: -30, social: -20 },
  snow: { perception: -15, ranged: -15, movement: -15, outdoor: -20, social: -10 },
  blizzard: { perception: -35, ranged: -35, movement: -30, outdoor: -40, social: -25 },
  fog: { perception: -20, ranged: -25, movement: -5, outdoor: -15, social: -10 },
  dense_fog: { perception: -35, ranged: -35, movement: -10, outdoor: -25, social: -15 },
  hail: { perception: -15, ranged: -20, movement: -15, outdoor: -25, social: -15 },
  scorching_heat: { perception: -10, ranged: -5, movement: -20, outdoor: -30, social: -10 },
  freezing_cold: { perception: -5, ranged: -10, movement: -15, outdoor: -25, social: -10 },
  wind: { perception: -5, ranged: -15, movement: -10, outdoor: -15, social: -5 },
  gale: { perception: -15, ranged: -25, movement: -25, outdoor: -30, social: -20 },
};

/**
 * @param {string} weatherType
 * @returns {{ perception: number, ranged: number, movement: number, outdoor: number, social: number }}
 */
export function getWeatherModifiers(weatherType) {
  const key = weatherType && WEATHER_TYPES[weatherType] ? weatherType : 'clear';
  const row = WEATHER_TEST_MODIFIERS[key];
  return { ...row };
}

/**
 * @param {{ duration?: number, type?: string } | null | undefined} currentWeather
 * @param {number} hoursElapsed
 * @returns {boolean}
 */
export function shouldWeatherChange(currentWeather, hoursElapsed) {
  if (currentWeather == null) return true;
  const h = Number(hoursElapsed);
  if (!Number.isFinite(h) || h < 0) return true;
  const dur = Number(currentWeather.duration);
  if (!Number.isFinite(dur) || dur <= 0) return h > 0;

  return h >= dur;
}

/**
 * @param {number} day Game day (1-based year position; wraps every 360 days)
 * @returns {'spring'|'summer'|'autumn'|'winter'}
 */
export function getSeasonForDay(day) {
  const d = Math.floor(Number(day));
  if (!Number.isFinite(d)) return 'spring';
  const yd = ((Math.abs(d) - 1) % 360) + 1;
  if (yd <= 90) return 'spring';
  if (yd <= 180) return 'summer';
  if (yd <= 270) return 'autumn';
  return 'winter';
}

/**
 * @param {{ type?: string, severity?: number, duration?: number, mechanicalEffects?: Partial<MechanicalEffects>, description?: string } | null | undefined} weather
 * @returns {string}
 */
export function formatWeatherForPrompt(weather) {
  const type = weather?.type && WEATHER_TYPES[weather.type] ? weather.type : 'clear';
  const def = WEATHER_TYPES[type];
  const mods = getWeatherModifiers(type);
  const me = { ...def.mechanicalEffects, ...(weather?.mechanicalEffects || {}) };
  const sev = weather?.severity ?? def.severity;
  const dur = weather?.duration;

  const lines = [
    `Conditions: ${def.name} (${type}). Severity ${sev}/5.`,
    me.description || def.mechanicalEffects.description,
    `Environmental pressure — visibility/movement/combat/social (abstract): ${me.visibilityMod}/${me.movementMod}/${me.combatMod}/${me.socialMod}.`,
    `Suggested test shifts — perception ${mods.perception}, ranged ${mods.ranged}, movement ${mods.movement}, outdoor endurance/exposure ${mods.outdoor}, social ${mods.social}.`,
  ];
  if (dur != null && Number.isFinite(Number(dur))) {
    lines.push(`Expected stability: about ${dur} hours before reassessment.`);
  }
  return lines.join(' ');
}

/**
 * Maps engine weather to atmosphere.weather values understood by prompts + resolveEffects
 * (rain | snow | storm | clear | fog | fire), plus particles and mood.
 *
 * @param {string} weatherType
 * @returns {{ weather: 'rain'|'snow'|'storm'|'clear'|'fog'|'fire', particles: string, mood: string, transition: string }}
 */
export function mapWeatherToAtmosphere(weatherType) {
  const t = weatherType && WEATHER_TYPES[weatherType] ? weatherType : 'clear';

  const table = {
    clear: { weather: 'clear', particles: 'none', mood: 'peaceful', transition: 'fade' },
    cloudy: { weather: 'clear', particles: 'none', mood: 'peaceful', transition: 'fade' },
    overcast: { weather: 'clear', particles: 'none', mood: 'tense', transition: 'fade' },
    drizzle: { weather: 'rain', particles: 'none', mood: 'peaceful', transition: 'dissolve' },
    rain: { weather: 'rain', particles: 'none', mood: 'tense', transition: 'dissolve' },
    heavy_rain: { weather: 'rain', particles: 'none', mood: 'tense', transition: 'dissolve' },
    thunderstorm: { weather: 'storm', particles: 'sparks', mood: 'chaotic', transition: 'dissolve' },
    snow: { weather: 'snow', particles: 'none', mood: 'peaceful', transition: 'fade' },
    blizzard: { weather: 'snow', particles: 'none', mood: 'chaotic', transition: 'dissolve' },
    fog: { weather: 'fog', particles: 'none', mood: 'mystical', transition: 'fade' },
    dense_fog: { weather: 'fog', particles: 'none', mood: 'dark', transition: 'dissolve' },
    hail: { weather: 'storm', particles: 'sparks', mood: 'tense', transition: 'dissolve' },
    scorching_heat: { weather: 'fire', particles: 'embers', mood: 'tense', transition: 'fade' },
    freezing_cold: { weather: 'snow', particles: 'none', mood: 'dark', transition: 'fade' },
    wind: { weather: 'clear', particles: 'none', mood: 'tense', transition: 'fade' },
    gale: { weather: 'storm', particles: 'none', mood: 'chaotic', transition: 'dissolve' },
  };

  return { ...table[t] };
}
