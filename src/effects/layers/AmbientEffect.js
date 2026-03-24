/**
 * Subtle always-on ambient layer that adds atmosphere to every scene.
 *
 * Three composited sub-effects:
 *   1. Vignette    – radial gradient darkening at edges
 *   2. Dust motes  – very faint, slow-drifting micro-particles
 *   3. Border glow – soft "breathing" pulse of primary colour at edges
 *
 * Colors follow the Nikczemny Krzemuch design tokens.
 */

const COLORS = {
  primary:    [197, 154, 255],   // #c59aff
  primaryDim: [149,  71, 247],   // #9547f7
  surface:    [ 14,  14,  16],   // #0e0e10
  white:      [255, 251, 254],   // #fffbfe
  gold:       [255, 239, 213],   // #ffefd5
};

const DUST_COUNT = 35;
const DUST_SPEED_RANGE  = [3, 10];
const DUST_SIZE_RANGE   = [0.6, 1.8];
const DUST_LIFE_RANGE   = [5, 12];
const DUST_BASE_ALPHA   = 0.12;

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
/*  AmbientEffect                                                      */
/* ------------------------------------------------------------------ */

export default class AmbientEffect {
  /** @param {{ glow?: boolean }} [options] */
  constructor(options = {}) {
    this.glowEnabled = options.glow ?? true;

    this.width  = 0;
    this.height = 0;
    this.time   = 0;

    this.motes    = [];
    this.finished = false;

    this._vignetteGrad = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Layer interface                                                   */
  /* ---------------------------------------------------------------- */

  init(_ctx, width, height) {
    this.width  = width;
    this.height = height;
    this._buildVignette(_ctx);
    this._fillMotes();
  }

  update(dt, intensity = 1) {
    this.time += dt;

    for (const m of this.motes) {
      m.age += dt;

      if (m.age >= m.lifetime) {
        this._respawnMote(m);
        continue;
      }

      m.x += m.vx * dt;
      m.y += m.vy * dt;

      m.x += Math.sin(m.age * m.noiseFreq) * 0.15;

      if (m.x < -5)             m.x = this.width + 5;
      else if (m.x > this.width + 5) m.x = -5;
      if (m.y < -5)             m.y = this.height + 5;
      else if (m.y > this.height + 5) m.y = -5;

      const t = m.age / m.lifetime;
      const fade = t < 0.2 ? t / 0.2
                 : t > 0.8 ? (1 - t) / 0.2
                 : 1;
      m.alpha = fade * DUST_BASE_ALPHA * intensity;
    }
  }

  draw(ctx, intensity = 1) {
    const w = this.width;
    const h = this.height;

    ctx.save();

    /* --- 1. Vignette ------------------------------------------------ */
    if (!this._vignetteGrad && w > 0 && h > 0) {
      this._buildVignette(ctx);
    }
    if (this._vignetteGrad) {
      ctx.globalAlpha = 0.55 * intensity;
      ctx.fillStyle = this._vignetteGrad;
      ctx.fillRect(0, 0, w, h);
    }

    /* --- 2. Dust motes ---------------------------------------------- */
    for (const m of this.motes) {
      if (m.alpha <= 0) continue;
      const [r, g, b] = m.color;
      ctx.globalAlpha = m.alpha;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }

    /* --- 3. Border glow --------------------------------------------- */
    if (this.glowEnabled) {
      this._drawBorderGlow(ctx, intensity);
    }

    ctx.restore();
  }

  resize(width, height) {
    this.width  = width;
    this.height = height;
    this._vignetteGrad = null; // rebuild lazily next draw
  }

  destroy() {
    this.motes = [];
    this._vignetteGrad = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Vignette                                                         */
  /* ---------------------------------------------------------------- */

  _buildVignette(ctx) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = Math.hypot(cx, cy);

    const grad = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
    const [sr, sg, sb] = COLORS.surface;
    grad.addColorStop(0,   `rgba(${sr},${sg},${sb},0)`);
    grad.addColorStop(0.6, `rgba(${sr},${sg},${sb},0.15)`);
    grad.addColorStop(0.85,`rgba(${sr},${sg},${sb},0.5)`);
    grad.addColorStop(1,   `rgba(${sr},${sg},${sb},0.85)`);
    this._vignetteGrad = grad;
  }

  /* ---------------------------------------------------------------- */
  /*  Border glow                                                      */
  /* ---------------------------------------------------------------- */

  _drawBorderGlow(ctx, intensity) {
    const w = this.width;
    const h = this.height;

    const breathe = 0.5 + 0.5 * Math.sin(this.time * 0.8);
    const alpha   = (0.03 + breathe * 0.05) * intensity;
    const spread  = 40 + breathe * 20;

    const [pr, pg, pb] = COLORS.primary;
    const color0 = `rgba(${pr},${pg},${pb},${alpha})`;
    const color1 = `rgba(${pr},${pg},${pb},0)`;

    ctx.globalAlpha = 1;

    // top edge
    const top = ctx.createLinearGradient(0, 0, 0, spread);
    top.addColorStop(0, color0);
    top.addColorStop(1, color1);
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, spread);

    // bottom edge
    const bottom = ctx.createLinearGradient(0, h, 0, h - spread);
    bottom.addColorStop(0, color0);
    bottom.addColorStop(1, color1);
    ctx.fillStyle = bottom;
    ctx.fillRect(0, h - spread, w, spread);

    // left edge
    const left = ctx.createLinearGradient(0, 0, spread, 0);
    left.addColorStop(0, color0);
    left.addColorStop(1, color1);
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, spread, h);

    // right edge
    const right = ctx.createLinearGradient(w, 0, w - spread, 0);
    right.addColorStop(0, color0);
    right.addColorStop(1, color1);
    ctx.fillStyle = right;
    ctx.fillRect(w - spread, 0, spread, h);
  }

  /* ---------------------------------------------------------------- */
  /*  Dust motes                                                       */
  /* ---------------------------------------------------------------- */

  _fillMotes() {
    this.motes = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      const m = this._createMote();
      m.age = rand(0, m.lifetime * 0.9);
      this.motes.push(m);
    }
  }

  _createMote() {
    const speed = rand(...DUST_SPEED_RANGE);
    const angle = rand(0, Math.PI * 2);
    return {
      x:         rand(0, this.width),
      y:         rand(0, this.height),
      vx:        Math.cos(angle) * speed,
      vy:        Math.sin(angle) * speed * 0.5,
      size:      rand(...DUST_SIZE_RANGE),
      color:     pick([COLORS.white, COLORS.gold, COLORS.primary]),
      alpha:     0,
      age:       0,
      lifetime:  rand(...DUST_LIFE_RANGE),
      noiseFreq: rand(0.8, 2.5),
    };
  }

  _respawnMote(m) {
    const speed = rand(...DUST_SPEED_RANGE);
    const angle = rand(0, Math.PI * 2);
    m.x         = rand(0, this.width);
    m.y         = rand(0, this.height);
    m.vx        = Math.cos(angle) * speed;
    m.vy        = Math.sin(angle) * speed * 0.5;
    m.size      = rand(...DUST_SIZE_RANGE);
    m.color     = pick([COLORS.white, COLORS.gold, COLORS.primary]);
    m.alpha     = 0;
    m.age       = 0;
    m.lifetime  = rand(...DUST_LIFE_RANGE);
    m.noiseFreq = rand(0.8, 2.5);
  }
}
