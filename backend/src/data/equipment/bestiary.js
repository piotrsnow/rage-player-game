/**
 * RPGon bestiary — native RPGon stat blocks.
 *
 * Each entry uses RPGon 6-attribute system (scale 1-25) directly.
 * No more WFRP characteristics conversion.
 *
 * Structure per entry:
 *   race        — creature race (from BESTIARY_RACES)
 *   locations   — where it can appear (from BESTIARY_LOCATIONS)
 *   difficulty  — individual unit tier (trivial/low/medium/high/deadly)
 *   attributes  — base RPGon attributes (szczescie always 0)
 *   variance    — ± random per attribute at spawn (optional, defaults from DIFFICULTY_VARIANCE)
 *   maxWounds   — starting/max HP
 *   skills      — combat skills using RPGon Polish names, values per difficulty caps
 *   traits      — special abilities/tags
 *   armourDR    — flat damage reduction
 *   weapons     — weapon keys from WEAPONS catalog
 */

// ── Enums ──

export const BESTIARY_LOCATIONS = [
  'las', 'miasto', 'wioska', 'gory', 'bagno',
  'wybrzeze', 'jaskinia', 'ruiny', 'droga', 'pole',
];

export const BESTIARY_DIFFICULTIES = ['trivial', 'low', 'medium', 'high', 'deadly'];

export const BESTIARY_RACES = [
  'ludzie', 'orkowie', 'gobliny', 'nieumarli', 'zwierzeta',
  'demony', 'trolle', 'pajaki', 'krasnoludy', 'elfy', 'niziolki',
];

/** Default attribute variance per difficulty tier (can be overridden per entry). */
export const DIFFICULTY_VARIANCE = { trivial: 1, low: 1, medium: 2, high: 2, deadly: 3 };

/** Point cost per difficulty tier for encounter budget system. */
export const THREAT_COSTS = { trivial: 1, low: 2, medium: 4, high: 8, deadly: 16 };

// ── Bestiary Data ──

