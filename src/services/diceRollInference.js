import { CHARACTERISTIC_KEYS, CHARACTERISTIC_NAMES, SKILLS } from '../data/wfrp.js';

const CHARACTERISTIC_KEY_SET = new Set(CHARACTERISTIC_KEYS);

function canonicalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
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
  ['zrecznosc', 'ag'],
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
  const baseName = skillName.replace(/\s*\(.*\)/, '').trim();
  const allSkills = [...SKILLS.basic, ...SKILLS.advanced];
  const found = allSkills.find((skill) => skill.name === baseName || skill.name === skillName.trim());
  return found ? normalizeCharacteristicKey(found.characteristic) : null;
}

export function inferCharacteristicFromAction(actionText) {
  if (typeof actionText !== 'string' || !actionText.trim()) return null;
  return SOCIAL_ACTION_RE.test(actionText) ? 'fel' : null;
}

export function resolveDiceRollCharacteristic(diceRoll, actionText = '') {
  const explicitCharacteristic = normalizeCharacteristicKey(diceRoll?.characteristic);
  if (explicitCharacteristic) return explicitCharacteristic;

  const skillCharacteristic = findSkillCharacteristicKey(diceRoll?.skill);
  if (skillCharacteristic) return skillCharacteristic;

  return inferCharacteristicFromAction(actionText);
}
