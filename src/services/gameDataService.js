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

  get alchemyRecipes() {
    return _equipmentData?.alchemy || [];
  },

  get materials() {
    return _equipmentData?.materials || [];
  },

  get materialArchetypes() {
    return _equipmentData?.materialArchetypes || {};
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

  /**
   * Map AI-generated starting inventory items to real catalog baseTypes.
   * The AI invents flavor names like "Miecz Akademicki" — we keep that name
   * but resolve a baseType from EQUIPMENT so combat/equip slots/stats work.
   * Matching: type → category, then keyword scan over Polish + English names.
   * Falls back to the cheapest entry in the category.
   */
  mapStartingInventoryToCatalog(aiInventory) {
    if (!Array.isArray(aiInventory) || aiInventory.length === 0) return [];
    const equipment = this.equipment;
    if (!equipment || Object.keys(equipment).length === 0) return aiInventory;

    const TYPE_TO_CATEGORY = {
      weapon: 'weapons',
      weapons: 'weapons',
      armour: 'armour',
      armor: 'armour',
      shield: 'shields',
      shields: 'shields',
      gear: 'adventuring_gear',
      tool: 'tools',
      tools: 'tools',
      medical: 'medical',
      clothing: 'clothing',
    };

    // [regex, baseTypeId] — first match wins. Polish + English keywords.
    const KEYWORD_HINTS = {
      weapons: [
        [/sztylet|dagger|n[oó]ż|knife/i, 'dagger'],
        [/rapier|szpad/i, 'rapier'],
        [/ha?lab?ard|halberd/i, 'halberd'],
        [/(top[oó]r|axe)\s*(boj|battle|wojen)|battle\s*axe|topór\s*bojowy/i, 'battle_axe'],
        [/(m[lł]ot|hammer)\s*(boj|war|wojen)|war\s*hammer/i, 'war_hammer'],
        [/great\s*weapon|dwur[eę]czn|two[-\s]?hand|zwei|claymore|bastard/i, 'great_weapon'],
        [/(miecz|m[ie]cz|sword|szabl|sabre|saber|scimitar|topór|topor|axe|maczug|bu[lł]aw|mace)/i, 'hand_weapon'],
        [/w[lł][oó]czn|spear|pike|javelin|oszczep/i, 'spear'],
        [/quarterstaff|kij\s*boj|kostur|staff/i, 'quarterstaff'],
        [/pa[lł]k|club|cudgel/i, 'club'],
        [/longbow|d[lł]ugi\s*[lł]uk/i, 'longbow'],
        [/short\s*bow|kr[oó]tki\s*[lł]uk|[lł]uk\s*kr[oó]t/i, 'short_bow'],
        [/[lł]uk|bow/i, 'short_bow'],
        [/light\s*crossbow|lekka\s*kusza/i, 'light_crossbow'],
        [/kusza|crossbow|arbalest/i, 'crossbow'],
        [/proca|sling/i, 'sling'],
        [/pistolet|pistol|handgun/i, 'blackpowder_pistol'],
        [/muszkiet|musket|arquebus/i, 'blackpowder_musket'],
      ],
      armour: [
        [/full\s*plate|pe[lł]n[ay]\s*p[lł]yt|harness/i, 'plate_suit'],
        [/breast\s*plate|napier[sś]nik|kira[sś]/i, 'breastplate'],
        [/mail\s*coat|d[lł]ug[ai]\s*kolcz/i, 'mail_coat'],
        [/mail|kolcz|chain/i, 'mail_shirt'],
        [/gambeson|przeszywanic|aketon/i, 'gambeson'],
        [/leather\s*jerkin|kub?rak\s*sk[oó]r|sk[oó]r\w*\s*kub?rak|kub?rak/i, 'leather_jerkin'],
        [/leather|sk[oó]rz/i, 'leather_jack'],
        [/p[lł]yt|plate/i, 'plate_suit'],
      ],
      shields: [
        [/buckler|puklerz/i, 'buckler'],
        [/tower|wie[zż]|pavise|pawęż/i, 'tower_shield'],
        [/shield|tarcz/i, 'shield'],
      ],
    };

    const priceCp = (p) => ((p?.gold || 0) * 100) + ((p?.silver || 0) * 10) + (p?.copper || 0);

    const candidatesByCategory = (category) =>
      Object.entries(equipment)
        .filter(([, def]) => def.category === category)
        .map(([id, def]) => ({ id, ...def }));

    return aiInventory.map((item) => {
      if (!item || typeof item !== 'object') return item;
      if (item.baseType && equipment[item.baseType]) return item; // already valid

      const typeKey = String(item.type || '').toLowerCase();
      const targetCategory = TYPE_TO_CATEGORY[typeKey];
      if (!targetCategory) return item; // unknown type — keep as flavor

      const candidates = candidatesByCategory(targetCategory);
      if (candidates.length === 0) return item;

      const haystack = `${item.name || ''} ${item.description || ''}`.toLowerCase();
      const hints = KEYWORD_HINTS[targetCategory] || [];

      let matchId = null;
      for (const [pattern, baseTypeId] of hints) {
        if (pattern.test(haystack) && equipment[baseTypeId]) {
          matchId = baseTypeId;
          break;
        }
      }

      if (!matchId) {
        // Fallback: cheapest non-ammunition entry in the category.
        const sorted = candidates
          .filter(c => !(c.properties || []).includes('Ammunition'))
          .sort((a, b) => priceCp(a.price) - priceCp(b.price));
        matchId = sorted[0]?.id || candidates[0].id;
      }

      const catalogEntry = equipment[matchId];
      return {
        ...item,
        baseType: matchId,
        rarity: item.rarity || 'common',
        // Surface combat-relevant properties so UI can show stats immediately.
        properties: catalogEntry?.properties || item.properties || [],
        weight: catalogEntry?.weight ?? item.weight ?? 0,
      };
    });
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
