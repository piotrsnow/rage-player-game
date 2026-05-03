/**
 * Premium system-prompt assembler.
 *
 * Splits the prompt into a static prefix (cacheable, campaign-constant rules)
 * and a dynamic suffix (per-scene state). Anthropic gets them as separate
 * system blocks with `cache_control` on the prefix; OpenAI gets them combined
 * and relies on automatic prefix caching.
 */

import {
  coreRulesBlock,
  scenePacingBlock,
  narrativeRulesBlock,
  dialogueFormatBlock,
  suggestedActionsBlock,
  stateChangesRulesBlock,
  actionRulesBlock,
  playerInputPolicyBlock,
  responseFormatBlock,
  worldSettingBlock,
} from './staticRules.js';
import { buildConditionalRules } from './conditionalRules.js';
import { buildDmSettingsBlock } from './dmSettingsBlock.js';
import { buildCharacterBlock } from './characterBlock.js';
import {
  buildWorldStateBlock,
  buildKeyNpcsBlock,
  buildKeyPlotFactsBlock,
  buildCodexSummaryBlock,
  buildNeedsCrisisBlock,
  buildActiveQuestsBlock,
  buildRecentContextBlock,
  buildRecentLocationTrailBlock,
  deriveScenePhase,
} from './worldBlock.js';

/**
 * Expected scene count per campaign-length label. Used to derive campaign
 * phase (early/mid/late) for pacing hints. Rough RPG-session estimates —
 * not enforced, purely advisory signal for the model.
 */
const EXPECTED_SCENES_BY_LENGTH = {
  Short: 20,
  Medium: 40,
  Long: 60,
  Epic: 100,
};
import {
  buildItemAttributionBlock,
  buildDungeonRoomStaticHint,
  buildDungeonRoomFullSchema,
  buildQuestGiverHintBlock,
} from './livingWorldBlock.js';

/**
 * Build a lean system prompt from the campaign's core state and recent scenes.
 * Returns { staticPrefix, dynamicSuffix, combined } so callers can either emit
 * a flat string (OpenAI) or an Anthropic cache-enabled system blocks array.
 */
export function buildLeanSystemPrompt(coreState, recentScenes, language = 'pl', {
  dmSettings = {},
  needsSystemEnabled = false,
  characterNeeds = null,
  sceneCount = 0,
  intentResult = {},
  livingWorldEnabled = false,
  questGiverHint = null,
} = {}) {
  const cs = coreState;
  const intent = intentResult._intent || 'freeform';
  const campaign = cs.campaign || {};
  const character = cs.character || {};
  const world = cs.world || {};
  const quests = cs.quests || {};
  const expectedScenes = EXPECTED_SCENES_BY_LENGTH[campaign.length] || 0;
  const scenePhase = deriveScenePhase(sceneCount, expectedScenes);

  // ═══════════════════════════════════════════════════════════════
  // STATIC SECTIONS — identical across scenes within a session.
  // Placed FIRST so both Anthropic (explicit cache_control) and OpenAI
  // (automatic prefix caching) can cache this prefix.
  // ═══════════════════════════════════════════════════════════════
  const staticSections = [
    coreRulesBlock(),
    scenePacingBlock(),
    narrativeRulesBlock(),
    dialogueFormatBlock(),
    suggestedActionsBlock(language),
    stateChangesRulesBlock(),
    actionRulesBlock(),
    playerInputPolicyBlock(),
    responseFormatBlock(language),
    worldSettingBlock(campaign),
  ];

  // Living World static-content blocks. Item attribution + dungeon-flow hints
  // stay; the location-policy slot (newLocations / currentLocation) moved
  // ENTIRELY into conditionalRules — it now fires only when the player is
  // somewhere a slot is actually available (settlement / canonical-subloc /
  // dungeon_room). Wilderness scenes don't see it at all.
  if (livingWorldEnabled) {
    staticSections.push(buildItemAttributionBlock());
    staticSections.push(buildDungeonRoomStaticHint());
  }

  // DM narrator sliders (poeticism/grittiness/detail/humor/drama) — per-campaign
  // settings, zmieniają się bardzo rzadko. Trzymamy w staticPrefix dla cache hit.
  // Gdy user zmieni mid-session, cache się odświeża przy następnej scenie.
  staticSections.push(buildDmSettingsBlock(campaign, dmSettings));

  // ═══════════════════════════════════════════════════════════════
  // DYNAMIC SECTIONS — change per scene (character, world, quests).
  // ═══════════════════════════════════════════════════════════════
  const dynamicSections = [];

  const conditionalRules = buildConditionalRules({ intent, coreState: cs, scenePhase });
  if (conditionalRules.length > 0) {
    dynamicSections.push(`Conditional rules:\n${conditionalRules.join('\n')}`);
  }

  dynamicSections.push(buildCharacterBlock(character));

  const worldState = buildWorldStateBlock(world, { sceneCount, expectedScenes });
  if (worldState) dynamicSections.push(worldState);

  const trailBlock = buildRecentLocationTrailBlock(recentScenes, world.currentLocation);
  if (trailBlock) dynamicSections.push(trailBlock);

  const keyNpcs = buildKeyNpcsBlock(world);
  if (keyNpcs) dynamicSections.push(keyNpcs);

  const keyPlotFacts = buildKeyPlotFactsBlock(world);
  if (keyPlotFacts) dynamicSections.push(keyPlotFacts);

  const codexSummary = buildCodexSummaryBlock(world);
  if (codexSummary) dynamicSections.push(codexSummary);

  const needsCrisis = buildNeedsCrisisBlock({ needsSystemEnabled, characterNeeds });
  if (needsCrisis) dynamicSections.push(needsCrisis);

  const activeQuests = buildActiveQuestsBlock(quests);
  if (activeQuests) dynamicSections.push(activeQuests);

  const recentContext = buildRecentContextBlock({
    recentScenes,
    gameStateSummary: cs.gameStateSummary,
  });
  for (const block of recentContext) dynamicSections.push(block);

  if (livingWorldEnabled) {
    // Dungeon-room flow stateChanges (trap/loot/cleared flags) — only when the
    // player is actually in a dungeon. The currentLocation slot for room-to-
    // room nav now lives in conditionalRules' LOCATION POLICY block.
    if (cs.dungeonRoom) {
      dynamicSections.push(buildDungeonRoomFullSchema());
    }

    const questGiver = buildQuestGiverHintBlock(questGiverHint);
    if (questGiver) dynamicSections.push(questGiver);
  }

  const staticPrefix = staticSections.join('\n\n');
  const dynamicSuffix = dynamicSections.join('\n\n');
  return { staticPrefix, dynamicSuffix, combined: staticPrefix + '\n\n' + dynamicSuffix };
}

/**
 * Convert split prompt parts into Anthropic system blocks with cache_control.
 * Static prefix is cached (ephemeral, 5-min TTL); dynamic suffix is fresh per request.
 */
export function buildAnthropicSystemBlocks(staticPrefix, dynamicSuffix) {
  const blocks = [
    { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
  ];
  if (dynamicSuffix) {
    blocks.push({ type: 'text', text: dynamicSuffix });
  }
  return blocks;
}
