import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';

const log = childLogger({ module: 'incidents' });

/**
 * Slugify NPC name to the same `npcId` shape `processNpcChanges` uses.
 * Must mirror npcs.js:106 — `name.toLowerCase().replace(/\s+/g, '_')`.
 */
function slugifyNpcName(name) {
  return String(name || '').toLowerCase().trim().replace(/\s+/g, '_');
}

/**
 * Incident-only primitive: rename an existing CampaignNPC (changes BOTH
 * `name` and `npcId`) and sweep all `CampaignNpcRelationship.targetRef`
 * pointers to the old name.
 *
 * Why this lives outside `processNpcChanges`:
 *   - Scene flow keys NPCs by `npcId = slugify(name)`. An emission like
 *     `{action:'update', name:'Olafur'}` for an NPC currently keyed
 *     `npcId='olaf'` falls through to the create branch (npcs.js:264) and
 *     produces a duplicate row. That's intentional for normal scene flow —
 *     a new name = a new NPC.
 *   - For retroactive bug-fix corrections we need actual rename semantics:
 *     keep the same row (memory, relationships, world links, embedding),
 *     just change the displayed name and rekey it.
 *
 * Skips with a warning instead of throwing on:
 *   - source NPC not found
 *   - target name already in use by another NPC in this campaign
 *   - identical from→to (no-op)
 *
 * @param {string} campaignId
 * @param {Array<{from: string, to: string}>} renames
 * @returns {Promise<Array<{from:string,to:string,renamedId:string}>>}
 *          List of successfully applied renames (for logging / FE summary).
 */
export async function processNpcRenames(campaignId, renames) {
  if (!campaignId || !Array.isArray(renames) || renames.length === 0) return [];

  const applied = [];

  for (const entry of renames) {
    const from = typeof entry?.from === 'string' ? entry.from.trim() : '';
    const to = typeof entry?.to === 'string' ? entry.to.trim() : '';
    if (!from || !to) {
      log.warn({ campaignId, entry }, 'npcRename skipped — empty from/to');
      continue;
    }
    if (from === to) {
      log.debug({ campaignId, from }, 'npcRename skipped — identical from/to');
      continue;
    }

    const fromId = slugifyNpcName(from);
    const toId = slugifyNpcName(to);

    try {
      const existing = await prisma.npc.findUnique({
        where: { campaignId_npcId: { campaignId, npcId: fromId } },
      });
      if (!existing) {
        log.warn({ campaignId, from, fromId }, 'npcRename skipped — source NPC not found');
        continue;
      }

      if (toId !== fromId) {
        const collision = await prisma.npc.findUnique({
          where: { campaignId_npcId: { campaignId, npcId: toId } },
        });
        if (collision) {
          log.warn(
            { campaignId, from, to, conflictId: collision.id },
            'npcRename skipped — target name collides with an existing NPC',
          );
          continue;
        }
      }

      await prisma.npc.update({
        where: { id: existing.id },
        data: { name: to, npcId: toId },
      });

      // Sweep relationships pointing at the old name. CampaignNpcRelationship
      // is a flavor join table keyed by free-text targetRef (see npcs.js:64),
      // so an in-place updateMany keeps the relationship graph consistent.
      const swept = await prisma.npcRelationship.updateMany({
        where: { targetRef: from, campaignNpc: { campaignId } },
        data: { targetRef: to },
      });

      applied.push({ from, to, renamedId: existing.id });
      log.info(
        { campaignId, from, to, sweptRelationships: swept?.count ?? 0 },
        'NPC renamed via incident correction',
      );
    } catch (err) {
      log.warn({ err: err?.message, campaignId, from, to }, 'npcRename failed');
    }
  }

  return applied;
}
