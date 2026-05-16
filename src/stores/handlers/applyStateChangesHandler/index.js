import { applyCharacterMutations } from './character.js';
import { applyQuests } from './quests.js';
import { applyWorldNotes, applyKnowledgeBase } from './worldKnowledge.js';
import { applyNpcs } from './npcs.js';
import { applyMapChanges, applyCurrentLocation } from './mapChanges.js';
import { applyTimeAndNeeds, applyRestCrisisPenalty } from './timeAndNeeds.js';
import { applyActiveEffects, applyFactionChanges } from './worldSystems.js';
import {
  applyCampaignEnd,
  applyCombatUpdate,
  applyStartTrade,
  applyActProgression,
  applyNarrativeState,
} from './sceneFlow.js';
import { applyBoardMutations } from '../../../../shared/domain/explorationBoard.js';
import { devLog } from '../../devEventLogStore';

/**
 * Mega-handler for `APPLY_STATE_CHANGES` — applies a full AI-scene state-change
 * payload in one pass. Each sub-applier corresponds to one conceptual bucket
 * of the AI response schema. Order matters:
 *
 *   campaignEnd → character → quests → world notes → npcs → mapChanges →
 *   time/needs → knowledge-base auto-populate → rest-crisis penalty →
 *   world systems → combat/trade → act progression → currentLocation →
 *   narrative state
 *
 * The knowledge-base auto-populate reads `draft.world.npcs` AFTER npcs have
 * been processed, so it must come after `applyNpcs`. Rest-crisis penalty is
 * a view of the post-decay needs, so it must come after `applyTimeAndNeeds`.
 * `currentLocation` runs after `applyKnowledgeBase` because the auto-populate
 * pass references `changes.currentLocation` to bump visitCount against the
 * ABOUT-TO-BE-set location (not the freshly-set one).
 */
export function applyStateChangesHandler(draft, action) {
  const changes = action.payload;
  const activeBuckets = Object.keys(changes).filter((k) => changes[k] != null && changes[k] !== undefined);
  devLog.emit({ category: 'state', type: 'dispatch_state_changes', label: `Dispatch APPLY_STATE_CHANGES [${activeBuckets.length} buckets]`, data: { buckets: activeBuckets, hasCombatUpdate: !!changes.combatUpdate, hasNpcs: !!changes.npcs, hasCurrentLocation: !!changes.currentLocation } });

  applyCampaignEnd(draft, changes);
  applyCharacterMutations(draft, changes);
  applyQuests(draft, changes);
  applyWorldNotes(draft, changes);
  applyNpcs(draft, changes);
  applyMapChanges(draft, changes);
  applyTimeAndNeeds(draft, changes);
  applyKnowledgeBase(draft, changes);
  applyRestCrisisPenalty(draft);
  applyActiveEffects(draft, changes);
  applyFactionChanges(draft, changes);
  applyCombatUpdate(draft, changes);
  applyStartTrade(draft, changes);
  applyActProgression(draft);
  applyCurrentLocation(draft, changes);
  applyNarrativeState(draft, changes);

  if (Array.isArray(changes.boardUpdates) && changes.boardUpdates.length > 0 && draft.world?.locationBoard) {
    applyBoardMutations(draft.world.locationBoard, changes.boardUpdates);
  }
}
