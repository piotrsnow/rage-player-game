/**
 * Animated film grain overlay that adds cinematic texture to every scene.
 *
 * Generates random noise each frame using a small offscreen canvas that is
 * tiled across the viewport. The grain intensity scales with mood — darker
 * and tenser moods get heavier grain for a grittier Warhammer feel.
 */

const MOOD_GRAIN = {
  mystical: 0.030,
  dark:     0.055,
  peaceful: 0.020,
  tense:    0.050,
  chaotic:  0.045,
};

const TILE_SIZE = 128;

export default class FilmGrainEffect {
  /** @param {{ mood?: string }} [options] */
  constructor(options = {}) {
    this.mood = options.mood ?? 'mystical';
    this.baseAlpha = MOOD_GRAIN[this.mood] ?? MOOD_GRAIN.mystical;

    this.width = 0;
    this.height = 0;
    this.finished = false;

    this._tile = null;
    this._tileCtx = null;
  }

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
    this._buildTile();
  }

  update() { /* grain is regenerated each draw */ }

  draw(ctx, intensity = 1) {
    const alpha = this.baseAlpha * intensity;
    if (alpha <= 0) return;

    this._regenerateNoise();

    ctx.save();
    ctx.globalAlpha = alpha;

    const pattern = ctx.createPattern(this._tile, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.restore();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  destroy() {
    this._tile = null;
    this._tileCtx = null;
  }

  _buildTile() {
    if (typeof OffscreenCanvas !== 'undefined') {
      this._tile = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
    } else {
      this._tile = document.createElement('canvas');
      this._tile.width = TILE_SIZE;
      this._tile.height = TILE_SIZE;
    }
    this._tileCtx = this._tile.getContext('2d');
  }

  _regenerateNoise() {
    if (!this._tileCtx) return;

    const ctx = this._tileCtx;
    const imageData = ctx.createImageData(TILE_SIZE, TILE_SIZE);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      data[i]     = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }
}
