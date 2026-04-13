import {
  resolveBackendDiceRollWithPreRoll,
  CREATIVITY_BONUS_MAX,
  SKILL_BY_NAME,
  DIFFICULTY_THRESHOLDS,
  getSkillLevel,
  clamp,
} from '../diceResolver.js';

// ── Skill XP calculation (deterministic, mirrors shared/domain logic) ──

const DIFFICULTY_SKILL_XP = {
  easy:     { success: 4,  failure: 2  },
  medium:   { success: 8,  failure: 4  },
  hard:     { success: 14, failure: 7  },
  veryHard: { success: 20, failure: 10 },
  extreme:  { success: 28, failure: 14 },
};

/**
 * Convert AI's skillsUsed + actionDifficulty into deterministic skillProgress XP.
 * Called after scene generation, before returning result to frontend.
 * diceRolls: resolved dice rolls array (nano + model), used for roll-based XP.
 */
export function calculateFreeformSkillXP(stateChanges, hasExternalDiceRoll, diceRolls) {
  if (!stateChanges) return;
  const skillsUsed = stateChanges.skillsUsed;
  const difficulty = stateChanges.actionDifficulty;

  if (Array.isArray(diceRolls) && diceRolls.length > 0) {
    stateChanges.skillProgress = {};
    const rolledSkills = new Set();
    for (const roll of diceRolls) {
      if (!roll?.skill) continue;
      const entry = DIFFICULTY_SKILL_XP[roll.difficulty] || DIFFICULTY_SKILL_XP.medium;
      stateChanges.skillProgress[roll.skill] = roll.success ? entry.success : entry.failure;
      rolledSkills.add(roll.skill);
    }
    if (Array.isArray(skillsUsed)) {
      for (const skill of skillsUsed.slice(0, 3)) {
        if (typeof skill === 'string' && skill.trim() && !rolledSkills.has(skill.trim())) {
          const entry = DIFFICULTY_SKILL_XP[difficulty] || DIFFICULTY_SKILL_XP.medium;
          stateChanges.skillProgress[skill.trim()] = entry.success;
        }
      }
    }
  } else if (Array.isArray(skillsUsed) && skillsUsed.length > 0 && !hasExternalDiceRoll) {
    const entry = DIFFICULTY_SKILL_XP[difficulty] || DIFFICULTY_SKILL_XP.medium;
    const xp = entry.success;
    stateChanges.skillProgress = {};
    for (const skill of skillsUsed.slice(0, 3)) {
      if (typeof skill === 'string' && skill.trim()) {
        stateChanges.skillProgress[skill.trim()] = xp;
      }
    }
  }

  delete stateChanges.skillsUsed;
  delete stateChanges.actionDifficulty;
}

/**
 * Apply creativity bonus to a dice roll in-place. Modifies total/margin/success/
 * creativityBonus so the bonus isn't double-counted — if the roll already has
 * a previous bonus, replace it with the new value and recalculate total.
 */
export function applyCreativityToRoll(roll, bonus) {
  if (!roll || typeof roll !== 'object') return;
  const clamped = Math.max(0, Math.min(CREATIVITY_BONUS_MAX, Math.floor(Number(bonus) || 0)));
  if (clamped === 0 && (roll.creativityBonus || 0) === 0) return;

  const previous = roll.creativityBonus || 0;
  roll.creativityBonus = clamped;
  roll.total = (roll.total || 0) - previous + clamped;
  if (typeof roll.threshold === 'number') {
    roll.margin = roll.total - roll.threshold;
    roll.success = roll.luckySuccess === true || roll.margin >= 0;
  }
}

/**
 * Decide whether the player qualifies for a creativity bonus at all.
 * Bonus is only awarded for freshly-typed actions — never for clicked
 * suggestedActions or auto modes ([CONTINUE], [WAIT], etc).
 */
export function isCreativityEligible(playerAction, { isCustomAction, fromAutoPlayer } = {}) {
  if (!isCustomAction) return false;
  if (fromAutoPlayer) return false;
  if (typeof playerAction !== 'string') return false;
  if (playerAction.startsWith('[')) return false;
  return true;
}

/**
 * Resolve model-initiated dice rolls using pre-rolled values.
 * Model returns only {skill, difficulty, success} — backend calculates the full
 * result. If the model's narrated outcome disagrees with the mechanical result,
 * nudge d50 to reconcile so narration and mechanics stay in sync.
 */
export function resolveModelDiceRolls(sceneResult, character, preRolls) {
  // Schema reorder: diceRolls is TOP-LEVEL. Fall back to legacy stateChanges.diceRolls
  // for any in-flight responses where the model still nests it (best-effort).
  const modelRolls = Array.isArray(sceneResult.diceRolls) && sceneResult.diceRolls.length > 0
    ? sceneResult.diceRolls
    : sceneResult.stateChanges?.diceRolls;
  if (!Array.isArray(modelRolls) || modelRolls.length === 0) return;

  const resolved = [];
  for (let i = 0; i < Math.min(modelRolls.length, 3); i++) {
    const { skill, difficulty, success: modelSaysSuccess } = modelRolls[i] || {};
    const preRoll = preRolls[i];
    if (!skill || !preRoll) continue;

    const roll = resolveBackendDiceRollWithPreRoll(
      character, skill, difficulty || 'medium',
      preRoll.d50, preRoll.luckySuccess,
    );
    if (!roll) continue;

    if (typeof modelSaysSuccess === 'boolean' && modelSaysSuccess !== roll.success && !roll.luckySuccess) {
      const skillDef = SKILL_BY_NAME[skill];
      if (skillDef) {
        const attr = character.attributes[skillDef.attribute] || 0;
        const skillLvl = getSkillLevel(character, skill);
        const momentum = clamp(character.momentumBonus || 0, -10, 10);
        const threshold = DIFFICULTY_THRESHOLDS[difficulty] || DIFFICULTY_THRESHOLDS.medium;

        if (modelSaysSuccess && !roll.success) {
          const nudge = Math.floor(Math.random() * 4);
          const neededD50 = threshold - attr - skillLvl - momentum + nudge;
          roll.roll = clamp(neededD50, 1, 50);
        } else if (!modelSaysSuccess && roll.success) {
          const nudge = -(Math.floor(Math.random() * 4) + 1);
          const neededD50 = threshold - attr - skillLvl - momentum + nudge;
          roll.roll = clamp(neededD50, 1, 50);
        }
        roll.total = roll.roll + attr + skillLvl + momentum;
        roll.margin = roll.total - threshold;
        roll.success = roll.margin >= 0;
      }
    }

    resolved.push(roll);
  }

  if (resolved.length > 0) {
    sceneResult.diceRolls = resolved;
  } else {
    sceneResult.diceRolls = undefined;
  }
  if (sceneResult.stateChanges?.diceRolls) {
    delete sceneResult.stateChanges.diceRolls;
  }
}
