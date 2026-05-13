import { gameData } from '../../../services/gameDataService';

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

export function drawBattlefield(ctx, canvasW, canvasH, _now) {
  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const cell = getCellSize(canvasW, canvasH);
  const origin = getGridOrigin(canvasW, canvasH);
  const gridW = W * cell;
  const gridH = H * cell;

  ctx.fillStyle = 'rgba(25,25,28,0.6)';
  ctx.fillRect(origin.x - 2, origin.y - 2, gridW + 4, gridH + 4);

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

    // Emoji icon
    const emojiAlpha = tile.consumed ? 0.12 : 0.75 + 0.15 * Math.sin(now / 600 + tile.x);
    ctx.globalAlpha = emojiAlpha;
    const fontSize = cell * 0.5;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.emoji, centerX, centerY);

    ctx.restore();
  }
}

function alphaHex(a) {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}

export function drawMovementZone(ctx, canvasW, canvasH, myCombatant, hoverCell, now) {
  const remaining = myCombatant.movementAllowance - (myCombatant.movementUsed || 0);
  if (remaining <= 0) return;

  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const pos = normalizePos(myCombatant.position);
  const cell = getCellSize(canvasW, canvasH);
  const origin = getGridOrigin(canvasW, canvasH);
  const t = now ?? performance.now();
  const dashOffset = (t / 40) % 16;

  const inZone = (col, row) => {
    if (col < 0 || col >= W || row < 0 || row >= H) return false;
    return Math.max(Math.abs(col - pos.x), Math.abs(row - pos.y)) <= remaining;
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

  if (hoverCell) {
    const dist = Math.max(Math.abs(hoverCell.x - pos.x), Math.abs(hoverCell.y - pos.y));
    if (dist > 0 && dist <= remaining) {
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

export function drawRangeIndicator(ctx, fromCombatant, toCombatant, canvasW, canvasH) {
  if (!fromCombatant || !toCombatant) return;
  const fp = normalizePos(fromCombatant.position);
  const tp = normalizePos(toCombatant.position);
  const p1 = cellToPixel(fp.x, fp.y, canvasW, canvasH);
  const p2 = cellToPixel(tp.x, tp.y, canvasW, canvasH);
  const dist = Math.max(Math.abs(fp.x - tp.x), Math.abs(fp.y - tp.y));

  ctx.save();
  ctx.strokeStyle = 'rgba(197,154,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  ctx.fillStyle = 'rgba(197,154,255,0.6)';
  ctx.font = 'bold 10px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${dist}`, midX, midY - 4);
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

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Draw a ranged-attack projectile (glowing orb + trail → explosion).
 * Returns true while the animation is still running, false when done.
 */
export function drawProjectile(ctx, anim, canvasW, canvasH, now) {
  if (!anim) return false;
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
