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

export const CREATIVITY_BONUS_MAX = 20;

const SKILLS = [
  { name: 'Walka wrecz', attribute: 'sila' },
  { name: 'Walka bronia jednoręczna', attribute: 'sila' },
  { name: 'Walka bronia dwureczna', attribute: 'sila' },
  { name: 'Strzelectwo', attribute: 'zrecznosc' },
  { name: 'Uniki', attribute: 'zrecznosc' },
  { name: 'Walka dwiema brońmi', attribute: 'zrecznosc' },
  { name: 'Zastraszanie', attribute: 'sila' },
  { name: 'Taktyka', attribute: 'inteligencja' },
  { name: 'Atletyka', attribute: 'sila' },
  { name: 'Akrobatyka', attribute: 'zrecznosc' },
  { name: 'Jezdziectwo', attribute: 'zrecznosc' },
  { name: 'Prezenie sie', attribute: 'sila' },
  { name: 'Wywazanie drzwi', attribute: 'sila' },
  { name: 'Perswazja', attribute: 'charyzma' },
  { name: 'Blef', attribute: 'charyzma' },
  { name: 'Handel', attribute: 'charyzma' },
  { name: 'Przywodztwo', attribute: 'charyzma' },
  { name: 'Wystepy', attribute: 'charyzma' },
  { name: 'Flirt', attribute: 'charyzma' },
  { name: 'Wiedza ogolna', attribute: 'inteligencja' },
  { name: 'Wiedza o potworach', attribute: 'inteligencja' },
  { name: 'Wiedza o naturze', attribute: 'inteligencja' },
  { name: 'Medycyna', attribute: 'inteligencja' },
  { name: 'Alchemia', attribute: 'inteligencja' },
  { name: 'Rzemioslo', attribute: 'inteligencja' },
  { name: 'Nawigacja', attribute: 'inteligencja' },
  { name: 'Skradanie', attribute: 'zrecznosc' },
  { name: 'Otwieranie zamkow', attribute: 'zrecznosc' },
  { name: 'Kradziez kieszonkowa', attribute: 'zrecznosc' },
  { name: 'Pulapki i mechanizmy', attribute: 'zrecznosc' },
  { name: 'Spostrzegawczosc', attribute: 'inteligencja' },
  { name: 'Przetrwanie', attribute: 'wytrzymalosc' },
  { name: 'Tropienie', attribute: 'inteligencja' },
  { name: 'Odpornosc', attribute: 'wytrzymalosc' },
  { name: 'Picie alkoholu', attribute: 'wytrzymalosc' },
  { name: 'Upartosc', attribute: 'wytrzymalosc' },
  { name: 'Plywanie', attribute: 'wytrzymalosc' },
  { name: 'Fart', attribute: 'szczescie' },
  { name: 'Hazard', attribute: 'szczescie' },
  { name: 'Przeczucie', attribute: 'szczescie' },
  { name: 'Modlitwa', attribute: 'szczescie' },
];

export const SKILL_BY_NAME = Object.fromEntries(SKILLS.map(s => [s.name, s]));

// Fuzzy lookup: strip diacritics + lowercase + collapse whitespace → canonical name.
const SKILL_CANONICAL_MAP = new Map();
function stripToKey(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l').replace(/\u0141/g, 'L')
    .trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}
for (const s of SKILLS) {
  SKILL_CANONICAL_MAP.set(stripToKey(s.name), s.name);
}

/**
 * Resolve an AI-returned skill name (possibly with diacritics / different casing)
 * to the canonical ASCII key used in SKILL_BY_NAME and character.skills.
 * Returns the canonical name or null if no match.
 */
export function canonicalizeSkillName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (SKILL_BY_NAME[raw]) return raw;
  return SKILL_CANONICAL_MAP.get(stripToKey(raw)) || null;
}

