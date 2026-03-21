/**
 * Pooled particle layer with four visual variants.
 *
 * Variants
 * --------
 * magic_dust  – purple / gold slow-floating motes
 * sparks      – fast upward orange sparks
 * embers      – red slow-rising embers
 * arcane      – violet spiralling orbits
 *
 * Colors are drawn from the Obsidian Grimoire design tokens.
 */

/* ------------------------------------------------------------------ */
/*  Design-system colours (rgba components)                           */
/* ------------------------------------------------------------------ */

const COLORS = {
  purple:     [197, 154, 255],  // primary  #c59aff
  purpleDim:  [149,  71, 247],  // primary_dim  #9547f7
  gold:       [255, 239, 213],  // tertiary  #ffefd5
  orange:     [255, 180,  80],
  red:        [255, 110, 132],  // error  #ff6e84
  violet:     [176, 117, 255],  // primary_fixed_dim  #b075ff
  white:      [255, 251, 254],  // on_surface  #fffbfe
};

/* ------------------------------------------------------------------ */
/*  Variant presets                                                    */
/* ------------------------------------------------------------------ */

const VARIANT_PRESETS = {
  magic_dust: {
    poolSize: 100,
    colors: [COLORS.purple, COLORS.gold, COLORS.purpleDim],
    speedRange: [8, 25],
    sizeRange: [1.5, 4],
    lifetimeRange: [3, 6],
    drift: 0.4,            // horizontal wobble amplitude
    gravity: -6,           // negative = floats upward
    glow: true,
    glowRadius: 8,
  },

  sparks: {
    poolSize: 80,
    colors: [COLORS.orange, COLORS.gold, COLORS.white],
    speedRange: [60, 120],
    sizeRange: [1, 2.5],
    lifetimeRange: [0.6, 1.4],
    drift: 0.8,
    gravity: -90,
    glow: false,
    glowRadius: 0,
  },

  embers: {
    poolSize: 70,
    colors: [COLORS.red, COLORS.orange],
    speedRange: [10, 30],
    sizeRange: [2, 5],
    lifetimeRange: [3, 7],
    drift: 0.3,
    gravity: -12,
    glow: true,
    glowRadius: 10,
  },

  arcane: {
    poolSize: 120,
    colors: [COLORS.violet, COLORS.purple, COLORS.purpleDim],
    speedRange: [20, 50],
    sizeRange: [1, 3],
    lifetimeRange: [2, 5],
    drift: 0,               // orbit-driven, not drift-driven
    gravity: 0,
    glow: true,
    glowRadius: 6,
    orbit: true,             // enables spiral motion
    orbitRadiusRange: [30, 120],
    orbitSpeedRange: [1.5, 3.5],
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function easeAlpha(t) {
  // smooth fade-in during first 15 %, fade-out during last 25 %
  if (t < 0.15) return t / 0.15;
  if (t > 0.75) return (1 - t) / 0.25;
  return 1;
}

/* ------------------------------------------------------------------ */
/*  ParticleEffect                                                    */
/* ------------------------------------------------------------------ */

export default class ParticleEffect {
  /**
   * @param {{ variant?: string }} [options]
   */
  constructor(options = {}) {
    const variantName = options.variant ?? 'magic_dust';
    this.preset = VARIANT_PRESETS[variantName] ?? VARIANT_PRESETS.magic_dust;

    this.pool = [];
    this.width = 0;
    this.height = 0;

    /** Set by EffectEngine when the layer should auto-remove itself. */
    this.finished = false;
  }

  /* ---------------------------------------------------------------- */
  /*  Layer interface                                                  */
  /* ---------------------------------------------------------------- */

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
    this._fillPool();
  }

  update(dt, intensity = 1) {
    const p = this.preset;

    for (const particle of this.pool) {
      if (!particle.alive) {
        this._respawn(particle);
        continue;
      }

      particle.age += dt;
      if (particle.age >= particle.lifetime) {
        particle.alive = false;
        continue;
      }

      if (p.orbit) {
        particle.orbitAngle += particle.orbitSpeed * dt;
        particle.x = particle.cx + Math.cos(particle.orbitAngle) * particle.orbitRadius;
        particle.y = particle.cy + Math.sin(particle.orbitAngle) * particle.orbitRadius;
        // slowly drift the orbit centre upward
        particle.cy += p.gravity * dt * 0.3;
      } else {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += p.gravity * dt;

        // horizontal noise wobble
        if (p.drift > 0) {
          particle.x += Math.sin(particle.age * particle.noiseFreq) * p.drift;
        }
      }

      // wrap horizontally so particles don't all vanish off-screen
      if (particle.x < -10) particle.x = this.width + 10;
      else if (particle.x > this.width + 10) particle.x = -10;

      const lifeT = particle.age / particle.lifetime;
      particle.alpha = easeAlpha(lifeT) * intensity;
    }
  }

  draw(ctx, intensity = 1) {
    const p = this.preset;

    ctx.save();
    for (const particle of this.pool) {
      if (!particle.alive || particle.alpha <= 0) continue;

      const [r, g, b] = particle.color;
      const alpha = particle.alpha;

      if (p.glow && p.glowRadius > 0) {
        const grad = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, particle.size + p.glowRadius * intensity,
        );
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.9})`);
        grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.35})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(
          particle.x - p.glowRadius - particle.size,
          particle.y - p.glowRadius - particle.size,
          (p.glowRadius + particle.size) * 2,
          (p.glowRadius + particle.size) * 2,
        );
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  destroy() {
    this.pool = [];
  }

  /* ---------------------------------------------------------------- */
  /*  Internal                                                        */
  /* ---------------------------------------------------------------- */

  /** Pre-populate the pool, staggering initial ages so particles don't
   *  all appear simultaneously on first frame. */
  _fillPool() {
    const { poolSize } = this.preset;
    this.pool = [];
    for (let i = 0; i < poolSize; i++) {
      const particle = this._createParticle();
      // stagger: start each particle at a random point in its lifetime
      particle.age = rand(0, particle.lifetime * 0.9);
      this.pool.push(particle);
    }
  }

  _createParticle() {
    const p = this.preset;
    const lifetime = rand(...p.lifetimeRange);
    const speed = rand(...p.speedRange);
    const angle = rand(0, Math.PI * 2);

    const particle = {
      alive: true,
      x: rand(0, this.width),
      y: rand(0, this.height),
      vx: Math.cos(angle) * speed * 0.3,
      vy: -Math.abs(Math.sin(angle) * speed),   // bias upward
      size: rand(...p.sizeRange),
      color: pick(p.colors),
      alpha: 0,
      age: 0,
      lifetime,
      noiseFreq: rand(1.5, 4),
    };

    if (p.orbit) {
      particle.cx = rand(this.width * 0.15, this.width * 0.85);
      particle.cy = rand(this.height * 0.15, this.height * 0.85);
      particle.orbitRadius = rand(...p.orbitRadiusRange);
      particle.orbitAngle = rand(0, Math.PI * 2);
      particle.orbitSpeed = rand(...p.orbitSpeedRange) * (Math.random() > 0.5 ? 1 : -1);
      particle.x = particle.cx + Math.cos(particle.orbitAngle) * particle.orbitRadius;
      particle.y = particle.cy + Math.sin(particle.orbitAngle) * particle.orbitRadius;
    }

    return particle;
  }

  /** Recycle a dead particle back to a fresh random state. */
  _respawn(particle) {
    const p = this.preset;
    const lifetime = rand(...p.lifetimeRange);
    const speed = rand(...p.speedRange);
    const angle = rand(0, Math.PI * 2);

    particle.alive = true;
    particle.age = 0;
    particle.lifetime = lifetime;
    particle.alpha = 0;
    particle.size = rand(...p.sizeRange);
    particle.color = pick(p.colors);
    particle.noiseFreq = rand(1.5, 4);

    if (p.orbit) {
      particle.cx = rand(this.width * 0.15, this.width * 0.85);
      particle.cy = rand(this.height * 0.15, this.height * 0.85);
      particle.orbitRadius = rand(...p.orbitRadiusRange);
      particle.orbitAngle = rand(0, Math.PI * 2);
      particle.orbitSpeed = rand(...p.orbitSpeedRange) * (Math.random() > 0.5 ? 1 : -1);
      particle.x = particle.cx + Math.cos(particle.orbitAngle) * particle.orbitRadius;
      particle.y = particle.cy + Math.sin(particle.orbitAngle) * particle.orbitRadius;
    } else {
      particle.x = rand(0, this.width);
      particle.y = this.height + rand(5, 20);  // spawn just below viewport
      particle.vx = Math.cos(angle) * speed * 0.3;
      particle.vy = -Math.abs(Math.sin(angle) * speed);
    }
  }
}
