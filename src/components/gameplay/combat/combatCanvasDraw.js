import { gameData } from '../../../services/gameDataService';
import { getTileDef, isTilePassable, isPushable } from '../../../../shared/domain/battlefieldTiles.js';
import { getTilePattern, clearPatternCache } from '../../../services/combat/tilePatterns.js';
import { hasLineOfSight } from '../../../services/combatLineOfSight.js';
import { getReachableCells, getOccupiedCells, isCellPassableOnBattlefield } from '../../../services/combatEngine.js';
import { findSpell } from '../../../data/rpgMagic.js';

export const COLORS = {
  bg: '#0e0e10',
  bgGrad: '#141416',
  card: '#19191c',
  cardBorder: '#2a2a2e',
  primary: '#c59aff',
  primaryDim: '#9547f7',
  error: '#ff6e84',
  errorDim: '#b8344a',
  tertiary: '#ffefd5',
  text: '#fffbfe',
  textDim: '#adaaad',
  outline: '#48474a',
  green: '#66bb6a',
  movementZone: 'rgba(197,154,255,0.12)',
  movementZoneBorder: 'rgba(197,154,255,0.35)',
  meleeArc: 'rgba(255,239,213,0.12)',
  gridLine: 'rgba(72,71,74,0.25)',
  gridLineMajor: 'rgba(72,71,74,0.45)',
};

export const TOKEN_RADIUS = 22;
export const GRID_PAD = 12;

const TOKEN_CELL_RATIO = 0.6;

export function getTokenRadius(canvasW, canvasH) {
  return getCellSize(canvasW, canvasH) * TOKEN_CELL_RATIO;
}

const PARTICLE_COUNT = 35;

function normalizePos(p) {
  if (p && typeof p === 'object' && 'x' in p) return p;
  if (typeof p === 'number') return { x: p, y: 4 };
  return { x: 0, y: 0 };
}

export function getCellSize(canvasW, canvasH) {
  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const availW = canvasW - GRID_PAD * 2;
  const availH = canvasH - GRID_PAD * 2;
  const cellW = availW / W;
  const cellH = availH / H;
  const cell = Math.min(cellW, cellH);
  return cell;
}

export function getGridOrigin(canvasW, canvasH) {
  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const cell = getCellSize(canvasW, canvasH);
  const gridW = W * cell;
  const gridH = H * cell;
  return {
    x: (canvasW - gridW) / 2,
    y: (canvasH - gridH) / 2,
  };
}

export function cellToPixel(col, row, canvasW, canvasH) {
  const cell = getCellSize(canvasW, canvasH);
  const origin = getGridOrigin(canvasW, canvasH);
  return {
    x: origin.x + (col + 0.5) * cell,
    y: origin.y + (row + 0.5) * cell,
  };
}

export function pixelToCell(px, py, canvasW, canvasH) {
  const cell = getCellSize(canvasW, canvasH);
  const origin = getGridOrigin(canvasW, canvasH);
  const col = Math.floor((px - origin.x) / cell);
  const row = Math.floor((py - origin.y) / cell);
  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  if (col < 0 || col >= W || row < 0 || row >= H) return null;
  return { x: col, y: row };
}

export function initParticles(w, h) {
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.6 - 0.2,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
      hue: Math.random() > 0.5 ? 275 : 15,
    });
  }
  return particles;
}

