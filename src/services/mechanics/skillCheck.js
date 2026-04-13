import { SKILLS, DIFFICULTY_THRESHOLDS, MOMENTUM_RANGE, CREATIVITY_BONUS_MAX } from '../../data/rpgSystem.js';
import { rollD50, rollPercentage } from '../gameState.js';
import { rollLuckCheck } from '../../../shared/domain/luck.js';

// ── CONSTANTS ──

export const MOMENTUM_MIN = MOMENTUM_RANGE.min;
export const MOMENTUM_MAX = MOMENTUM_RANGE.max;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// --- Action-to-attribute keyword matching (PL + EN) ---

const ACTION_PATTERNS = [
  // Combat melee / physical force (Sila)
  { re: /\b(?:atak(?:uj[eę]?|ować)?|uderz(?:am|ać|yć)?|tn(?:ij|ę)|walcz(?:[eę]|yć)?|łam(?:ię|ać)?|podnos[zię]|dźwig(?:am|ać)?|pcham|forsuj[eę]?|attack|hit|strike|slash|stab|punch|kick|fight|swing|cleave|parry|block|force|lift|push|pull|break\s*(?:down|open)|smash|carry)\b/iu, attribute: 'sila', difficulty: 'medium' },
  // Ranged / stealth / dodge / acrobatics (Zrecznosc)
  { re: /\b(?:strzel(?:am|ać)?|celuj[eę]?|skrad(?:am|ać)|chow(?:am|ać)|ukryw(?:am|ać)|przemyk(?:am|ać)?|unikai?(?:m|ć)|skacz[eę]?|biegnę|sprint|sneak|hide|stealth|dodge|evade|climb|jump|sprint|run|acrobat|tumble|leap|shoot|fire|aim|lockpick|pick\s*(?:lock|pocket)|sleight)\b/iu, attribute: 'zrecznosc', difficulty: 'medium' },
  // Social (Charyzma)
  { re: /\b(?:mów(?:ię|ić)?|powiedz|rozmawiam|przekonuj[eę]?|negocjuj[eę]?|targuj[eę]?|kłam(?:ię|ać)?|blefuj[eę]?|pytam|prosz[eę]?|flirtuj[eę]?|zastrasz(?:am|ać)?|say|tell|talk|speak|persuade|convince|negotiate|bargain|haggle|bluff|lie|charm|flirt|intimidate|gossip|command|order)\b/iu, attribute: 'charyzma', difficulty: 'medium' },
  // Knowledge / perception / investigation (Inteligencja)
  { re: /\b(?:szuk(?:am|ać)|badam|przeszuk(?:uj[eę]?|iwać)?|obserwuj[eę]?|analizuj[eę]?|czyt(?:am|ać)|rozpozn(?:aję|ać)?|search|look|examine|investigate|inspect|read|study|analyze|identify|perceive|notice|spot|recall|research|decipher)\b/iu, attribute: 'inteligencja', difficulty: 'medium' },
  // Endurance / survival (Wytrzymalosc)
  { re: /\b(?:wytrzym(?:uj[eę]?|ać)?|znos[zię]|opier(?:am|ać)|przetrwa(?:ć|m)?|endure|resist|withstand|tough(?:en)?|brace|survive|swim|march)\b/iu, attribute: 'wytrzymalosc', difficulty: 'medium' },
  // Magic / spellcasting (Inteligencja — casting uses mana, but scroll learning uses INT)
  { re: /\b(?:rzuc(?:am)?\s*(?:zaklęcie|czar)|cast\s*spell|channel|meditat|invoke|dispel)\b/iu, attribute: 'inteligencja', difficulty: 'medium' },
];

/**
 * Infer attribute, suggested skills and difficulty from action text.
 */
export function inferActionContext(actionText) {
  if (typeof actionText !== 'string' || !actionText.trim()) return null;

  const text = actionText.trim();

  for (const pattern of ACTION_PATTERNS) {
    if (pattern.re.test(text)) {
      const suggestedSkills = SKILLS
        .filter((s) => s.attribute === pattern.attribute)
        .map((s) => s.name)
        .slice(0, 6);

      return {
        attribute: pattern.attribute,
        suggestedSkills,
        difficulty: pattern.difficulty,
      };
    }
  }

  return null;
}

