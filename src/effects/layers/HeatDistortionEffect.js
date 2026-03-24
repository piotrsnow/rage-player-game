/**
 * Rising heat-shimmer bands in the lower portion of the viewport.
 *
 * Renders semi-transparent horizontal strips with sinusoidal offset and
 * alpha variation that slowly rise, creating the illusion of convective
 * distortion above hot surfaces. Good for fire and chaotic scenes.
 */

const BAND_COUNT = 18;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export default class HeatDistortionEffect {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.elapsed = 0;
    this.finished = false;

    this.bands = [];
  }

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
    this._buildBands();
  }

  update(dt) {
    this.elapsed += dt;

    for (const b of this.bands) {
      b.y -= b.speed * dt;
      if (b.y < this.height * 0.2) {
        this._resetBand(b);
      }
    }
  }

  draw(ctx, intensity = 1) {
    if (intensity <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const b of this.bands) {
      const normY = (b.y - this.height * 0.2) / (this.height * 0.8);
      const fadeIn = Math.min(1, normY * 3);
      const fadeOut = normY > 0.8 ? (1 - normY) / 0.2 : 1;
      const alpha = b.baseAlpha * intensity * fadeIn * fadeOut;
      if (alpha < 0.003) continue;

      const waveOffset = Math.sin(this.elapsed * b.freq + b.phase) * b.amplitude;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgba(255,240,210,1)`;
      ctx.fillRect(
        waveOffset,
        b.y,
        this.width,
        b.thickness,
      );
    }

    ctx.restore();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  destroy() {
    this.bands = [];
  }

  _buildBands() {
    this.bands = [];
    for (let i = 0; i < BAND_COUNT; i++) {
      const b = this._createBand();
      b.y = rand(this.height * 0.35, this.height);
      this.bands.push(b);
    }
  }

  _createBand() {
    return {
      y: this.height + rand(0, 20),
      speed: rand(8, 25),
      thickness: rand(1.5, 4),
      baseAlpha: rand(0.015, 0.04),
      freq: rand(1.5, 4),
      amplitude: rand(3, 12),
      phase: rand(0, Math.PI * 2),
    };
  }

  _resetBand(b) {
    Object.assign(b, this._createBand());
  }
}
