// Pure canvas rendering for the player world map.
// No React, no DOM reads — takes plain inputs + a 2D context and draws.
//
// Grid range is a GLOBAL constant because the canonical world
// (backend/src/scripts/seedWorld.js) is the same for every campaign. It is
// not derived from per-campaign `Campaign.worldBounds` — that field exists
// for ring-spawn / AI-placement guardrails, not for "how big is the map".

import { BIOME_REGIONS } from '../../../../shared/domain/biomeMap.js';

const GRID_MIN = -10;
const GRID_MAX = 10;
const GRID_SPAN = GRID_MAX - GRID_MIN;
const CELL_KM = 1;

// Biome fill palette — muted parchment-friendly tones; the SVG palette would
// drown out POI dots so we crank alpha down. Layer order matches BIOME_REGIONS
// (background plains first, overlays on top) so a Wilcze-Pustkowia ellipse
// inside Czarnobór reads correctly.
const BIOME_FILL = {
  plains: 'rgba(170, 142, 60, 0.45)',
  forest: 'rgba(45, 90, 61, 0.55)',
  hills: 'rgba(140, 122, 82, 0.45)',
  mountains: 'rgba(90, 100, 112, 0.6)',
  swamp: 'rgba(74, 93, 44, 0.55)',
  wasteland: 'rgba(138, 108, 63, 0.5)',
  urban: 'rgba(181, 69, 69, 0.5)',
  coast: 'rgba(75, 167, 199, 0.45)',
};

const TYPE_COLOR = {
  capital: '#d4a545',
  city: '#c09030',
  town: '#a07828',
  village: '#8a7040',
  hamlet: '#706048',
  dungeon: '#7a3838',
  cave: '#5a3a50',
  ruins: '#6a5a78',
  forest: '#486040',
  wilderness: '#5a5438',
  camp: '#8a6840',
  shrine: '#7a78a0',
  interior: '#5c4d38',
  generic: '#5c4d38',
};

const DANGER_RING = {
  safe: null,
  moderate: 'rgba(200,160,60,0.55)',
  dangerous: 'rgba(210,100,50,0.7)',
  deadly: 'rgba(220,60,60,0.85)',
};

export const mapGeometry = { GRID_MIN, GRID_MAX, GRID_SPAN, CELL_KM };

export function computePxPerKm(width, height) {
  const pad = 16;
  const usable = Math.min(width, height) - pad * 2;
  return Math.max(4, usable / GRID_SPAN);
}

export function worldToScreen(wx, wy, pxPerKm, width, height) {
  const gridPx = GRID_SPAN * pxPerKm;
  const ox = (width - gridPx) / 2;
  const oy = (height - gridPx) / 2;
  // Y inverted so N (positive regionY) is up on screen.
  return {
    x: ox + (wx - GRID_MIN) * pxPerKm,
    y: oy + (GRID_MAX - wy) * pxPerKm,
  };
}

export function screenToWorld(sx, sy, pxPerKm, width, height) {
  const gridPx = GRID_SPAN * pxPerKm;
  const ox = (width - gridPx) / 2;
  const oy = (height - gridPx) / 2;
  return {
    x: (sx - ox) / pxPerKm + GRID_MIN,
    y: GRID_MAX - (sy - oy) / pxPerKm,
  };
}