const SKILLS_BY_ATTRIBUTE = {};
for (const s of SKILLS) {
  (SKILLS_BY_ATTRIBUTE[s.attribute] ??= []).push(s.name);
}

// Action-text → attribute heuristics (mirrors src/services/mechanics/skillCheck.js ACTION_PATTERNS).
const FORCE_ROLL_PATTERNS = [
  { re: /\b(?:atak(?:uj[eę]?|ować)?|uderz(?:am|ać|yć)?|tn(?:ij|ę)|walcz(?:[eę]|yć)?|łam(?:ię|ać)?|podnos[zię]|dźwig(?:am|ać)?|pcham|forsuj[eę]?|attack|hit|strike|slash|stab|punch|kick|fight|swing|cleave|parry|block|force|lift|push|pull|break\s*(?:down|open)|smash|carry)\b/iu, attribute: 'sila' },
  { re: /\b(?:strzel(?:am|ać)?|celuj[eę]?|skrad(?:am|ać)|chow(?:am|ać)|ukryw(?:am|ać)|przemyk(?:am|ać)?|unikai?(?:m|ć)|skacz[eę]?|biegnę|sprint|sneak|hide|stealth|dodge|evade|climb|jump|sprint|run|acrobat|tumble|leap|shoot|fire|aim|lockpick|pick\s*(?:lock|pocket)|sleight)\b/iu, attribute: 'zrecznosc' },
  { re: /\b(?:mów(?:ię|ić)?|powiedz|rozmawiam|przekonuj[eę]?|negocjuj[eę]?|targuj[eę]?|kłam(?:ię|ać)?|blefuj[eę]?|pytam|prosz[eę]?|flirtuj[eę]?|zastrasz(?:am|ać)?|say|tell|talk|speak|persuade|convince|negotiate|bargain|haggle|bluff|lie|charm|flirt|intimidate|gossip|command|order)\b/iu, attribute: 'charyzma' },
  { re: /\b(?:szuk(?:am|ać)|badam|przeszuk(?:uj[eę]?|iwać)?|obserwuj[eę]?|analizuj[eę]?|czyt(?:am|ać)|rozpozn(?:aję|ać)?|search|look|examine|investigate|inspect|read|study|analyze|identify|perceive|notice|spot|recall|research|decipher)\b/iu, attribute: 'inteligencja' },
  { re: /\b(?:wytrzym(?:uj[eę]?|ać)?|znos[zię]|opier(?:am|ać)|przetrwa(?:ć|m)?|endure|resist|withstand|tough(?:en)?|brace|survive|swim|march)\b/iu, attribute: 'wytrzymalosc' },
  { re: /\b(?:rzuc(?:am)?\s*(?:zaklęcie|czar)|cast\s*spell|channel|meditat|invoke|dispel)\b/iu, attribute: 'inteligencja' },
];

const FALLBACK_FORCED_SKILL = 'Przeczucie';

/**
 * Pick the best skill for a forced roll. Priority:
 *   1. Action-text heuristic → character's highest skill for that attribute
 *   2. First canonical skill for the matched attribute (character has none trained)
 *   3. Przeczucie (unclassifiable text — player wants a roll anyway)
 */
export function inferForcedRollSkill(playerAction, character) {
  if (typeof playerAction !== 'string' || !playerAction.trim()) return FALLBACK_FORCED_SKILL;

  const text = playerAction.trim();
  let attribute = null;
  for (const p of FORCE_ROLL_PATTERNS) {
    if (p.re.test(text)) { attribute = p.attribute; break; }
  }

  if (attribute) {
    const candidates = SKILLS_BY_ATTRIBUTE[attribute] || [];
    let bestSkill = null;
    let bestLevel = -1;
    for (const name of candidates) {
      const level = getSkillLevel(character, name);
      if (level > bestLevel) { bestSkill = name; bestLevel = level; }
    }
    return bestSkill || candidates[0] || FALLBACK_FORCED_SKILL;
  }

  return FALLBACK_FORCED_SKILL;
}

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
const MODIFIER_VALUE_MIN = -10;
const MODIFIER_VALUE_MAX = 15;
const MODIFIER_SUM_MIN = -15;
const MODIFIER_SUM_MAX = 20;
const MODIFIER_MAX_COUNT = 4;

