/**
 * Living World — quest helper barrel.
 *
 * Folder name is vestigial: the original `assignGoalsForCampaign` orchestrator
 * (BE-driven activeGoal + radiant-offer mechanic) was archived to
 * `knowledge/ideas/npc-action-assignment.md` pending a redesign. What remains
 * here are independent helpers used elsewhere:
 *   - `pickQuestGiver` — Phase D quest-giver hint for nano `quest_offer_likely`
 *   - `categorize` / `NPC_CATEGORIES` — role → category mapping for shadows
 *
 * `roleAffinity.js` is internal to `pickQuestGiver`.
 */

export { NPC_CATEGORIES, categorize } from './categories.js';
export { pickQuestGiver } from './npcGiverPicker.js';
