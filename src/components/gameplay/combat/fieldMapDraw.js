/**
 * Drawing module for the field/exploration map canvas.
 * Mirrors combatCanvasDraw.js but for the non-combat "map" visualization mode.
 */

import { getTileDef, isPortalTile } from '../../../../shared/domain/battlefieldTiles.js';
import { getTilePattern } from '../../../services/combat/tilePatterns.js';

export const GRID_PAD = 10;

export const COLORS = {
  bg: '#0e0e10',
  bgGrad: '#141416',
  gridLine: 'rgba(72,71,74,0.18)',
  gridLineMajor: 'rgba(72,71,74,0.35)',
  playerRing: '#c59aff',
  allyRing: '#ffefd5',
  enemyRing: '#ff6e84',
  neutralRing: '#48474a',
};

// ── Grid math ──

export function getFieldCellSize(canvasW, canvasH, gridW, gridH) {
  const availW = canvasW - GRID_PAD * 2;
  const availH = canvasH - GRID_PAD * 2;
  return Math.min(availW / gridW, availH / gridH);
}

export function getFieldGridOrigin(canvasW, canvasH, gridW, gridH) {
  const cell = getFieldCellSize(canvasW, canvasH, gridW, gridH);
  return {
    x: (canvasW - gridW * cell) / 2,
    y: (canvasH - gridH * cell) / 2,
  };
}

export function fieldCellToPixel(col, row, canvasW, canvasH, gridW, gridH) {
  const cell = getFieldCellSize(canvasW, canvasH, gridW, gridH);
  const origin = getFieldGridOrigin(canvasW, canvasH, gridW, gridH);
  return {
    x: origin.x + (col + 0.5) * cell,
    y: origin.y + (row + 0.5) * cell,
  };
}

export function fieldPixelToCell(px, py, canvasW, canvasH, gridW, gridH) {
  const cell = getFieldCellSize(canvasW, canvasH, gridW, gridH);
  const origin = getFieldGridOrigin(canvasW, canvasH, gridW, gridH);
  const col = Math.floor((px - origin.x) / cell);
  const row = Math.floor((py - origin.y) / cell);
  if (col < 0 || col >= gridW || row < 0 || row >= gridH) return null;
  return { x: col, y: row };
}

// ── Drawing ──

const PARTICLE_COUNT = 20;

export function initFieldParticles(w, h) {
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -Math.random() * 0.3 - 0.1,
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.25 + 0.05,
      hue: 140 + Math.random() * 60,
    });
  }
  return particles;
}

export function drawFieldBackground(ctx, w, h, now, particles) {
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(14,14,16,0.92)');
  grad.addColorStop(1, 'rgba(20,20,22,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.2,
    w / 2, h / 2, Math.max(w, h) * 0.75,
  );
  vignette.addColorStop(0, 'rgba(100,180,100,0.015)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
    if (p.x < -5) p.x = w + 5;
    if (p.x > w + 5) p.x = -5;
    const flicker = 0.6 + 0.4 * Math.sin(now / 1000 + p.x);
    ctx.globalAlpha = p.alpha * flicker;
    ctx.fillStyle = `hsl(${p.hue}, 50%, 60%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawFieldGrid(ctx, canvasW, canvasH, gridW, gridH, tiles) {
  const cell = getFieldCellSize(canvasW, canvasH, gridW, gridH);
  const origin = getFieldGridOrigin(canvasW, canvasH, gridW, gridH);
  const totalW = gridW * cell;
  const totalH = gridH * cell;

  ctx.fillStyle = 'rgba(25,25,28,0.5)';
  ctx.fillRect(origin.x - 1, origin.y - 1, totalW + 2, totalH + 2);

  if (tiles) {
    for (let col = 0; col < gridW; col++) {
      for (let row = 0; row < gridH; row++) {
        const tileId = tiles[col]?.[row];
        if (!tileId) continue;
        const def = getTileDef(tileId);
        if (!def) continue;

        const cx = origin.x + col * cell;
        const cy = origin.y + row * cell;

        ctx.fillStyle = def.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(cx, cy, cell, cell);

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

        if (!def.passable) {
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
        }
      }
    }
  }

  // Portal glow overlay
  if (tiles) {
    const now = performance.now();
    for (let col = 0; col < gridW; col++) {
      for (let row = 0; row < gridH; row++) {
        if (!isPortalTile(tiles[col]?.[row])) continue;
        const cx = origin.x + col * cell;
        const cy = origin.y + row * cell;
        const pulse = 0.25 + 0.15 * Math.sin(now / 600);
        ctx.fillStyle = `rgba(58, 210, 230, ${pulse})`;
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = `rgba(100, 240, 255, ${pulse + 0.1})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
      }
    }
    ctx.lineWidth = 1;
  }

  // Subtle grid lines
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.4;
  for (let col = 0; col <= gridW; col++) {
    const x = origin.x + col * cell;
    ctx.beginPath();
    ctx.moveTo(x, origin.y);
    ctx.lineTo(x, origin.y + totalH);
    ctx.stroke();
  }
  for (let row = 0; row <= gridH; row++) {
    const y = origin.y + row * cell;
    ctx.beginPath();
    ctx.moveTo(origin.x, y);
    ctx.lineTo(origin.x + totalW, y);
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.gridLineMajor;
  ctx.lineWidth = 1;
  ctx.strokeRect(origin.x, origin.y, totalW, totalH);
}

/**
 * Compute DOM positions for field-map entity tokens.
 */
export function computeFieldTokenPositions(entities, canvasW, canvasH, gridW, gridH) {
  return entities.map((e) => {
    const px = fieldCellToPixel(e.x, e.y, canvasW, canvasH, gridW, gridH);
    return { entity: e, x: px.x, y: px.y };
  });
}
