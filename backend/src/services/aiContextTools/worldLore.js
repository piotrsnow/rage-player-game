import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'aiContextTools' });

// Round A (Phase 0a) — in-memory cache for the World Lore preamble. Key is
// "<latestUpdatedAt>|<count>" so a) edits invalidate via updatedAt, b) deletes
// invalidate via count drop, c) additions invalidate via either. Lives in
// module scope so warm Node workers hit the cache across scenes.
let _worldLoreCache = { key: null, preamble: '' };

/**
 * Concat admin-editable `WorldLoreSection` rows into a single markdown
 * preamble for scene-gen prompts. Sections rendered in `order` ascending,
 * each as `## {title}\n{content}`. Truncated to `maxChars` with a marker.
 *
 * Cached in-memory by `max(updatedAt)` + row count — admin edits bust the
 * cache on next read because the lore routes write a fresh updatedAt.
 *
 * Silent on failure (returns '') — scene-gen must never block on lore.
 */
export async function buildWorldLorePreamble({ maxChars = 10000 } = {}) {
  try {
    const meta = await prisma.worldLoreSection.aggregate({
      _max: { updatedAt: true },
      _count: { _all: true },
    });
    const key = `${meta._max?.updatedAt?.toISOString?.() || ''}|${meta._count?._all || 0}`;
    if (_worldLoreCache.key === key) return _worldLoreCache.preamble;

    const sections = await prisma.worldLoreSection.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { title: true, content: true },
    });
    const parts = [];
    let total = 0;
    for (const s of sections) {
      const content = (s.content || '').trim();
      if (!content) continue;
      const block = `## ${s.title}\n${content}\n\n`;
      if (total + block.length > maxChars) {
        const remaining = Math.max(0, maxChars - total);
        if (remaining > 200) parts.push(`${block.slice(0, remaining - 20)}\n…[truncated]\n`);
        break;
      }
      parts.push(block);
      total += block.length;
    }
    const preamble = parts.join('').trim();
    _worldLoreCache = { key, preamble };
    return preamble;
  } catch (err) {
    log.warn({ err: err?.message }, 'buildWorldLorePreamble failed');
    return '';
  }
}
