/**
 * Backend Dice Resolver — resolves d50 skill checks server-side.
 *
 * Called after intent classification (nano model) determines which skill/difficulty
 * to use, and before the large model call so the AI can narrate the outcome.
 */

// ── CONSTANTS (mirrored from src/data/rpgSystem.js) ──

const DIFFICULTY_THRESHOLDS = {
  easy: 30,
  medium: 40,
  hard: 55,
  veryHard: 65,
  extreme: 80,
};

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

const SKILL_BY_NAME = Object.fromEntries(SKILLS.map(s => [s.name, s]));

// ── HELPERS ──

function rollD50() {
  return Math.floor(Math.random() * 50) + 1;
}

function rollPercentage() {
  return Math.floor(Math.random() * 100) + 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Find the best skill for the given skill name from character's skills.
 */
function getSkillLevel(character, skillName) {
  const entry = character?.skills?.[skillName];
  if (!entry) return 0;
  return typeof entry === 'object' ? (entry.level || 0) : (entry || 0);
}

/**
 * Resolve a d50 skill check on the backend.
 *
 * @param {Object} character - character state with attributes, skills, momentumBonus
 * @param {string} skillName - skill to test (from nano model)
 * @param {string} difficulty - difficulty key (easy/medium/hard/veryHard/extreme)
 * @param {Object} [options] - { testsFrequency }
 * @returns {Object|null} dice roll result, or null if no roll needed
 */
export function resolveBackendDiceRoll(character, skillName, difficulty, options = {}) {
  if (!character?.attributes) return null;

  const skillDef = SKILL_BY_NAME[skillName];
  if (!skillDef) return null;

  const attribute = skillDef.attribute;
  const attributeValue = character.attributes[attribute] || 0;
  const skillLevel = getSkillLevel(character, skillName);
  const momentum = clamp(character.momentumBonus || 0, -10, 10);

  // Luck check
  const szczescie = character.attributes.szczescie || 0;
  const luckRoll = rollPercentage();
  const luckySuccess = luckRoll <= szczescie;

  // Roll d50
  const d50Roll = rollD50();

  // Total
  const total = d50Roll + attributeValue + skillLevel + momentum;

  // Threshold
  const difficultyKey = difficulty || 'medium';
  const threshold = DIFFICULTY_THRESHOLDS[difficultyKey] || DIFFICULTY_THRESHOLDS.medium;

  // Result
  const margin = total - threshold;
  const success = luckySuccess || margin >= 0;

  return {
    roll: d50Roll,
    attribute,
    attributeValue,
    skill: skillName,
    skillLevel,
    difficulty: difficultyKey,
    threshold,
    creativityBonus: 0,
    momentumBonus: momentum,
    dispositionBonus: 0,
    dispositionNpc: null,
    total,
    margin,
    success,
    luckySuccess,
    luckRoll,
  };
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