export const BESTIARY = {
  // ── Ludzie ──
  'Wieśniak': {
    race: 'ludzie', locations: ['wioska', 'pole', 'droga'], difficulty: 'trivial',
    attributes: { sila: 2, inteligencja: 1, charyzma: 1, zrecznosc: 1, wytrzymalosc: 2, szczescie: 0 },
    maxWounds: 6,
    skills: { 'Walka wrecz': 1 },
    traits: [], armourDR: 0, weapons: ['Pałka'],
  },
  'Żebrak': {
    race: 'ludzie', locations: ['miasto', 'wioska'], difficulty: 'trivial',
    attributes: { sila: 1, inteligencja: 1, charyzma: 1, zrecznosc: 2, wytrzymalosc: 1, szczescie: 0 },
    maxWounds: 4,
    skills: { 'Walka wrecz': 1 },
    traits: [], armourDR: 0, weapons: ['Hand Weapon'],
  },
  'Pijak': {
    race: 'ludzie', locations: ['miasto', 'wioska'], difficulty: 'trivial',
    attributes: { sila: 2, inteligencja: 1, charyzma: 1, zrecznosc: 1, wytrzymalosc: 2, szczescie: 0 },
    maxWounds: 5,
    skills: { 'Walka wrecz': 2 },
    traits: [], armourDR: 0, weapons: ['Hand Weapon'],
  },
  'Strażnik': {
    race: 'ludzie', locations: ['miasto', 'wioska'], difficulty: 'low',
    attributes: { sila: 3, inteligencja: 2, charyzma: 2, zrecznosc: 3, wytrzymalosc: 3, szczescie: 0 },
    maxWounds: 12,
    skills: { 'Walka bronia jednoręczna': 4, 'Uniki': 3 },
    traits: [], armourDR: 3, weapons: ['Hand Weapon', 'Buckler'],
  },
  'Bandyta': {
    race: 'ludzie', locations: ['droga', 'las', 'wioska'], difficulty: 'low',
    attributes: { sila: 3, inteligencja: 2, charyzma: 2, zrecznosc: 3, wytrzymalosc: 3, szczescie: 0 },
    maxWounds: 10,
    skills: { 'Walka bronia jednoręczna': 3, 'Strzelectwo': 3, 'Uniki': 2 },
    traits: [], armourDR: 1, weapons: ['Dagger', 'Shortbow'],
  },
  'Kultista': {
    race: 'ludzie', locations: ['miasto', 'jaskinia', 'ruiny'], difficulty: 'low',
    attributes: { sila: 2, inteligencja: 3, charyzma: 3, zrecznosc: 2, wytrzymalosc: 2, szczescie: 0 },
    maxWounds: 8,
    skills: { 'Walka wrecz': 3 },
    traits: [], armourDR: 0, weapons: ['Dagger'],
  },
  'Rycerz': {
    race: 'ludzie', locations: ['miasto', 'droga', 'pole'], difficulty: 'high',
    attributes: { sila: 6, inteligencja: 3, charyzma: 4, zrecznosc: 5, wytrzymalosc: 6, szczescie: 0 },
    maxWounds: 22,
    skills: { 'Walka bronia jednoręczna': 10, 'Uniki': 8 },
    traits: [], armourDR: 6, weapons: ['Hand Weapon'],
  },

  // ── Orkowie ──
  'Goblin': {
    race: 'orkowie', locations: ['las', 'jaskinia', 'gory'], difficulty: 'trivial',
    attributes: { sila: 1, inteligencja: 1, charyzma: 1, zrecznosc: 3, wytrzymalosc: 1, szczescie: 0 },
    maxWounds: 6,
    skills: { 'Walka bronia jednoręczna': 2, 'Uniki': 2 },
    traits: [], armourDR: 0, weapons: ['Dagger'],
  },
  'Ork Wojownik': {
    race: 'orkowie', locations: ['las', 'gory', 'pole'], difficulty: 'medium',
    attributes: { sila: 5, inteligencja: 1, charyzma: 1, zrecznosc: 3, wytrzymalosc: 5, szczescie: 0 },
    maxWounds: 18,
    skills: { 'Walka bronia jednoręczna': 6 },
    traits: [], armourDR: 2, weapons: ['Hand Weapon'],
  },
  'Ork Wódz': {
    race: 'orkowie', locations: ['gory', 'jaskinia'], difficulty: 'deadly',
    attributes: { sila: 8, inteligencja: 2, charyzma: 3, zrecznosc: 4, wytrzymalosc: 7, szczescie: 0 },
    maxWounds: 28,
    skills: { 'Walka bronia dwureczna': 14, 'Uniki': 6 },
    traits: ['Duży'], armourDR: 5, weapons: ['Halberd'],
  },

  // ── Gobliny ──
  'Goblin Zwiadowca': {
    race: 'gobliny', locations: ['las', 'gory', 'bagno'], difficulty: 'trivial',
    attributes: { sila: 1, inteligencja: 1, charyzma: 1, zrecznosc: 3, wytrzymalosc: 1, szczescie: 0 },
    maxWounds: 5,
    skills: { 'Strzelectwo': 2, 'Skradanie': 2 },
    traits: [], armourDR: 0, weapons: ['Proca'],
  },
  'Goblin Wojownik': {
    race: 'gobliny', locations: ['las', 'jaskinia', 'gory'], difficulty: 'low',
    attributes: { sila: 2, inteligencja: 1, charyzma: 1, zrecznosc: 3, wytrzymalosc: 2, szczescie: 0 },
    maxWounds: 8,
    skills: { 'Walka bronia jednoręczna': 4, 'Uniki': 3 },
    traits: [], armourDR: 0, weapons: ['Dagger'],
  },
  'Goblin Szaman': {
    race: 'gobliny', locations: ['jaskinia', 'ruiny'], difficulty: 'medium',
    attributes: { sila: 1, inteligencja: 4, charyzma: 2, zrecznosc: 2, wytrzymalosc: 1, szczescie: 0 },
    maxWounds: 7,
    skills: { 'Walka wrecz': 2 },
    traits: ['Magia'], armourDR: 0, weapons: ['Kij Bojowy'],
  },

  // ── Nieumarli ──
  'Zombie': {
    race: 'nieumarli', locations: ['ruiny', 'jaskinia', 'bagno'], difficulty: 'low',
    attributes: { sila: 3, inteligencja: 1, charyzma: 1, zrecznosc: 1, wytrzymalosc: 4, szczescie: 0 },
    maxWounds: 12,
    skills: { 'Walka wrecz': 2 },
    traits: ['Nieumarły', 'Strach 1'], armourDR: 0, weapons: ['Hand Weapon'],
  },
  'Szkielet Wojownik': {
    race: 'nieumarli', locations: ['ruiny', 'jaskinia'], difficulty: 'low',
    attributes: { sila: 3, inteligencja: 1, charyzma: 1, zrecznosc: 2, wytrzymalosc: 3, szczescie: 0 },
    maxWounds: 8,
    skills: { 'Walka bronia jednoręczna': 4, 'Uniki': 2 },
    traits: ['Nieumarły', 'Strach 1'], armourDR: 1, weapons: ['Hand Weapon'],
  },
  'Duch': {
    race: 'nieumarli', locations: ['ruiny', 'jaskinia', 'miasto'], difficulty: 'medium',
    attributes: { sila: 3, inteligencja: 3, charyzma: 2, zrecznosc: 4, wytrzymalosc: 2, szczescie: 0 },
    maxWounds: 10,
    skills: { 'Walka wrecz': 5 },
    traits: ['Nieumarły', 'Eteryczny', 'Strach 2'], armourDR: 0, weapons: ['Hand Weapon'],
  },
  'Upiór': {
    race: 'nieumarli', locations: ['ruiny', 'jaskinia'], difficulty: 'deadly',
    attributes: { sila: 7, inteligencja: 4, charyzma: 2, zrecznosc: 5, wytrzymalosc: 7, szczescie: 0 },
    maxWounds: 24,
    skills: { 'Walka bronia jednoręczna': 14, 'Uniki': 10 },
    traits: ['Nieumarły', 'Strach 3', 'Terror 1'], armourDR: 5, weapons: ['Hand Weapon'],
  },

  // ── Zwierzęta ──
  'Szczur Olbrzymi': {
    race: 'zwierzeta', locations: ['jaskinia', 'miasto', 'bagno'], difficulty: 'trivial',
    attributes: { sila: 1, inteligencja: 1, charyzma: 1, zrecznosc: 3, wytrzymalosc: 1, szczescie: 0 },
    maxWounds: 4,
    skills: { 'Walka wrecz': 1 },
    traits: ['Bestia', 'Zaraza'], armourDR: 0, weapons: ['Hand Weapon'],
  },
  'Wąż': {
    race: 'zwierzeta', locations: ['las', 'bagno', 'pole'], difficulty: 'trivial',
    attributes: { sila: 1, inteligencja: 1, charyzma: 1, zrecznosc: 3, wytrzymalosc: 1, szczescie: 0 },
    maxWounds: 3,
    skills: { 'Walka wrecz': 1 },
    traits: ['Bestia', 'Jad'], armourDR: 0, weapons: ['Hand Weapon'],
  },
  'Wilk': {
    race: 'zwierzeta', locations: ['las', 'gory', 'pole'], difficulty: 'low',
    attributes: { sila: 3, inteligencja: 1, charyzma: 1, zrecznosc: 4, wytrzymalosc: 3, szczescie: 0 },
    maxWounds: 10,
    skills: { 'Walka wrecz': 4 },
    traits: ['Bestia'], armourDR: 1, weapons: ['Hand Weapon'],
  },
  'Dzik': {
    race: 'zwierzeta', locations: ['las', 'pole'], difficulty: 'low',
    attributes: { sila: 4, inteligencja: 1, charyzma: 1, zrecznosc: 2, wytrzymalosc: 4, szczescie: 0 },
    maxWounds: 12,
    skills: { 'Walka wrecz': 3 },
    traits: ['Bestia', 'Szarża'], armourDR: 2, weapons: ['Hand Weapon'],
  },
  'Niedźwiedź': {
    race: 'zwierzeta', locations: ['las', 'gory'], difficulty: 'high',
    attributes: { sila: 7, inteligencja: 1, charyzma: 1, zrecznosc: 3, wytrzymalosc: 7, szczescie: 0 },
    maxWounds: 28,
    skills: { 'Walka wrecz': 10 },
    traits: ['Bestia', 'Duży'], armourDR: 4, weapons: ['Hand Weapon'],
  },

  // ── Demony ──
  'Pomniejszy Demon': {
    race: 'demony', locations: ['ruiny', 'jaskinia'], difficulty: 'medium',
    attributes: { sila: 4, inteligencja: 3, charyzma: 2, zrecznosc: 4, wytrzymalosc: 4, szczescie: 0 },
    maxWounds: 16,
    skills: { 'Walka wrecz': 7, 'Uniki': 4 },
    traits: ['Demon', 'Strach 2'], armourDR: 2, weapons: ['Hand Weapon'],
  },
  'Demon Ognia': {
    race: 'demony', locations: ['ruiny', 'jaskinia'], difficulty: 'high',
    attributes: { sila: 6, inteligencja: 4, charyzma: 2, zrecznosc: 5, wytrzymalosc: 6, szczescie: 0 },
    maxWounds: 22,
    skills: { 'Walka bronia jednoręczna': 10, 'Uniki': 7 },
    traits: ['Demon', 'Strach 3', 'Ognisty'], armourDR: 3, weapons: ['Great Weapon'],
  },
  'Demon Cieni': {
    race: 'demony', locations: ['ruiny', 'jaskinia'], difficulty: 'deadly',
    attributes: { sila: 5, inteligencja: 5, charyzma: 3, zrecznosc: 8, wytrzymalosc: 5, szczescie: 0 },
    maxWounds: 26,
    skills: { 'Walka bronia jednoręczna': 13, 'Uniki': 12 },
    traits: ['Demon', 'Strach 3', 'Terror 2'], armourDR: 2, weapons: ['Great Weapon'],
  },

  // ── Trolle ──
  'Troll Leśny': {
    race: 'trolle', locations: ['las', 'bagno'], difficulty: 'high',
    attributes: { sila: 7, inteligencja: 1, charyzma: 1, zrecznosc: 2, wytrzymalosc: 7, szczescie: 0 },
    maxWounds: 28,
    skills: { 'Walka bronia dwureczna': 8 },
    traits: ['Duży', 'Regeneracja'], armourDR: 4, weapons: ['Great Weapon'],
  },
  'Troll Jaskiniowy': {
    race: 'trolle', locations: ['jaskinia', 'gory'], difficulty: 'deadly',
    attributes: { sila: 9, inteligencja: 1, charyzma: 1, zrecznosc: 2, wytrzymalosc: 9, szczescie: 0 },
    maxWounds: 35,
    skills: { 'Walka bronia dwureczna': 12 },
    traits: ['Duży', 'Regeneracja'], armourDR: 6, weapons: ['Great Weapon'],
  },
  'Troll Rzeczny': {
    race: 'trolle', locations: ['bagno', 'wybrzeze'], difficulty: 'high',
    attributes: { sila: 6, inteligencja: 1, charyzma: 1, zrecznosc: 3, wytrzymalosc: 7, szczescie: 0 },
    maxWounds: 26,
    skills: { 'Walka bronia dwureczna': 8, 'Walka wrecz': 6 },
    traits: ['Duży', 'Regeneracja'], armourDR: 4, weapons: ['Great Weapon'],
  },

  // ── Pająki ──
  'Pająk Leśny': {
    race: 'pajaki', locations: ['las', 'jaskinia'], difficulty: 'low',
    attributes: { sila: 2, inteligencja: 1, charyzma: 1, zrecznosc: 4, wytrzymalosc: 2, szczescie: 0 },
    maxWounds: 8,
    skills: { 'Walka wrecz': 3 },
    traits: ['Jad', 'Sieć'], armourDR: 1, weapons: ['Hand Weapon'],
  },
  'Pająk Olbrzymi': {
    race: 'pajaki', locations: ['jaskinia', 'las'], difficulty: 'medium',
    attributes: { sila: 4, inteligencja: 1, charyzma: 1, zrecznosc: 4, wytrzymalosc: 4, szczescie: 0 },
    maxWounds: 18,
    skills: { 'Walka wrecz': 7 },
    traits: ['Jad', 'Sieć', 'Duży'], armourDR: 2, weapons: ['Hand Weapon'],
  },
  'Królowa Pająków': {
    race: 'pajaki', locations: ['jaskinia'], difficulty: 'high',
    attributes: { sila: 5, inteligencja: 2, charyzma: 1, zrecznosc: 5, wytrzymalosc: 5, szczescie: 0 },
    maxWounds: 24,
    skills: { 'Walka wrecz': 10, 'Uniki': 6 },
    traits: ['Jad', 'Sieć', 'Duży'], armourDR: 3, weapons: ['Hand Weapon'],
  },

  // ── Krasnoludy ──
  'Krasnolud Górnik': {
    race: 'krasnoludy', locations: ['gory', 'jaskinia'], difficulty: 'low',
    attributes: { sila: 3, inteligencja: 2, charyzma: 1, zrecznosc: 2, wytrzymalosc: 4, szczescie: 0 },
    maxWounds: 14,
    skills: { 'Walka bronia jednoręczna': 3, 'Odpornosc': 4 },
    traits: [], armourDR: 3, weapons: ['Hand Weapon'],
  },
  'Krasnolud Wojownik': {
    race: 'krasnoludy', locations: ['gory', 'jaskinia', 'miasto'], difficulty: 'medium',
    attributes: { sila: 5, inteligencja: 2, charyzma: 2, zrecznosc: 3, wytrzymalosc: 5, szczescie: 0 },
    maxWounds: 18,
    skills: { 'Walka bronia jednoręczna': 7, 'Uniki': 4 },
    traits: [], armourDR: 4, weapons: ['Hand Weapon', 'Buckler'],
  },
  'Krasnolud Weteran': {
    race: 'krasnoludy', locations: ['gory', 'jaskinia'], difficulty: 'high',
    attributes: { sila: 6, inteligencja: 3, charyzma: 2, zrecznosc: 3, wytrzymalosc: 7, szczescie: 0 },
    maxWounds: 24,
    skills: { 'Walka bronia dwureczna': 10, 'Uniki': 6 },
    traits: [], armourDR: 5, weapons: ['Halberd'],
  },

  // ── Elfy ──
  'Elf Zwiadowca': {
    race: 'elfy', locations: ['las', 'gory'], difficulty: 'low',
    attributes: { sila: 2, inteligencja: 3, charyzma: 2, zrecznosc: 4, wytrzymalosc: 2, szczescie: 0 },
    maxWounds: 8,
    skills: { 'Strzelectwo': 4, 'Uniki': 4 },
    traits: [], armourDR: 1, weapons: ['Shortbow'],
  },
  'Elf Wojownik': {
    race: 'elfy', locations: ['las', 'ruiny'], difficulty: 'medium',
    attributes: { sila: 3, inteligencja: 3, charyzma: 2, zrecznosc: 5, wytrzymalosc: 3, szczescie: 0 },
    maxWounds: 14,
    skills: { 'Walka bronia jednoręczna': 6, 'Uniki': 7 },
    traits: [], armourDR: 2, weapons: ['Hand Weapon'],
  },
  'Elf Strażnik': {
    race: 'elfy', locations: ['las', 'ruiny'], difficulty: 'high',
    attributes: { sila: 4, inteligencja: 4, charyzma: 3, zrecznosc: 6, wytrzymalosc: 4, szczescie: 0 },
    maxWounds: 18,
    skills: { 'Walka bronia jednoręczna': 9, 'Strzelectwo': 8, 'Uniki': 11 },
    traits: [], armourDR: 3, weapons: ['Hand Weapon', 'Shortbow'],
  },

  // ── Niziołki ──
  'Niziołek Złodziej': {
    race: 'niziolki', locations: ['miasto', 'wioska', 'droga'], difficulty: 'low',
    attributes: { sila: 1, inteligencja: 2, charyzma: 3, zrecznosc: 4, wytrzymalosc: 1, szczescie: 0 },
    maxWounds: 6,
    skills: { 'Uniki': 5, 'Walka bronia jednoręczna': 2 },
    traits: [], armourDR: 1, weapons: ['Dagger'],
  },
  'Niziołek Awanturnik': {
    race: 'niziolki', locations: ['droga', 'las', 'wioska'], difficulty: 'medium',
    attributes: { sila: 2, inteligencja: 2, charyzma: 3, zrecznosc: 5, wytrzymalosc: 2, szczescie: 0 },
    maxWounds: 10,
    skills: { 'Walka bronia jednoręczna': 5, 'Strzelectwo': 5, 'Uniki': 7 },
    traits: [], armourDR: 2, weapons: ['Dagger', 'Proca'],
  },
  'Niziołek Kapitan': {
    race: 'niziolki', locations: ['miasto', 'wioska'], difficulty: 'high',
    attributes: { sila: 3, inteligencja: 3, charyzma: 4, zrecznosc: 6, wytrzymalosc: 3, szczescie: 0 },
    maxWounds: 14,
    skills: { 'Walka bronia jednoręczna': 9, 'Uniki': 11, 'Strzelectwo': 7 },
    traits: [], armourDR: 3, weapons: ['Hand Weapon', 'Buckler'],
  },
};

