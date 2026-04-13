/**
 * Backend Dice Resolver — resolves d50 skill checks server-side.
 *
 * Called after intent classification (nano model) determines which skill/difficulty
 * to use, and before the large model call so the AI can narrate the outcome.
 * Also used to resolve model-initiated dice rolls post-hoc.
 */

// ── CONSTANTS (mirrored from src/data/rpgSystem.js) ──

export const DIFFICULTY_THRESHOLDS = {
  easy: 20,
  medium: 35,
  hard: 50,
  veryHard: 65,
  extreme: 80,
};

export const CREATIVITY_BONUS_MAX = 10;

const SKILLS = [
  { name: 'Walka wrecz', attribute: 'sila' },
  { name: 'Walka bronia jednoręczna', attribute: 'sila' },
  { name: 'Walka bronia dwureczna', attribute: 'sila' },
  { name: 'Strzelectwo', attribute: 'zrecznosc' },
  { name: 'Uniki', attribute: 'zrecznosc' },
  { name: 'Zastraszanie', attribute: 'sila' },
  { name: 'Atletyka', attribute: 'sila' },
  { name: 'Akrobatyka', attribute: 'zrecznosc' },
  { name: 'Jezdziectwo', attribute: 'zrecznosc' },
  { name: 'Perswazja', attribute: 'charyzma' },
  { name: 'Blef', attribute: 'charyzma' },
  { name: 'Handel', attribute: 'charyzma' },
  { name: 'Przywodztwo', attribute: 'charyzma' },
  { name: 'Wystepy', attribute: 'charyzma' },
  { name: 'Wiedza ogolna', attribute: 'inteligencja' },
  { name: 'Wiedza o potworach', attribute: 'inteligencja' },
  { name: 'Wiedza o naturze', attribute: 'inteligencja' },
  { name: 'Medycyna', attribute: 'inteligencja' },
  { name: 'Alchemia', attribute: 'inteligencja' },
  { name: 'Rzemioslo', attribute: 'inteligencja' },
  { name: 'Skradanie', attribute: 'zrecznosc' },
  { name: 'Otwieranie zamkow', attribute: 'zrecznosc' },
  { name: 'Kradziez kieszonkowa', attribute: 'zrecznosc' },
  { name: 'Pulapki i mechanizmy', attribute: 'zrecznosc' },
  { name: 'Spostrzegawczosc', attribute: 'inteligencja' },
  { name: 'Przetrwanie', attribute: 'wytrzymalosc' },
  { name: 'Tropienie', attribute: 'inteligencja' },
  { name: 'Odpornosc', attribute: 'wytrzymalosc' },
  { name: 'Fart', attribute: 'szczescie' },
  { name: 'Hazard', attribute: 'szczescie' },
  { name: 'Przeczucie', attribute: 'szczescie' },
];

export const SKILL_BY_NAME = Object.fromEntries(SKILLS.map(s => [s.name, s]));

// ── HELPERS ──

export function rollD50() {
  return Math.floor(Math.random() * 50) + 1;
}

function rollPercentage() {
  return Math.floor(Math.random() * 100) + 1;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

import { getSkillLevel as getSkillLevelFromMap } from '../../../shared/domain/skills.js';
import { rollLuckCheck, isLuckySuccess } from '../../../shared/domain/luck.js';

/**
 * Find the skill level for the given skill name from character's skills.
 * Backend helpers pass the whole character; thin wrapper over the shared
 * map-based helper.
 */
export function getSkillLevel(character, skillName) {
  return getSkillLevelFromMap(character?.skills, skillName);
}

/**
 * Core dice resolution with explicit d50 and luckySuccess values.
 * Used by both nano-resolved and model-resolved paths.
 */
export function resolveBackendDiceRollWithPreRoll(character, skillName, difficulty, preD50, luckySuccess, creativityBonus = 0) {
  if (!character?.attributes) return null;

  const skillDef = SKILL_BY_NAME[skillName];
  if (!skillDef) return null;

  const attribute = skillDef.attribute;
  const attributeValue = character.attributes[attribute] || 0;
  const skillLevel = getSkillLevel(character, skillName);
  const momentum = clamp(character.momentumBonus || 0, -10, 10);
  const clampedCreativity = clamp(Number(creativityBonus) || 0, 0, CREATIVITY_BONUS_MAX);

  const difficultyKey = difficulty || 'medium';
  const threshold = DIFFICULTY_THRESHOLDS[difficultyKey] || DIFFICULTY_THRESHOLDS.medium;

  const total = preD50 + attributeValue + skillLevel + momentum + clampedCreativity;
  const margin = total - threshold;
  const success = luckySuccess || margin >= 0;

  return {
    roll: preD50,
    attribute,
    attributeValue,
    skill: skillName,
    skillLevel,
    difficulty: difficultyKey,
    threshold,
    creativityBonus: clampedCreativity,
    momentumBonus: momentum,
    dispositionBonus: 0,
    dispositionNpc: null,
    total,
    margin,
    success,
    luckySuccess,
  };
}

/**
 * Resolve a d50 skill check with fresh random values.
 * Wrapper around resolveBackendDiceRollWithPreRoll.
 */
export function resolveBackendDiceRoll(character, skillName, difficulty, options = {}) {
  const d50 = rollD50();
  const { luckySuccess } = rollLuckCheck(character?.attributes?.szczescie, rollPercentage);
  return resolveBackendDiceRollWithPreRoll(character, skillName, difficulty, d50, luckySuccess);
}

/**
 * Generate 3 pre-rolled dice sets for the large model fallback.
 * Lucky success is pre-resolved using character's Szczescie attribute.
 */
export function generatePreRolls(character) {
  const szczescie = character?.attributes?.szczescie || 0;
  const momentum = clamp(character?.momentumBonus || 0, -10, 10);
  return Array.from({ length: 3 }, () => {
    const d50 = rollD50();
    const luckyRoll = rollPercentage();
    return {
      d50,
      momentum,
      base: d50 + momentum,
      luckySuccess: isLuckySuccess(szczescie, luckyRoll),
    };
  });
}

/**
 * Format a resolved dice roll for injection into the AI prompt.
 */
export function formatResolvedCheck(diceRoll) {
  if (!diceRoll) return 'No skill check for this action.';

  const outcome = diceRoll.luckySuccess ? 'LUCKY SUCCESS (Szczescie!)'
    : diceRoll.success ? (diceRoll.margin >= 15 ? 'GREAT SUCCESS' : 'SUCCESS')
      : (diceRoll.margin <= -15 ? 'HARD FAILURE' : 'FAILURE');

  const parts = [
    `Skill: ${diceRoll.skill || 'untrained'} (${diceRoll.attribute?.toUpperCase() || '?'})`,
    `Roll: d50=${diceRoll.roll} + attr=${diceRoll.attributeValue} + skill=${diceRoll.skillLevel} + momentum=${diceRoll.momentumBonus} = ${diceRoll.total}`,
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
