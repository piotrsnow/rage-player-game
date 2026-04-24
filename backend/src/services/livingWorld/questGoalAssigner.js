// Thin barrel — implementation split into ./questGoalAssigner/*.js after the
// 557-LOC known-debt. External importers (campaignSandbox, postSceneWork,
// generateSceneStream, processStateChanges, npcPromotion, the test file) use
// these named exports from this path unchanged.
export {
  assignGoalsForCampaign,
  classifyQuestRole,
  buildGoalString,
  generateBackgroundGoal,
  pickQuestGiver,
  categorize,
  NPC_CATEGORIES,
} from './questGoalAssigner/index.js';
