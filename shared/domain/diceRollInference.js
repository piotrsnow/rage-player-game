const CHARACTERISTIC_KEYS = ['ws', 'bs', 's', 't', 'i', 'ag', 'dex', 'int', 'wp', 'fel'];
const CHARACTERISTIC_KEY_SET = new Set(CHARACTERISTIC_KEYS);

function canonicalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'L')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

const CHARACTERISTIC_ALIASES = new Map([
  ...CHARACTERISTIC_KEYS.map((key) => [canonicalizeKey(key), key]),
  ['weaponskill', 'ws'],
  ['ballisticskill', 'bs'],
  ['strength', 's'],
  ['sila', 's'],
  ['toughness', 't'],
  ['wytrzymalosc', 't'],
  ['initiative', 'i'],
  ['inicjatywa', 'i'],
  ['agility', 'ag'],
  ['zwinnosc', 'ag'],
  ['dexterity', 'dex'],
  ['manualdexterity', 'dex'],
  ['zrecznosc', 'dex'],
  ['intelligence', 'int'],
  ['inteligencja', 'int'],
  ['willpower', 'wp'],
  ['silawoli', 'wp'],
  ['fellowship', 'fel'],
  ['charisma', 'fel'],
  ['charyzma', 'fel'],
  ['social', 'fel'],
  ['spoleczne', 'fel'],
  ['ww', 'ws'],
  ['us', 'bs'],
  ['wt', 't'],
  ['zw', 'ag'],
  ['zr', 'dex'],
  ['sw', 'wp'],
  ['ogd', 'fel'],
]);

const SKILL_CHARACTERISTIC_BASE = new Map([
  ['art', 'dex'],
  ['athletics', 'ag'],
  ['bribery', 'fel'],
  ['charm', 'fel'],
  ['charmanimal', 'wp'],
  ['climb', 's'],
  ['cool', 'wp'],
  ['consumealcohol', 't'],
  ['dodge', 'ag'],
  ['drive', 'ag'],
  ['endurance', 't'],
  ['entertain', 'fel'],
  ['gamble', 'int'],
  ['gossip', 'fel'],
  ['haggle', 'fel'],
  ['intimidate', 's'],
  ['intuition', 'i'],
  ['leadership', 'fel'],
  ['melee', 'ws'],
  ['navigation', 'i'],
  ['outdoorsurvival', 'int'],
  ['perception', 'i'],
  ['ride', 'ag'],
  ['row', 's'],
  ['stealth', 'ag'],
  ['animalcare', 'int'],
  ['animaltraining', 'int'],
  ['channelling', 'wp'],
  ['evaluate', 'int'],
  ['heal', 'int'],
  ['language', 'int'],
  ['lore', 'int'],
  ['perform', 'ag'],
  ['picklock', 'dex'],
  ['play', 'dex'],
  ['pray', 'fel'],
  ['ranged', 'bs'],
  ['research', 'int'],
  ['sail', 'ag'],
  ['secretsigns', 'int'],
  ['settrap', 'dex'],
  ['sleightofhand', 'dex'],
  ['swim', 's'],
  ['track', 'i'],
  ['trade', 'dex'],
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
  return SKILL_CHARACTERISTIC_BASE.get(canonicalizeKey(baseName)) || null;
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
