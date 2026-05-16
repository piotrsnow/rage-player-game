import { useEffect, useCallback, useMemo } from 'react';

/**
 * Keyboard hook for field-map interaction (Enter/E).
 * Fires onNpcInteract when the player is adjacent to an NPC,
 * or onPortalEnter when the player is standing on a portal tile.
 */
export function useFieldMapInteraction({
  entities,
  portals,
  playerEntityId = '__player__',
  onNpcInteract,
  onPortalEnter,
  enabled = true,
}) {
  const player = useMemo(
    () => entities.find((e) => e.id === playerEntityId),
    [entities, playerEntityId],
  );

  const portalMap = useMemo(() => {
    const m = new Map();
    if (Array.isArray(portals)) {
      for (const p of portals) m.set(`${p.x}:${p.y}`, p);
    }
    return m;
  }, [portals]);

  const adjacentNpc = useMemo(() => {
    if (!player) return null;
    for (const e of entities) {
      if (e.id === playerEntityId) continue;
      if (e.type === 'player' || e.type === 'ally') continue;
      const dx = Math.abs(e.x - player.x);
      const dy = Math.abs(e.y - player.y);
      if (dx <= 1 && dy <= 1 && (dx + dy) > 0) return e;
    }
    return null;
  }, [entities, player, playerEntityId]);

  const standingOnPortal = useMemo(() => {
    if (!player) return null;
    return portalMap.get(`${player.x}:${player.y}`) || null;
  }, [player, portalMap]);

  const handleKey = useCallback((ev) => {
    if (!enabled) return;
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable) return;
    if (ev.key !== 'Enter' && ev.key !== 'e' && ev.key !== 'E') return;

    if (standingOnPortal && onPortalEnter) {
      ev.preventDefault();
      onPortalEnter(standingOnPortal);
      return;
    }

    if (adjacentNpc && onNpcInteract) {
      ev.preventDefault();
      onNpcInteract(adjacentNpc);
      return;
    }
  }, [enabled, standingOnPortal, adjacentNpc, onNpcInteract, onPortalEnter]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [enabled, handleKey]);

  return { adjacentNpc, standingOnPortal };
}
