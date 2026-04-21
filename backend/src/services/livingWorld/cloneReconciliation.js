// Living World — keep CampaignNPC clones consistent with their WorldNPC
// source of truth.
//
// A CampaignNPC with `worldNpcId` set is a CLONE of a canonical global
// NPC. Premium AI drives the clone during scenes (dialogue, movement,
// decisions) and that divergence is expected. But the global can change
// outside this campaign (the NPC dies in another campaign, their home
// location moves, they take a major deed elsewhere). When it does, the
// clone needs a reconciliation decision:
//
//   'announce_death'    — global is no longer alive; in-scene reveal:
//                         "dociera wieść, że X zginął w...".
//   'detach_clone'      — global changed in a way that can't gracefully
//                         roll into the clone's narrative. Clear
//                         CampaignNPC.worldNpcId so future scenes treat
//                         the clone as standalone (Witcher-style
//                         multiverse acknowledgment).
//   'silent_sync'       — minor drift, just update clone metadata.
//   'none'              — no divergence worth acting on.
//
// This is a READ-ONLY classification helper — caller decides whether to
// apply side-effects (updateCampaignNPC, write reveal event) based on
// the returned verdict and the current scene pipeline phase.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'cloneReconciliation' });

/**
 * Pure function — decide what to do given a clone + global pair.
 * Returns `{ verdict, reason }`. Export for tests.
 */
export function classifyDivergence(clone, global) {
  if (!clone || !global) return { verdict: 'none', reason: 'missing_input' };
  if (clone.alive !== false && global.alive === false) {
    return { verdict: 'announce_death', reason: 'global_died_elsewhere' };
  }
  if (clone.alive === false && global.alive === true) {
    // Clone was killed in THIS campaign but global is still alive. That's
    // canonical independence — global keeps living in other campaigns.
    return { verdict: 'none', reason: 'clone_killed_independently' };
  }
  // Future heuristics: home location moved permanently, promotion to a
  // political role that invalidates the clone's personality, etc.
  return { verdict: 'none', reason: 'no_divergence' };
}

/**
 * Apply the verdict from classifyDivergence. Safe to call for any
 * CampaignNPC — no-op when there's no worldNpcId linkage.
 *
 * `emitRevealEvent` is an optional callback — caller passes it to push a
 * WorldEvent or a scene-visible note (e.g. "reveal_death"). The helper
 * itself only mutates DB state.
 */
export async function reconcileCloneWithGlobal(campaignNpcId, { emitRevealEvent = null } = {}) {
  try {
    const clone = await prisma.campaignNPC.findUnique({
      where: { id: campaignNpcId },
      select: { id: true, campaignId: true, name: true, alive: true, worldNpcId: true },
    });
    if (!clone || !clone.worldNpcId) return { verdict: 'none', reason: 'no_global_link' };

    const global = await prisma.worldNPC.findUnique({
      where: { id: clone.worldNpcId },
      select: { id: true, alive: true, currentLocationId: true },
    });
    if (!global) {
      // Dangling worldNpcId — detach to avoid future lookups
      await prisma.campaignNPC.update({ where: { id: clone.id }, data: { worldNpcId: null } });
      return { verdict: 'detach_clone', reason: 'global_not_found' };
    }

    const decision = classifyDivergence(clone, global);
    if (decision.verdict === 'announce_death' && typeof emitRevealEvent === 'function') {
      try {
        await emitRevealEvent({
          campaignNpc: clone,
          worldNpc: global,
          verdict: decision.verdict,
          reason: decision.reason,
        });
      } catch (err) {
        log.warn({ err, cloneId: clone.id }, 'emitRevealEvent callback failed');
      }
      // Mirror death into the clone — future context won't pretend they're alive
      await prisma.campaignNPC.update({ where: { id: clone.id }, data: { alive: false } });
    }
    return decision;
  } catch (err) {
    log.warn({ err, campaignNpcId }, 'reconcileCloneWithGlobal failed');
    return { verdict: 'none', reason: 'error' };
  }
}

/**
 * Batch-run reconciliation for every linked CampaignNPC in a campaign.
 * Used by generateSceneStream at scene boot so drift from other
 * campaigns is caught before assembleContext touches the roster.
 */
export async function reconcileCloneBatch({ campaignId, emitRevealEvent = null } = {}) {
  if (!campaignId) return { processed: 0, revealed: 0 };
  try {
    const clones = await prisma.campaignNPC.findMany({
      where: { campaignId, worldNpcId: { not: null }, alive: true },
      select: { id: true },
    });
    let revealed = 0;
    for (const c of clones) {
      const decision = await reconcileCloneWithGlobal(c.id, { emitRevealEvent });
      if (decision.verdict !== 'none') revealed += 1;
    }
    return { processed: clones.length, revealed };
  } catch (err) {
    log.warn({ err, campaignId }, 'reconcileCloneBatch failed');
    return { processed: 0, revealed: 0 };
  }
}
