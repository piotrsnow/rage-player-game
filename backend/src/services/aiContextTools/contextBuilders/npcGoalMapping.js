import { clearCampaignNpcIntroHint } from '../../livingWorld/campaignSandbox.js';

/**
 * Pure map: enriched CampaignNPC shadows → prompt-shaped NPC entries with
 * goal progress, recently-arrived flag, radiant quest offer hint, and a
 * one-shot pendingIntroHint (cleared post-surface in a separate call).
 *
 * Round B — shadow fields are already scoped to this playthrough, so no
 * cross-campaign goal leak guard is needed (Phase 3b moved tick/goal state
 * onto CampaignNPC).
 */
export function mapAmbientNpcsWithGoals(ambientNpcs) {
  return ambientNpcs.map((n) => {
    const progress = (n.goalProgress && typeof n.goalProgress === 'object') ? n.goalProgress : null;
    const milestones = Array.isArray(progress?.milestones) ? progress.milestones.slice(-2) : [];
    // "Just arrived" = last tick's action was a move to this location on
    // the scene that just finished. Premium narrates "NPC wchodzi zdyszany".
    const recentlyArrived = progress?.lastAction === 'move'
      && typeof progress?.step === 'number';
    // G3 — radiant quest offer hint. When the background goal was tagged
    // offerable, premium gets a marker so it MAY propose a newQuest in
    // stateChanges (with source: 'npc_radiant'). Non-binding — premium
    // decides based on player behaviour.
    const radiantOffer = progress?.offerableAsQuest && progress?.questTemplate
      ? { template: progress.questTemplate }
      : null;
    return {
      name: n.name,
      role: n.role || null,
      category: n.category || null,
      paused: !!n.pausedAt,
      activeGoal: n.activeGoal || null,
      recentMilestones: milestones,
      recentlyArrived,
      radiantOffer,
      // Round B — one-shot intro hint set by quest-trigger "moveNpcToPlayer".
      // Scene-gen surfaces it in the NPC brief; we clear it post-assembly so
      // the hint fires exactly once.
      pendingIntroHint: n.pendingIntroHint || null,
      campaignNpcId: n.campaignNpcId || null,
    };
  });
}

/**
 * Fire-and-forget clear of surfaced pendingIntroHints. Failure just means
 * the hint lingers and fires on next scene (harmless duplicate — same NPC,
 * same line).
 */
export function clearSurfacedIntroHints(enrichedNpcs) {
  for (const n of enrichedNpcs) {
    if (n.pendingIntroHint && n.campaignNpcId) {
      clearCampaignNpcIntroHint(n.campaignNpcId).catch(() => {});
    }
  }
}
