import { SKILL_CAPS, xpForSkillLevel } from '../../../data/rpgSystem';
import { calculateMaxWounds, normalizeMoney } from '../../../services/gameState';
import { stackMaterials } from '../_shared';

/**
 * All direct character-sheet mutations — wounds, status, mana, attributes,
 * skill progression, spell book, inventory, money, statuses. Kept together so
 * the one character write-through runs in a single pass before any world
 * logic that depends on post-character state (e.g. kb auto-populate).
 */
export function applyCharacterMutations(draft, changes) {
  applyVitals(draft, changes);
  applyAttributes(draft, changes);
  applySkillProgress(draft, changes);
  applySpellBook(draft, changes);
  applyInventoryAndMaterials(draft, changes);
  applyRemovals(draft, changes);
  applyMoneyChange(draft, changes);
  applyStatuses(draft, changes);
}

function applyVitals(draft, changes) {
  // NOTE: changes.xp is intentionally ignored on the FE. Character XP is
  // authoritative on the backend and arrives via RECONCILE_CHARACTER_FROM_BACKEND.
  // Scene messages still read changes.xp to display "+X XP" toasts, but the
  // character state itself is not mutated here.
  if (changes.woundsChange !== undefined && draft.character) {
    const newWounds = Math.max(0, Math.min(draft.character.maxWounds, draft.character.wounds + changes.woundsChange));
    draft.character.wounds = newWounds;
    if (newWounds === 0 && changes.woundsChange < 0) {
      draft.character.status = 'dead';
    }
  }

  if (changes.forceStatus && draft.character) {
    draft.character.status = changes.forceStatus;
  }

  if (changes.manaChange !== undefined && draft.character) {
    if (!draft.character.mana) draft.character.mana = { current: 0, max: 0 };
    const mana = draft.character.mana;
    mana.current = Math.max(0, Math.min(mana.max, mana.current + changes.manaChange));
  }

  if (changes.manaMaxChange !== undefined && draft.character) {
    if (!draft.character.mana) draft.character.mana = { current: 0, max: 0 };
    draft.character.mana.max = Math.max(0, draft.character.mana.max + changes.manaMaxChange);
  }
}

function applyAttributes(draft, changes) {
  if (!changes.attributeChanges || !draft.character) return;
  for (const [key, amount] of Object.entries(changes.attributeChanges)) {
    draft.character.attributes[key] = Math.max(1, (draft.character.attributes[key] || 0) + amount);
  }
  const newMaxWounds = calculateMaxWounds(draft.character.attributes.wytrzymalosc);
  draft.character.maxWounds = newMaxWounds;
  draft.character.wounds = Math.min(draft.character.wounds, newMaxWounds);
}

// Skill xp/level is applied locally so the UI can show the progress bar
// during the brief window before RECONCILE_CHARACTER_FROM_BACKEND overwrites
// the whole character. Char XP cascade happens on BE and arrives via RECONCILE.
function applySkillProgress(draft, changes) {
  if (!changes.skillProgress || !draft.character) return;
  for (const [skillName, xpGain] of Object.entries(changes.skillProgress)) {
    if (!draft.character.skills[skillName]) {
      draft.character.skills[skillName] = { level: 0, xp: 0, cap: SKILL_CAPS.basic };
    }
    const skill = draft.character.skills[skillName];
    skill.xp = (skill.xp ?? skill.progress ?? 0) + xpGain;

    while (skill.level < skill.cap) {
      const needed = xpForSkillLevel(skill.level + 1);
      if (needed <= 0 || skill.xp < needed) break;
      skill.xp -= needed;
      skill.level += 1;
    }
  }
}

function applySpellBook(draft, changes) {
  if (!draft.character) return;
  const ensureSpells = () => {
    if (!draft.character.spells) draft.character.spells = { known: [], usageCounts: {}, scrolls: [] };
  };

  if (changes.spellUsage) {
    ensureSpells();
    if (!draft.character.spells.usageCounts) draft.character.spells.usageCounts = {};
    for (const [spellName, uses] of Object.entries(changes.spellUsage)) {
      draft.character.spells.usageCounts[spellName] = (draft.character.spells.usageCounts[spellName] || 0) + uses;
    }
  }

  if (changes.learnSpell) {
    ensureSpells();
    if (!draft.character.spells.known.includes(changes.learnSpell)) {
      draft.character.spells.known.push(changes.learnSpell);
    }
  }

  if (changes.consumeScroll) {
    ensureSpells();
    draft.character.spells.scrolls = draft.character.spells.scrolls.filter((s) => s !== changes.consumeScroll);
  }

  if (changes.addScroll) {
    ensureSpells();
    draft.character.spells.scrolls.push(changes.addScroll);
  }
}

function applyInventoryAndMaterials(draft, changes) {
  if (!draft.character) return;

  if (changes.newItems) {
    const regularItems = [];
    const materialItems = [];
    for (const item of changes.newItems) {
      if (item.type === 'material') materialItems.push(item);
      else regularItems.push(item);
    }
    if (regularItems.length > 0) {
      if (!draft.character.inventory) draft.character.inventory = [];
      draft.character.inventory.push(...regularItems);
    }
    if (materialItems.length > 0) {
      draft.character.materialBag = stackMaterials(draft.character.materialBag || [], materialItems);
    }
  }

  if (changes.newMaterials) {
    draft.character.materialBag = stackMaterials(draft.character.materialBag || [], changes.newMaterials);
  }
}

// Remove items by id (AI echoes inventory ids) AND by name+quantity (crafting,
// alchemy, ritual consumption). Name removal checks the materialBag first,
// then inventory — most consumables are in the bag.
function applyRemovals(draft, changes) {
  if (!draft.character) return;

  if (changes.removeItems && draft.character.inventory) {
    draft.character.inventory = draft.character.inventory.filter(
      (i) => !changes.removeItems.includes(i.id),
    );
  }

  if (changes.removeItemsByName) {
    const removeFromArray = (arr, name, remaining) => {
      const lower = name.toLowerCase();
      const out = [];
      for (const item of arr) {
        if (remaining <= 0 || (item.name || '').toLowerCase() !== lower) {
          out.push(item);
          continue;
        }
        const qty = item.quantity || 1;
        if (qty <= remaining) {
          remaining -= qty;
        } else {
          out.push({ ...item, quantity: qty - remaining });
          remaining = 0;
        }
      }
      return { out, remaining };
    };

    for (const { name, quantity } of changes.removeItemsByName) {
      let remaining = quantity;
      const bagResult = removeFromArray(draft.character.materialBag || [], name, remaining);
      draft.character.materialBag = bagResult.out;
      remaining = bagResult.remaining;
      if (remaining > 0) {
        const invResult = removeFromArray(draft.character.inventory || [], name, remaining);
        draft.character.inventory = invResult.out;
      }
    }
  }
}

function applyMoneyChange(draft, changes) {
  if (!changes.moneyChange || !draft.character) return;
  const cur = draft.character.money || { gold: 0, silver: 0, copper: 0 };
  draft.character.money = normalizeMoney({
    gold: (cur.gold || 0) + (changes.moneyChange.gold || 0),
    silver: (cur.silver || 0) + (changes.moneyChange.silver || 0),
    copper: (cur.copper || 0) + (changes.moneyChange.copper || 0),
  });
}

function applyStatuses(draft, changes) {
  if (changes.statuses && draft.character) {
    draft.character.statuses = changes.statuses;
  }
}
