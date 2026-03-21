/**
 * Scene transition effects that self-remove after completion.
 *
 * Types
 * -----
 * dissolve     – random-block noise wipe through dark
 * fade         – smooth opacity fade through surface-dark
 * arcane_wipe  – iris close/open with a glowing arcane ring
 *
 * All transitions run for ~1–1.5 s then set `finished = true`
 * so the EffectEngine auto-removes the layer.
 */

/* ------------------------------------------------------------------ */
/*  Design-system colours                                              */
/* ------------------------------------------------------------------ */

const COLORS = {
  surface: [14, 14, 16],      // #0e0e10
  purple:  [197, 154, 255],   // primary      #c59aff
  violet:  [176, 117, 255],   // primary_fixed_dim  #b075ff
  gold:    [255, 239, 213],   // tertiary     #ffefd5
};

/* ------------------------------------------------------------------ */
/*  Per-type presets                                                    */
/* ------------------------------------------------------------------ */

const PRESETS = {
  dissolve:    { duration: 1.2, blockSize: 10 },
  fade:        { duration: 1.0 },
  arcane_wipe: { duration: 1.4, ringWidth: 35, runeCount: 12 },
};

/* ------------------------------------------------------------------ */
/*  Easing helpers                                                     */
/* ------------------------------------------------------------------ */

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

/* ------------------------------------------------------------------ */
/*  TransitionEffect                                                   */
/* ------------------------------------------------------------------ */

export default class TransitionEffect {
  /**
   * @param {{ type?: 'dissolve'|'fade'|'arcane_wipe', duration?: number }} [options]
   */
  constructor(options = {}) {
    this.type = options.type ?? 'fade';
    const preset = PRESETS[this.type] ?? PRESETS.fade;

    this.duration  = options.duration ?? preset.duration;
    this.blockSize = preset.blockSize ?? 10;
    this.ringWidth = preset.ringWidth ?? 35;
    this.runeCount = preset.runeCount ?? 12;

    this.elapsed  = 0;
    this.finished = false;
    this.width    = 0;
    this.height   = 0;

    this._dissolveThresholds = null;
    this._dissolveCols = 0;
    this._dissolveRows = 0;
    this._runeAngles = null;
  }

  /* ------ Layer interface ----------------------------------------- */

  init(_ctx, width, height) {
    this.width  = width;
    this.height = height;
    this.elapsed  = 0;
    this.finished = false;

    if (this.type === 'dissolve')    this._buildDissolveMap();
    if (this.type === 'arcane_wipe') this._buildRuneAngles();
  }

  update(dt) {
    if (this.finished) return;
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.elapsed  = this.duration;
      this.finished = true;
    }
  }

  draw(ctx) {
    if (this.finished) return;

    const progress = Math.min(this.elapsed / this.duration, 1);

    switch (this.type) {
      case 'dissolve':
        this._drawDissolve(ctx, progress);
        break;
      case 'arcane_wipe':
        this._drawArcaneWipe(ctx, progress);
        break;
      default:
        this._drawFade(ctx, progress);
        break;
    }
  }

  resize(width, height) {
    this.width  = width;
    this.height = height;
    if (this.type === 'dissolve') this._buildDissolveMap();
  }

  destroy() {
    this._dissolveThresholds = null;
    this._runeAngles = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Dissolve – random-block noise wipe                               */
  /* ---------------------------------------------------------------- */

  _buildDissolveMap() {
    const cols  = Math.ceil(this.width  / this.blockSize);
    const rows  = Math.ceil(this.height / this.blockSize);
    const total = cols * rows;

    this._dissolveThresholds = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      this._dissolveThresholds[i] = Math.random();
    }
    this._dissolveCols = cols;
    this._dissolveRows = rows;
  }

  _drawDissolve(ctx, progress) {
    const map = this._dissolveThresholds;
    if (!map) return;

    const cols = this._dissolveCols;
    const rows = this._dissolveRows;
    const bs   = this.blockSize;

    // 0→0.5 blocks fill in;  0.5→1 blocks clear out
    const threshold = progress <= 0.5
      ? progress * 2
      : (1 - progress) * 2;

    const [r, g, b] = COLORS.surface;
    ctx.save();
    ctx.fillStyle = `rgb(${r},${g},${b})`;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (map[row * cols + col] < threshold) {
          ctx.fillRect(col * bs, row * bs, bs, bs);
        }
      }
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  Fade – smooth opacity through black                              */
  /* ---------------------------------------------------------------- */

  _drawFade(ctx, progress) {
    const [r, g, b] = COLORS.surface;
    const alpha = progress <= 0.5
      ? easeInOutCubic(progress * 2)
      : easeInOutCubic((1 - progress) * 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  Arcane Wipe – iris close / open with glowing ring                */
  /* ---------------------------------------------------------------- */

  _buildRuneAngles() {
    this._runeAngles = [];
    for (let i = 0; i < this.runeCount; i++) {
      this._runeAngles.push(
        (Math.PI * 2 * i) / this.runeCount + Math.random() * 0.3,
      );
    }
  }

  _drawArcaneWipe(ctx, progress) {
    const cx = this.width  / 2;
    const cy = this.height / 2;
    const maxRadius = Math.hypot(cx, cy) + this.ringWidth;

    // Phase 1 (0→0.5): hole shrinks – dark overlay covers old scene
    // Phase 2 (0.5→1): hole expands – reveals new scene
    const isClosing = progress <= 0.5;
    const phase = isClosing ? progress * 2 : (progress - 0.5) * 2;
    const eased = easeOutQuart(phase);

    const holeRadius = isClosing
      ? maxRadius * (1 - eased)
      : maxRadius * eased;

    ctx.save();

    // Dark overlay with circular cutout (even-odd fill via CCW arc)
    const [sr, sg, sb] = COLORS.surface;
    ctx.fillStyle = `rgb(${sr},${sg},${sb})`;
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    if (holeRadius > 0.5) {
      ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2, true);
    }
    ctx.fill();

    // Glowing ring at the hole edge
    const ringVisible = holeRadius > 1 && holeRadius < maxRadius - 1;
    if (ringVisible) {
      const rw     = this.ringWidth;
      const innerR = Math.max(0, holeRadius - rw * 0.6);
      const outerR = holeRadius + rw * 0.6;

      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      const [pr, pg, pb] = COLORS.purple;
      const [vr, vg, vb] = COLORS.violet;
      grad.addColorStop(0,    `rgba(${pr},${pg},${pb},0)`);
      grad.addColorStop(0.35, `rgba(${vr},${vg},${vb},0.35)`);
      grad.addColorStop(0.5,  `rgba(${pr},${pg},${pb},0.7)`);
      grad.addColorStop(0.65, `rgba(${vr},${vg},${vb},0.35)`);
      grad.addColorStop(1,    `rgba(${pr},${pg},${pb},0)`);

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();

      this._drawRunes(ctx, cx, cy, holeRadius, progress);
    }

    ctx.restore();
  }

  /** Gold rune dots orbiting the ring edge. */
  _drawRunes(ctx, cx, cy, radius, progress) {
    if (!this._runeAngles) return;

    const [gr, gg, gb] = COLORS.gold;
    const dotRadius = 6;
    const spin = progress * Math.PI * 4;

    for (const baseAngle of this._runeAngles) {
      const angle = baseAngle + spin;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, dotRadius);
      grad.addColorStop(0,   `rgba(${gr},${gg},${gb},0.9)`);
      grad.addColorStop(0.5, `rgba(${gr},${gg},${gb},0.3)`);
      grad.addColorStop(1,   `rgba(${gr},${gg},${gb},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
