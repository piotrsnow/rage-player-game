import { normalizeMultiplayerStateChanges } from '../../../shared/contracts/multiplayer.js';
import {
  STATE_CHANGE_LIMITS,
  clamp,
  moneyToCopper,
  sanitizeNpcChanges,
  normalizeItemList,
  sanitizeInventoryItems,
  normalizeCodexUpdates,
} from '../../../shared/domain/stateValidation.js';

const DEFAULTS = { ...STATE_CHANGE_LIMITS };

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
        allWarnings.push(`Unknown character: "${charName}"`);
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