function sanitizeModifiers(rawModifiers) {
  if (!Array.isArray(rawModifiers) || rawModifiers.length === 0) return [];
  const capped = rawModifiers.slice(0, MODIFIER_MAX_COUNT);
  return capped
    .filter(m => m && typeof m.reason === 'string' && typeof m.value === 'number')
    .map(m => ({
      reason: m.reason.slice(0, 40),
      value: clamp(Math.trunc(m.value), MODIFIER_VALUE_MIN, MODIFIER_VALUE_MAX),
    }));
}

export function resolveBackendDiceRollWithPreRoll(character, skillName, difficulty, preD50, luckySuccess, creativityBonus = 0, rawModifiers = []) {
  if (!character?.attributes) return null;

  const skillDef = SKILL_BY_NAME[skillName];
  if (!skillDef) return null;

  const attribute = skillDef.attribute;
  const attributeValue = character.attributes[attribute] || 0;
  const skillLevel = getSkillLevel(character, skillName);
  const momentum = clamp(character.momentumBonus || 0, -10, 10);
  const clampedCreativity = clamp(Number(creativityBonus) || 0, 0, CREATIVITY_BONUS_MAX);

  const difficultyKey = difficulty || 'medium';
  const baseThreshold = DIFFICULTY_THRESHOLDS[difficultyKey] || DIFFICULTY_THRESHOLDS.medium;

  const modifiers = sanitizeModifiers(rawModifiers);
  const modifierSum = clamp(
    modifiers.reduce((sum, m) => sum + m.value, 0),
    MODIFIER_SUM_MIN,
    MODIFIER_SUM_MAX,
  );
  const finalThreshold = baseThreshold + modifierSum;

  const thresholdBreakdown = modifiers.length > 0
    ? { base: baseThreshold, modifiers, final: finalThreshold }
    : undefined;

  const luckBonus = character.attributes.szczescie || 0;
  const total = preD50 + attributeValue + skillLevel + momentum + clampedCreativity + luckBonus;
  const margin = total - finalThreshold;
  const success = luckySuccess || margin >= 0;

  return {
    roll: preD50,
    attribute,
    attributeValue,
    skill: skillName,
    skillLevel,
    difficulty: difficultyKey,
    threshold: finalThreshold,
    creativityBonus: clampedCreativity,
    momentumBonus: momentum,
    dispositionBonus: 0,
    dispositionNpc: null,
    luckBonus,
    total,
    margin,
    success,
    luckySuccess,
    ...(thresholdBreakdown && { thresholdBreakdown }),
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
      base: d50 + momentum + szczescie,
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

  let thresholdLine = `Threshold: ${diceRoll.threshold} (${diceRoll.difficulty})`;
  if (diceRoll.thresholdBreakdown) {
    const tb = diceRoll.thresholdBreakdown;
    const modParts = tb.modifiers.map(m => `${m.value >= 0 ? '+' : ''}${m.value} ${m.reason}`);
    thresholdLine = `Threshold: ${tb.base} (${diceRoll.difficulty}) ${modParts.join(' ')} = ${tb.final}`;
  }

  const parts = [
    `Skill: ${diceRoll.skill || 'untrained'} (${diceRoll.attribute?.toUpperCase() || '?'})`,
    `Roll: d50=${diceRoll.roll} + attr=${diceRoll.attributeValue} + skill=${diceRoll.skillLevel} + momentum=${diceRoll.momentumBonus} + luck=${diceRoll.luckBonus || 0} = ${diceRoll.total}`,
    thresholdLine,
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
