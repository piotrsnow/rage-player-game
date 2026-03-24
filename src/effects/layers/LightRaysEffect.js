/**
 * God rays / crepuscular light beams radiating from a point near the top
 * of the viewport. Several translucent wedge shapes slowly drift and
 * breathe for an atmospheric, volumetric-light feel.
 *
 * Triggered by lighting values: 'rays', 'dawn', 'bright'.
 */

const RAY_COUNT = 7;

const LIGHTING_CONFIGS = {
  rays:  { color: [255, 245, 220], baseAlpha: 0.07, spread: 0.65 },
  dawn:  { color: [255, 200, 140], baseAlpha: 0.09, spread: 0.70 },
  bright:{ color: [255, 250, 235], baseAlpha: 0.06, spread: 0.55 },
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export default class LightRaysEffect {
  /** @param {{ lighting?: string }} [options] */
  constructor(options = {}) {
    const cfg = LIGHTING_CONFIGS[options.lighting] ?? LIGHTING_CONFIGS.rays;
    this.color = cfg.color;
    this.baseAlpha = cfg.baseAlpha;
    this.spread = cfg.spread;

    this.width = 0;
    this.height = 0;
    this.elapsed = 0;
    this.finished = false;

    this.rays = [];
    this._sourceX = 0;
    this._sourceY = 0;
  }

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
    this._sourceX = width * rand(0.3, 0.7);
    this._sourceY = -height * 0.05;
    this._buildRays();
  }

  update(dt) {
    this.elapsed += dt;
  }

  draw(ctx, intensity = 1) {
    if (intensity <= 0) return;
    const [r, g, b] = this.color;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const ray of this.rays) {
      const breathe = 0.6 + 0.4 * Math.sin(this.elapsed * ray.breathFreq + ray.phase);
      const alpha = this.baseAlpha * intensity * breathe;
      if (alpha <= 0.005) continue;

      const angle = ray.baseAngle + Math.sin(this.elapsed * ray.driftFreq + ray.phase) * 0.03;
      const halfWidth = ray.widthFactor * this.spread;
      const reach = this.height * 1.3;

      const dx1 = Math.cos(angle - halfWidth) * reach;
      const dy1 = Math.sin(angle - halfWidth) * reach;
      const dx2 = Math.cos(angle + halfWidth) * reach;
      const dy2 = Math.sin(angle + halfWidth) * reach;

      const grad = ctx.createLinearGradient(
        this._sourceX, this._sourceY,
        this._sourceX, this._sourceY + this.height,
      );
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(this._sourceX, this._sourceY);
      ctx.lineTo(this._sourceX + dx1, this._sourceY + dy1);
      ctx.lineTo(this._sourceX + dx2, this._sourceY + dy2);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  resize(width, height) {
    const sx = this.width > 0 ? width / this.width : 1;
    this._sourceX *= sx;
    this._sourceY = -height * 0.05;
    this.width = width;
    this.height = height;
  }

  destroy() {
    this.rays = [];
  }

  _buildRays() {
    this.rays = [];
    const arcStart = Math.PI * 0.3;
    const arcEnd = Math.PI * 0.7;

    for (let i = 0; i < RAY_COUNT; i++) {
      const t = (i + rand(0.2, 0.8)) / RAY_COUNT;
      this.rays.push({
        baseAngle: arcStart + (arcEnd - arcStart) * t,
        widthFactor: rand(0.02, 0.06),
        breathFreq: rand(0.3, 0.8),
        driftFreq: rand(0.1, 0.3),
        phase: rand(0, Math.PI * 2),
      });
    }
  }
}
