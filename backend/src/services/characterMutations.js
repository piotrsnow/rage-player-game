/**
 * Backend character mutation helpers.
 *
 * Mirrors the AI-driven character state-change branches from the FE store
 * handler (src/stores/handlers/applyStateChangesHandler/character.js).
 * Operates on the FE-shape snapshot (plain JS object with `skills` map,
 * `inventory` array, `equipped` object, `materialBag` array — same shape
 * the FE store consumes) and returns the mutated snapshot. The caller
 * persists it back to Postgres through `persistCharacterSnapshot` from
 * characterRelations.js, which fans the snapshot back out into the F4
 * child tables (CharacterSkill / CharacterInventoryItem / CharacterMaterial).
 *
 * Used by:
 *   - backend/src/routes/characters.js PATCH /:id/state-changes (manual deltas)
 *   - backend/src/services/sceneGenerator.js processStateChanges (AI scene flow)
 */

import { slugifyItemName } from '../../../shared/domain/itemKeys.js';
import { normalizeSpellMaterialIcon } from '../../../shared/domain/spellMaterialIcons.js';
import { addEffect, removeEffect, removeEffectsByName, migrateStatusStrings, deriveStatusNames } from '../../../shared/domain/statusEffects.js';
import { SKILL_BY_NAME, canonicalizeSkillName } from './diceResolver.js';
import { sanitizeMana } from '../../../shared/domain/mana.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'characterMutations' });

// ── RPGon constants (mirrored from src/data/rpgSystem.js) ──

const SKILL_CAPS = { basic: 15, max: 25 };
const SKILL_XP_CONFIG = { base: 20, multiplier: 1.25 };

function xpForSkillLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(SKILL_XP_CONFIG.base * Math.pow(SKILL_XP_CONFIG.multiplier, level - 2));
}

function charXpFromSkillLevelUp(newLevel) {
  return newLevel * newLevel;
}

function charLevelCost(targetLevel) {
  if (targetLevel <= 1) return 0;
  return 5 * targetLevel * targetLevel;
}

function cumulativeCharXpThreshold(targetLevel) {
  if (targetLevel <= 1) return 0;
  let sum = 0;
  for (let k = 2; k <= targetLevel; k++) sum += charLevelCost(k);
  return sum;
}

function calculateMaxWounds(wytrzymalosc) {
  return wytrzymalosc * 2 + 10;
}

function createDefaultNeeds() {
  return { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 };
}

// ── Money helpers ──

function normalizeMoney(money) {
  let { gold = 0, silver = 0, copper = 0 } = money || {};
  if (copper < 0 || silver < 0 || gold < 0) {
    let totalCopper = gold * 100 + silver * 10 + copper;
    if (totalCopper < 0) totalCopper = 0;
    gold = Math.floor(totalCopper / 100);
    silver = Math.floor((totalCopper % 100) / 10);
    copper = totalCopper % 10;
    return { gold, silver, copper };
  }
  if (copper >= 10) { silver += Math.floor(copper / 10); copper = copper % 10; }
  if (silver >= 10) { gold += Math.floor(silver / 10); silver = silver % 10; }
  return { gold, silver, copper };
}

// ── Material / inventory stacking (F4: name-keyed merge for both) ──

function stackMaterials(bag, newItems) {
  const result = (bag || []).map((m) => ({ ...m }));
  for (const item of newItems) {
    const key = slugifyItemName(item.name);
    const existing = result.find((m) => slugifyItemName(m.name) === key);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
    } else {
      result.push({ name: item.name, quantity: item.quantity || 1 });
    }
  }
  return result;
}

/**
 * Stack regular inventory items by slugify(name). After F4, items are
 * keyed in the DB by itemKey, so the in-memory snapshot must merge by the
 * same rule — otherwise FE would briefly show duplicate rows that the
 * next BE reconcile collapses into one.
 */
