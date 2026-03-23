// Weather System - WFRP 4e weather types, seasonal tables, and atmosphere mapping

export const WEATHER_TYPES = {
  clear: {
    name: 'Clear',
    description: 'Blue skies and good visibility. Ideal conditions for travel and combat.',
    effects: { visibility: 0, movementPenalty: 0, rangedPenalty: 0, perceptionPenalty: 0, specialEffects: [] },
  },
  cloudy: {
    name: 'Cloudy',
    description: 'Overcast skies with heavy cloud cover. No direct impact on activities.',
    effects: { visibility: 0, movementPenalty: 0, rangedPenalty: 0, perceptionPenalty: 0, specialEffects: [] },
  },
  rain: {
    name: 'Rain',
    description: 'Steady rainfall reducing visibility and making surfaces slick.',
    effects: { visibility: -10, movementPenalty: 0, rangedPenalty: -10, perceptionPenalty: -10, specialEffects: ['slippery_surfaces'] },
  },
  heavyRain: {
    name: 'Heavy Rain',
    description: 'Torrential downpour that hampers movement and washes away tracks.',
    effects: { visibility: -20, movementPenalty: -5, rangedPenalty: -20, perceptionPenalty: -20, specialEffects: ['slippery_surfaces', 'tracks_washed'] },
  },
  storm: {
    name: 'Storm',
    description: 'Violent thunderstorm with lightning strikes and deafening thunder.',
    effects: { visibility: -30, movementPenalty: -10, rangedPenalty: -30, perceptionPenalty: -20, specialEffects: ['lightning_risk', 'deafening_thunder'] },
  },
  snow: {
    name: 'Snow',
    description: 'Gentle snowfall that blankets the ground and reveals tracks.',
    effects: { visibility: -10, movementPenalty: -5, rangedPenalty: -10, perceptionPenalty: -10, specialEffects: ['cold_exposure', 'tracks_visible'] },
  },
  blizzard: {
    name: 'Blizzard',
    description: 'Fierce blinding snowstorm with extreme cold and near-zero visibility.',
    effects: { visibility: -40, movementPenalty: -20, rangedPenalty: -40, perceptionPenalty: -30, specialEffects: ['cold_exposure', 'frostbite_risk', 'lost_risk'] },
  },
  fog: {
    name: 'Fog',
    description: 'Thick fog rolling across the land, perfect cover for ambushes.',
    effects: { visibility: -30, movementPenalty: 0, rangedPenalty: -20, perceptionPenalty: -30, specialEffects: ['ambush_advantage'] },
  },
  heatwave: {
    name: 'Heatwave',
    description: 'Oppressive heat that saps stamina and causes shimmering mirages.',
    effects: { visibility: 0, movementPenalty: -5, rangedPenalty: 0, perceptionPenalty: -10, specialEffects: ['heat_exhaustion', 'mirage'] },
  },
  wind: {
    name: 'Strong Wind',
    description: 'Powerful gusts that deflect ranged attacks and hinder movement.',
    effects: { visibility: 0, movementPenalty: -5, rangedPenalty: -20, perceptionPenalty: -10, specialEffects: ['ranged_deflection'] },
  },
};

export const SEASONAL_WEATHER = {
  spring: { clear: 3, cloudy: 4, rain: 4, heavyRain: 2, storm: 1, fog: 2, wind: 1 },
  summer: { clear: 5, cloudy: 3, rain: 2, heavyRain: 1, storm: 2, heatwave: 3, wind: 1 },
  autumn: { clear: 2, cloudy: 4, rain: 4, heavyRain: 3, storm: 2, fog: 3, wind: 2 },
  winter: { clear: 2, cloudy: 3, rain: 1, snow: 4, blizzard: 2, fog: 2, wind: 2 },
};

export const WEATHER_ATMOSPHERE_MAP = {
  clear:     { weather: 'clear', particles: 'none', mood: 'peaceful' },
  cloudy:    { weather: 'clear', particles: 'none', mood: 'tense' },
  rain:      { weather: 'rain', particles: 'none', mood: 'dark' },
  heavyRain: { weather: 'rain', particles: 'none', mood: 'dark' },
  storm:     { weather: 'storm', particles: 'sparks', mood: 'chaotic' },
  snow:      { weather: 'snow', particles: 'none', mood: 'peaceful' },
  blizzard:  { weather: 'snow', particles: 'none', mood: 'chaotic' },
  fog:       { weather: 'fog', particles: 'none', mood: 'mystical' },
  heatwave:  { weather: 'clear', particles: 'embers', mood: 'tense' },
  wind:      { weather: 'clear', particles: 'none', mood: 'tense' },
};

export function rollWeather(season = 'summer', currentWeather = 'clear') {
  const table = SEASONAL_WEATHER[season];
  if (!table) return 'clear';

  const weighted = Object.entries(table).map(([type, weight]) => ({
    type,
    weight: type === currentWeather ? weight + 2 : weight,
  }));

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const { type, weight } of weighted) {
    roll -= weight;
    if (roll <= 0) return type;
  }

  return weighted[weighted.length - 1].type;
}

export function getWeatherEffects(weatherType) {
  const entry = WEATHER_TYPES[weatherType];
  return entry ? entry.effects : WEATHER_TYPES.clear.effects;
}

export function weatherToAtmosphere(weatherType) {
  const atmosphere = WEATHER_ATMOSPHERE_MAP[weatherType] || WEATHER_ATMOSPHERE_MAP.clear;
  return { ...atmosphere };
}
