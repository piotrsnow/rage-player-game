/**
 * Drifting fog / smoke layer composed of large semi-transparent radial
 * gradient "clouds" that move with sine-based offsets for organic motion.
 *
 * Mood tinting
 * ------------
 * mystical  – purple haze  (primary #c59aff)
 * dark      – cool grey smoke
 * peaceful  – soft green mist
 * tense     – desaturated red-grey
 * chaotic   – warm amber / orange haze
 *
 * Multiple blobs move at different speeds to create a parallax depth feel.
 */

/* ------------------------------------------------------------------ */
/*  Design-system colour palettes per mood                            */
/* ------------------------------------------------------------------ */

const MOOD_PALETTES = {
  mystical: [
    [149, 71, 247],   // primary_dim  #9547f7
    [197, 154, 255],  // primary      #c59aff
    [176, 117, 255],  // primary_fixed_dim  #b075ff
  ],
  dark: [
    [50, 50, 58],
    [72, 71, 74],     // outline_variant  #48474a
    [40, 40, 48],
  ],
  peaceful: [
    [80, 160, 110],
    [100, 180, 130],
    [60, 140, 100],
  ],
  tense: [
    [110, 60, 70],
    [90, 50, 60],
    [130, 70, 80],
  ],
  chaotic: [
    [200, 130, 60],
    [255, 180, 80],
    [180, 100, 50],
  ],
};

const DEFAULT_MOOD = 'mystical';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* ------------------------------------------------------------------ */
/*  FogEffect                                                         */
/* ------------------------------------------------------------------ */

const BLOB_COUNT = 5;

export default class FogEffect {
  /**
   * @param {{ mood?: string }} [options]
   */
  constructor(options = {}) {
    this.mood = options.mood ?? DEFAULT_MOOD;
    this.palette = MOOD_PALETTES[this.mood] ?? MOOD_PALETTES[DEFAULT_MOOD];

    this.blobs = [];
    this.width = 0;
    this.height = 0;
    this.elapsed = 0;

    this.finished = false;
  }

  /* ---------------------------------------------------------------- */
  /*  Layer interface                                                  */
  /* ---------------------------------------------------------------- */

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
    this._createBlobs();
  }

  update(dt, intensity = 1) {
    this.elapsed += dt;

    for (const blob of this.blobs) {
      const t = this.elapsed;

      // Organic horizontal drift: sum of two sine waves at different frequencies
      blob.x = blob.anchorX
        + Math.sin(t * blob.freqX + blob.phaseX) * blob.amplitudeX
        + Math.sin(t * blob.freqX * 0.37 + blob.phaseX * 1.7) * blob.amplitudeX * 0.4;

      // Subtle vertical float
      blob.y = blob.anchorY
        + Math.sin(t * blob.freqY + blob.phaseY) * blob.amplitudeY;

      // Slow radius "breathing"
      blob.currentRadius = blob.baseRadius
        + Math.sin(t * blob.breathFreq + blob.breathPhase) * blob.breathAmp;

      blob.currentAlpha = blob.baseAlpha * intensity;
    }
  }

  draw(ctx, intensity = 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const blob of this.blobs) {
      if (blob.currentAlpha <= 0) continue;

      const [r, g, b] = blob.color;
      const radius = Math.max(1, blob.currentRadius);

      const grad = ctx.createRadialGradient(
        blob.x, blob.y, 0,
        blob.x, blob.y, radius,
      );

      const a = blob.currentAlpha;
      grad.addColorStop(0, `rgba(${r},${g},${b},${a * 0.55})`);
      grad.addColorStop(0.35, `rgba(${r},${g},${b},${a * 0.35})`);
      grad.addColorStop(0.7, `rgba(${r},${g},${b},${a * 0.12})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(
        blob.x - radius,
        blob.y - radius,
        radius * 2,
        radius * 2,
      );
    }

    ctx.restore();
  }

  resize(width, height) {
    const scaleX = this.width > 0 ? width / this.width : 1;
    const scaleY = this.height > 0 ? height / this.height : 1;

    this.width = width;
    this.height = height;

    for (const blob of this.blobs) {
      blob.anchorX *= scaleX;
      blob.anchorY *= scaleY;
      blob.baseRadius *= Math.max(scaleX, scaleY);
      blob.amplitudeX *= scaleX;
      blob.amplitudeY *= scaleY;
      blob.breathAmp *= Math.max(scaleX, scaleY);
    }
  }

  destroy() {
    this.blobs = [];
  }

  /* ---------------------------------------------------------------- */
  /*  Internal                                                        */
  /* ---------------------------------------------------------------- */

  _createBlobs() {
    this.blobs = [];
    const minDim = Math.min(this.width, this.height);

    for (let i = 0; i < BLOB_COUNT; i++) {
      const depthFactor = (i + 1) / BLOB_COUNT; // 0.2 → 1.0

      this.blobs.push({
        anchorX: rand(this.width * 0.1, this.width * 0.9),
        anchorY: rand(this.height * 0.2, this.height * 0.8),

        x: 0,
        y: 0,

        // Larger blobs for "closer" depth layers
        baseRadius: rand(minDim * 0.25, minDim * 0.5) * lerp(0.7, 1.3, depthFactor),
        currentRadius: 0,

        // Slower speed for "further" layers → parallax
        freqX: rand(0.06, 0.15) * lerp(0.5, 1.2, depthFactor),
        freqY: rand(0.04, 0.10) * lerp(0.5, 1.0, depthFactor),
        amplitudeX: rand(this.width * 0.08, this.width * 0.2),
        amplitudeY: rand(this.height * 0.03, this.height * 0.08),
        phaseX: rand(0, Math.PI * 2),
        phaseY: rand(0, Math.PI * 2),

        // Slow radius pulsing
        breathFreq: rand(0.15, 0.35),
        breathPhase: rand(0, Math.PI * 2),
        breathAmp: rand(minDim * 0.02, minDim * 0.06),

        // "Nearer" blobs are slightly more opaque
        baseAlpha: rand(0.12, 0.28) * lerp(0.6, 1.0, depthFactor),
        currentAlpha: 0,

        color: pick(this.palette),
      });
    }
  }
}