export function drawParchment(ctx, w, h) {
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, 'rgba(45,36,28,0.95)');
  grad.addColorStop(1, 'rgba(25,20,15,0.98)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function drawGridLines(ctx, pxPerKm, w, h) {
  const gridPx = GRID_SPAN * pxPerKm;
  const ox = (w - gridPx) / 2;
  const oy = (h - gridPx) / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(120,100,70,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SPAN; i += CELL_KM) {
    const x = ox + i * pxPerKm;
    ctx.beginPath();
    ctx.moveTo(x, oy);
    ctx.lineTo(x, oy + gridPx);
    ctx.stroke();
    const y = oy + i * pxPerKm;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + gridPx, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(160,130,85,0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, gridPx, gridPx);

  ctx.strokeStyle = 'rgba(200,160,80,0.18)';
  ctx.lineWidth = 1;
  const axis = worldToScreen(0, 0, pxPerKm, w, h);
  ctx.beginPath();
  ctx.moveTo(axis.x, oy);
  ctx.lineTo(axis.x, oy + gridPx);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ox, axis.y);
  ctx.lineTo(ox + gridPx, axis.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Paint the biome layer below grid + POIs. Walks BIOME_REGIONS in order so
 * overlay regions (Wilcze Pustkowia, swamp, etc.) draw on top of the plains
 * background, matching the SVG layer order. Skips the [0] background entry
 * — we paint a single `plains` rect first to cover any uncovered area.
 */
export function drawBiomeLayer(ctx, pxPerKm, w, h) {
  const gridPx = GRID_SPAN * pxPerKm;
  const ox = (w - gridPx) / 2;
  const oy = (h - gridPx) / 2;
  ctx.save();
  // Background plains across the whole grid.
  ctx.fillStyle = BIOME_FILL.plains;
  ctx.fillRect(ox, oy, gridPx, gridPx);

  // Overlay polygons (skip [0] which is the bare-plains fallback).
  for (let i = 1; i < BIOME_REGIONS.length; i++) {
    const region = BIOME_REGIONS[i];
    const polygon = region.polygon;
    if (!polygon || polygon.length === 0) continue;
    ctx.fillStyle = BIOME_FILL[region.biome] || BIOME_FILL.plains;
    ctx.beginPath();
    for (let j = 0; j < polygon.length; j++) {
      const [wx, wy] = polygon[j];
      const s = worldToScreen(wx, wy, pxPerKm, w, h);
      if (j === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Player marker at continuous (wx, wy). Used both for free-vector wandering
 * (Campaign.currentX/Y) and as an alternative way to highlight position when
 * anchored at a POI. Renders as a pulsing crosshair so it's distinguishable
 * from POI tile pulses.
 */
export function drawPlayerMarker(ctx, wx, wy, pxPerKm, w, h, pulse = 0) {
  const s = worldToScreen(wx, wy, pxPerKm, w, h);
  const r = Math.max(5, pxPerKm * 0.18);
  ctx.save();
  // Outer glow
  const glowR = r + 6 + pulse * 4;
  const glow = ctx.createRadialGradient(s.x, s.y, r * 0.4, s.x, s.y, glowR);
  glow.addColorStop(0, 'rgba(245, 232, 188, 0.7)');
  glow.addColorStop(1, 'rgba(245, 232, 188, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(s.x, s.y, glowR, 0, Math.PI * 2);
  ctx.fill();
  // Core dot
  ctx.fillStyle = '#f5e8bc';
  ctx.strokeStyle = 'rgba(40,30,20,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Crosshair ticks
  ctx.strokeStyle = '#1a140c';
  ctx.lineWidth = 1.2;
  const t = r * 0.4;
  ctx.beginPath();
  ctx.moveTo(s.x - r, s.y);
  ctx.lineTo(s.x - t, s.y);
  ctx.moveTo(s.x + t, s.y);
  ctx.lineTo(s.x + r, s.y);
  ctx.moveTo(s.x, s.y - r);
  ctx.lineTo(s.x, s.y - t);
  ctx.moveTo(s.x, s.y + t);
  ctx.lineTo(s.x, s.y + r);
  ctx.stroke();
  ctx.restore();
}

export function drawEdge(ctx, a, b, { discovered }) {
  ctx.save();
  ctx.strokeStyle = discovered ? 'rgba(180,150,100,0.55)' : 'rgba(120,100,70,0.18)';
  ctx.lineWidth = discovered ? 1.5 : 1;
  if (!discovered) ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

export function drawTile(ctx, loc, screen, pxPerKm, opts) {
  const { fog, isCurrent, isHovered, pulse } = opts;
  if (fog === 'unknown') return;

  const r = Math.max(6, Math.min(18, pxPerKm * 0.35));
  const color = TYPE_COLOR[loc.locationType] || TYPE_COLOR.generic;
  const dashed = fog === 'heardAbout';
  const alpha = fog === 'heardAbout' ? 0.45 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (isCurrent) {
    const glowR = r + 8 + pulse * 6;
    const glow = ctx.createRadialGradient(screen.x, screen.y, r, screen.x, screen.y, glowR);
    glow.addColorStop(0, 'rgba(240,212,138,0.55)');
    glow.addColorStop(1, 'rgba(240,212,138,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  const dangerRing = DANGER_RING[loc.dangerLevel];
  if (dangerRing) {
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = dangerRing;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
  const inner = ctx.createRadialGradient(screen.x - 2, screen.y - 2, 0, screen.x, screen.y, r);
  if (isCurrent) {
    inner.addColorStop(0, '#f5d88a');
    inner.addColorStop(1, color);
  } else if (isHovered) {
    inner.addColorStop(0, lighten(color, 0.25));
    inner.addColorStop(1, color);
  } else {
    inner.addColorStop(0, lighten(color, 0.1));
    inner.addColorStop(1, color);
  }
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.lineWidth = dashed ? 1.5 : 1;
  if (dashed) ctx.setLineDash([4, 3]);
  ctx.strokeStyle = isCurrent ? '#f0d48a' : 'rgba(40,30,20,0.8)';
  ctx.stroke();
  ctx.setLineDash([]);

  const name = loc.displayName || loc.canonicalName || '';
  ctx.font = `${isCurrent ? 'bold ' : ''}10px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle = 'rgba(15,12,8,0.85)';
  ctx.lineWidth = 3;
  ctx.fillStyle = isCurrent ? '#f0d48a' : 'rgba(210,190,155,0.95)';
  ctx.strokeText(name, screen.x, screen.y + r + 3);
  ctx.fillText(name, screen.x, screen.y + r + 3);

  ctx.restore();
}

export function pickLocationAt(wx, wy, locations, fogVisited, fogHeard) {
  let best = null;
  let bestDist = 0.6;
  for (const loc of locations) {
    if (loc.parentLocationId) continue;
    const state = tileFogState(loc, fogVisited, fogHeard);
    if (state === 'unknown') continue;
    const d = Math.hypot(wx - loc.regionX, wy - loc.regionY);
    if (d < bestDist) { bestDist = d; best = loc; }
  }
  return best;
}

export function tileFogState(loc, fogVisited, fogHeard) {
  if (fogVisited.has(loc.id)) return 'visited';
  if (fogHeard.has(loc.id)) return 'heardAbout';
  return 'unknown';
}

function lighten(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + 255 * amt));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + 255 * amt));
  const b = Math.min(255, Math.round((n & 0xff) + 255 * amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