function stackInventory(inventory, newItems) {
  const result = (inventory || []).map((it) => ({ ...it, props: it.props ? { ...it.props } : {} }));
  for (const item of newItems) {
    const key = slugifyItemName(item.name);
    const existing = result.find((i) => slugifyItemName(i.name) === key);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
      // Latest write wins for non-quantity props (matches DB stacking).
      const knownColumns = new Set(['id', 'name', 'baseType', 'quantity', 'props', 'imageUrl', 'addedAt']);
      for (const [k, v] of Object.entries(item)) {
        if (!knownColumns.has(k)) existing[k] = v;
        else if (k !== 'id' && k !== 'name' && k !== 'quantity' && v !== undefined) existing[k] = v;
      }
    } else {
      result.push({ ...item, id: key, name: item.name, quantity: item.quantity || 1 });
    }
  }
  return result;
}

// ── Main mutation entry point ──

/**
 * Apply AI/manual state changes to a deserialized character snapshot.
 * Returns a new character object — does NOT mutate the input.
 *
 * @param {object} character - deserialized Character (parsed JSON fields, not raw DB row)
 * @param {object} changes - delta object matching APPLY_STATE_CHANGES payload shape
 * @returns {object} mutated character snapshot
 */
export function applyCharacterStateChanges(character, changes) {
  if (!character || !changes) return character;
  let next = { ...character };

  // ── Wounds ──
  if (changes.woundsChange !== undefined) {
    const newWounds = Math.max(0, Math.min(next.maxWounds || 0, (next.wounds || 0) + changes.woundsChange));
    next.wounds = newWounds;
    if (newWounds === 0 && changes.woundsChange < 0) {
      next.status = 'dead';
    }
  }

  if (changes.forceStatus) {
    next.status = changes.forceStatus;
  }

  // Propagate campaign's current location into the character record so the
  // character picker can tell if this character is in a safe spot to release.
  if (typeof changes.currentLocation === 'string' && changes.currentLocation) {
    next.lockedLocation = changes.currentLocation;
  }

  // ── Character XP / level (raw xp delta) ──
  // Frontend uses changes.xp; sceneGenerator reward branch uses xpDelta as alias.
  // characterXp is a monotonic lifetime total — level-up does not consume it,
  // the cascade compares against cumulativeCharXpThreshold of the next level.
  const xpDelta = changes.xpDelta ?? changes.xp;
  if (xpDelta !== undefined && xpDelta > 0) {
    let charXp = (next.characterXp || 0) + xpDelta;
    let charLevel = next.characterLevel || 1;
    let attrPoints = next.attributePoints || 0;
    while (charXp >= cumulativeCharXpThreshold(charLevel + 1)) {
      charLevel++;
      attrPoints++;
    }
    next.characterXp = charXp;
    next.characterLevel = charLevel;
    next.attributePoints = attrPoints;
  }

  // ── Mana ──
  // Safeguard: gdy upstream przepuści NaN/Infinity/0 jako manaChange, traktuj
  // jako zepsutą próbę regeneracji i normalizuj do +1. Wartości ujemne
  // (legalne koszty zaklęć) zostają nietknięte. Klon `changes` żeby nie
  // mutować wejścia — wywołujący traktują payload jako read-only.
  if (changes.manaChange !== undefined && changes.manaChange !== null) {
    if (!Number.isFinite(changes.manaChange) || changes.manaChange === 0) {
      log.warn(
        { original: changes.manaChange, stateChangeKeys: Object.keys(changes) },
        '[safeguard] manaChange normalized to +1',
      );
      changes = { ...changes, manaChange: 1 };
    }
  }
  if (changes.manaChange !== undefined) {
    const mana = { ...(next.mana || { current: 0, max: 0 }) };
    mana.current = Math.max(0, Math.min(mana.max || 0, (mana.current || 0) + changes.manaChange));
    next.mana = mana;
  }
  if (changes.manaMaxChange !== undefined) {
    const mana = { ...(next.mana || { current: 0, max: 0 }) };
    mana.max = Math.max(0, (mana.max || 0) + changes.manaMaxChange);
    next.mana = mana;
  }

  // ── Attributes (advancement) ──
  if (changes.attributeChanges) {
    const attrs = { ...(next.attributes || {}) };
    for (const [key, amount] of Object.entries(changes.attributeChanges)) {
      attrs[key] = Math.max(1, (attrs[key] || 0) + amount);
    }
    const newMaxWounds = calculateMaxWounds(attrs.wytrzymalosc || 10) + (next.bonusMaxWounds || 0);
    next.attributes = attrs;
    next.maxWounds = newMaxWounds;
    next.wounds = Math.min(next.wounds || 0, newMaxWounds);
  }

  // ── Skills (XP gain → level up cascade → character XP cascade) ──
  if (changes.skillProgress) {
    const skills = { ...(next.skills || {}) };
    let charXpGained = 0;
    const skillGains = [];
    const newBadges = [];

    for (const [rawSkillName, xpGain] of Object.entries(changes.skillProgress)) {
      const skillName = canonicalizeSkillName(rawSkillName) || rawSkillName;
      if (!SKILL_BY_NAME[skillName]) {
        newBadges.push({ name: rawSkillName, earnedAt: new Date().toISOString(), redeemed: false });
        continue;
      }
      const current = skills[skillName] || { level: 0, xp: 0, cap: SKILL_CAPS.basic };
      const oldLevel = current.level || 0;
      let newXp = (current.xp ?? current.progress ?? 0) + xpGain;
      let newLevel = oldLevel;
      const cap = current.cap || SKILL_CAPS.basic;

      while (newLevel < cap) {
        const needed = xpForSkillLevel(newLevel + 1);
        if (needed <= 0 || newXp < needed) break;
        newXp -= needed;
        newLevel++;
        charXpGained += charXpFromSkillLevelUp(newLevel);
      }

      skills[skillName] = { ...current, level: newLevel, xp: newXp, cap };
      skillGains.push({ skillName, xpGained: xpGain, oldLevel, newLevel });
    }

    next.skills = skills;
    next._skillGains = skillGains;

    if (charXpGained > 0) {
      let charXp = (next.characterXp || 0) + charXpGained;
      let charLevel = next.characterLevel || 1;
      let attrPoints = next.attributePoints || 0;
      while (charXp >= cumulativeCharXpThreshold(charLevel + 1)) {
        charLevel++;
        attrPoints++;
      }
      next.characterXp = charXp;
      next.characterLevel = charLevel;
      next.attributePoints = attrPoints;
    }

    if (newBadges.length > 0) {
      next.skillBadges = [...(next.skillBadges || []), ...newBadges];
    }
  }

  // ── Skill Badges (unknown skills converted to collectible medals) ──
  if (Array.isArray(changes.skillBadges) && changes.skillBadges.length > 0) {
    next.skillBadges = [...(next.skillBadges || []), ...changes.skillBadges];
  }

  // ── Spells ──
  if (changes.spellUsage) {
    const spells = { ...(next.spells || { known: [], usageCounts: {}, scrolls: [] }) };
    const counts = { ...(spells.usageCounts || {}) };
    for (const [spellName, uses] of Object.entries(changes.spellUsage)) {
      counts[spellName] = (counts[spellName] || 0) + uses;
    }
    next.spells = { ...spells, usageCounts: counts };
  }
  if (changes.learnSpell) {
    const spells = { ...(next.spells || { known: [], usageCounts: {}, scrolls: [] }) };
    if (!(spells.known || []).includes(changes.learnSpell)) {
      spells.known = [...(spells.known || []), changes.learnSpell];
    }
    if (changes.learnSpellIcon) {
      const icon = normalizeSpellMaterialIcon(changes.learnSpellIcon);
      if (icon) {
        spells.icons = { ...(spells.icons || {}), [changes.learnSpell]: icon };
      }
    }
    if (changes.learnSpellSchool) {
      spells.schools = { ...(spells.schools || {}), [changes.learnSpell]: changes.learnSpellSchool };
    }
    next.spells = spells;
  }
  if (changes.consumeScroll) {
    const spells = { ...(next.spells || { known: [], usageCounts: {}, scrolls: [] }) };
    spells.scrolls = (spells.scrolls || []).filter((s) => s !== changes.consumeScroll);
    next.spells = spells;
  }
  if (changes.addScroll) {
    const spells = { ...(next.spells || { known: [], usageCounts: {}, scrolls: [] }) };
    spells.scrolls = [...(spells.scrolls || []), changes.addScroll];
    next.spells = spells;
  }

  // ── Inventory: items + materials (F4: both stack by slugify(name)) ──
  if (changes.newItems) {
    const regularItems = [];
    const materialItems = [];
    for (const item of changes.newItems) {
      if (item?.type === 'material') materialItems.push(item);
      else regularItems.push(item);
    }
    if (regularItems.length > 0) {
      next.inventory = stackInventory(next.inventory || [], regularItems);
    }
    if (materialItems.length > 0) {
      next.materialBag = stackMaterials(next.materialBag || [], materialItems);
    }
  }

  if (changes.newMaterials) {
    next.materialBag = stackMaterials(next.materialBag || [], changes.newMaterials);
  }

  if (changes.removeItems) {
    next.inventory = (next.inventory || []).filter((i) => !changes.removeItems.includes(i.id));
  }

  if (changes.removeItemsByName) {
    let bag = [...(next.materialBag || [])];
    let inv = [...(next.inventory || [])];
    for (const { name, quantity } of changes.removeItemsByName) {
      let toRemove = quantity;
      const key = slugifyItemName(name);

      bag = bag.reduce((acc, item) => {
        if (toRemove <= 0 || slugifyItemName(item.name) !== key) {
          acc.push(item);
          return acc;
        }
        const qty = item.quantity || 1;
        if (qty <= toRemove) toRemove -= qty;
        else { acc.push({ ...item, quantity: qty - toRemove }); toRemove = 0; }
        return acc;
      }, []);

      if (toRemove > 0) {
        inv = inv.reduce((acc, item) => {
          if (toRemove <= 0 || slugifyItemName(item.name) !== key) {
            acc.push(item);
            return acc;
          }
          const qty = item.quantity || 1;
          if (qty <= toRemove) toRemove -= qty;
          else { acc.push({ ...item, quantity: qty - toRemove }); toRemove = 0; }
          return acc;
        }, []);
      }
    }
    next.materialBag = bag;
    next.inventory = inv;
  }

  // ── Money ──
  if (changes.moneyChange) {
    const cur = next.money || { gold: 0, silver: 0, copper: 0 };
    next.money = normalizeMoney({
      gold: (cur.gold || 0) + (changes.moneyChange.gold || 0),
      silver: (cur.silver || 0) + (changes.moneyChange.silver || 0),
      copper: (cur.copper || 0) + (changes.moneyChange.copper || 0),
    });
  }

  // ── Active Effects (structured) ──
  if (Array.isArray(changes.characterEffects) && changes.characterEffects.length > 0) {
    let effects = [...(next.activeEffects || [])];
    for (const cmd of changes.characterEffects) {
      if (cmd.action === 'add' && cmd.effect) {
        effects = addEffect(effects, cmd.effect);
      } else if (cmd.action === 'remove' && cmd.effectId) {
        effects = removeEffect(effects, cmd.effectId);
      } else if (cmd.action === 'remove' && cmd.name) {
        effects = removeEffectsByName(effects, cmd.name);
      }
    }
    next.activeEffects = effects;
    next.statuses = deriveStatusNames(effects);
  }

  // ── Statuses (legacy replace — backward compat) ──
  if (changes.statuses && !changes.characterEffects) {
    if (Array.isArray(changes.statuses) && changes.statuses.every((s) => typeof s === 'string')) {
      next.activeEffects = migrateStatusStrings(changes.statuses);
      next.statuses = changes.statuses;
    } else {
      next.statuses = changes.statuses;
    }
  }

  // ── Needs (deltas, clamped 0..100) ──
  if (changes.needsChanges) {
    const needs = { ...(next.needs || createDefaultNeeds()) };
    for (const [key, delta] of Object.entries(changes.needsChanges)) {
      if (key in needs) {
        needs[key] = Math.max(0, Math.min(100, (needs[key] ?? 100) + delta));
      }
    }
    next.needs = needs;
  }

  // ── Equipment slot changes ──
  if (changes.equipChange) {
    const equipped = { ...(next.equipped || { mainHand: null, offHand: null, armour: null }) };
    for (const slot of ['mainHand', 'offHand', 'armour']) {
      if (slot in changes.equipChange) equipped[slot] = changes.equipChange[slot];
    }
    next.equipped = equipped;
  }

  if (next.mana) next.mana = sanitizeMana(next.mana);

  return next;
}
