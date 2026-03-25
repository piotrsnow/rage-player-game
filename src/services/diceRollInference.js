import { CHARACTERISTIC_KEYS, CHARACTERISTIC_NAMES, SKILLS } from '../data/wfrp.js';
import plTranslations from '../locales/pl.json' with { type: 'json' };

const CHARACTERISTIC_KEY_SET = new Set(CHARACTERISTIC_KEYS);
const ALL_SKILLS = [...SKILLS.basic, ...SKILLS.advanced];

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')   // ł → l
    .replace(/\u0141/g, 'L');   // Ł → L
}

function canonicalizeKey(value) {
  return stripDiacritics(
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
  );
}

const SKILL_ALIAS_MAP = new Map();
for (const skill of ALL_SKILLS) {
  SKILL_ALIAS_MAP.set(canonicalizeKey(skill.name), skill.name);
}
if (plTranslations.wfrpSkills) {
  for (const [enName, plName] of Object.entries(plTranslations.wfrpSkills)) {
    SKILL_ALIAS_MAP.set(canonicalizeKey(plName), enName);
  }
}

const CHARACTERISTIC_ALIASES = new Map([
  ...CHARACTERISTIC_KEYS.map((key) => [canonicalizeKey(key), key]),
  ...Object.entries(CHARACTERISTIC_NAMES).map(([key, label]) => [canonicalizeKey(label), key]),
  ['weaponskill', 'ws'],
  ['ballisticskill', 'bs'],
  ['strength', 's'],
  ['sila', 's'],
  ['toughness', 't'],
  ['wytrzymalosc', 't'],
  ['initiative', 'i'],
  ['inicjatywa', 'i'],
  ['agility', 'ag'],
  ['dexterity', 'dex'],
  ['manualdexterity', 'dex'],
  ['intelligence', 'int'],
  ['intel', 'int'],
  ['inteligencja', 'int'],
  ['willpower', 'wp'],
  ['silawoli', 'wp'],
  ['fellowship', 'fel'],
  ['charisma', 'fel'],
  ['charyzma', 'fel'],
  ['social', 'fel'],
  ['spoleczne', 'fel'],
  // Polish WFRP stat names (long)
  ['walkawrecz', 'ws'],
  ['umiejetnoscistrzeleckie', 'bs'],
  ['zwinnosc', 'ag'],
  ['zrecznosc', 'dex'],
  ['oglada', 'fel'],
  // Polish WFRP abbreviations
  ['ww', 'ws'],
  ['us', 'bs'],
  ['wt', 't'],
  ['zw', 'ag'],
  ['zr', 'dex'],
  ['sw', 'wp'],
  ['ogd', 'fel'],
]);

const SOCIAL_ACTION_RE = /["“”„«»]|(?:\b(?:say|tell|ask|speak|talk|chat|greet|persuade|convince|negotiate|bargain|haggle|bluff|lie|question|request|plead|flirt|joke|taunt|boast|promise|explain|encourage|warn|command|order)\b)|(?:\b(?:mow(?:ie|ic)?|mówię|mówić|powiedz|powiem|powiadam|zapyt(?:am|ac)?|zapytuję|pytam|rozmawiam|zagaduj(?:e|ę|ac)?|gad(?:am|ac)|prosz(?:e|ę)|przekonuj(?:e|ę|ac)?|negocjuj(?:e|ę|ac)?|targuj(?:e|ę|ac)?|blefuj(?:e|ę|ac)?|klam(?:ie|ię)|kłamię|wyjasni(?:am|ac)?|wyjaśniam|ostrzegam|nakazuj(?:e|ę|ac)?|komplementuj(?:e|ę|ac)?)\b)/iu;

export function isValidCharacteristicKey(value) {
  return CHARACTERISTIC_KEY_SET.has(value);
}

export function normalizeCharacteristicKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return CHARACTERISTIC_ALIASES.get(canonicalizeKey(value)) || null;
}

export function findSkillCharacteristicKey(skillName) {
  if (typeof skillName !== 'string' || !skillName.trim()) return null;
  const normalized = normalizeSkillName(skillName);
  const lookupName = normalized || skillName.trim();
  const baseName = lookupName.replace(/\s*\(.*\)/, '').trim();
  const allSkills = [...SKILLS.basic, ...SKILLS.advanced];
  const found = allSkills.find((skill) => skill.name === baseName || skill.name === lookupName);
  return found ? normalizeCharacteristicKey(found.characteristic) : null;
}

export function inferCharacteristicFromAction(actionText) {
  if (typeof actionText !== 'string' || !actionText.trim()) return null;
  return SOCIAL_ACTION_RE.test(actionText) ? 'fel' : null;
}

export function normalizeSkillName(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const base = value.replace(/\s*\(.*\)/, '').trim();
  const spec = value.match(/\((.+)\)/)?.[1]?.trim();
  const canonBase = SKILL_ALIAS_MAP.get(canonicalizeKey(base));
  if (!canonBase) return null;
  if (spec) {
    const canonSpec = plTranslations.wfrpSpec
      ? Object.entries(plTranslations.wfrpSpec).find(
          ([, plVal]) => canonicalizeKey(plVal) === canonicalizeKey(spec)
        )?.[0] ?? spec
      : spec;
    return `${canonBase} (${canonSpec})`;
  }
  return canonBase;
}

export function inferSkillFromCharacter(characteristicKey, skillAdvances, characterSkills) {
  if (!characteristicKey || !skillAdvances || skillAdvances <= 0 || !characterSkills) return null;
  const candidates = [];
  for (const [skillName, adv] of Object.entries(characterSkills)) {
    if (adv !== skillAdvances) continue;
    const skillChar = findSkillCharacteristicKey(skillName);
    if (skillChar === characteristicKey) candidates.push(skillName);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Given an array of AI-suggested skill names, pick the one that yields the
 * highest effective base target (characteristicValue + skillAdvances).
 * Returns { skill, advances, characteristic } or null.
 */
export function pickBestSkill(suggestedSkills, characterSkills, characteristics) {
  if (!Array.isArray(suggestedSkills) || suggestedSkills.length === 0) return null;

  const charSkills = characterSkills && typeof characterSkills === 'object' ? characterSkills : {};
  const chars = characteristics && typeof characteristics === 'object' ? characteristics : {};

  let best = null;

  for (const raw of suggestedSkills) {
    const normalized = normalizeSkillName(raw);
    if (!normalized) continue;

    const charKey = findSkillCharacteristicKey(normalized);
    if (!charKey) continue;

    const advances = charSkills[normalized] ?? 0;
    const charValue = chars[charKey] ?? 0;
    const effective = charValue + advances;

    if (!best || effective > best.effective) {
      best = { skill: normalized, advances, characteristic: charKey, effective };
    }
  }

  if (!best) return null;
  const { effective: _, ...result } = best;
  return result;
}

export function resolveDiceRollCharacteristic(diceRoll, actionText = '') {
  const explicitCharacteristic = normalizeCharacteristicKey(diceRoll?.characteristic);
  if (explicitCharacteristic) return explicitCharacteristic;

  const skillCharacteristic = findSkillCharacteristicKey(diceRoll?.skill);
  if (skillCharacteristic) return skillCharacteristic;

  return inferCharacteristicFromAction(actionText);
}
