/**
 * Subtle lens flare artifacts along a diagonal from a bright light source.
 *
 * Draws 3–5 semi-transparent circles / hexagons of varying size and colour
 * along an axis from the source point through the viewport centre. The
 * artefacts gently breathe and shift, adding photographic realism.
 *
 * Triggered by lighting: 'bright' or 'dawn'.
 */

const FLARE_COUNT = 5;

const LIGHTING_CONFIGS = {
  bright: { sourceColor: [255, 250, 240], warmth: 0.3 },
  dawn:   { sourceColor: [255, 210, 160], warmth: 0.6 },
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function lerpColor(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export default class LensFlareEffect {
  /** @param {{ lighting?: string }} [options] */
  constructor(options = {}) {
    const cfg = LIGHTING_CONFIGS[options.lighting] ?? LIGHTING_CONFIGS.bright;
    this.sourceColor = cfg.sourceColor;
    this.warmth = cfg.warmth;

    this.width = 0;
    this.height = 0;
    this.elapsed = 0;
    this.finished = false;

    this.flares = [];
    this._sourceX = 0;
    this._sourceY = 0;
  }

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
    this._sourceX = width * rand(0.25, 0.75);
    this._sourceY = height * rand(0.05, 0.2);
    this._buildFlares();
  }

  update(dt) {
    this.elapsed += dt;
  }

  draw(ctx, intensity = 1) {
    if (intensity <= 0) return;

    const cx = this.width / 2;
    const cy = this.height / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const f of this.flares) {
      const breathe = 0.7 + 0.3 * Math.sin(this.elapsed * f.breathFreq + f.phase);
      const alpha = f.baseAlpha * intensity * breathe;
      if (alpha < 0.003) continue;

      const fx = this._sourceX + (cx - this._sourceX) * f.axisT;
      const fy = this._sourceY + (cy - this._sourceY) * f.axisT;
      const radius = f.radius * (0.9 + 0.1 * breathe);

      const [r, g, b] = f.color;

      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.8})`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.3})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  resize(width, height) {
    const sx = this.width > 0 ? width / this.width : 1;
    const sy = this.height > 0 ? height / this.height : 1;
    this._sourceX *= sx;
    this._sourceY *= sy;
    for (const f of this.flares) {
      f.radius *= Math.max(sx, sy);
    }
    this.width = width;
    this.height = height;
  }

  destroy() {
    this.flares = [];
  }

  _buildFlares() {
    this.flares = [];
    const minDim = Math.min(this.width, this.height);

    const warm = [255, 180, 100];
    const cool = [180, 200, 255];

    for (let i = 0; i < FLARE_COUNT; i++) {
      const t = (i + 1) / (FLARE_COUNT + 1);
      const tintT = this.warmth + (1 - this.warmth) * (i / FLARE_COUNT);
      this.flares.push({
        axisT: 0.3 + t * 1.4,
        radius: rand(minDim * 0.03, minDim * 0.12),
        baseAlpha: rand(0.03, 0.08),
        color: lerpColor(cool, warm, tintT).map(Math.round),
        breathFreq: rand(0.3, 0.7),
        phase: rand(0, Math.PI * 2),
      });
    }
  }
}
