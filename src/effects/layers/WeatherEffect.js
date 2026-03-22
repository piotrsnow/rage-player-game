/**
 * Weather layer supporting rain, snow, fire, and storm variants.
 *
 * Variants
 * --------
 * rain   – angled streaks with splash particles at the bottom
 * snow   – soft drifting circles with horizontal sine wobble
 * fire   – bottom-up orange/red particles with upward acceleration
 * storm  – rain combined with intermittent lightning flashes
 *
 * All colours align with the Nikczemny Krzemuch design tokens.
 */

/* ------------------------------------------------------------------ */
/*  Design-system colours (rgb components)                             */
/* ------------------------------------------------------------------ */

const COLORS = {
  rainDrop:   [180, 200, 230],
  rainSplash: [200, 215, 240],
  snowflake:  [255, 251, 254],  // on_surface #fffbfe
  fireOrange: [255, 180,  80],
  fireRed:    [255, 110, 132],  // error #ff6e84
  fireGold:   [255, 239, 213],  // tertiary #ffefd5
  lightning:  [197, 154, 255],  // primary #c59aff
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------------------ */
/*  Sub-systems                                                        */
/* ------------------------------------------------------------------ */

/**
 * Manages a pool of rain drops that fall as angled streaks plus small
 * splash particles that burst on impact at the bottom edge.
 */
class RainSystem {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.drops = [];
    this.splashes = [];
    this.windAngle = 0.18; // radians – slight diagonal
  }

  populate(count) {
    this.drops = [];
    for (let i = 0; i < count; i++) {
      this.drops.push(this._spawnDrop(true));
    }
  }

  update(dt, intensity) {
    const speed = 600 + intensity * 500;
    const windX = Math.sin(this.windAngle) * speed;
    const windY = Math.cos(this.windAngle) * speed;

    for (const d of this.drops) {
      d.x += windX * dt;
      d.y += windY * dt;

      if (d.y > this.height) {
        if (Math.random() < 0.4 * intensity) {
          this._spawnSplash(d.x, this.height);
        }
        this._resetDrop(d);
      }
      if (d.x > this.width + 20) {
        d.x = -20;
      }
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.age += dt;
      if (s.age >= s.lifetime) {
        this.splashes.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 300 * dt; // gravity pulls splash down
    }
  }

  draw(ctx, intensity) {
    const [r, g, b] = COLORS.rainDrop;
    const baseAlpha = 0.25 + intensity * 0.35;
    const len = 14 + intensity * 18;

    ctx.save();
    ctx.strokeStyle = `rgba(${r},${g},${b},${baseAlpha})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const d of this.drops) {
      const dx = Math.sin(this.windAngle) * len * d.size;
      const dy = Math.cos(this.windAngle) * len * d.size;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + dx, d.y + dy);
    }
    ctx.stroke();
    ctx.restore();

    // splashes
    if (this.splashes.length > 0) {
      const [sr, sg, sb] = COLORS.rainSplash;
      ctx.save();
      for (const s of this.splashes) {
        const t = s.age / s.lifetime;
        const alpha = (1 - t) * 0.5 * intensity;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${sr},${sg},${sb})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
  }

  _spawnDrop(stagger) {
    return {
      x: rand(-40, this.width + 40),
      y: stagger ? rand(-this.height * 0.3, this.height) : rand(-this.height * 0.3, -10),
      size: rand(0.6, 1.3),
    };
  }

  _resetDrop(d) {
    d.x = rand(-40, this.width + 40);
    d.y = rand(-this.height * 0.3, -10);
    d.size = rand(0.6, 1.3);
  }

  _spawnSplash(x, y) {
    const count = Math.floor(rand(2, 5));
    for (let i = 0; i < count; i++) {
      this.splashes.push({
        x,
        y: y - rand(0, 4),
        vx: rand(-40, 40),
        vy: rand(-80, -30),
        size: rand(1, 2.5),
        age: 0,
        lifetime: rand(0.15, 0.35),
      });
    }
  }
}

/**
 * Soft circles drifting downward with horizontal sine wobble.
 */
class SnowSystem {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.flakes = [];
  }

  populate(count) {
    this.flakes = [];
    for (let i = 0; i < count; i++) {
      this.flakes.push(this._spawnFlake(true));
    }
  }

  update(dt) {
    for (const f of this.flakes) {
      f.age += dt;
      f.y += f.speed * dt;
      f.x += Math.sin(f.age * f.wobbleFreq) * f.wobbleAmp * dt;

      if (f.y > this.height + 10) {
        this._resetFlake(f);
      }
      if (f.x < -10) f.x = this.width + 10;
      else if (f.x > this.width + 10) f.x = -10;
    }
  }

  draw(ctx, intensity) {
    const [r, g, b] = COLORS.snowflake;
    ctx.save();
    for (const f of this.flakes) {
      const alpha = f.alpha * intensity;
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
  }

  _spawnFlake(stagger) {
    return {
      x: rand(0, this.width),
      y: stagger ? rand(-20, this.height) : rand(-this.height * 0.2, -10),
      size: rand(1.5, 4.5),
      speed: rand(20, 55),
      alpha: rand(0.3, 0.75),
      age: rand(0, 20),
      wobbleFreq: rand(0.6, 2),
      wobbleAmp: rand(15, 40),
    };
  }

  _resetFlake(f) {
    Object.assign(f, this._spawnFlake(false));
  }
}

/**
 * Bottom-up orange/red particles with upward acceleration and short lifespan.
 */
class FireSystem {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.particles = [];
  }

  populate(count) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push(this._spawnParticle(true));
    }
  }

  update(dt) {
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.lifetime) {
        this._resetParticle(p);
        continue;
      }
      p.vy -= p.accel * dt; // accelerate upward
      p.y += p.vy * dt;
      p.x += p.vx * dt + Math.sin(p.age * p.noiseFreq) * 0.6;
    }
  }

  draw(ctx, intensity) {
    ctx.save();
    for (const p of this.particles) {
      const t = p.age / p.lifetime;
      const alpha = (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9) * intensity * 0.8;
      if (alpha <= 0) continue;

      const [r, g, b] = p.color;
      const radius = p.size * (1 - t * 0.4);

      // glow
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius + 6 * intensity);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.9})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.3})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      const box = radius + 6 * intensity;
      ctx.fillRect(p.x - box, p.y - box, box * 2, box * 2);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
  }

  _spawnParticle(stagger) {
    const lifetime = rand(0.5, 1.6);
    return {
      x: rand(this.width * 0.05, this.width * 0.95),
      y: stagger
        ? rand(this.height * 0.3, this.height)
        : this.height + rand(0, 10),
      vx: rand(-15, 15),
      vy: rand(-40, -80),
      accel: rand(50, 130),
      size: rand(2, 5.5),
      color: pick([COLORS.fireOrange, COLORS.fireRed, COLORS.fireGold]),
      age: stagger ? rand(0, lifetime * 0.8) : 0,
      lifetime,
      noiseFreq: rand(2, 5),
    };
  }

  _resetParticle(p) {
    Object.assign(p, this._spawnParticle(false));
  }
}

/**
 * Occasional full-screen lightning flash for the storm variant.
 */
class LightningSystem {
  constructor() {
    this.flash = 0;       // current flash brightness 0..1
    this.cooldown = 0;    // seconds until next possible flash
    this._nextCooldown();
  }

  update(dt, intensity) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.5);
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0 && intensity > 0.2) {
      this.flash = 0.5 + intensity * 0.5;
      this._nextCooldown();
    }
  }

  draw(ctx, width, height, intensity) {
    if (this.flash <= 0) return;
    const [r, g, b] = COLORS.lightning;
    const alpha = this.flash * 0.25 * intensity;
    ctx.save();
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  _nextCooldown() {
    this.cooldown = rand(2, 7);
  }
}

/* ------------------------------------------------------------------ */
/*  Density presets (base counts before intensity scaling)             */
/* ------------------------------------------------------------------ */

const DENSITY = {
  rain:  { drops: 300 },
  snow:  { flakes: 150 },
  fire:  { particles: 120 },
  storm: { drops: 400 },
};

/* ------------------------------------------------------------------ */
/*  WeatherEffect                                                      */
/* ------------------------------------------------------------------ */

export default class WeatherEffect {
  /**
   * @param {{ type?: 'rain'|'snow'|'fire'|'storm', intensity?: number }} [options]
   */
  constructor(options = {}) {
    this.type = options.type ?? 'rain';
    this.configIntensity = Math.max(0, Math.min(1, options.intensity ?? 0.7));

    this.width = 0;
    this.height = 0;
    this.finished = false;

    this._rain = null;
    this._snow = null;
    this._fire = null;
    this._lightning = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Layer interface                                                  */
  /* ---------------------------------------------------------------- */

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
    this._buildSystems();
  }

  update(dt, engineIntensity = 1) {
    const eff = this.configIntensity * engineIntensity;

    if (this._rain) this._rain.update(dt, eff);
    if (this._snow) this._snow.update(dt);
    if (this._fire) this._fire.update(dt);
    if (this._lightning) this._lightning.update(dt, eff);
  }

  draw(ctx, engineIntensity = 1) {
    const eff = this.configIntensity * engineIntensity;

    if (this._rain) this._rain.draw(ctx, eff);
    if (this._snow) this._snow.draw(ctx, eff);
    if (this._fire) this._fire.draw(ctx, eff);
    if (this._lightning) this._lightning.draw(ctx, this.width, this.height, eff);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    if (this._rain) this._rain.resize(width, height);
    if (this._snow) this._snow.resize(width, height);
    if (this._fire) this._fire.resize(width, height);
  }

  destroy() {
    this._rain = null;
    this._snow = null;
    this._fire = null;
    this._lightning = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Internal                                                         */
  /* ---------------------------------------------------------------- */

  _buildSystems() {
    const scaledCount = (base) =>
      Math.max(10, Math.round(base * this.configIntensity));

    switch (this.type) {
      case 'rain': {
        this._rain = new RainSystem(this.width, this.height);
        this._rain.populate(scaledCount(DENSITY.rain.drops));
        break;
      }
      case 'snow': {
        this._snow = new SnowSystem(this.width, this.height);
        this._snow.populate(scaledCount(DENSITY.snow.flakes));
        break;
      }
      case 'fire': {
        this._fire = new FireSystem(this.width, this.height);
        this._fire.populate(scaledCount(DENSITY.fire.particles));
        break;
      }
      case 'storm': {
        this._rain = new RainSystem(this.width, this.height);
        this._rain.populate(scaledCount(DENSITY.storm.drops));
        this._lightning = new LightningSystem();
        break;
      }
      default: {
        this._rain = new RainSystem(this.width, this.height);
        this._rain.populate(scaledCount(DENSITY.rain.drops));
      }
    }
  }
}
