import { useEffect, useCallback } from 'react';
import { getDistance } from '../services/combatEngine';

/**
 * Returns the closest alive enemy to the actor.
 */
export function findClosestEnemy(combatants, actorId) {
  const actor = combatants.find(c => c.id === actorId);
  if (!actor) return null;

  let best = null;
  for (const c of combatants) {
    if (c.type !== 'enemy' || c.isDefeated) continue;
    const d = getDistance(actor, c);
    if (!best || d < best.dist) best = { target: c, dist: d };
  }
  return best?.target || null;
}

const ARROW_DELTAS = {
  ArrowUp: { dx: 0, dy: -1 }, ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
  w: { dx: 0, dy: -1 }, s: { dx: 0, dy: 1 },
  a: { dx: -1, dy: 0 }, d: { dx: 1, dy: 0 },
};

/**
 * Keyboard shortcut handler for the combat panel.
 *
 * Bindings:
 *   Arrows / WASD — move combatant one cell
 *   Enter / 1     — quick attack nearest enemy
 *   2             — defend
 *   3             — dodge
 *   4             — charge nearest enemy
 *   Space         — skip turn
 *   Escape        — close modal (via onEscape callback)
 */
export function useCombatKeyboard({
  combat,
  isMyTurn,
  combatOver,
  actionAnim,
  projectileAnim,
  myCombatantId,
  onExecuteManoeuvre,
  onMoveToPosition,
  isWalking,
  onSkipTurn,
  onEscape,
  enabled = true,
}) {
  const getClosest = useCallback(() => {
    if (!myCombatantId) return null;
    return findClosestEnemy(combat.combatants, myCombatantId);
  }, [combat.combatants, myCombatantId]);

  useEffect(() => {
    if (!enabled || !isMyTurn || combatOver) return;

    function handler(e) {
      if (actionAnim || projectileAnim) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      const delta = ARROW_DELTAS[e.key];
      if (delta && onMoveToPosition && !isWalking) {
        const actor = combat.combatants.find(c => c.id === myCombatantId);
        if (actor && !actor.isDefeated) {
          const pos = actor.position ?? { x: 0, y: 0 };
          e.preventDefault();
          onMoveToPosition({ x: pos.x + delta.dx, y: pos.y + delta.dy });
        }
        return;
      }

      switch (e.key) {
        case 'Enter':
        case '1': {
          const target = getClosest();
          if (target) {
            e.preventDefault();
            onExecuteManoeuvre('attack', target.id, '');
          }
          break;
        }
        case '2': {
          e.preventDefault();
          onExecuteManoeuvre('defend', null, '');
          break;
        }
        case '3': {
          e.preventDefault();
          onExecuteManoeuvre('dodge', null, '');
          break;
        }
        case '4': {
          const target = getClosest();
          if (target) {
            e.preventDefault();
            onExecuteManoeuvre('charge', target.id, '');
          }
          break;
        }
        case ' ': {
          e.preventDefault();
          onSkipTurn();
          break;
        }
        case 'Escape': {
          e.preventDefault();
          onEscape?.();
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, isMyTurn, combatOver, actionAnim, projectileAnim, isWalking, combat.combatants, myCombatantId, getClosest, onExecuteManoeuvre, onMoveToPosition, onSkipTurn, onEscape]);

  return { getClosestEnemy: getClosest };
}
