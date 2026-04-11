import { useEffect, useRef } from 'react';
import { createMultiplayerCombatState } from '../services/combatEngine';

const FALLBACK_ENEMY = {
  name: 'Hostile Foe',
  characteristics: { ws: 35, bs: 25, s: 30, t: 30, i: 30, ag: 30, dex: 25, int: 20, wp: 25, fel: 15 },
  wounds: 10,
  maxWounds: 10,
  skills: { 'Melee (Basic)': 5 },
  traits: [],
  armour: { body: 0 },
  weapons: ['Hand Weapon'],
};

/**
 * Host-only multiplayer combat plumbing:
 * 1. Detects combatUpdate from the latest scene and creates MP combat state.
 * 2. Forwards pending combat maneuvers from remote players to the combat panel.
 */
export function useMultiplayerCombatHost({ isMultiplayer, isHost, mp, mpGameState, combatPanelComponent }) {
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

  useEffect(() => {
    if (!isMultiplayer || !isHost) return;
    const pending = mp.state.pendingCombatManoeuvre;
    if (!pending) return;

    mp.clearPendingCombatManoeuvre();
    const fromPlayerId = `player_${pending.fromOdId}`;
    if (combatPanelComponent?.resolveRemoteManoeuvre) {
      combatPanelComponent.resolveRemoteManoeuvre(
        fromPlayerId,
        pending.manoeuvre,
        pending.targetId,
        pending.customDescription
      );
    }
  }, [isMultiplayer, isHost, mp, mp.state.pendingCombatManoeuvre, combatPanelComponent]);
}
