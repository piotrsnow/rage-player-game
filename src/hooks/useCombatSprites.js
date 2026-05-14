import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../services/apiClient';

function buildPayload(combatant) {
  return {
    id: combatant.id,
    name: combatant.name,
    type: combatant.type,
    species: combatant.species || combatant.race || undefined,
    gender: combatant.gender || undefined,
    equipped: combatant.equipped || undefined,
    inventory: (combatant.inventory || []).slice(0, 10),
    weapons: combatant.weapons || undefined,
    equippedArmour: combatant.equippedArmour || undefined,
    traits: (combatant.traits || []).slice(0, 5),
    description: combatant.description || undefined,
  };
}

function needsGeneration(combatant) {
  return !combatant.spriteSheetUrl;
}

function resolveSprites(raw) {
  const out = {};
  for (const [id, url] of Object.entries(raw)) {
    out[id] = apiClient.resolveMediaUrl(url);
  }
  return out;
}

/**
 * Fetches chargen sprite sheets (with PixelLab fallback) for combat combatants.
 * Returns { sprites, spriteSheets, regenerateSprite }.
 *   sprites        — map of combatantId -> spriteUrl (for backward compat)
 *   spriteSheets   — map of combatantId -> spriteSheetUrl (832x1344 LPC sheet)
 *   regenerateSprite(combatant) — force-regenerate a single combatant's sprite
 */
export function useCombatSprites(combatants) {
  const [sprites, setSprites] = useState({});
  const [spriteSheets, setSpriteSheets] = useState({});
  const fetchedKeyRef = useRef('');
  const combatantsRef = useRef(combatants);
  combatantsRef.current = combatants;

  const stableKey = combatants
    .map(c => c.id)
    .sort()
    .join('|');

  useEffect(() => {
    if (!combatants.length || fetchedKeyRef.current === stableKey) return;
    fetchedKeyRef.current = stableKey;

    let cancelled = false;

    const fetchSprites = async () => {
      try {
        const toGenerate = combatants.filter(needsGeneration);
        if (!toGenerate.length) return;
        const payload = toGenerate.map(buildPayload);
        const data = await apiClient.post('/combat/sprites/generate', { combatants: payload });

        console.log('[useCombatSprites] response', { sprites: data?.sprites, spriteSheets: data?.spriteSheets });
        if (!cancelled && data) {
          if (data.sprites) setSprites(resolveSprites(data.sprites));
          if (data.spriteSheets) setSpriteSheets(resolveSprites(data.spriteSheets));
        }
      } catch (err) {
        console.warn('[useCombatSprites] fetch failed', err);
      }
    };

    fetchSprites();

    return () => { cancelled = true; };
  }, [stableKey, combatants]);

  const regenerateSprite = useCallback(async (combatant) => {
    try {
      const data = await apiClient.post('/combat/sprites/generate', {
        combatants: [buildPayload(combatant)],
        force: true,
      });
      if (data?.sprites) {
        const resolved = resolveSprites(data.sprites);
        setSprites(prev => ({ ...prev, ...resolved }));
      }
      if (data?.spriteSheets) {
        const resolved = resolveSprites(data.spriteSheets);
        setSpriteSheets(prev => ({ ...prev, ...resolved }));
      }
    } catch {
      // silent — sprite regen is best-effort
    }
  }, []);

  return { sprites, spriteSheets, regenerateSprite };
}