// ── Utility Functions ──

/**
 * Apply random ± variance to base attributes at spawn time.
 * szczescie is never modified. All values clamped to [1, 25].
 */
export function applyAttributeVariance(baseAttributes, variance) {
  const attrs = { ...baseAttributes };
  const keys = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc'];
  for (const key of keys) {
    const delta = Math.floor(Math.random() * (variance * 2 + 1)) - variance;
    attrs[key] = Math.max(1, Math.min(25, attrs[key] + delta));
  }
  return attrs;
}

/**
 * Select a group of enemies from the bestiary using the encounter budget system.
 *
 * @param {object} params
 * @param {string}  [params.location]      - Filter by location (from BESTIARY_LOCATIONS)
 * @param {number}  [params.budget=4]      - Total threat point budget
 * @param {string}  [params.maxDifficulty] - Cap on individual unit tier (from BESTIARY_DIFFICULTIES)
 * @param {number}  [params.count=1]       - Target number of enemies
 * @param {string}  [params.race]          - Filter by race (from BESTIARY_RACES)
 * @returns {Array<object>} Array of bestiary entries with name attached
 */
export function selectBestiaryEncounter({ location, budget = 4, maxDifficulty, count = 1, race } = {}) {
  const maxTierIdx = maxDifficulty
    ? BESTIARY_DIFFICULTIES.indexOf(maxDifficulty)
    : BESTIARY_DIFFICULTIES.length - 1;

  // Build filtered pool
  let pool = Object.entries(BESTIARY).filter(([, entry]) => {
    if (location && !entry.locations.includes(location)) return false;
    if (race && entry.race !== race) return false;
    if (BESTIARY_DIFFICULTIES.indexOf(entry.difficulty) > maxTierIdx) return false;
    return true;
  });

  // Fallback: if pool is empty after location filter, drop location
  if (pool.length === 0 && location) {
    pool = Object.entries(BESTIARY).filter(([, entry]) => {
      if (race && entry.race !== race) return false;
      if (BESTIARY_DIFFICULTIES.indexOf(entry.difficulty) > maxTierIdx) return false;
      return true;
    });
  }

  // Fallback: if still empty, use everything up to maxDifficulty
  if (pool.length === 0) {
    pool = Object.entries(BESTIARY).filter(([, entry]) => {
      return BESTIARY_DIFFICULTIES.indexOf(entry.difficulty) <= maxTierIdx;
    });
  }

  // Ultimate fallback
  if (pool.length === 0) {
    pool = Object.entries(BESTIARY);
  }

  // Sort pool by threat cost descending for greedy fill
  pool.sort(([, a], [, b]) => {
    return (THREAT_COSTS[b.difficulty] || 1) - (THREAT_COSTS[a.difficulty] || 1);
  });

  const selected = [];
  let remainingBudget = budget;

  for (let i = 0; i < count && remainingBudget > 0; i++) {
    // Find entries that fit in remaining budget
    const affordable = pool.filter(([, entry]) => (THREAT_COSTS[entry.difficulty] || 1) <= remainingBudget);
    if (affordable.length === 0) break;

    // For first slot prefer expensive (boss), for later slots pick randomly
    let pick;
    if (i === 0 && affordable.length > 1) {
      // Pick from the most expensive tier available
      const maxCost = THREAT_COSTS[affordable[0][1].difficulty] || 1;
      const topTier = affordable.filter(([, e]) => (THREAT_COSTS[e.difficulty] || 1) === maxCost);
      pick = topTier[Math.floor(Math.random() * topTier.length)];
    } else {
      pick = affordable[Math.floor(Math.random() * affordable.length)];
    }

    const [name, entry] = pick;
    const variance = entry.variance ?? DIFFICULTY_VARIANCE[entry.difficulty] ?? 1;
    selected.push({
      ...entry,
      name,
      attributes: applyAttributeVariance(entry.attributes, variance),
      wounds: entry.maxWounds,
    });
    remainingBudget -= THREAT_COSTS[entry.difficulty] || 1;
  }

  // Guarantee at least 1 enemy
  if (selected.length === 0 && pool.length > 0) {
    const [name, entry] = pool[pool.length - 1]; // cheapest
    const variance = entry.variance ?? DIFFICULTY_VARIANCE[entry.difficulty] ?? 1;
    selected.push({
      ...entry,
      name,
      attributes: applyAttributeVariance(entry.attributes, variance),
      wounds: entry.maxWounds,
    });
  }

  return selected;
}

