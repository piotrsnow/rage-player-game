import { clearCampaignNpcIntroHint } from '../../livingWorld/campaignSandbox.js';

/**
 * Pure map: enriched CampaignNPC shadows → prompt-shaped NPC entries.
 *
 * File name is vestigial — the BE-driven goal/radiant-offer mechanic was
 * archived to `knowledge/ideas/npc-action-assignment.md`. What stays is the
 * one-shot `pendingIntroHint` (set by quest trigger `onComplete.moveNpcToPlayer`)
 * + identity fields the prompt renders.
 */
export function mapAmbientNpcs(ambientNpcs) {
  return ambientNpcs.map((n) => ({
    name: n.name,
    role: n.role || null,
    category: n.category || null,
    paused: !!n.pausedAt,
    // Round B — one-shot intro hint set by quest-trigger "moveNpcToPlayer".
    // Scene-gen surfaces it in the NPC brief; we clear it post-assembly so
    // the hint fires exactly once.
    pendingIntroHint: n.pendingIntroHint || null,
    campaignNpcId: n.campaignNpcId || null,
  }));
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
