import { SKILLS } from '../../data/wfrp.js';
import { calculateSL, rollD100 } from '../gameState.js';
import { pickBestSkill, normalizeSkillName, inferSkillFromCharacter, findSkillCharacteristicKey } from '../diceRollInference.js';
import { getApplicableTalentBonus } from '../../data/wfrpTalents.js';

export const MAX_COMBINED_BONUS = 30;
export const MIN_DIFFICULTY_MODIFIER = -40;
export const MAX_DIFFICULTY_MODIFIER = 40;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeDifficultyModifier(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER)
    : 0;
}

export function snapDifficultyModifier(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.round(value / 10) * 10, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER);
}

// --- Action-to-characteristic keyword matching (PL + EN) ---

const ACTION_PATTERNS = [
  // Combat melee
  { re: /\b(?:atak(?:uj[eę]?|ować)?|uderz(?:am|ać|yć)?|tn(?:ij|ę)|walcz(?:[eę]|yć)?|attack|hit|strike|slash|stab|punch|kick|fight|swing|cleave|parry|block)\b/iu, characteristic: 'ws', difficulty: 0 },
  // Ranged
  { re: /\b(?:strzel(?:am|ać)?|rzuc(?:am|ić)?|celuj[eę]?|miot(?:am|ać)?|shoot|fire|throw|aim|hurl|toss|snipe)\b/iu, characteristic: 'bs', difficulty: 0 },
  // Strength / physical force
  { re: /\b(?:wywa[żz](?:am|ać|yć)?|łam(?:ię|ać)?|podnos[zię]|dźwig(?:am|ać)?|pcham|forsuj[eę]?|force|lift|push|pull|break\s*(?:down|open)|smash|pry|bend|carry)\b/iu, characteristic: 's', difficulty: 0 },
  // Toughness / endurance
  { re: /\b(?:wytrzym(?:uj[eę]?|ać)?|znos[zię]|opier(?:am|ać)|endure|resist|withstand|tough(?:en)?|brace|stomach)\b/iu, characteristic: 't', difficulty: 0 },
  // Agility / stealth / dodge
  { re: /\b(?:skrad(?:am|ać)|chow(?:am|ać)|ukryw(?:am|ać)|przemyk(?:am|ać)?|unikai?(?:m|ć)|wspina(?:m|ć)|skacz[eę]?|biegnę|sprint|sneak|hide|stealth|dodge|evade|climb|jump|sprint|run|acrobat|tumble|leap|vault|dash|crawl)\b/iu, characteristic: 'ag', difficulty: 0 },
  // Dexterity / manual
  { re: /\b(?:otwieram\s*zamek|włam(?:uj[eę]?|ać)?|kradnę|podkrad(?:am|ać)?|wytrych|majstru(?:ję|ać)|lockpick|pick\s*(?:lock|pocket)|sleight|craft|disarm\s*trap|tinker|forge|sew|repair)\b/iu, characteristic: 'dex', difficulty: -10 },
  // Intelligence / perception / knowledge
  { re: /\b(?:szuk(?:am|ać)|badam|przeszuk(?:uj[eę]?|iwać)?|obserwuj[eę]?|analizuj[eę]?|czyt(?:am|ać)|rozpozn(?:aję|ać)?|identyfik(?:uj[eę]?|ować)|search|look|examine|investigate|inspect|read|study|analyze|identify|perceive|notice|spot|recall|research|decipher)\b/iu, characteristic: 'int', difficulty: 0 },
  // Willpower / magic / resist fear
  { re: /\b(?:rzuc(?:am)?\s*(?:zaklęcie|czar)|medytuj[eę]?|skupi(?:am|ć)|modl[eę]|opier(?:am|ać)\s*si[eę]\s*(?:strachowi|magii)|cast\s*spell|channel|meditat|pray|concentrate|focus|resist\s*(?:fear|magic|corruption)|invoke|dispel)\b/iu, characteristic: 'wp', difficulty: 0 },
  // Fellowship / social
  { re: /\b(?:mów(?:ię|ić)?|powiedz|rozmawiam|przekonuj[eę]?|negocjuj[eę]?|targuj[eę]?|kłam(?:ię|ać)?|blefuj[eę]?|pytam|prosz[eę]?|zagaduj[eę]?|flirtuj[eę]?|zastrasz(?:am|ać)?|say|tell|talk|speak|persuade|convince|negotiate|bargain|haggle|bluff|lie|charm|flirt|intimidate|gossip|bribe|seduce|question|ask|request|plead|taunt|boast|command|order|greet)\b/iu, characteristic: 'fel', difficulty: 0 },
];

/**
 * Infer characteristic, suggested skills and difficulty from action text.
 * @param {string} actionText
 * @returns {{ characteristic: string, suggestedSkills: string[], difficultyModifier: number } | null}
 */