/**
 * Pick the best matching skill from character's skills for an attribute.
 */
function pickBestSkillForAttribute(suggestedSkills, characterSkills, attribute) {
  if (!characterSkills || !suggestedSkills?.length) return null;

  let best = null;
  let bestLevel = -1;

  for (const skillName of suggestedSkills) {
    const entry = characterSkills[skillName];
    if (!entry) continue;
    const level = typeof entry === 'object' ? entry.level : entry;
    if (level > bestLevel) {
      best = { skill: skillName, level, attribute };
      bestLevel = level;
    }
  }

  return best;
}

/**
 * Resolve a d50 skill check.
 *
 * Mechanic:
 * 1. Luck check: roll 1-100, if <= szczescie → auto-success
 * 2. Roll d50
 * 3. Total = d50 + attribute + skillLevel + momentum (±10) + creativity (0-10)
 * 4. Compare to difficulty threshold
 * 5. Margin = total - threshold
 *
 * @param {Object} params
 * @param {Object} params.character - player character state
 * @param {string} params.actionText - raw action text
 * @param {number} [params.roll] - pre-rolled d50 (auto-rolled if not provided)
 * @param {number} [params.currentMomentum] - current momentum value (±10)
 * @param {Array} [params.worldNpcs] - NPC list for disposition lookup
 * @param {Function} [params.resolveDisposition] - (actionText, npcs) => { npcName, bonus }
 * @param {number} [params.creativityBonus] - bonus for creative actions (0-10)
 * @param {Object} [params.actionContext] - pre-inferred action context
 * @param {string} [params.difficultyOverride] - override difficulty level
 * @returns {Object|null} resolved skill check result
 */
export function resolveSkillCheck({
  character,
  actionText,
  roll,
  currentMomentum = 0,
  worldNpcs = [],
  resolveDisposition,
  creativityBonus = 0,
  actionContext = null,
  difficultyOverride = null,
}) {
  const context = actionContext || inferActionContext(actionText);
  if (!context) return null;

  const attributes = character?.attributes;
  if (!attributes) return null;

  const attribute = context.attribute;
  const attributeValue = attributes[attribute];
  if (attributeValue == null) return null;

  // --- Luck check (Szczescie) ---
  const { luckRoll, luckySuccess } = rollLuckCheck(attributes.szczescie, rollPercentage);

  // --- Pick best skill ---
  const bestSkill = pickBestSkillForAttribute(
    context.suggestedSkills,
    character?.skills,
    attribute,
  );

  const skill = bestSkill?.skill || null;
  const skillLevel = bestSkill?.level || 0;

  // --- Disposition bonus (for social tests) ---
  let dispositionBonus = 0;
  let dispositionNpc = null;
  if (attribute === 'charyzma' && typeof resolveDisposition === 'function') {
    const disposition = resolveDisposition(actionText, worldNpcs);
    if (disposition) {
      dispositionBonus = disposition.bonus;
      dispositionNpc = disposition.npcName;
    }
  }

  // --- Roll d50 ---
  const d50Roll = roll ?? rollD50();

  // --- Clamp bonuses ---
  const clampedMomentum = clamp(currentMomentum, MOMENTUM_MIN, MOMENTUM_MAX);
  const clampedCreativity = clamp(creativityBonus, 0, CREATIVITY_BONUS_MAX);

  // --- Calculate total ---
  const total = d50Roll + attributeValue + skillLevel + clampedMomentum + clampedCreativity + dispositionBonus;

  // --- Determine threshold ---
  const difficultyKey = difficultyOverride || context.difficulty || 'medium';
  const threshold = DIFFICULTY_THRESHOLDS[difficultyKey] || DIFFICULTY_THRESHOLDS.medium;

  // --- Determine success ---
  const margin = total - threshold;
  const success = luckySuccess || margin >= 0;

  return {
    roll: d50Roll,
    attribute,
    attributeValue,
    skill,
    suggestedSkills: context.suggestedSkills,
    skillLevel,
    difficulty: difficultyKey,
    threshold,
    creativityBonus: clampedCreativity,
    momentumBonus: clampedMomentum,
    dispositionBonus,
    dispositionNpc,
    total,
    margin,
    success,
    luckySuccess,
    luckRoll,
  };
}
