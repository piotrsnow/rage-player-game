import { useEffect, useRef } from 'react';
import { createMultiplayerCombatState } from '../services/combatEngine';

const FALLBACK_ENEMY = {
  name: 'Wrogi wojownik',
  attributes: { sila: 5, inteligencja: 2, charyzma: 1, zrecznosc: 4, wytrzymalosc: 5, szczescie: 0 },
  wounds: 10,
  maxWounds: 10,
  skills: { 'Walka wrecz': 5 },
  traits: [],
  weapons: ['Hand Weapon'],
};

// Host-only: detects a `combatUpdate` on the latest scene and bootstraps
// multiplayer combat state from it. Remote-manoeuvre forwarding used to
// live here as well, but now lives inside CombatPanel via
// useCombatHostResolve — this hook is pure scene → combat initialisation.
export function useMultiplayerCombatSceneDetect({ isMultiplayer, isHost, mp, mpGameState }) {
  const lastCombatSceneRef = useRef(null);

  useEffect(() => {
    if (!isMultiplayer || !isHost) return;
    const lastScene = (mpGameState?.scenes || []).at(-1);
    if (!lastScene || lastScene.id === lastCombatSceneRef.current) return;
    if (mpGameState?.combat?.active) return;

    const combatUpdate = lastScene.stateChanges?.combatUpdate;
    if (combatUpdate?.active) {
      lastCombatSceneRef.current = lastScene.id;
      const chars = mpGameState.characters || [];
      const aiEnemies = Array.isArray(combatUpdate.enemies)
        ? combatUpdate.enemies.filter((enemy) => enemy?.name)
        : [];
      const fallbackEnemies = aiEnemies.length > 0 ? aiEnemies : [FALLBACK_ENEMY];
      const combatState = createMultiplayerCombatState(chars, fallbackEnemies, []);
      combatState.reason = combatUpdate.reason || '';
      mp.syncCombatState(combatState);
    }
  }, [isMultiplayer, isHost, mp, mpGameState?.scenes, mpGameState?.combat, mpGameState?.characters]);
}
