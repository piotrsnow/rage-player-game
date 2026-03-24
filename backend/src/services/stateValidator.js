const DEFAULTS = {
  maxXpPerScene: 50,
  maxItemsPerScene: 3,
  maxWoundsDelta: 20,
  needsDeltaMin: -30,
  needsDeltaMax: 50,
  maxMoneyGainCopper: 500,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
