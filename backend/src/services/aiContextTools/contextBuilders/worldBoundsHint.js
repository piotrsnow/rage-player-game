import { unpackWorldBounds } from '../../locationRefs.js';

/**
 * Round B (Phase 4c) — tells premium how far in each cardinal direction the
 * player can still travel before hitting the edge of this campaign's
 * worldBounds. Prevents "you see endless plains to the west" narration
 * when the boundary is 3 km away.
 *
 * F5 — bounds source moved from worldBounds JSONB to 4 Float columns; reads
 * still use the unpacked legacy shape via unpackWorldBounds.
 */
export function computeWorldBoundsHint(campaign, location) {
  const b = unpackWorldBounds(campaign);
  if (!b) return null;
  const px = location?.regionX ?? 0;
  const py = location?.regionY ?? 0;
  return {
    remainingN: Math.max(0, Math.round((b.maxY - py) * 10) / 10),
    remainingS: Math.max(0, Math.round((py - b.minY) * 10) / 10),
    remainingE: Math.max(0, Math.round((b.maxX - px) * 10) / 10),
    remainingW: Math.max(0, Math.round((px - b.minX) * 10) / 10),
  };
}