export function inferActionContext(actionText) {
  if (typeof actionText !== 'string' || !actionText.trim()) return null;

  const text = actionText.trim();

  for (const pattern of ACTION_PATTERNS) {
    if (pattern.re.test(text)) {
      const allSkills = [...SKILLS.basic, ...SKILLS.advanced];
      const suggestedSkills = allSkills
        .filter((s) => s.characteristic.toLowerCase() === pattern.characteristic)
        .map((s) => s.name)
        .slice(0, 6);

      return {
        characteristic: pattern.characteristic,
        suggestedSkills,
        difficultyModifier: pattern.difficulty,
      };
    }
  }

  return null;
}

/**
 * Fully resolve a WFRP4e skill check before AI call.
 * @param {Object} params
 * @param {Object} params.character - player character state
 * @param {string} params.actionText - raw action text
 * @param {number} params.roll - pre-rolled d100
 * @param {number} params.currentMomentum - current momentum value (bonus to this roll)
 * @param {Array} params.worldNpcs - NPC list for disposition lookup
 * @param {Function} params.resolveDisposition - (actionText, npcs) => { npcName, bonus } | null
 * @param {number} [params.creativityBonus] - bonus for custom/auto-player actions (0-25)
 * @returns {import('./index.js').ResolvedSkillCheck | null}
 */
export function resolveSkillCheck({ character, actionText, roll, currentMomentum = 0, worldNpcs = [], resolveDisposition, creativityBonus = 0 }) {
  const context = inferActionContext(actionText);
  if (!context) return null;

  const characteristics = character?.characteristics;
  if (!characteristics) return null;

  let resolvedCharacteristic = context.characteristic;
  const characteristicValue = characteristics[resolvedCharacteristic];
  if (characteristicValue == null) return null;

  // Pick best skill from character's skills matching this characteristic
  const bestSkill = pickBestSkill(
    context.suggestedSkills,
    character?.skills,
    characteristics,
  );

  let skill = null;
  let skillAdvances = 0;
  let baseTarget = characteristicValue;

  if (bestSkill) {
    skill = bestSkill.skill;
    skillAdvances = bestSkill.advances;
    if (bestSkill.characteristic !== resolvedCharacteristic) {
      resolvedCharacteristic = bestSkill.characteristic;
    }
    const charVal = characteristics[resolvedCharacteristic] ?? characteristicValue;
    baseTarget = charVal + skillAdvances;
  }

  // Normalize skill name
  if (skill) {
    const normalized = normalizeSkillName(skill);
    if (normalized) skill = normalized;
  }
  if (!skill && skillAdvances > 0) {
    const inferred = inferSkillFromCharacter(resolvedCharacteristic, skillAdvances, character?.skills);
    if (inferred) skill = inferred;
  }

  // Talent bonus
  const talentResult = getApplicableTalentBonus(character?.talents, resolvedCharacteristic, skill);
  const talentBonus = talentResult ? talentResult.bonus : 0;
  const applicableTalent = talentResult ? talentResult.talent : null;

  // Disposition bonus (for social tests)
  let dispositionBonus = 0;
  let dispositionNpc = null;
  if (resolvedCharacteristic === 'fel' && typeof resolveDisposition === 'function') {
    const disposition = resolveDisposition(actionText, worldNpcs);
    if (disposition) {
      dispositionBonus = disposition.bonus;
      dispositionNpc = disposition.npcName;
    }
  }

  // Bonuses with cap
  const totalBonus = creativityBonus + currentMomentum + dispositionBonus;
  const cappedBonus = Math.min(totalBonus, MAX_COMBINED_BONUS);

  const difficultyModifier = context.difficultyModifier;
  const effectiveTarget = baseTarget + talentBonus + cappedBonus + difficultyModifier;

  // Success / critical determination
  const isCriticalSuccess = roll >= 1 && roll <= 4;
  const isCriticalFailure = roll >= 96 && roll <= 100;
  const isSuccess = isCriticalSuccess || (!isCriticalFailure && roll <= effectiveTarget);
  const sl = calculateSL(roll, effectiveTarget);

  return {
    roll,
    characteristic: resolvedCharacteristic,
    characteristicValue: characteristics[resolvedCharacteristic] ?? characteristicValue,
    skill,
    suggestedSkills: context.suggestedSkills,
    skillAdvances,
    applicableTalent,
    talentBonus,
    baseTarget,
    difficultyModifier,
    creativityBonus,
    momentumBonus: currentMomentum,
    dispositionBonus,
    dispositionNpc,
    target: effectiveTarget,
    success: isSuccess,
    criticalSuccess: isCriticalSuccess,
    criticalFailure: isCriticalFailure,
    sl,
  };
}
