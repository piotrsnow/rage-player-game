import { apiClient } from './apiClient';

/**
 * Frontend cache for game data fetched from backend.
 * Loaded once on app startup, used by combatEngine, prompts, components.
 */

let _combatData = null;
let _bestiaryData = null;
let _loading = null;

export const gameData = {
  /** Fetch combat data (weapons, armour, manoeuvres, hitLocations, constants) */
  async loadCombat() {
    if (_combatData) return _combatData;
    if (_loading) return _loading;
    _loading = apiClient.get('/game-data/combat').then((data) => {
      _combatData = data;
      _loading = null;
      return data;
    }).catch((err) => {
      _loading = null;
      console.error('[gameData] Failed to load combat data:', err.message);
      throw err;
    });
    return _loading;
  },

  /** Fetch bestiary data */
  async loadBestiary() {
    if (_bestiaryData) return _bestiaryData;
    const data = await apiClient.get('/game-data/bestiary');
    _bestiaryData = data;
    return data;
  },

  /** Load all game data at once */
  async loadAll() {
    await Promise.all([this.loadCombat(), this.loadBestiary()]);
  },

  // ── Synchronous accessors (return cached data, throw if not loaded) ──

  get weapons() {
    return _combatData?.weapons || {};
  },

  get armour() {
    return _combatData?.armour || {};
  },

  get manoeuvres() {
    return _combatData?.manoeuvres || {};
  },

  get hitLocations() {
    return _combatData?.hitLocations || [];
  },

  get MELEE_RANGE() {
    return _combatData?.constants?.MELEE_RANGE ?? 2;
  },

  get BATTLEFIELD_MAX() {
    return _combatData?.constants?.BATTLEFIELD_MAX ?? 20;
  },

  get DEFAULT_MOVEMENT() {
    return _combatData?.constants?.DEFAULT_MOVEMENT ?? 4;
  },

  get bestiary() {
    return _bestiaryData?.bestiary || {};
  },

  get isLoaded() {
    return !!_combatData;
  },

  // ── Helper functions (same interface as old wfrpCombat.js) ──

  getHitLocation(roll) {
    const reversed = parseInt(roll.toString().split('').reverse().join(''), 10) || roll;
    const locRoll = ((reversed - 1) % 100) + 1;
    for (const entry of this.hitLocations) {
      if (locRoll >= entry.range[0] && locRoll <= entry.range[1]) {
        return entry.location;
      }
    }
    return 'body';
  },

  getWeaponData(weaponName) {
    return this.weapons[weaponName] || this.weapons['Hand Weapon'] || { damage: '+SB', qualities: [], group: 'Melee (Basic)', twoHanded: false };
  },

  getArmourAP(armourItems, location) {
    let total = 0;
    for (const itemName of armourItems) {
      const armourPiece = this.armour[itemName];
      if (armourPiece && armourPiece.locations[location]) {
        total += armourPiece.locations[location];
      }
    }
    return total;
  },

  getBestiaryEntry(name) {
    return this.bestiary[name] || null;
  },

  getBestiaryByType(type) {
    return Object.values(this.bestiary).filter((b) => b.type === type);
  },

  getBestiaryByThreat(threat) {
    return Object.values(this.bestiary).filter((b) => b.threat === threat);
  },

  getRandomEnemy(threat = null) {
    const pool = threat
      ? Object.values(this.bestiary).filter((b) => b.threat === threat)
      : Object.values(this.bestiary);
    return pool[Math.floor(Math.random() * pool.length)] || null;
  },

  formatBestiaryForPrompt(entries) {
    return entries.map((e) => {
      const chars = Object.entries(e.characteristics)
        .map(([k, v]) => `${k.toUpperCase()}:${v}`)
        .join(' ');
      return `- ${e.name || 'Unknown'} (${e.type || '?'}, ${e.threat || '?'}): ${chars}, W:${e.maxWounds}, Skills: ${Object.entries(e.skills || {}).map(([s, v]) => `${s}:${v}`).join(', ') || 'none'}, Traits: ${(e.traits || []).join(', ') || 'none'}`;
    }).join('\n');
  },
};