/**
 * Generate a summary of bestiary entries grouped by location, for AI prompts.
 * Returns a formatted string showing typical encounters per location.
 */
export function getBestiaryLocationSummary() {
  const byLocation = {};
  for (const [name, entry] of Object.entries(BESTIARY)) {
    for (const loc of entry.locations) {
      if (!byLocation[loc]) byLocation[loc] = [];
      byLocation[loc].push(`${name} [${entry.difficulty}, ${entry.race}]`);
    }
  }
  return Object.entries(byLocation)
    .map(([loc, entries]) => `${loc}: ${entries.join(', ')}`)
    .join('\n');
}

/**
 * Find the closest bestiary entry for an enemy name.
 * Returns the raw bestiary object (with .name attached) or null.
 * Matching order: exact name → partial name → fallback to 'Bandyta'.
 */
export function findClosestBestiaryEntry(enemyName) {
  if (!enemyName) return null;
  const q = enemyName.toLowerCase();
  const entries = Object.entries(BESTIARY);

  for (const [name, entry] of entries) {
    if (name.toLowerCase() === q) return { ...entry, name };
  }
  for (const [name, entry] of entries) {
    const bName = name.toLowerCase();
    if (q.includes(bName) || bName.includes(q)) return { ...entry, name };
  }
  if (BESTIARY['Bandyta']) return { ...BESTIARY['Bandyta'], name: 'Bandyta' };
  return null;
}

