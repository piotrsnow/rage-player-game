const DEFAULTS = {
  maxXpPerScene: 50,
  maxItemsPerScene: 3,
  maxWoundsDelta: 20,
  needsDeltaMin: -30,
  needsDeltaMax: 50,
  maxMoneyGainCopper: 500,
  maxDispositionDelta: 10,
  maxCodexPerScene: 3,
  maxCodexFragmentLength: 1000,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moneyToCopper(m) {
  return (m.gold || 0) * 100 + (m.silver || 0) * 10 + (m.copper || 0);
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
    if (validated.codexUpdates.length > limits.maxCodexPerScene) {
      allCorrections.push(`Codex updates capped from ${validated.codexUpdates.length} to ${limits.maxCodexPerScene}`);
      validated.codexUpdates = validated.codexUpdates.slice(0, limits.maxCodexPerScene);
    }
    validated.codexUpdates = validated.codexUpdates.filter((u) => {
      if (!u.id || !u.name || !u.fragment?.content || !u.fragment?.source) {
        allCorrections.push('Invalid codex update removed (missing required fields)');
        return false;
      }
      return true;
    });
    for (const update of validated.codexUpdates) {
      if (update.fragment.content.length > limits.maxCodexFragmentLength) {
        update.fragment.content = update.fragment.content.substring(0, limits.maxCodexFragmentLength);
        allCorrections.push(`Codex fragment for "${update.name}" truncated to ${limits.maxCodexFragmentLength} chars`);
      }
    }
  }

  return { validated, warnings: allWarnings, corrections: allCorrections };
}
