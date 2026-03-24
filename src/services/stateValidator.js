import { SKILLS, TALENTS } from '../data/wfrp';

const DEFAULTS = {
  maxXpPerScene: 50,
  maxItemsPerScene: 3,
  maxWoundsDelta: 20,
  needsDeltaMin: -30,
  needsDeltaMax: 100,
  maxMoneyGainCopper: 500, // 5 GC equivalent
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moneyToCopper(m) {
  return (m.gold || 0) * 100 + (m.silver || 0) * 10 + (m.copper || 0);
}

export function validateStateChanges(stateChanges, currentState, config = {}) {
  if (!stateChanges || typeof stateChanges !== 'object') {
    return { validated: stateChanges, warnings: [], corrections: [] };
  }

  const limits = { ...DEFAULTS, ...config };
  const warnings = [];
  const corrections = [];
  const validated = { ...stateChanges };
  const character = currentState?.character;

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
    if (validated.newItems.length > limits.maxItemsPerScene) {
      warnings.push(`AI proposed ${validated.newItems.length} new items, capped to ${limits.maxItemsPerScene}`);
      validated.newItems = validated.newItems.slice(0, limits.maxItemsPerScene);
      corrections.push(`Items capped to ${limits.maxItemsPerScene}`);
    }
  }

  if (validated.moneyChange) {
    const gain = moneyToCopper(validated.moneyChange);
    if (gain > limits.maxMoneyGainCopper) {
      warnings.push(`Large money gain: ${gain} CP (limit: ${limits.maxMoneyGainCopper})`);
    }
    if (character?.money) {
      const currentCopper = moneyToCopper(character.money);
      if (gain < 0 && currentCopper + gain < 0) {
        warnings.push(`Money would go negative — spending more than character has`);
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

  if (validated.skillAdvances && typeof validated.skillAdvances === 'object') {
    const allSkillNames = [...SKILLS.basic, ...SKILLS.advanced].map((s) => s.name);
    for (const skillName of Object.keys(validated.skillAdvances)) {
      if (!allSkillNames.includes(skillName)) {
        warnings.push(`Unknown skill: "${skillName}"`);
      }
    }
  }

  if (validated.newTalents && Array.isArray(validated.newTalents)) {
    for (const talent of validated.newTalents) {
      if (!TALENTS.includes(talent)) {
        warnings.push(`Unknown talent: "${talent}"`);
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

  if (validated.codexUpdates && Array.isArray(validated.codexUpdates)) {
    const MAX_CODEX_PER_SCENE = 3;
    const MAX_FRAGMENT_LENGTH = 1000;
    if (validated.codexUpdates.length > MAX_CODEX_PER_SCENE) {
      corrections.push(`Codex updates capped from ${validated.codexUpdates.length} to ${MAX_CODEX_PER_SCENE}`);
      validated.codexUpdates = validated.codexUpdates.slice(0, MAX_CODEX_PER_SCENE);
    }
    validated.codexUpdates = validated.codexUpdates.filter((u) => {
      if (!u.id || !u.name || !u.fragment?.content || !u.fragment?.source) {
        corrections.push(`Invalid codex update removed (missing required fields)`);
        return false;
      }
      return true;
    });
    for (const update of validated.codexUpdates) {
      if (update.fragment.content.length > MAX_FRAGMENT_LENGTH) {
        update.fragment.content = update.fragment.content.substring(0, MAX_FRAGMENT_LENGTH);
        corrections.push(`Codex fragment for "${update.name}" truncated to ${MAX_FRAGMENT_LENGTH} chars`);
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
  const validated = { ...stateChanges };

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
        if (charDelta.newItems.length > limits.maxItemsPerScene) {
          charDelta.newItems = charDelta.newItems.slice(0, limits.maxItemsPerScene);
          allCorrections.push(`${charName}: items capped to ${limits.maxItemsPerScene}`);
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

  return { validated, warnings: allWarnings, corrections: allCorrections };
}

const MAX_UNDO_STACK = 10;

export function pushUndoEntry(undoStack, stateSnapshot) {
  const stack = [...(undoStack || [])];
  stack.push({
    timestamp: Date.now(),
    character: stateSnapshot.character,
    world: stateSnapshot.world,
    quests: stateSnapshot.quests,
  });
  if (stack.length > MAX_UNDO_STACK) {
    stack.shift();
  }
  return stack;
}
