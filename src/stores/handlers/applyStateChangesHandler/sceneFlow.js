import { createCombatState } from '../../../services/combatEngine';

/**
 * Scene-level flow mutations: campaign end, combat start/stop, trade panel
 * activation, three-act progression, narrative seeds/agendas/callbacks.
 */

export function applyCampaignEnd(draft, changes) {
  if (!changes.campaignEnd || !draft.campaign) return;
  draft.campaign.status = changes.campaignEnd.status || 'completed';
  draft.campaign.epilogue = changes.campaignEnd.epilogue || '';
}

/**
 * AI flags `combatUpdate.active: true` → spin up a fresh combat state with
 * the enemy list + party allies. `active: false` tears combat down. Narrator
 * hint gets stashed on `combat.reason` for the combat panel header.
 */
export function applyCombatUpdate(draft, changes) {
  if (changes.combatUpdate?.active) {
    const allies = (draft.party || []).filter((c) => c.id !== draft.activeCharacterId);
    draft.combat = createCombatState(draft.character, changes.combatUpdate.enemies || [], allies);
    draft.combat.reason = changes.combatUpdate.reason;
  } else if (changes.combatUpdate && !changes.combatUpdate.active) {
    draft.combat = null;
  }
}

/**
 * `startTrade` from AI toggles the trade panel. `pendingSetup:true` signals
 * the panel to populate `shopItems` from the NPC's role + disposition
 * (actual item roll happens on the UI side).
 */
export function applyStartTrade(draft, changes) {
  if (!changes.startTrade?.npcName) return;
  draft.trade = {
    active: true,
    npcName: changes.startTrade.npcName,
    pendingSetup: true,
    shopItems: [],
    haggleAttempts: 0,
    maxHaggle: 3,
    haggleLog: [],
    haggleDiscounts: {},
  };
  const npc = (draft.world?.npcs || []).find(
    (n) => n.name?.toLowerCase() === changes.startTrade.npcName.toLowerCase(),
  );
  if (npc) {
    draft.trade.npcRole = npc.role || 'merchant';
    draft.trade.disposition = npc.disposition || 0;
  }
}

/**
 * Three-act progression — count scenes since the current act started and
 * advance when we hit the act's `targetScenes`. Safely no-ops if the
 * campaign has no structured acts.
 */
export function applyActProgression(draft) {
  if (!draft.campaign?.structure?.acts?.length) return;
  const structure = draft.campaign.structure;
  const currentAct = structure.acts.find((a) => a.number === structure.currentAct);
  if (!currentAct) return;

  const scenesBeforeAct = structure.acts
    .filter((a) => a.number < structure.currentAct)
    .reduce((sum, a) => sum + (a.targetScenes || 0), 0);
  const scenesInAct = (draft.scenes?.length || 0) - scenesBeforeAct;
  if (scenesInAct >= (currentAct.targetScenes || 999)) {
    const nextActNum = structure.currentAct + 1;
    if (structure.acts.some((a) => a.number === nextActNum)) {
      structure.currentAct = nextActNum;
    }
  }
}

/**
 * Narrative threading — seeds (foreshadow markers), resolvedSeeds (payoff
 * flags), npcAgendas (off-screen NPC plans), pendingCallbacks (delayed
 * consequence hooks attached to the last decision).
 */
export function applyNarrativeState(draft, changes) {
  applyNarrativeSeeds(draft, changes);
  applyResolvedSeeds(draft, changes);
  applyNpcAgendas(draft, changes);
  applyPendingCallbacks(draft, changes);
}

function applyNarrativeSeeds(draft, changes) {
  if (!changes.narrativeSeeds?.length) return;
  if (!draft.world.narrativeSeeds) draft.world.narrativeSeeds = [];
  const existingIds = new Set(draft.world.narrativeSeeds.map((e) => e.id));
  const sceneIdx = draft.scenes?.length || 0;
  for (const seed of changes.narrativeSeeds) {
    if (existingIds.has(seed.id)) continue;
    draft.world.narrativeSeeds.push({ ...seed, planted: seed.planted ?? sceneIdx });
  }
  if (draft.world.narrativeSeeds.length > 30) {
    draft.world.narrativeSeeds = draft.world.narrativeSeeds.slice(-30);
  }
}

function applyResolvedSeeds(draft, changes) {
  if (!changes.resolvedSeeds?.length || !draft.world.narrativeSeeds) return;
  for (const seed of draft.world.narrativeSeeds) {
    if (changes.resolvedSeeds.includes(seed.id)) seed.resolved = true;
  }
}

function applyNpcAgendas(draft, changes) {
  if (!changes.npcAgendas?.length) return;
  if (!draft.world.npcAgendas) draft.world.npcAgendas = [];
  const sceneIdx = draft.scenes?.length || 0;
  for (const agenda of changes.npcAgendas) {
    const existing = draft.world.npcAgendas.find(
      (a) => a.npcName?.toLowerCase() === agenda.npcName?.toLowerCase(),
    );
    if (existing) {
      Object.assign(existing, agenda);
    } else {
      draft.world.npcAgendas.push({ ...agenda, plantedScene: agenda.plantedScene ?? sceneIdx });
    }
  }
  if (draft.world.npcAgendas.length > 20) {
    draft.world.npcAgendas = draft.world.npcAgendas.slice(-20);
  }
}

function applyPendingCallbacks(draft, changes) {
  if (!changes.pendingCallbacks?.length || !draft.world?.knowledgeBase?.decisions?.length) return;
  const decisions = draft.world.knowledgeBase.decisions;
  const last = decisions[decisions.length - 1];
  if (!last.pendingCallbacks) last.pendingCallbacks = [];
  last.pendingCallbacks.push(...changes.pendingCallbacks);
}
