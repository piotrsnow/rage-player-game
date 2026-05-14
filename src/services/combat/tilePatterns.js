/**
 * Canvas pattern rendering for battlefield structural tiles.
 * Each pattern is drawn into a small OffscreenCanvas and cached as a CanvasPattern.
 */

const _cache = new Map();

function createPatternCanvas(size, drawFn) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size, size)
    : document.createElement('canvas');
  if (c.width !== size) { c.width = size; c.height = size; }
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  return c;
}

function getCached(ctx, key, size, drawFn) {
  const cacheKey = `${key}_${size}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);
  const patCanvas = createPatternCanvas(size, drawFn);
  const pat = ctx.createPattern(patCanvas, 'repeat');
  _cache.set(cacheKey, pat);
  return pat;
}

export function clearPatternCache() {
  _cache.clear();
}

const PATTERN_DRAW = {
  solid(_ctx, _s) {},

  brick(ctx, s) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    const half = s / 2;
    ctx.strokeRect(0, 0, s, half);
    ctx.strokeRect(half, half, s, half);
    ctx.strokeRect(-half, half, s, half);
  },

  crosshatch(ctx, s) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(s, s);
    ctx.moveTo(s, 0); ctx.lineTo(0, s);
    ctx.stroke();
  },

  diagonal_stripes(ctx, s) {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = -s; i < s * 2; i += 4) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + s, s);
    }
    ctx.stroke();
  },

  dots(ctx, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const gap = s / 3;
    for (let x = gap; x < s; x += gap) {
      for (let y = gap; y < s; y += gap) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  waves(ctx, s) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = s * 0.3; y < s; y += s * 0.4) {
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(s * 0.25, y - 3, s * 0.5, y);
      ctx.quadraticCurveTo(s * 0.75, y + 3, s, y);
    }
    ctx.stroke();
  },

  grass_tufts(ctx, s) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    const cx = s * 0.3, cy = s * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx - 2, cy - 4);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + 1, cy - 5);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + 3, cy - 3);
    ctx.stroke();
    const cx2 = s * 0.75, cy2 = s * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 - 1, cy2 - 4);
    ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + 2, cy2 - 3);
    ctx.stroke();
  },

  cobble(ctx, s) {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.8;
    const q = s / 4;
    ctx.beginPath();
    ctx.arc(q, q, q * 0.8, 0, Math.PI * 2);
    ctx.arc(q * 3, q, q * 0.7, 0, Math.PI * 2);
    ctx.arc(q * 2, q * 3, q * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  },

  wood_grain(ctx, s) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let y = 2; y < s; y += 3) {
      ctx.moveTo(0, y + Math.sin(y) * 0.5);
      ctx.lineTo(s, y + Math.sin(y + 1) * 0.5);
    }
    ctx.stroke();
  },

  crystals(ctx, s) {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    const cx = s * 0.5, cy = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 3, cy); ctx.closePath();
    ctx.stroke();
  },

  cracks(ctx, s) {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.1);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.lineTo(s * 0.4, s * 0.9);
    ctx.moveTo(s * 0.5, s * 0.5);
    ctx.lineTo(s * 0.85, s * 0.6);
    ctx.stroke();
  },

  snow_dots(ctx, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const positions = [[0.2, 0.3], [0.7, 0.15], [0.5, 0.6], [0.15, 0.8], [0.8, 0.75]];
    for (const [px, py] of positions) {
      ctx.beginPath();
      ctx.arc(s * px, s * py, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  mud_spots(ctx, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    const positions = [[0.3, 0.25], [0.7, 0.5], [0.2, 0.7], [0.8, 0.2]];
    for (const [px, py] of positions) {
      ctx.beginPath();
      ctx.ellipse(s * px, s * py, 2.5, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  vines(ctx, s) {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.3);
    ctx.quadraticCurveTo(s * 0.4, s * 0.1, s * 0.5, s * 0.5);
    ctx.quadraticCurveTo(s * 0.6, s * 0.9, s, s * 0.7);
    ctx.stroke();
  },
};

/**
 * Get (or create + cache) a CanvasPattern for the given pattern key.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} patternKey - one of the PATTERN_DRAW keys
 * @param {number} cellSize - tile cell size in px
 * @returns {CanvasPattern|null}
 */
export function getTilePattern(ctx, patternKey, cellSize) {
  if (patternKey === 'solid' || !PATTERN_DRAW[patternKey]) return null;
  const size = Math.max(8, Math.round(cellSize));
  return getCached(ctx, patternKey, size, PATTERN_DRAW[patternKey]);
}
