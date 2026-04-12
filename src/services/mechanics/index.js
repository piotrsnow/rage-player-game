import { rollD50 } from '../gameState.js';
import { resolveSkillCheck, inferActionContext } from './skillCheck.js';
import { isRestAction, calculateRestRecovery } from './restRecovery.js';
import { resolveActionDisposition } from './dispositionBonus.js';
export { resolveD50Test } from './d50Test.js';

/**
 * Master orchestrator: resolve all deterministic mechanics before AI call.
 *
 * Creativity bonus is intentionally NOT computed here — it is awarded
 * exclusively by the large model in the backend pipeline (see
 * sceneGenerator.js → applyCreativityToRoll). Any frontend dice roll
 * resolved here will have creativityBonus=0 until backend reconciles it.
 */
export async function resolveMechanics({ state, playerAction, settings, isFirstScene, t, inferSkillCheckFn = null, skipDiceRoll: forceSkipDiceRoll = false }) {
  const isIdleWorldEvent = playerAction && playerAction.startsWith('[IDLE_WORLD_EVENT');
  const isPassiveAction = Boolean(isIdleWorldEvent || playerAction === '[WAIT]');
  const isRest = isRestAction(playerAction, t);

  // Dice roll decision
  const testsFrequency = settings?.dmSettings?.testsFrequency ?? 50;
  const shouldRollDice = !isPassiveAction && !isFirstScene && Math.random() * 100 < testsFrequency;
  const skipDiceRoll = forceSkipDiceRoll || isPassiveAction || isFirstScene || !shouldRollDice;

  let diceRoll = null;

  if (!skipDiceRoll) {
    const roll = rollD50();
    const currentMomentum = state.momentumBonus || 0;

    let actionContext = null;
    if (inferSkillCheckFn) {
      try {
        const aiResult = await inferSkillCheckFn(playerAction, state.character?.skills);
        if (aiResult && !aiResult.skip) {
          actionContext = {
            attribute: aiResult.attribute,
            suggestedSkills: aiResult.skill ? [aiResult.skill] : [],
            difficulty: aiResult.difficulty || 'medium',
          };
        }
      } catch (err) {
        console.warn('[resolveMechanics] AI skill inference failed, falling back to regex:', err.message);
        actionContext = inferActionContext(playerAction);
      }
    } else {
      actionContext = inferActionContext(playerAction);
    }

    if (actionContext) {
      diceRoll = resolveSkillCheck({
        character: state.character,
        actionText: playerAction,
        roll,
        currentMomentum,
        worldNpcs: state.world?.npcs || [],
        resolveDisposition: resolveActionDisposition,
        actionContext,
      });
    }
  }

  // Rest recovery
  let restRecovery = null;
  if (isRest) {
    const restSucceeded = !diceRoll || diceRoll.success === true;
    const restHours = restSucceeded ? 8 : 4;
    restRecovery = calculateRestRecovery(state.character, restHours);
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
 */
export function formatResolvedCheck(diceRoll) {
  if (!diceRoll) return 'No skill check for this action.';

  const outcome = diceRoll.luckySuccess ? 'LUCKY SUCCESS (Szczescie!)'
    : diceRoll.success ? (diceRoll.margin >= 15 ? 'GREAT SUCCESS' : 'SUCCESS')
    : (diceRoll.margin <= -15 ? 'HARD FAILURE' : 'FAILURE');

  const parts = [
    `Skill: ${diceRoll.skill || 'untrained'} (${diceRoll.attribute?.toUpperCase() || '?'})`,
    `Roll: d50=${diceRoll.roll} + attr=${diceRoll.attributeValue} + skill=${diceRoll.skillLevel} + momentum=${diceRoll.momentumBonus} + creativity=${diceRoll.creativityBonus} = ${diceRoll.total}`,
    `Threshold: ${diceRoll.threshold} (${diceRoll.difficulty})`,
    `Result: ${outcome} (margin ${diceRoll.margin >= 0 ? '+' : ''}${diceRoll.margin})`,
  ];

  if (diceRoll.luckySuccess) {
    parts.push('Szczescie strikes! Describe a fortunate twist that turns into success.');
  } else if (diceRoll.margin >= 15) {
    parts.push('Describe an impressive, decisive success with bonus effects.');
  } else if (diceRoll.success) {
    parts.push('The character succeeds.');
  } else if (diceRoll.margin <= -15) {
    parts.push('Describe a significant failure with serious consequences.');
  } else {
    parts.push('The character fails, but not catastrophically.');
  }

  return parts.join('\n');
}
