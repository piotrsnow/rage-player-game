import { rollD100 } from '../gameState.js';
import { resolveSkillCheck } from './skillCheck.js';
import { isRestAction, calculateRestRecovery } from './restRecovery.js';
import { resolveActionDisposition } from './dispositionBonus.js';

const CREATIVITY_KEYWORDS = [
  'carefully', 'quietly', 'quickly', 'stealthily', 'cleverly', 'forcefully',
  'ostrożnie', 'cicho', 'szybko', 'sprytnie', 'siłą', 'podstępem',
];

/**
 * Calculate a creativity bonus for custom/auto-player actions based on description length and keywords.
 * @param {string} actionText
 * @param {boolean} isCustomAction
 * @param {boolean} fromAutoPlayer
 * @returns {number} 0-25
 */
function getCreativityBonus(actionText, isCustomAction, fromAutoPlayer) {
  if (!isCustomAction && !fromAutoPlayer) return 0;
  const text = typeof actionText === 'string' ? actionText.trim().toLowerCase() : '';
  if (!text) return 0;

  const words = text.match(/[\p{L}\p{N}'-]+/gu) || [];
  const uniqueWords = new Set(words);
  const keywordHits = CREATIVITY_KEYWORDS.filter((kw) => text.includes(kw)).length;

  let bonus = 5;
  if (words.length >= 6) bonus += 5;
  if (words.length >= 10) bonus += 5;
  if (keywordHits >= 2) bonus += 5;
  if (words.length >= 14 && uniqueWords.size >= 10) bonus += 5;

  return Math.min(bonus, 25);
}

/**
 * @typedef {Object} ResolvedSkillCheck
 * @property {number} roll
 * @property {string} characteristic
 * @property {number} characteristicValue
 * @property {string|null} skill
 * @property {string[]} suggestedSkills
 * @property {number} skillAdvances
 * @property {string|null} applicableTalent
 * @property {number} talentBonus
 * @property {number} baseTarget
 * @property {number} difficultyModifier
 * @property {number} creativityBonus
 * @property {number} momentumBonus
 * @property {number} dispositionBonus
 * @property {string|null} dispositionNpc
 * @property {number} target
 * @property {boolean} success
 * @property {boolean} criticalSuccess
 * @property {boolean} criticalFailure
 * @property {number} sl
 */

/**
 * @typedef {Object} ResolvedMechanics
 * @property {ResolvedSkillCheck|null} diceRoll - resolved BEFORE AI call
 * @property {boolean} skipDiceRoll
 * @property {{ woundsChange: number|undefined, needsChanges: Object }|null} restRecovery
 * @property {boolean} isRest
 */

/**
 * Master orchestrator: resolve all deterministic mechanics before AI call.
 * @param {Object} params
 * @param {Object} params.state - full game state
 * @param {string} params.playerAction
 * @param {Object} params.settings - user settings
 * @param {boolean} params.isFirstScene
 * @param {boolean} params.isCustomAction
 * @param {boolean} params.fromAutoPlayer
 * @param {Function} params.t - i18next translation function
 * @returns {ResolvedMechanics}
 */
export function resolveMechanics({ state, playerAction, settings, isFirstScene, isCustomAction, fromAutoPlayer, t }) {
  const isIdleWorldEvent = playerAction && playerAction.startsWith('[IDLE_WORLD_EVENT');
  const isPassiveAction = Boolean(isIdleWorldEvent || playerAction === '[WAIT]');
  const isRest = isRestAction(playerAction, t);

  // Dice roll decision
  const testsFrequency = settings?.dmSettings?.testsFrequency ?? 50;
  const shouldRollDice = !isPassiveAction && !isFirstScene && Math.random() * 100 < testsFrequency;
  const skipDiceRoll = isPassiveAction || isFirstScene || !shouldRollDice;

  let diceRoll = null;

  if (!skipDiceRoll) {
    const roll = rollD100();
    const currentMomentum = state.momentumBonus || 0;
    const creativityBonus = getCreativityBonus(playerAction, isCustomAction, fromAutoPlayer);

    diceRoll = resolveSkillCheck({
      character: state.character,
      actionText: playerAction,
      roll,
      currentMomentum,
      worldNpcs: state.world?.npcs || [],
      resolveDisposition: resolveActionDisposition,
      creativityBonus,
    });
  }

  // Rest recovery (applied after AI call, but calculated now)
  let restRecovery = null;
  if (isRest) {
    const restSucceeded = !diceRoll || diceRoll.success === true;
    if (restSucceeded) {
      // hoursSlept will be merged with AI's timeAdvance later; default 8 for rest
      restRecovery = calculateRestRecovery(state.character, 8);
    } else {
      // Failed rest: still satisfy needs but no healing
      restRecovery = calculateRestRecovery(state.character, 0);
      if (restRecovery) restRecovery.woundsChange = undefined;
    }
  }

  return {
    diceRoll,
    skipDiceRoll,
    restRecovery,
    isRest,
  };
}

/**
 * Format resolved skill check for AI prompt injection.
 * @param {ResolvedSkillCheck|null} diceRoll
 * @returns {string}
 */
export function formatResolvedCheck(diceRoll) {
  if (!diceRoll) return 'No skill check for this action.';

  const outcome = diceRoll.criticalSuccess ? 'CRITICAL SUCCESS'
    : diceRoll.criticalFailure ? 'CRITICAL FAILURE'
    : diceRoll.success ? 'SUCCESS' : 'FAILURE';

  const parts = [
    `Skill: ${diceRoll.skill || 'untrained'} (${diceRoll.characteristic.toUpperCase()})`,
    `Roll: ${diceRoll.roll} vs Target: ${diceRoll.target}`,
    `Result: ${outcome} (SL ${diceRoll.sl >= 0 ? '+' : ''}${diceRoll.sl})`,
  ];

  if (diceRoll.criticalSuccess) {
    parts.push('Describe an exceptional success with bonus effects.');
  } else if (diceRoll.criticalFailure) {
    parts.push('Describe a spectacular failure with extra consequences.');
  } else if (diceRoll.success) {
    parts.push(`The character succeeds${diceRoll.sl >= 3 ? ' impressively' : ''}.`);
  } else {
    parts.push(`The character fails${diceRoll.sl <= -3 ? ' badly' : ''}.`);
  }

  return parts.join('\n');
}