export function drawBackground(ctx, w, h, now, anim) {
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(14,14,16,0.88)');
  grad.addColorStop(1, 'rgba(20,20,22,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, 'rgba(197,154,255,0.02)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  if (!anim.particles.length) anim.particles = initParticles(w, h);
  for (const p of anim.particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
    if (p.x < -5) p.x = w + 5;
    if (p.x > w + 5) p.x = -5;
    const flicker = 0.6 + 0.4 * Math.sin(now / 800 + p.x);
    ctx.globalAlpha = p.alpha * flicker;
    ctx.fillStyle = `hsl(${p.hue}, 80%, 70%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawBattlefield(ctx, canvasW, canvasH, _now, battlefield, destructibleHp, pushesLeft) {
  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const cell = getCellSize(canvasW, canvasH);
  const origin = getGridOrigin(canvasW, canvasH);
  const gridW = W * cell;
  const gridH = H * cell;

  ctx.fillStyle = 'rgba(25,25,28,0.6)';
  ctx.fillRect(origin.x - 2, origin.y - 2, gridW + 4, gridH + 4);

  // Draw structural tiles if present
  if (battlefield) {
    for (let col = 0; col < W; col++) {
      for (let row = 0; row < H; row++) {
        const tileId = battlefield[col]?.[row];
        if (!tileId) continue;
        const def = getTileDef(tileId);
        if (!def) continue;

        const cx = origin.x + col * cell;
        const cy = origin.y + row * cell;

        // Base color fill
        ctx.fillStyle = def.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(cx, cy, cell, cell);

        // Pattern overlay
        const pattern = getTilePattern(ctx, def.pattern, cell);
        if (pattern) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.fillStyle = pattern;
          ctx.globalAlpha = 1;
          ctx.fillRect(0, 0, cell, cell);
          ctx.restore();
        }

        ctx.globalAlpha = 1;

        // Impassable tiles: darker border
        if (!def.passable) {
          const isDestroyed = destructibleHp && destructibleHp[`${col}:${row}`] != null && destructibleHp[`${col}:${row}`] <= 0;
          if (!isDestroyed) {
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
          }
        }

        // Destructible tiles: show HP crack overlay when damaged
        if (def.destructible && destructibleHp) {
          const key = `${col}:${row}`;
          const hp = destructibleHp[key];
          if (hp != null && hp > 0 && hp < def.destructible.hp) {
            const damageFrac = 1 - (hp / def.destructible.hp);
            ctx.strokeStyle = `rgba(200,50,50,${0.3 + damageFrac * 0.4})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx + cell * 0.2, cy + cell * 0.1);
            ctx.lineTo(cx + cell * 0.5, cy + cell * 0.5);
            ctx.lineTo(cx + cell * 0.4, cy + cell * 0.9);
            ctx.stroke();
          }
        }

        // Directional cover: thick bar on the covered edge
        if (def.directionalCover) {
          ctx.strokeStyle = 'rgba(180,150,80,0.6)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          switch (def.directionalCover) {
            case 'north': ctx.moveTo(cx, cy); ctx.lineTo(cx + cell, cy); break;
            case 'south': ctx.moveTo(cx, cy + cell); ctx.lineTo(cx + cell, cy + cell); break;
            case 'west':  ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + cell); break;
            case 'east':  ctx.moveTo(cx + cell, cy); ctx.lineTo(cx + cell, cy + cell); break;
          }
          ctx.stroke();
        }

        // Pushable tile badge
        if (def.pushable && pushesLeft) {
          const key = `${col}:${row}`;
          const remaining = pushesLeft[key];
          const badgeR = Math.max(6, cell * 0.18);
          const badgeX = cx + cell - badgeR - 2;
          const badgeY = cy + cell - badgeR - 2;

          if (remaining != null && remaining > 0) {
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180,130,40,0.85)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,220,100,0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(badgeR * 1.2)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(remaining), badgeX, badgeY);
          } else if (remaining === undefined || remaining === 0) {
            // Permanently fixed — lock icon (small padlock shape)
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(80,80,80,0.75)';
            ctx.fill();
            ctx.fillStyle = 'rgba(200,200,200,0.9)';
            ctx.font = `bold ${Math.round(badgeR * 1.1)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔒', badgeX, badgeY);
          }
        }
      }
    }
  }

  // Grid lines
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.5;
  for (let col = 0; col <= W; col++) {
    const x = origin.x + col * cell;
    ctx.beginPath();
    ctx.moveTo(x, origin.y);
    ctx.lineTo(x, origin.y + gridH);
    ctx.stroke();
  }
  for (let row = 0; row <= H; row++) {
    const y = origin.y + row * cell;
    ctx.beginPath();
    ctx.moveTo(origin.x, y);
    ctx.lineTo(origin.x + gridW, y);
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.gridLineMajor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(origin.x, origin.y, gridW, gridH);
}

export function drawTerrainTiles(ctx, canvasW, canvasH, terrainTiles, tileDefs, now) {
  if (!terrainTiles?.length || !tileDefs) return;

  const cell = getCellSize(canvasW, canvasH);
  const origin = getGridOrigin(canvasW, canvasH);

  for (const tile of terrainTiles) {
    const def = tileDefs[tile.type];
    if (!def) continue;

    const cx = origin.x + tile.x * cell;
    const cy = origin.y + tile.y * cell;
    const centerX = cx + cell / 2;
    const centerY = cy + cell / 2;

    const baseAlpha = tile.consumed ? 0.08 : 0.25;
    const pulse = tile.consumed ? 0 : 0.1 * Math.sin(now / 800 + tile.x * 0.7 + tile.y * 1.3);

    ctx.save();

    // Radial glow fill
    const radius = cell * 0.65;
    const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    grad.addColorStop(0, def.color + alphaHex(baseAlpha + pulse));
    grad.addColorStop(0.7, def.color + alphaHex((baseAlpha + pulse) * 0.5));
    grad.addColorStop(1, def.color + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(cx, cy, cell, cell);

    // Thin border
    if (!tile.consumed) {
      ctx.strokeStyle = def.color + alphaHex(0.35 + pulse);
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
    }

    // Circle background + emoji icon
    const emojiAlpha = tile.consumed ? 0.12 : 0.75 + 0.15 * Math.sin(now / 600 + tile.x);
    const circleR = cell * 0.34;
    ctx.globalAlpha = emojiAlpha * 0.45;
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleR, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.globalAlpha = emojiAlpha * 0.7;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = def.color;
    ctx.stroke();

    ctx.globalAlpha = emojiAlpha;
    const fontSize = cell * 0.36;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(def.emoji, centerX, centerY);

    ctx.restore();
  }
}

function alphaHex(a) {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}

export function drawMovementZone(ctx, canvasW, canvasH, myCombatant, hoverCell, now, combat) {
  const remaining = myCombatant.movementAllowance - (myCombatant.movementUsed || 0);
  if (remaining <= 0) return;

  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const pos = normalizePos(myCombatant.position);
  const cell = getCellSize(canvasW, canvasH);
  const origin = getGridOrigin(canvasW, canvasH);
  const t = now ?? performance.now();
  const dashOffset = (t / 40) % 16;

  // BFS flood-fill reachable cells respecting walls
  const occupied = combat ? getOccupiedCells(combat.combatants, myCombatant.id) : new Set();
  const reachable = combat?.battlefield
    ? getReachableCells(combat.battlefield, combat.destructibleHp, pos, remaining, occupied)
    : null;

  const inZone = (col, row) => {
    if (col < 0 || col >= W || row < 0 || row >= H) return false;
    if (reachable) return reachable.has(`${col}:${row}`);
    return (Math.abs(col - pos.x) + Math.abs(row - pos.y)) <= remaining;
  };

  ctx.save();
  ctx.strokeStyle = COLORS.movementZoneBorder;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -dashOffset;
  ctx.beginPath();

  for (let col = 0; col < W; col++) {
    for (let row = 0; row < H; row++) {
      if (!inZone(col, row)) continue;
      const cx = origin.x + col * cell;
      const cy = origin.y + row * cell;
      if (!inZone(col, row - 1)) { ctx.moveTo(cx, cy); ctx.lineTo(cx + cell, cy); }
      if (!inZone(col, row + 1)) { ctx.moveTo(cx, cy + cell); ctx.lineTo(cx + cell, cy + cell); }
      if (!inZone(col - 1, row)) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + cell); }
      if (!inZone(col + 1, row)) { ctx.moveTo(cx + cell, cy); ctx.lineTo(cx + cell, cy + cell); }
    }
  }

  ctx.stroke();
  ctx.restore();

  if (hoverCell && inZone(hoverCell.x, hoverCell.y)) {
    const path = _cardinalBfsPath(pos, hoverCell, occupied, W, H);
    if (path && path.length > 0 && path.length <= remaining) {
      ctx.save();
      const pathAlpha = 0.25 + 0.1 * Math.sin(t / 400);
      ctx.fillStyle = COLORS.primary;
      ctx.globalAlpha = pathAlpha;
      for (const step of path) {
        const cx = origin.x + step.x * cell;
        const cy = origin.y + step.y * cell;
        ctx.fillRect(cx + 2, cy + 2, cell - 4, cell - 4);
      }
      ctx.restore();

      const px = cellToPixel(hoverCell.x, hoverCell.y, canvasW, canvasH);
      const bright = 1.2 + 1.0 * (0.5 + 0.5 * Math.sin(t / 220));
      const bounce = Math.sin(t / 300) * 2;
      const size = cell * 0.55;
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.filter = `brightness(${bright}) saturate(1.3) hue-rotate(-15deg)`;
      ctx.fillText('👣', px.x, px.y + bounce);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }
  }
}

const _DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

function _cardinalBfsPath(start, end, occupiedSet, width, height) {
  if (start.x === end.x && start.y === end.y) return [];
  const endKey = `${end.x}:${end.y}`;
  if (occupiedSet.has(endKey)) return null;
  const startKey = `${start.x}:${start.y}`;
  const cameFrom = new Map();
  cameFrom.set(startKey, null);
  const queue = [{ x: start.x, y: start.y }];
  while (queue.length > 0) {
    const { x, y } = queue.shift();
    const key = `${x}:${y}`;
    if (key === endKey) {
      const path = [];
      let cur = endKey;
      while (cur && cur !== startKey) {
        const [cx, cy] = cur.split(':').map(Number);
        path.push({ x: cx, y: cy });
        cur = cameFrom.get(cur);
      }
      path.reverse();
      return path;
    }
    for (const { dx, dy } of _DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nk = `${nx}:${ny}`;
      if (cameFrom.has(nk)) continue;
      if (nk !== endKey && occupiedSet.has(nk)) continue;
      cameFrom.set(nk, key);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

export function drawMeleeEngagements(ctx, combatants, canvasW, canvasH, now) {
  const active = combatants.filter((c) => !c.isDefeated);
  const friendlyActive = active.filter((c) => c.type === 'player' || c.type === 'ally');
  const enemyActive = active.filter((c) => c.type === 'enemy');

  ctx.save();
  for (const f of friendlyActive) {
    for (const e of enemyActive) {
      const fp = normalizePos(f.position);
      const ep = normalizePos(e.position);
      const dist = Math.max(Math.abs(fp.x - ep.x), Math.abs(fp.y - ep.y));
      if (dist <= gameData.MELEE_RANGE) {
        const p1 = cellToPixel(fp.x, fp.y, canvasW, canvasH);
        const p2 = cellToPixel(ep.x, ep.y, canvasW, canvasH);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const arcH = 12 + Math.sin(now / 1200) * 3;

        ctx.strokeStyle = COLORS.meleeArc;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(midX, midY - arcH, p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = COLORS.tertiary;
        ctx.globalAlpha = 0.4 + 0.2 * Math.sin(now / 600);
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('\u2694', midX, midY - arcH + 2);
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.restore();
}

export function drawRangeIndicator(ctx, fromCombatant, toCombatant, canvasW, canvasH, battlefield, destructibleHp) {
  if (!fromCombatant || !toCombatant) return;
  const fp = normalizePos(fromCombatant.position);
  const tp = normalizePos(toCombatant.position);
  const p1 = cellToPixel(fp.x, fp.y, canvasW, canvasH);
  const p2 = cellToPixel(tp.x, tp.y, canvasW, canvasH);
  const dist = Math.max(Math.abs(fp.x - tp.x), Math.abs(fp.y - tp.y));

  const losBlocked = battlefield && !hasLineOfSight(battlefield, destructibleHp || {}, fp, tp);

  ctx.save();
  ctx.strokeStyle = losBlocked ? 'rgba(255,100,100,0.5)' : 'rgba(197,154,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  ctx.fillStyle = losBlocked ? 'rgba(255,100,100,0.7)' : 'rgba(197,154,255,0.6)';
  ctx.font = 'bold 10px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(losBlocked ? `${dist} \u{1F6AB}` : `${dist}`, midX, midY - 4);
  ctx.restore();
}

export function drawCombatOverOverlay(ctx, w, h, friendlies, now, anim) {
  const startTs = anim.combatOverStart || now;
  const elapsed = now - startTs;
  const fadeIn = Math.min(1, elapsed / 600);
  const scaleIn = 0.85 + 0.15 * Math.min(1, elapsed / 400);

  ctx.fillStyle = `rgba(14,14,16,${0.65 * fadeIn})`;
  ctx.fillRect(0, 0, w, h);

  const isVictory = friendlies.some((c) => !c.isDefeated);
  const textY = h * 0.4;

  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.translate(w / 2, textY);
  ctx.scale(scaleIn, scaleIn);

  const glowColor = isVictory ? COLORS.primary : COLORS.error;
  const glowPulse = 0.6 + 0.4 * Math.sin(now / 500);

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 20 + glowPulse * 15;
  ctx.font = '32px NewRocker, cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = glowColor;
  ctx.fillText(isVictory ? '\u2694 ZWYCI\u0118STWO' : '\u2620 PORA\u017bKA', 0, 0);
  ctx.shadowBlur = 0;

  ctx.restore();

  if (elapsed > 200) {
    const sparkCount = 12;
    const sparkAge = elapsed - 200;
    if (sparkAge < 1500) {
      for (let i = 0; i < sparkCount; i++) {
        const angle = (i / sparkCount) * Math.PI * 2 + now / 2000;
        const dist = 30 + sparkAge * 0.08;
        const sparkAlpha = Math.max(0, 1 - sparkAge / 1500) * 0.7;
        const sx = w / 2 + Math.cos(angle) * dist;
        const sy = textY + Math.sin(angle) * dist * 0.5;
        ctx.globalAlpha = sparkAlpha;
        ctx.fillStyle = isVictory ? COLORS.tertiary : COLORS.error;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5 + Math.sin(now / 300 + i) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

const FLIGHT_MS = 1000;
const EXPLOSION_MS = 500;
const TRAIL_LENGTH = 12;
const SPARK_COUNT = 10;

export const PROJECTILE_TOTAL_MS = FLIGHT_MS + EXPLOSION_MS;
export const SPELL_VFX_COUNT = 5;

// ── School-specific spell palettes ──
const SCHOOL_PALETTES = {
  ogien:           { primary: '#ff6a00', secondary: '#ffcc44', glowRgb: '255,106,0',  mistRgb: '255,80,0',    accent: '#ff3300' },
  blyskawice:      { primary: '#00d4ff', secondary: '#a0f0ff', glowRgb: '0,212,255',  mistRgb: '100,200,255', accent: '#ffffff' },
  lod:             { primary: '#a8e0ff', secondary: '#ffffff', glowRgb: '168,224,255', mistRgb: '200,230,255', accent: '#d0f0ff' },
  leczenie:        { primary: '#44dd88', secondary: '#a0ffcc', glowRgb: '68,221,136',  mistRgb: '60,200,120',  accent: '#22ff88' },
  ochrona:         { primary: '#ffd060', secondary: '#fff0b0', glowRgb: '255,208,96',  mistRgb: '255,200,80',  accent: '#ffaa00' },
  niewidzialnosc:  { primary: '#b0c8e8', secondary: '#e0e8f0', glowRgb: '176,200,232', mistRgb: '160,180,210', accent: '#8090b0' },
  przestrzen:      { primary: '#b040ff', secondary: '#d090ff', glowRgb: '176,64,255',  mistRgb: '140,60,220',  accent: '#8000cc' },
  umysl:           { primary: '#e060c0', secondary: '#ffb0e8', glowRgb: '224,96,192',  mistRgb: '180,60,160',  accent: '#a020a0' },
  wiatr_percepcja: { primary: '#80d8d8', secondary: '#c0f0f0', glowRgb: '128,216,216', mistRgb: '100,200,200', accent: '#40b0b0' },
};
const FALLBACK_SPELL_PAL = { primary: '#c59aff', secondary: '#e0c8ff', glowRgb: '197,154,255', mistRgb: '160,120,220', accent: '#7b2fbe' };

const SCHOOL_VARIANT = {
  ogien: 2, blyskawice: 1, lod: 3, umysl: 4, przestrzen: 4,
  ochrona: 0, leczenie: 0, niewidzialnosc: 0, wiatr_percepcja: 1,
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const hex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hexRgb(hex) {
  return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;
}

/**
 * Resolve spell school palette + visual variant from spellName.
 * Falls back to a stable hash-derived palette for custom spells, or the
 * legacy indexed palette when no name is available at all.
 */
export function getSpellVfxProfile(spellName, fallbackVariant) {
  if (spellName) {
    const found = findSpell(spellName);
    if (found) {
      return {
        pal: SCHOOL_PALETTES[found.treeId] || FALLBACK_SPELL_PAL,
        variant: SCHOOL_VARIANT[found.treeId] ?? 0,
        treeId: found.treeId,
      };
    }
    const h = hashStr(spellName);
    const hue = h % 360;
    const primary = hslHex(hue, 70, 55);
    return {
      pal: {
        primary, secondary: hslHex(hue, 50, 78),
        glowRgb: hexRgb(primary), mistRgb: hexRgb(hslHex(hue, 60, 40)),
        accent: hslHex(hue, 80, 38),
      },
      variant: h % 5,
      treeId: null,
    };
  }
  const OLD_PALS = [
    FALLBACK_SPELL_PAL,
    SCHOOL_PALETTES.blyskawice,
    SCHOOL_PALETTES.ogien,
    SCHOOL_PALETTES.lod,
    { primary: '#7b2fbe', secondary: '#b080e0', glowRgb: '123,47,190', mistRgb: '100,40,160', accent: '#3a0066' },
  ];
  return { pal: OLD_PALS[fallbackVariant] || FALLBACK_SPELL_PAL, variant: fallbackVariant ?? 0, treeId: null };
}

const SPELL_TRAIL_LEN = 20;
const SPELL_SPARK_N = 16;
const STREAK_N = 5;
const FORK_N = 4;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function drawSpellProjectile(ctx, anim, canvasW, canvasH, now) {
  const elapsed = now - anim.startTime;
  if (elapsed > FLIGHT_MS + EXPLOSION_MS) return false;

  if (!anim._vfxProfile) anim._vfxProfile = getSpellVfxProfile(anim.spellName, anim.spellVfxVariant);
  const { pal, variant } = anim._vfxProfile;

  const fromPx = cellToPixel(anim.fromCell.x, anim.fromCell.y, canvasW, canvasH);
  const cell = getCellSize(canvasW, canvasH);
  let toPx = cellToPixel(anim.toCell.x, anim.toCell.y, canvasW, canvasH);
  if (!anim.hit) {
    const offDist = cell * 0.35;
    toPx = { x: toPx.x + anim.missOffsetX * offDist, y: toPx.y + anim.missOffsetY * offDist };
  }

  ctx.save();

  // ═══ FLIGHT PHASE ═══
  if (elapsed <= FLIGHT_MS) {
    const t = easeOutCubic(Math.min(1, elapsed / FLIGHT_MS));
    const cx = fromPx.x + (toPx.x - fromPx.x) * t;
    const cy = fromPx.y + (toPx.y - fromPx.y) * t;

    if (!anim._trail) anim._trail = [];
    anim._trail.push({ x: cx, y: cy });
    if (anim._trail.length > SPELL_TRAIL_LEN) anim._trail.shift();

    // Trail
    for (let i = 0; i < anim._trail.length; i++) {
      const p = anim._trail[i];
      const r = (i + 1) / anim._trail.length;
      ctx.globalAlpha = r * 0.35;
      ctx.fillStyle = r > 0.6 ? pal.primary : pal.secondary;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5 + r * 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mist cloud
    const mistR = 32 + Math.sin(elapsed / 200) * 8;
    const mg = ctx.createRadialGradient(cx, cy, 0, cx, cy, mistR);
    mg.addColorStop(0, `rgba(${pal.mistRgb},0.18)`);
    mg.addColorStop(0.5, `rgba(${pal.mistRgb},0.06)`);
    mg.addColorStop(1, `rgba(${pal.mistRgb},0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(cx, cy, mistR, 0, Math.PI * 2);
    ctx.fill();

    // Side streaks
    if (!anim._streaks) {
      anim._streaks = [];
      for (let i = 0; i < STREAK_N; i++) {
        anim._streaks.push({
          offAngle: Math.random() * Math.PI * 2,
          len: 8 + Math.random() * 14,
          drift: (Math.random() - 0.5) * 6,
          phase: Math.random() * 1000,
        });
      }
    }
    const dx = toPx.x - fromPx.x;
    const dy = toPx.y - fromPx.y;
    const travelAngle = Math.atan2(dy, dx);
    for (const sk of anim._streaks) {
      const vis = Math.sin((elapsed + sk.phase) / 180) * 0.5 + 0.5;
      if (vis < 0.2) continue;
      const perpA = travelAngle + Math.PI / 2 + sk.offAngle * 0.3;
      const sx = cx + Math.cos(perpA) * sk.drift;
      const sy = cy + Math.sin(perpA) * sk.drift;
      const ex = sx + Math.cos(travelAngle + sk.offAngle * 0.2) * sk.len;
      const ey = sy + Math.sin(travelAngle + sk.offAngle * 0.2) * sk.len;
      ctx.globalAlpha = vis * 0.4;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // Lightning micro-forks (all spells; stronger for lightning school)
    const forkIntensity = variant === 1 ? 1.0 : 0.3;
    if (!anim._forks || anim._forkFrame !== Math.floor(elapsed / 120)) {
      anim._forkFrame = Math.floor(elapsed / 120);
      anim._forks = [];
      const forkN = variant === 1 ? FORK_N + 2 : FORK_N;
      for (let i = 0; i < forkN; i++) {
        const a = Math.random() * Math.PI * 2;
        const len = 6 + Math.random() * 12;
        anim._forks.push({ a, len, midA: a + (Math.random() - 0.5) * 0.8, midD: len * 0.45 });
      }
    }
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = pal.primary;
    ctx.shadowBlur = variant === 1 ? 10 : 4;
    for (const f of anim._forks) {
      ctx.globalAlpha = forkIntensity * (0.4 + Math.random() * 0.3);
      const mx = cx + Math.cos(f.midA) * f.midD;
      const my = cy + Math.sin(f.midA) * f.midD;
      const ex = cx + Math.cos(f.a) * f.len;
      const ey = cy + Math.sin(f.a) * f.len;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(mx, my);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Variant-specific flight overlay
    switch (variant) {
      case 1: {
        // Lightning: full zigzag bolt from source
        if (!anim._zigzag || anim._zigzagFrame !== Math.floor(elapsed / 60)) {
          anim._zigzagFrame = Math.floor(elapsed / 60);
          const segs = 10;
          const pts = [{ x: fromPx.x, y: fromPx.y }];
          for (let s = 1; s < segs; s++) {
            const frac = s / segs;
            const bx = fromPx.x + (cx - fromPx.x) * frac;
            const by = fromPx.y + (cy - fromPx.y) * frac;
            const perp = 16 * (Math.random() - 0.5);
            pts.push({ x: bx + perp, y: by + perp });
          }
          pts.push({ x: cx, y: cy });
          anim._zigzag = pts;
        }
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = pal.primary;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(anim._zigzag[0].x, anim._zigzag[0].y);
        for (let i = 1; i < anim._zigzag.length; i++) ctx.lineTo(anim._zigzag[i].x, anim._zigzag[i].y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        break;
      }
      case 2: {
        // Fire: rising embers
        if (!anim._embers) {
          anim._embers = [];
          for (let i = 0; i < 8; i++) {
            anim._embers.push({
              offX: (Math.random() - 0.5) * 12,
              speed: 0.3 + Math.random() * 0.5,
              size: 1 + Math.random() * 2,
              phase: Math.random() * 1000,
            });
          }
        }
        for (const em of anim._embers) {
          const age = ((elapsed + em.phase) % 600) / 600;
          const ex = cx + em.offX + Math.sin(elapsed / 200 + em.phase) * 4;
          const ey = cy - age * 18;
          ctx.globalAlpha = (1 - age) * 0.7;
          ctx.fillStyle = age > 0.5 ? pal.secondary : pal.primary;
          ctx.beginPath();
          ctx.arc(ex, ey, em.size * (1 - age * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 3: {
        // Frost: orbiting ice crystals
        for (let i = 0; i < 4; i++) {
          const a = elapsed / 250 + i * Math.PI / 2;
          const oR = 13 + Math.sin(elapsed / 180 + i) * 3;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = pal.secondary;
          ctx.save();
          ctx.translate(cx + Math.cos(a) * oR, cy + Math.sin(a) * oR);
          ctx.rotate(a * 2);
          ctx.fillRect(-2.5, -2.5, 5, 5);
          ctx.restore();
        }
        break;
      }
      case 4: {
        // Void/mind: counter-rotating ring of dots
        for (let i = 0; i < 6; i++) {
          const a = -elapsed / 200 + i * Math.PI * 2 / 6;
          const d = 10 + Math.sin(elapsed / 140 + i) * 3;
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = pal.accent;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default: {
        // Arcane: orbiting satellites
        for (let i = 0; i < 4; i++) {
          const a = elapsed / 220 + i * Math.PI * 2 / 4;
          const oR = 14 + Math.sin(elapsed / 160) * 3;
          ctx.globalAlpha = 0.65;
          ctx.fillStyle = pal.secondary;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * oR, cy + Math.sin(a) * oR, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Core glow
    const coreGlowR = 28;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreGlowR);
    cg.addColorStop(0, `rgba(${pal.glowRgb},0.55)`);
    cg.addColorStop(0.4, `rgba(${pal.glowRgb},0.18)`);
    cg.addColorStop(1, `rgba(${pal.glowRgb},0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, coreGlowR, 0, Math.PI * 2);
    ctx.fill();

    // Core orb
    ctx.fillStyle = pal.primary;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();

  } else {
    // ═══ IMPACT PHASE ═══
    const explosionElapsed = elapsed - FLIGHT_MS;
    const t = Math.min(1, explosionElapsed / EXPLOSION_MS);
    const ix = toPx.x;
    const iy = toPx.y;

    // Large flash
    const flashAlpha = Math.max(0, 1 - t * 2);
    if (flashAlpha > 0) {
      const fg = ctx.createRadialGradient(ix, iy, 0, ix, iy, 45);
      fg.addColorStop(0, `rgba(${pal.glowRgb},${flashAlpha * 0.6})`);
      fg.addColorStop(0.4, `rgba(${pal.glowRgb},${flashAlpha * 0.2})`);
      fg.addColorStop(1, `rgba(${pal.glowRgb},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(ix, iy, 45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mist explosion
    const mistExpR = 20 + t * 35;
    const mistExpA = Math.max(0, 1 - t * 1.5) * 0.25;
    if (mistExpA > 0) {
      const mfg = ctx.createRadialGradient(ix, iy, 0, ix, iy, mistExpR);
      mfg.addColorStop(0, `rgba(${pal.mistRgb},${mistExpA})`);
      mfg.addColorStop(0.6, `rgba(${pal.mistRgb},${mistExpA * 0.4})`);
      mfg.addColorStop(1, `rgba(${pal.mistRgb},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = mfg;
      ctx.beginPath();
      ctx.arc(ix, iy, mistExpR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Expanding ring
    const ringR = 6 + t * 30;
    const ringAlpha = Math.max(0, 1 - t);
    ctx.globalAlpha = ringAlpha * 0.7;
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 2.5 - t * 2;
    ctx.beginPath();
    ctx.arc(ix, iy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Sparks
    if (!anim._sparks) {
      anim._sparks = [];
      for (let i = 0; i < SPELL_SPARK_N; i++) {
        const angle = (i / SPELL_SPARK_N) * Math.PI * 2 + Math.random() * 0.4;
        anim._sparks.push({ angle, speed: 35 + Math.random() * 30, size: 1.5 + Math.random() * 2 });
      }
    }
    for (const s of anim._sparks) {
      const d = s.speed * t;
      ctx.globalAlpha = Math.max(0, 1 - t * 1.2) * 0.8;
      ctx.fillStyle = s.angle % 2 > 1 ? pal.secondary : pal.primary;
      ctx.beginPath();
      ctx.arc(ix + Math.cos(s.angle) * d, iy + Math.sin(s.angle) * d, s.size * (1 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }

    // Variant-specific impact overlay
    switch (variant) {
      case 1: {
        // Lightning: impact bolts
        if (!anim._impactBolts) {
          anim._impactBolts = [];
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
            const len = 18 + Math.random() * 24;
            anim._impactBolts.push({ angle: a, len, midAngle: a + (Math.random() - 0.5) * 0.6, midDist: len * 0.5 });
          }
        }
        const boltAlpha = Math.max(0, 1 - t * 1.3);
        ctx.globalAlpha = boltAlpha;
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = pal.primary;
        ctx.shadowBlur = 10;
        const reach = Math.min(1, t * 3);
        for (const b of anim._impactBolts) {
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(ix + Math.cos(b.midAngle) * b.midDist * reach, iy + Math.sin(b.midAngle) * b.midDist * reach);
          ctx.lineTo(ix + Math.cos(b.angle) * b.len * reach, iy + Math.sin(b.angle) * b.len * reach);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        break;
      }
      case 2: {
        // Fire: fiery burst
        const fireR = 8 + t * 32;
        const fireAlpha = Math.max(0, 1 - t);
        const ffg = ctx.createRadialGradient(ix, iy, 0, ix, iy, fireR);
        ffg.addColorStop(0, `rgba(${pal.glowRgb},${fireAlpha * 0.5})`);
        ffg.addColorStop(0.5, `rgba(${pal.glowRgb},${fireAlpha * 0.2})`);
        ffg.addColorStop(1, `rgba(${pal.glowRgb},0)`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = ffg;
        ctx.beginPath();
        ctx.arc(ix, iy, fireR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = fireAlpha * 0.5;
        ctx.strokeStyle = pal.secondary;
        ctx.lineWidth = 2 - t;
        ctx.beginPath();
        ctx.arc(ix, iy, fireR, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 3: {
        // Frost: snowflake arms
        const frostR = 6 + t * 28;
        const frostAlpha = Math.max(0, 1 - t) * 0.65;
        ctx.globalAlpha = frostAlpha;
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 1.5;
        const armLen = frostR * 0.85;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(ix + Math.cos(a) * armLen, iy + Math.sin(a) * armLen);
          ctx.stroke();
          const bLen = armLen * 0.4;
          const bx = ix + Math.cos(a) * armLen * 0.6;
          const by = iy + Math.sin(a) * armLen * 0.6;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a + 0.5) * bLen, by + Math.sin(a + 0.5) * bLen);
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a - 0.5) * bLen, by + Math.sin(a - 0.5) * bLen);
          ctx.stroke();
        }
        break;
      }
      case 4: {
        // Void/mind: implosion + dark flash
        const phase1 = Math.min(1, t * 2.5);
        if (phase1 < 1) {
          const impR = 30 * (1 - phase1);
          ctx.globalAlpha = (1 - phase1) * 0.5;
          ctx.strokeStyle = pal.primary;
          ctx.lineWidth = 3 * (1 - phase1);
          ctx.beginPath();
          ctx.arc(ix, iy, impR, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (t > 0.3 && t < 0.6) {
          const dfA = 1 - Math.abs(t - 0.45) / 0.15;
          const dfg = ctx.createRadialGradient(ix, iy, 0, ix, iy, 24);
          dfg.addColorStop(0, `rgba(${pal.mistRgb},${dfA * 0.7})`);
          dfg.addColorStop(1, `rgba(${pal.mistRgb},0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = dfg;
          ctx.beginPath();
          ctx.arc(ix, iy, 24, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default: {
        // Arcane: hexagonal ring
        const hR = 5 + t * 26;
        const alpha = Math.max(0, 1 - t) * 0.65;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 2 - t * 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + elapsed * 0.001;
          const px = ix + Math.cos(a) * hR;
          const py = iy + Math.sin(a) * hR;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  ctx.restore();
  return true;
}

/**
 * Draw a ranged-attack projectile (glowing orb + trail → explosion).
 * Delegates to drawSpellProjectile when spellVfxVariant is set.
 * Returns true while the animation is still running, false when done.
 */
export function drawProjectile(ctx, anim, canvasW, canvasH, now) {
  if (!anim) return false;
  if (anim.spellVfxVariant != null) return drawSpellProjectile(ctx, anim, canvasW, canvasH, now);
  const elapsed = now - anim.startTime;
  if (elapsed > FLIGHT_MS + EXPLOSION_MS) return false;

  const fromPx = cellToPixel(anim.fromCell.x, anim.fromCell.y, canvasW, canvasH);
  const cell = getCellSize(canvasW, canvasH);

  let toPx = cellToPixel(anim.toCell.x, anim.toCell.y, canvasW, canvasH);
  if (!anim.hit) {
    const offDist = cell * 0.35;
    toPx = { x: toPx.x + anim.missOffsetX * offDist, y: toPx.y + anim.missOffsetY * offDist };
  }

  ctx.save();

  if (elapsed <= FLIGHT_MS) {
    const t = easeOutCubic(Math.min(1, elapsed / FLIGHT_MS));
    const cx = fromPx.x + (toPx.x - fromPx.x) * t;
    const cy = fromPx.y + (toPx.y - fromPx.y) * t;

    if (!anim._trail) anim._trail = [];
    anim._trail.push({ x: cx, y: cy });
    if (anim._trail.length > TRAIL_LENGTH) anim._trail.shift();

    for (let i = 0; i < anim._trail.length; i++) {
      const p = anim._trail[i];
      const ratio = (i + 1) / anim._trail.length;
      const r = 2 + ratio * 3;
      ctx.globalAlpha = ratio * 0.35;
      ctx.fillStyle = COLORS.primary;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
    glowGrad.addColorStop(0, 'rgba(197,154,255,0.5)');
    glowGrad.addColorStop(0.5, 'rgba(197,154,255,0.15)');
    glowGrad.addColorStop(1, 'rgba(197,154,255,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.primary;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const explosionElapsed = elapsed - FLIGHT_MS;
    const t = Math.min(1, explosionElapsed / EXPLOSION_MS);
    const ix = toPx.x;
    const iy = toPx.y;

    const flashAlpha = Math.max(0, 1 - t * 2.5);
    if (flashAlpha > 0) {
      const flashGrad = ctx.createRadialGradient(ix, iy, 0, ix, iy, 28);
      flashGrad.addColorStop(0, `rgba(197,154,255,${flashAlpha * 0.6})`);
      flashGrad.addColorStop(0.4, `rgba(197,154,255,${flashAlpha * 0.2})`);
      flashGrad.addColorStop(1, 'rgba(197,154,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = flashGrad;
      ctx.beginPath();
      ctx.arc(ix, iy, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    const ringR = 4 + t * 20;
    const ringAlpha = Math.max(0, 1 - t);
    ctx.globalAlpha = ringAlpha * 0.7;
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 2 - t * 1.5;
    ctx.beginPath();
    ctx.arc(ix, iy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    if (!anim._sparks) {
      anim._sparks = [];
      for (let i = 0; i < SPARK_COUNT; i++) {
        const angle = (i / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 30 + Math.random() * 25;
        anim._sparks.push({ angle, speed, size: 1.5 + Math.random() * 1.5 });
      }
    }

    for (const spark of anim._sparks) {
      const dist = spark.speed * t;
      const sx = ix + Math.cos(spark.angle) * dist;
      const sy = iy + Math.sin(spark.angle) * dist;
      const sparkAlpha = Math.max(0, 1 - t * 1.2);
      const sparkSize = spark.size * (1 - t * 0.7);
      ctx.globalAlpha = sparkAlpha * 0.8;
      ctx.fillStyle = COLORS.primary;
      ctx.beginPath();
      ctx.arc(sx, sy, sparkSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  return true;
}

/**
 * Compute DOM positions for combat tokens on the 2D grid.
 */
export function computeTokenPositions(combatants, canvasW, canvasH) {
  const positions = [];
  const cellSlots = {};

  for (const c of combatants) {
    const pos = normalizePos(c.position);
    const key = `${pos.x}:${pos.y}`;
    if (!cellSlots[key]) cellSlots[key] = [];
    cellSlots[key].push(c);
  }

  for (const [cellKey, group] of Object.entries(cellSlots)) {
    const [colStr, rowStr] = cellKey.split(':');
    const px = cellToPixel(Number(colStr), Number(rowStr), canvasW, canvasH);

    if (group.length === 1) {
      positions.push({ combatant: group[0], x: px.x, y: px.y });
    } else {
      const offset = getTokenRadius(canvasW, canvasH) * 0.5;
      for (let i = 0; i < group.length; i++) {
        const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
        positions.push({
          combatant: group[i],
          x: px.x + Math.cos(angle) * offset,
          y: px.y + Math.sin(angle) * offset,
        });
      }
    }
  }

  return positions;
}
