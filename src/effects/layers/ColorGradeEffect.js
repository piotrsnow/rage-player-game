/**
 * Full-screen colour wash that tints the scene based on mood.
 *
 * Uses a `multiply` composite operation at very low opacity to unify the
 * look of AI-generated images with the current atmosphere without
 * obliterating the original colours.
 *
 * Mood palettes:
 *   mystical – cool purple
 *   dark     – desaturated blue-grey
 *   peaceful – warm golden
 *   tense    – cold cyan / desaturated
 *   chaotic  – warm orange-amber
 */

const MOOD_GRADES = {
  mystical: { color: [160, 130, 220], alpha: 0.10 },
  dark:     { color: [ 80,  90, 115], alpha: 0.13 },
  peaceful: { color: [210, 190, 140], alpha: 0.08 },
  tense:    { color: [100, 130, 145], alpha: 0.11 },
  chaotic:  { color: [210, 150,  80], alpha: 0.10 },
};

export default class ColorGradeEffect {
  /** @param {{ mood?: string }} [options] */
  constructor(options = {}) {
    this.mood = options.mood ?? 'mystical';
    const grade = MOOD_GRADES[this.mood] ?? MOOD_GRADES.mystical;
    this.color = grade.color;
    this.baseAlpha = grade.alpha;

    this.width = 0;
    this.height = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  init(_ctx, width, height) {
    this.width = width;
    this.height = height;
  }

  update(dt) {
    this.elapsed += dt;
  }

  draw(ctx, intensity = 1) {
    const breathe = 0.85 + 0.15 * Math.sin(this.elapsed * 0.4);
    const alpha = this.baseAlpha * intensity * breathe;
    if (alpha <= 0) return;

    const [r, g, b] = this.color;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  destroy() {}
}
