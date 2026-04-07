// RPGon — Magic Engine
// Spell trees, mana costs, scroll mechanics, progression

import {
  SPELL_TREES, SCROLL_BASE_CHANCE,
  findSpell, isSpellUnlocked, getAvailableSpells as getAvailable,
} from '../data/rpgMagic.js';
import { rollPercentage } from './gameState.js';

/**
 * Cast a known spell. Checks mana, deducts cost, tracks usage.
 * @returns {{ success, manaCost, spellUsage, manaChange, error }}
 */
export function castSpell(character, spellName) {
  if (!character) return { success: false, error: 'No character' };

  const found = findSpell(spellName);
  if (!found) return { success: false, error: `Zaklecie "${spellName}" nie istnieje` };

  const { spell, treeId } = found;
  const spells = character.spells || { known: [], usageCounts: {}, scrolls: [] };

  // Check if spell is known
  if (!spells.known.includes(spellName)) {
    return { success: false, error: `Nie znasz zaklecia "${spellName}"` };
  }

  // Check mana
  const mana = character.mana || { current: 0, max: 0 };
  if (mana.current < spell.manaCost) {
    return { success: false, error: `Za malo many (${mana.current}/${spell.manaCost})` };
  }

  return {
    success: true,
    spellName,
    treeId,
    manaCost: spell.manaCost,
    manaChange: -spell.manaCost,
    spellUsage: { [spellName]: 1 },
    description: spell.description,
  };
}

/**
 * Attempt to learn a spell from a scroll.
 * Base chance: 25% + Intelligence bonus (1% per point).
 * @returns {{ success, learned, consumed, roll, chance, error }}
 */
export function learnFromScroll(character, scrollSpellName) {
  if (!character) return { success: false, error: 'No character' };

  const found = findSpell(scrollSpellName);
  if (!found) return { success: false, error: `Zaklecie "${scrollSpellName}" nie istnieje` };

  const spells = character.spells || { known: [], usageCounts: {}, scrolls: [] };

  if (!spells.scrolls.includes(scrollSpellName)) {
    return { success: false, error: `Nie masz scrolla "${scrollSpellName}"` };
  }

  if (spells.known.includes(scrollSpellName)) {
    return { success: false, error: `Juz znasz "${scrollSpellName}"` };
  }

  const intelligence = character.attributes?.inteligencja || 10;
  const chance = Math.min(95, SCROLL_BASE_CHANCE * 100 + intelligence);

  const roll = rollPercentage();
  const learned = roll <= chance;

  return {
    success: true,
    learned,
    consumed: true,
    consumeScroll: scrollSpellName,
    learnSpell: learned ? scrollSpellName : null,
    roll,
    chance,
  };
}

/**
 * Use a scroll for a one-shot spell cast (without learning it).
 */
export function useScrollOneShot(character, scrollSpellName) {
  if (!character) return { success: false, error: 'No character' };

  const found = findSpell(scrollSpellName);
  if (!found) return { success: false, error: `Zaklecie "${scrollSpellName}" nie istnieje` };

  const spells = character.spells || { known: [], usageCounts: {}, scrolls: [] };
  if (!spells.scrolls.includes(scrollSpellName)) {
    return { success: false, error: `Nie masz scrolla "${scrollSpellName}"` };
  }

  return {
    success: true,
    spellName: scrollSpellName,
    treeId: found.treeId,
    manaCost: 0,
    consumeScroll: scrollSpellName,
    description: found.spell.description,
  };
}

/**
 * Get all available (unlocked) spells for a character.
 */
export function getAvailableSpells(character) {
  if (!character?.spells) return [];
  const { known = [], usageCounts = {} } = character.spells;

  const knownTrees = new Set();
  for (const spellName of known) {
    const found = findSpell(spellName);
    if (found) knownTrees.add(found.treeId);
  }

  return getAvailable([...knownTrees], usageCounts);
}

/**
 * Check spell progression — which spells are close to being unlocked.
 */
export function getSpellProgressionStatus(character) {
  if (!character?.spells) return [];
  const { known = [], usageCounts = {} } = character.spells;

  const statuses = [];
  const knownTrees = new Set();
  for (const spellName of known) {
    const found = findSpell(spellName);
    if (found) knownTrees.add(found.treeId);
  }

  for (const treeId of knownTrees) {
    const tree = SPELL_TREES[treeId];
    if (!tree) continue;

    for (const spell of tree.spells) {
      if (known.includes(spell.name)) continue;
      if (!spell.unlockCondition) continue;

      const uses = usageCounts[spell.unlockCondition] || 0;
      const needed = spell.unlockUses;
      const unlocked = isSpellUnlocked(spell.name, usageCounts);

      statuses.push({
        treeId,
        treeName: tree.name,
        spellName: spell.name,
        level: spell.level,
        manaCost: spell.manaCost,
        prerequisite: spell.unlockCondition,
        currentUses: uses,
        requiredUses: needed,
        progress: needed > 0 ? Math.min(1, uses / needed) : 1,
        unlocked,
      });
    }
  }

  return statuses;
}

/**
 * Format casting result for narrative prompt.
 */
export function formatCastingResultForPrompt(result) {
  if (!result) return '';
  if (!result.success && result.error) {
    return `Proba rzucenia zaklecia nieudana: ${result.error}`;
  }
  if (result.learned !== undefined) {
    return result.learned
      ? `Nauczono sie zaklecia "${result.learnSpell}" ze scrolla (rzut ${result.roll} <= ${result.chance}%)`
      : `Nie udalo sie nauczyc zaklecia ze scrolla (rzut ${result.roll} > ${result.chance}%). Scroll zuzyty.`;
  }
  return `Rzucono "${result.spellName}" (koszt: ${result.manaCost} many). ${result.description || ''}`;
}

/**
 * Check if character can cast any spells.
 */
export function canCastAnySpell(character) {
  if (!character?.spells?.known?.length) return false;
  const mana = character.mana || { current: 0 };
  return mana.current > 0;
}

/**
 * Format magic status for prompts.
 */
export function formatMagicStatusForPrompt(character) {
  if (!character) return 'Brak zdolnosci magicznych.';
  const mana = character.mana || { current: 0, max: 0 };
  const spells = character.spells || { known: [], usageCounts: {}, scrolls: [] };

  const lines = [`Mana: ${mana.current}/${mana.max}`];

  if (spells.known.length > 0) {
    lines.push('Znane zaklecia:');
    for (const name of spells.known) {
      const found = findSpell(name);
      if (found) {
        const uses = spells.usageCounts[name] || 0;
        lines.push(`  ${name} [${found.spell.manaCost} many, uzycia: ${uses}] — ${found.spell.description}`);
      }
    }
  }

  if (spells.scrolls.length > 0) {
    lines.push(`Scrolle: ${spells.scrolls.join(', ')}`);
  }

  const progression = getSpellProgressionStatus(character);
  const nearUnlock = progression.filter((p) => p.progress >= 0.5 && !p.unlocked);
  if (nearUnlock.length > 0) {
    lines.push('Bliskie odblokowania:');
    for (const p of nearUnlock) {
      lines.push(`  ${p.spellName} (${p.currentUses}/${p.requiredUses} uzyc ${p.prerequisite})`);
    }
  }

  return lines.join('\n');
}
