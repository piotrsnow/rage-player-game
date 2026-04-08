import { SKILL_NAMES, STATE_CHANGE_LIMITS } from '../data/rpgSystem';
import { normalizeMultiplayerStateChanges } from '../../shared/contracts/multiplayer.js';
import {
  clamp,
  moneyToCopper,
  sanitizeNpcChanges,
  normalizeItemList,
  coerceItemAliases,
  sanitizeInventoryItems,
  normalizeCodexUpdates,
} from '../../shared/domain/stateValidation.js';

const DEFAULTS = { ...STATE_CHANGE_LIMITS };

const RARITY_GATES = { common: 0, uncommon: 0, rare: 16, exotic: 31 };

export function validateStateChanges(stateChanges, currentState, config = {}) {
  if (!stateChanges || typeof stateChanges !== 'object') {
    return { validated: stateChanges, warnings: [], corrections: [] };
  }

  const limits = { ...DEFAULTS, ...config };
  const warnings = [];
  const corrections = [];
  const validated = { ...stateChanges };
  const character = currentState?.character;
  coerceItemAliases(validated);

  if (validated.xp !== undefined && validated.xp !== null) {
    if (validated.xp > limits.maxXpPerScene) {
      corrections.push(`XP capped from ${validated.xp} to ${limits.maxXpPerScene}`);
      validated.xp = limits.maxXpPerScene;
    }
    if (validated.xp < 0) {
      corrections.push(`Negative XP (${validated.xp}) set to 0`);
      validated.xp = 0;
    }
  }

  if (validated.woundsChange !== undefined && validated.woundsChange !== null && character) {
    const currentWounds = character.wounds ?? 0;
    const maxWounds = character.maxWounds ?? 12;
    const proposed = currentWounds + validated.woundsChange;

    if (proposed < 0) {
      validated.woundsChange = -currentWounds;
      corrections.push(`Wounds clamped to 0 (was proposing ${proposed})`);
    }
    if (proposed > maxWounds) {
      validated.woundsChange = maxWounds - currentWounds;
      corrections.push(`Wounds clamped to max ${maxWounds}`);
    }
    if (Math.abs(validated.woundsChange) > limits.maxWoundsDelta) {
      warnings.push(`Large wounds delta: ${validated.woundsChange}`);
    }
  }

  if (validated.newItems && Array.isArray(validated.newItems)) {
    validated.newItems = normalizeItemList(validated.newItems, corrections);
    if (validated.newItems.length > limits.maxItemsPerScene) {
      warnings.push(`AI proposed ${validated.newItems.length} new items, capped to ${limits.maxItemsPerScene}`);
      validated.newItems = validated.newItems.slice(0, limits.maxItemsPerScene);
      corrections.push(`Items capped to ${limits.maxItemsPerScene}`);
    }
    validated.newItems = sanitizeInventoryItems(validated.newItems, corrections);
  }

  if (validated.moneyChange) {
    const gain = moneyToCopper(validated.moneyChange);
    if (gain > limits.maxMoneyGainCopper) {
      warnings.push(`Large money gain: ${gain} CP (limit: ${limits.maxMoneyGainCopper})`);
    }
    if (character?.money && gain < 0) {
      const currentCopper = moneyToCopper(character.money);
      if (currentCopper + gain < 0) {
        corrections.push(`Money spending clamped: tried ${gain} CP but only have ${currentCopper} CP`);
        validated.moneyChange = {
          gold: -Math.floor(currentCopper / 100),
          silver: -Math.floor((currentCopper % 100) / 10),
          copper: -(currentCopper % 10),
        };
      }
    }
  }

  if (validated.needsChanges && typeof validated.needsChanges === 'object') {
    const validatedNeeds = { ...validated.needsChanges };
    for (const [key, delta] of Object.entries(validatedNeeds)) {
      if (typeof delta !== 'number') continue;
      const clamped = clamp(delta, limits.needsDeltaMin, limits.needsDeltaMax);
      if (clamped !== delta) {
        corrections.push(`Need "${key}" delta clamped from ${delta} to ${clamped}`);
        validatedNeeds[key] = clamped;
      }
    }
    validated.needsChanges = validatedNeeds;
  }

  if (validated.skillProgress && typeof validated.skillProgress === 'object') {
    for (const skillName of Object.keys(validated.skillProgress)) {
      if (!SKILL_NAMES.includes(skillName)) {
        warnings.push(`Unknown skill: "${skillName}"`);
      }
    }
  }

  if (validated.removeItems && Array.isArray(validated.removeItems) && character?.inventory) {
    const inventoryIds = new Set(character.inventory.map((i) => i.id));
    validated.removeItems = validated.removeItems.filter((id) => {
      if (!inventoryIds.has(id)) {
        corrections.push(`Cannot remove item "${id}" — not in inventory`);
        return false;
      }
      return true;
    });
  }

  if (validated.npcs && Array.isArray(validated.npcs)) {
    validated.npcs = sanitizeNpcChanges(validated.npcs, corrections);
    for (const npc of validated.npcs) {
      if (typeof npc.dispositionChange === 'number') {
        const clamped = clamp(npc.dispositionChange, -limits.maxDispositionDelta, limits.maxDispositionDelta);
        if (clamped !== npc.dispositionChange) {
          corrections.push(`NPC "${npc.name}" disposition delta clamped from ${npc.dispositionChange} to ${clamped}`);
          npc.dispositionChange = clamped;
        }
      }
    }
  }

  if (validated.newItems && Array.isArray(validated.newItems)) {
    const sceneCount = currentState?.scenes?.length || 0;
    for (const item of validated.newItems) {
      if (!item || typeof item !== 'object') continue;
      const rarity = (item.rarity || 'common').toLowerCase();
      const minScene = RARITY_GATES[rarity];
      if (minScene !== undefined && sceneCount < minScene) {
        warnings.push(`Item "${item.name}" has rarity "${rarity}" but campaign is only at scene ${sceneCount} (available from scene ${minScene}+)`);
      }
    }
  }

  if (validated.codexUpdates && Array.isArray(validated.codexUpdates)) {
    validated.codexUpdates = normalizeCodexUpdates(validated.codexUpdates, corrections);
    if (validated.codexUpdates.length > limits.maxCodexPerScene) {
      corrections.push(`Codex updates capped from ${validated.codexUpdates.length} to ${limits.maxCodexPerScene}`);
      validated.codexUpdates = validated.codexUpdates.slice(0, limits.maxCodexPerScene);
    }
    for (const update of validated.codexUpdates) {
      if (update.fragment.content.length > limits.maxCodexFragmentLength) {
        update.fragment.content = update.fragment.content.substring(0, limits.maxCodexFragmentLength);
        corrections.push(`Codex fragment for "${update.name}" truncated to ${limits.maxCodexFragmentLength} chars`);
      }
    }
  }

  return { validated, warnings, corrections };
}

