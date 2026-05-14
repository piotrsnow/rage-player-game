import { useEffect, useCallback } from 'react';
import { isTilePassable } from '../../shared/domain/battlefieldTiles.js';

const ARROW_DELTAS = {
  ArrowUp:    { dx: 0, dy: -1 },
  ArrowDown:  { dx: 0, dy:  1 },
  ArrowLeft:  { dx: -1, dy: 0 },
  ArrowRight: { dx: 1,  dy: 0 },
  w: { dx: 0, dy: -1 },
  s: { dx: 0, dy:  1 },
  a: { dx: -1, dy: 0 },
  d: { dx: 1,  dy: 0 },
};

/**
 * Keyboard hook for field-map arrow/WASD movement.
 * Moves the player entity one cell per keypress, checking passability.
 */
export function useFieldMapKeyboard({
  entities,
  tiles,
  gridW,
  gridH,
  playerEntityId,
  onMove,
  enabled = true,
}) {
  const handleKey = useCallback((e) => {
    if (!enabled) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    const delta = ARROW_DELTAS[e.key];
    if (!delta) return;

    const player = entities.find((ent) => ent.id === playerEntityId);
    if (!player) return;

    const nx = player.x + delta.dx;
    const ny = player.y + delta.dy;

    if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) return;

    const tileId = tiles?.[nx]?.[ny];
    if (tileId && !isTilePassable(tileId)) return;

    const occupied = entities.some(
      (ent) => ent.id !== playerEntityId && ent.x === nx && ent.y === ny,
    );
    if (occupied) return;

    e.preventDefault();
    onMove(playerEntityId, nx, ny);
  }, [enabled, entities, tiles, gridW, gridH, playerEntityId, onMove]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [enabled, handleKey]);
}