/**
 * Search bestiary entries matching a query (name, traits, race, or difficulty).
 * Returns a formatted string for AI context, or null if no matches.
 */
export function searchBestiary(query) {
  const q = query.toLowerCase();
  const matches = Object.entries(BESTIARY).filter(([name, entry]) => {
    return name.toLowerCase().includes(q)
      || (entry.traits || []).some(t => t.toLowerCase().includes(q))
      || entry.race.toLowerCase().includes(q)
      || q.includes(entry.difficulty);
  });
  if (matches.length === 0) return null;
  return matches.map(([name, e]) => {
    const a = e.attributes;
    const attrs = `S:${a.sila} I:${a.inteligencja} Ch:${a.charyzma} Z:${a.zrecznosc} W:${a.wytrzymalosc}`;
    const skills = Object.entries(e.skills || {}).map(([s, v]) => `${s}+${v}`).join(', ') || 'brak';
    return `${name} [${e.difficulty}, ${e.race}]
  Atrybuty: ${attrs} | HP: ${e.maxWounds} | DR: ${e.armourDR}
  Broń: ${(e.weapons || ['Hand Weapon']).join(', ')}
  Umiejętności: ${skills}
  Cechy: ${(e.traits || []).join(', ') || 'brak'}
  Lokacje: ${e.locations.join(', ')}`;
  }).join('\n\n');
}
