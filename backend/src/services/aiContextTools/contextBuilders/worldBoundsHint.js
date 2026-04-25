import { childLogger } from '../../../lib/logger.js';

const log = childLogger({ module: 'aiContextTools' });

/**
 * Round B (Phase 4c) — tells premium how far in each cardinal direction the
 * player can still travel before hitting the edge of this campaign's
 * worldBounds. Prevents "you see endless plains to the west" narration
 * when the boundary is 3 km away.
 *
 * Returns null when bounds are unset or malformed. Malformed JSON is
 * log.warn'd — admin-provided bounds failing silently would hide a
 * config drift.
 */
export function computeWorldBoundsHint(campaign, location) {
  const b = (campaign?.worldBounds && typeof campaign.worldBounds === 'object')
    ? campaign.worldBounds : null;
  if (!b) return null;
  if (
    !Number.isFinite(b?.minX) || !Number.isFinite(b?.maxX)
    || !Number.isFinite(b?.minY) || !Number.isFinite(b?.maxY)
  ) {
    return null;
  }
  const px = location?.regionX ?? 0;
  const py = location?.regionY ?? 0;
  return {
    remainingN: Math.max(0, Math.round((b.maxY - py) * 10) / 10),
    remainingS: Math.max(0, Math.round((py - b.minY) * 10) / 10),
    remainingE: Math.max(0, Math.round((b.maxX - px) * 10) / 10),
    remainingW: Math.max(0, Math.round((px - b.minX) * 10) / 10),
  };
}
