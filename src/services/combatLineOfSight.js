/**
 * Bresenham-based line-of-sight + directional cover for the combat battlefield.
 */

import { getTileDef, doesTileBlockSight, RUBBLE_TILE } from '../../shared/domain/battlefieldTiles.js';

/**
 * Check if there is a clear line of sight between two cells on the battlefield.
 * Uses Bresenham's line algorithm on cell centers.
 *
 * @param {string[][]} battlefield - 2D grid of tile IDs [col][row]
 * @param {Record<string,number>} destructibleHp - remaining HP keyed by "x:y"
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @returns {boolean}
 */
export function hasLineOfSight(battlefield, destructibleHp, from, to) {
  if (!battlefield) return true;
  const cells = bresenhamLine(from.x, from.y, to.x, to.y);
  for (const cell of cells) {
    if (cell.x === from.x && cell.y === from.y) continue;
    if (cell.x === to.x && cell.y === to.y) continue;
    const tileId = battlefield[cell.x]?.[cell.y];
    if (!tileId) continue;
    if (isDestroyedAt(tileId, cell.x, cell.y, destructibleHp)) continue;
    if (doesTileBlockSight(tileId)) return false;
  }
  return true;
}

/**
 * Check if a ranged attack from `from` to a target at `to` is blocked
 * by directional cover at or adjacent to the target.
 *
 * @param {string[][]} battlefield
 * @param {{x:number,y:number}} from - attacker position
 * @param {{x:number,y:number}} to - target position
 * @returns {boolean} true if cover blocks the shot
 */
export function isBlockedByDirectionalCover(battlefield, from, to) {
  if (!battlefield) return false;
  const tileId = battlefield[to.x]?.[to.y];
  if (!tileId) return false;
  const def = getTileDef(tileId);
  if (!def?.directionalCover) return false;
  return doesCoverBlock(def.directionalCover, from, to);
}

/**
 * Combined LoS + directional cover check for ranged attacks.
 * Returns { clear, reason } where reason explains the block.
 */
export function checkRangedPath(battlefield, destructibleHp, from, to) {
  if (!hasLineOfSight(battlefield, destructibleHp, from, to)) {
    return { clear: false, reason: 'blocked_by_obstacle' };
  }
  if (isBlockedByDirectionalCover(battlefield, from, to)) {
    return { clear: false, reason: 'blocked_by_cover' };
  }
  return { clear: true, reason: null };
}

function doesCoverBlock(coverDirection, from, to) {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  switch (coverDirection) {
    case 'north': return dy < 0;
    case 'south': return dy > 0;
    case 'east':  return dx > 0;
    case 'west':  return dx < 0;
    default:      return false;
  }
}

function isDestroyedAt(tileId, x, y, destructibleHp) {
  const def = getTileDef(tileId);
  if (!def?.destructible) return false;
  const key = `${x}:${y}`;
  return destructibleHp[key] != null && destructibleHp[key] <= 0;
}

/**
 * Bresenham's line algorithm — returns array of {x, y} cells.
 */
function bresenhamLine(x0, y0, x1, y1) {
  const cells = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;

  while (true) {
    cells.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx)  { err += dx; cy += sy; }
  }
  return cells;
}