export function validateMultiplayerStateChanges(stateChanges, gameState, config = {}) {
  if (!stateChanges || typeof stateChanges !== 'object') {
    return { validated: stateChanges, warnings: [], corrections: [] };
  }

  const limits = { ...DEFAULTS, ...config };
  const allWarnings = [];
  const allCorrections = [];
  const validated = normalizeMultiplayerStateChanges({ ...stateChanges });

  if (validated.perCharacter && typeof validated.perCharacter === 'object') {
    const characters = gameState?.characters || [];
    const validatedPerChar = {};

    for (const [charName, delta] of Object.entries(validated.perCharacter)) {
      const character = characters.find((c) => c.name === charName || c.playerName === charName);
      if (!character) {
        allWarnings.push(`Unknown character in perCharacter: "${charName}"`);
        validatedPerChar[charName] = delta;
        continue;
      }

      const charDelta = { ...delta };

      if (charDelta.xp !== undefined && charDelta.xp > limits.maxXpPerScene) {
        allCorrections.push(`${charName}: XP capped from ${charDelta.xp} to ${limits.maxXpPerScene}`);
        charDelta.xp = limits.maxXpPerScene;
      }

      if (charDelta.wounds !== undefined) {
        const currentWounds = character.wounds ?? 0;
        const maxWounds = character.maxWounds ?? 12;
        const proposed = currentWounds + charDelta.wounds;
        if (proposed < 0) {
          charDelta.wounds = -currentWounds;
          allCorrections.push(`${charName}: wounds clamped to 0`);
        }
        if (proposed > maxWounds) {
          charDelta.wounds = maxWounds - currentWounds;
          allCorrections.push(`${charName}: wounds clamped to max`);
        }
      }

      if (charDelta.newItems && Array.isArray(charDelta.newItems)) {
        charDelta.newItems = normalizeItemList(charDelta.newItems, allCorrections, `${charName}: `);
        if (charDelta.newItems.length > limits.maxItemsPerScene) {
          charDelta.newItems = charDelta.newItems.slice(0, limits.maxItemsPerScene);
          allCorrections.push(`${charName}: items capped to ${limits.maxItemsPerScene}`);
        }
        charDelta.newItems = sanitizeInventoryItems(charDelta.newItems, allCorrections, `${charName}: `);
      }

      if (charDelta.moneyChange) {
        const gain = moneyToCopper(charDelta.moneyChange);
        if (gain > limits.maxMoneyGainCopper) {
          allWarnings.push(`${charName}: large money gain ${gain} CP (limit: ${limits.maxMoneyGainCopper})`);
        }
        if (character.money && gain < 0) {
          const currentCopper = moneyToCopper(character.money);
          if (currentCopper + gain < 0) {
            allCorrections.push(`${charName}: money spending clamped — tried ${Math.abs(gain)} CP but only has ${currentCopper} CP`);
            charDelta.moneyChange = {
              gold: -Math.floor(currentCopper / 100),
              silver: -Math.floor((currentCopper % 100) / 10),
              copper: -(currentCopper % 10),
            };
          }
        }
      }

      if (charDelta.needsChanges && typeof charDelta.needsChanges === 'object') {
        for (const [key, val] of Object.entries(charDelta.needsChanges)) {
          if (typeof val !== 'number') continue;
          charDelta.needsChanges[key] = clamp(val, limits.needsDeltaMin, limits.needsDeltaMax);
        }
      }

      validatedPerChar[charName] = charDelta;
    }
    validated.perCharacter = validatedPerChar;
  }

  if (validated.npcs && Array.isArray(validated.npcs)) {
    validated.npcs = sanitizeNpcChanges(validated.npcs, allCorrections, 'multiplayer: ');
    for (const npc of validated.npcs) {
      if (typeof npc.dispositionChange === 'number') {
        const clamped = clamp(npc.dispositionChange, -limits.maxDispositionDelta, limits.maxDispositionDelta);
        if (clamped !== npc.dispositionChange) {
          allCorrections.push(`NPC "${npc.name}" disposition delta clamped from ${npc.dispositionChange} to ${clamped}`);
          npc.dispositionChange = clamped;
        }
      }
    }
  }

  if (validated.codexUpdates && Array.isArray(validated.codexUpdates)) {
    validated.codexUpdates = normalizeCodexUpdates(validated.codexUpdates, allCorrections);
    if (validated.codexUpdates.length > limits.maxCodexPerScene) {
      allCorrections.push(`Codex updates capped from ${validated.codexUpdates.length} to ${limits.maxCodexPerScene}`);
      validated.codexUpdates = validated.codexUpdates.slice(0, limits.maxCodexPerScene);
    }
    for (const update of validated.codexUpdates) {
      if (update.fragment.content.length > limits.maxCodexFragmentLength) {
        update.fragment.content = update.fragment.content.substring(0, limits.maxCodexFragmentLength);
        allCorrections.push(`Codex fragment for "${update.name}" truncated to ${limits.maxCodexFragmentLength} chars`);
      }
    }
  }

  return { validated, warnings: allWarnings, corrections: allCorrections };
}
