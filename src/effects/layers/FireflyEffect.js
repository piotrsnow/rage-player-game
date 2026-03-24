/**
 * Lazily drifting firefly lights that pulse on and off.
 *
 * Distinct from the dust motes in AmbientEffect: fireflies are larger,
 * slower, have a visible glow halo, and follow a smooth blink cycle
 * rather than a linear fade-in/fade-out lifecycle.
 *
 * Warm yellow-green palette for night / forest / candlelight scenes.
 */

const FIREFLY_COUNT = 22;

const LIGHTING_PALETTES = {
  night:       [[180, 220, 100], [200, 235, 120], [160, 200,  80]],
  candlelight: [[255, 210, 120], [255, 190, 100], [240, 175,  90]],
  moonlight:   [[180, 200, 240], [200, 220, 255], [160, 190, 230]],
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default class FireflyEffect {
  /** @param {{ lighting?: string }} [options] */
  constructor(options = {}) {
    this.palette = LIGHTING_PALETTES[options.lighting] ?? LIGHTING_PALETTES.night;

    this.width = 0;
    this.height = 0;
    this.finished = false;

    this.flies = [];
  }

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
    this._populate();
  }

  update(dt, intensity = 1) {
    for (const f of this.flies) {
      f.age += dt;

      f.x += f.vx * dt + Math.sin(f.age * f.wobbleFreq) * 0.3;
      f.y += f.vy * dt + Math.cos(f.age * f.wobbleFreq * 0.7) * 0.2;

      if (f.x < -20) f.x = this.width + 20;
      else if (f.x > this.width + 20) f.x = -20;
      if (f.y < -20) f.y = this.height + 20;
      else if (f.y > this.height + 20) f.y = -20;

      const blinkPhase = (f.age * f.blinkSpeed + f.blinkOffset) % 1;
      const blinkCurve = blinkPhase < 0.4
        ? Math.sin((blinkPhase / 0.4) * Math.PI * 0.5)
        : blinkPhase < 0.6
          ? 1
          : Math.cos(((blinkPhase - 0.6) / 0.4) * Math.PI * 0.5);

      f.alpha = Math.max(0, blinkCurve) * f.baseAlpha * intensity;
    }
  }

  draw(ctx, intensity = 1) {
    if (intensity <= 0) return;

    ctx.save();
    for (const f of this.flies) {
      if (f.alpha < 0.005) continue;

      const [r, g, b] = f.color;
      const glowR = f.size + f.glowRadius;

      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, glowR);
      grad.addColorStop(0, `rgba(${r},${g},${b},${f.alpha * 0.95})`);
      grad.addColorStop(0.3, `rgba(${r},${g},${b},${f.alpha * 0.45})`);
      grad.addColorStop(0.7, `rgba(${r},${g},${b},${f.alpha * 0.10})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(f.x - glowR, f.y - glowR, glowR * 2, glowR * 2);

      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  destroy() {
    this.flies = [];
  }

  _populate() {
    this.flies = [];
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      this.flies.push(this._createFly());
    }
  }

  _createFly() {
    const speed = rand(2, 8);
    const angle = rand(0, Math.PI * 2);
    return {
      x: rand(0, this.width),
      y: rand(0, this.height),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6,
      size: rand(1.5, 3),
      glowRadius: rand(10, 22),
      color: pick(this.palette),
      baseAlpha: rand(0.35, 0.75),
      alpha: 0,
      age: rand(0, 30),
      blinkSpeed: rand(0.15, 0.35),
      blinkOffset: rand(0, 1),
      wobbleFreq: rand(0.4, 1.2),
    };
  }
}
