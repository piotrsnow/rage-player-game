import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';

/**
 * Fetches PixelLab combat sprites for a list of combatants.
 * Returns a map of combatantId -> spriteUrl (or null on failure).
 * Sprites are fetched once per combat instance (keyed by combatant ids).
 */
export function useCombatSprites(combatants) {
  const [sprites, setSprites] = useState({});
  const fetchedKeyRef = useRef('');

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
        const payload = combatants.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          species: c.species || c.race || undefined,
          gender: c.gender || undefined,
          equipped: c.equipped || undefined,
          inventory: (c.inventory || []).slice(0, 10),
          weapons: c.weapons || undefined,
          equippedArmour: c.equippedArmour || undefined,
          traits: (c.traits || []).slice(0, 5),
          description: c.description || undefined,
        }));

        const data = await apiClient.post('/combat/sprites/generate', { combatants: payload });

        if (!cancelled && data?.sprites) {
          setSprites(data.sprites);
        }
      } catch {
        // PixelLab not configured or request failed — fall back to initials
      }
    };

    fetchSprites();

    return () => { cancelled = true; };
  }, [stableKey, combatants]);

  return sprites;
}
