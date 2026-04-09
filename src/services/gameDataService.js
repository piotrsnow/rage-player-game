import { apiClient } from './apiClient';

/**
 * Frontend cache for game data fetched from backend.
 * Loaded once on app startup, used by combatEngine, prompts, components.
 */

let _combatData = null;
let _bestiaryData = null;
let _equipmentData = null;
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

  /** Fetch equipment catalog (shop items, crafting, availability) */
  async loadEquipment() {
    if (_equipmentData) return _equipmentData;
    const data = await apiClient.get('/game-data/equipment');
    _equipmentData = data;
    return data;
  },

  /** Load all game data at once */
  async loadAll() {
    await Promise.all([this.loadCombat(), this.loadBestiary(), this.loadEquipment()]);
  },

  // ── Synchronous accessors (return cached data, throw if not loaded) ──

  get weapons() {
    return _combatData?.weapons || {};
  },

  get armour() {
    return _combatData?.armour || {};
  },

  get shields() {
    return _combatData?.shields || {};
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

  get equipment() {
    return _equipmentData?.equipment || {};
  },

  get equipmentCategories() {
    return _equipmentData?.categories || {};
  },

  get craftingRecipes() {
    return _equipmentData?.crafting || [];
  },

  get availabilityModifiers() {
    return _equipmentData?.availability || {};
  },

  get baseTypeIndex() {
    return _equipmentData?.baseTypeIndex || {};
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

  /**
   * Resolve a baseType ID to full equipment + combat data.
   * Returns the precomputed entry from backend or null.
   */
  resolveBaseType(baseTypeId) {
    if (!baseTypeId) return null;
    return this.baseTypeIndex[baseTypeId] || null;
  },

  /**
   * Get WEAPONS combat stats via baseType → combatKey.
   */
  getWeaponDataByBaseType(baseTypeId) {
    const resolved = this.resolveBaseType(baseTypeId);
    if (!resolved?.combatKey || resolved.combatSource !== 'weapon') return null;
    return this.weapons[resolved.combatKey] || null;
  },

  /**
   * Get ARMOUR stats via baseType → combatKey.
   */
  getArmourDataByBaseType(baseTypeId) {
    const resolved = this.resolveBaseType(baseTypeId);
    if (!resolved?.combatKey || resolved.combatSource !== 'armour') return null;
    return this.armour[resolved.combatKey] || null;
  },

  /**
   * Get SHIELDS stats via baseType → combatKey.
   */
  getShieldDataByBaseType(baseTypeId) {
    const resolved = this.resolveBaseType(baseTypeId);
    if (!resolved?.combatKey || resolved.combatSource !== 'shield') return null;
    return this.shields[resolved.combatKey] || null;
  },

  /**
   * Check if a baseType maps to a weapon with twoHanded flag.
   */
  isTwoHanded(baseTypeId) {
    const weaponData = this.getWeaponDataByBaseType(baseTypeId);
    return weaponData?.twoHanded === true;
  },

  /**
   * Determine what equipment slot(s) an item can go into based on its baseType.
   * Returns: 'weapon' | 'shield' | 'armour' | null
   */
  getEquipSlotType(item) {
    if (!item?.baseType) {
      if (item?.type === 'weapon') return 'weapon';
      if (item?.type === 'armor' || item?.type === 'armour') return 'armour';
      if (item?.type === 'shield') return 'shield';
      return null;
    }
    const resolved = this.resolveBaseType(item.baseType);
    if (!resolved) return null;
    if (resolved.combatSource === 'weapon') return 'weapon';
    if (resolved.combatSource === 'armour') return 'armour';
    if (resolved.combatSource === 'shield') return 'shield';
    return null;
  },

  getBestiaryEntry(name) {
    return this.bestiary[name] || null;
  },

  /**
   * Find the closest bestiary match for an enemy name (fuzzy).
   * Matching: exact → partial name → Bandit fallback.
   * Returns { name, ...stats } or null.
   */
  findClosestBestiaryEntry(enemyName) {
    if (!enemyName) return null;
    const q = enemyName.toLowerCase();
    const entries = Object.entries(this.bestiary);

    // Exact match
    for (const [name, entry] of entries) {
      if (name.toLowerCase() === q) return { ...entry, name };
    }
    // Partial match
    for (const [name, entry] of entries) {
      const bName = name.toLowerCase();
      if (q.includes(bName) || bName.includes(q)) return { ...entry, name };
    }
    // Fallback: Bandit as generic humanoid template
    const bandit = this.bestiary['Bandit'];
    if (bandit) return { ...bandit, name: 'Bandit' };
    return null;
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

  getEquipmentByCategory(category) {
    return Object.entries(this.equipment)
      .filter(([, def]) => def.category === category)
      .map(([id, def]) => ({ id, ...def }));
  },

  formatEquipmentForPrompt(category) {
    const label = this.equipmentCategories[category] ?? category;
    const rows = this.getEquipmentByCategory(category);
    if (!rows.length) return `${label}: (no entries)`;
    const lines = rows.map((e) => {
      const parts = [];
      if (e.price?.gold) parts.push(`${e.price.gold} GC`);
      if (e.price?.silver) parts.push(`${e.price.silver} SS`);
      if (e.price?.copper) parts.push(`${e.price.copper} CP`);
      const priceStr = parts.length ? parts.join(' ') : '0 CP';
      const props = e.properties?.length ? ` [${e.properties.join('; ')}]` : '';
      return `- ${e.name} — ${priceStr}; Enc ${e.weight}; ${e.availability}${props}. ${e.description}`;
    });
    return `${label}:\n${lines.join('\n')}`;
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
