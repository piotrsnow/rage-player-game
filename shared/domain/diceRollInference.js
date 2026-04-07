// RPGon — Dice Roll Inference (shared between frontend and backend)
// Resolves attribute from dice roll data, skill name, or action text.

const ATTRIBUTE_KEYS = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie'];
const ATTRIBUTE_KEY_SET = new Set(ATTRIBUTE_KEYS);

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

const ATTRIBUTE_ALIASES = new Map([
  ...ATTRIBUTE_KEYS.map((key) => [canonicalizeKey(key), key]),
  // English aliases
  ['strength', 'sila'],
  ['str', 'sila'],
  ['intelligence', 'inteligencja'],
  ['int', 'inteligencja'],
  ['charisma', 'charyzma'],
  ['cha', 'charyzma'],
  ['dexterity', 'zrecznosc'],
  ['dex', 'zrecznosc'],
  ['agility', 'zrecznosc'],
  ['endurance', 'wytrzymalosc'],
  ['toughness', 'wytrzymalosc'],
  ['con', 'wytrzymalosc'],
  ['constitution', 'wytrzymalosc'],
  ['luck', 'szczescie'],
  // Polish short forms
  ['sil', 'sila'],
  ['zrc', 'zrecznosc'],
  ['wyt', 'wytrzymalosc'],
  ['szc', 'szczescie'],
  // Social aliases
  ['social', 'charyzma'],
  ['spoleczne', 'charyzma'],
  ['fellowship', 'charyzma'],
  ['fel', 'charyzma'],
  // Legacy WFRP aliases (backward compat for AI responses during transition)
  ['ws', 'sila'],
  ['s', 'sila'],
  ['bs', 'zrecznosc'],
  ['ag', 'zrecznosc'],
  ['t', 'wytrzymalosc'],
  ['wp', 'wytrzymalosc'],
  ['i', 'inteligencja'],
]);

// RPGon skill → parent attribute mapping
const SKILL_ATTRIBUTE_BASE = new Map([
  // Sila
  ['atletyka', 'sila'],
  ['bijatyka', 'sila'],
  ['walkabronijednorecna', 'sila'],
  ['walkabroniajdednorecna', 'sila'],
  ['walkabronia jednorecna', 'sila'],
  ['walkabronia jednoręczna', 'sila'],
  ['walkabroniadvurecna', 'sila'],
  ['walkabronia dwureczna', 'sila'],
  ['walkabroniadwurecna', 'sila'],
  ['zastraszanie', 'sila'],
  ['mocowanie', 'sila'],
  ['wspinaczka', 'sila'],
  ['dzwiganie', 'sila'],
  ['melee', 'sila'],
  ['intimidate', 'sila'],
  ['climb', 'sila'],
  ['athletics', 'sila'],
  // Inteligencja
  ['alchemia', 'inteligencja'],
  ['medycyna', 'inteligencja'],
  ['rzemioslo', 'inteligencja'],
  ['wiedzaogolna', 'inteligencja'],
  ['wiedzaopotworach', 'inteligencja'],
  ['wiedzaonaturze', 'inteligencja'],
  ['wiedzaoreligiachiwierzeniach', 'inteligencja'],
  ['strategia', 'inteligencja'],
  ['taktyka', 'inteligencja'],
  ['tropienie', 'inteligencja'],
  ['spostrzegawczosc', 'inteligencja'],
  ['sledztwo', 'inteligencja'],
  ['wydobywanieinformacji', 'inteligencja'],
  ['ocenianiewartosci', 'inteligencja'],
  ['czytanieipisanie', 'inteligencja'],
  ['heal', 'inteligencja'],
  ['lore', 'inteligencja'],
  ['research', 'inteligencja'],
  ['perception', 'inteligencja'],
  ['track', 'inteligencja'],
  ['evaluate', 'inteligencja'],
  // Charyzma
  ['perswazja', 'charyzma'],
  ['blef', 'charyzma'],
  ['plotkowanie', 'charyzma'],
  ['targowanie', 'charyzma'],
  ['dowodzenie', 'charyzma'],
  ['uwodzenie', 'charyzma'],
  ['wystepy', 'charyzma'],
  ['etykieta', 'charyzma'],
  ['przekonywanietlumu', 'charyzma'],
  ['negocjacje', 'charyzma'],
  ['charm', 'charyzma'],
  ['persuade', 'charyzma'],
  ['haggle', 'charyzma'],
  ['gossip', 'charyzma'],
  ['leadership', 'charyzma'],
  ['entertain', 'charyzma'],
  ['bribery', 'charyzma'],
  // Zrecznosc
  ['akrobatyka', 'zrecznosc'],
  ['jezdziectwo', 'zrecznosc'],
  ['skradaniesie', 'zrecznosc'],
  ['otwieranie zamkow', 'zrecznosc'],
  ['otwieraniezamkow', 'zrecznosc'],
  ['kradziez kieszonkowa', 'zrecznosc'],
  ['kradziez kieszonkowa', 'zrecznosc'],
  ['kradiezkieszonkowa', 'zrecznosc'],
  ['uniki', 'zrecznosc'],
  ['refleks', 'zrecznosc'],
  ['celnosc', 'zrecznosc'],
  ['rzucanie', 'zrecznosc'],
  ['pulapkiimechanizmy', 'zrecznosc'],
  ['zonglerkaisztuczki', 'zrecznosc'],
  ['dodge', 'zrecznosc'],
  ['stealth', 'zrecznosc'],
  ['picklock', 'zrecznosc'],
  ['sleightofhand', 'zrecznosc'],
  ['ranged', 'zrecznosc'],
  ['ride', 'zrecznosc'],
  ['acrobatics', 'zrecznosc'],
  // Wytrzymalosc
  ['odpornoscnabol', 'wytrzymalosc'],
  ['odpornoscnatrucizy', 'wytrzymalosc'],
  ['wytrwalosc', 'wytrzymalosc'],
  ['plywanie', 'wytrzymalosc'],
  ['przetrwanie', 'wytrzymalosc'],
  ['marszdlugodystansowy', 'wytrzymalosc'],
  ['odpornoscnaglodipragnienie', 'wytrzymalosc'],
  ['hartducha', 'wytrzymalosc'],
  ['endurance', 'wytrzymalosc'],
  ['swim', 'wytrzymalosc'],
  ['cool', 'wytrzymalosc'],
  // Szczescie
  ['fart', 'szczescie'],
  ['przeczucie', 'szczescie'],
  ['uniklosu', 'szczescie'],
  ['hazard', 'szczescie'],
  ['szukanieokazji', 'szczescie'],
  ['wyczucmoment', 'szczescie'],
  ['gamble', 'szczescie'],
]);

const SOCIAL_ACTION_RE = /["""„«»]|(?:\b(?:say|tell|ask|speak|talk|chat|greet|persuade|convince|negotiate|bargain|haggle|bluff|lie|question|request|plead|flirt|joke|taunt|boast|promise|explain|encourage|warn|command|order)\b)|(?:\b(?:mow(?:ie|ic)?|mówię|mówić|powiedz|powiem|powiadam|zapyt(?:am|ac)?|zapytuję|pytam|rozmawiam|zagaduj(?:e|ę|ac)?|gad(?:am|ac)|prosz(?:e|ę)|przekonuj(?:e|ę|ac)?|negocjuj(?:e|ę|ac)?|targuj(?:e|ę|ac)?|blefuj(?:e|ę|ac)?|klam(?:ie|ię)|kłamię|wyjasni(?:am|ac)?|wyjaśniam|ostrzegam|nakazuj(?:e|ę|ac)?|komplementuj(?:e|ę|ac)?)\b)/iu;

export function isValidAttributeKey(value) {
  return ATTRIBUTE_KEY_SET.has(value);
}

export function normalizeAttributeKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return ATTRIBUTE_ALIASES.get(canonicalizeKey(value)) || null;
}

export function findSkillAttributeKey(skillName) {
  if (typeof skillName !== 'string' || !skillName.trim()) return null;
  const baseName = skillName.replace(/\s*\(.*\)/, '').trim();
  return SKILL_ATTRIBUTE_BASE.get(canonicalizeKey(baseName)) || null;
}

export function inferAttributeFromAction(actionText) {
  if (typeof actionText !== 'string' || !actionText.trim()) return null;
  return SOCIAL_ACTION_RE.test(actionText) ? 'charyzma' : null;
}

export function resolveDiceRollAttribute(diceRoll, actionText = '') {
  const explicitAttribute = normalizeAttributeKey(diceRoll?.attribute || diceRoll?.characteristic);
  if (explicitAttribute) return explicitAttribute;

  const skillAttribute = findSkillAttributeKey(diceRoll?.skill);
  if (skillAttribute) return skillAttribute;

  return inferAttributeFromAction(actionText);
}

// Legacy compat aliases (for code that still uses old names)
export const resolveDiceRollCharacteristic = resolveDiceRollAttribute;
export const isValidCharacteristicKey = isValidAttributeKey;
export const normalizeCharacteristicKey = normalizeAttributeKey;
export const findSkillCharacteristicKey = findSkillAttributeKey;
export const inferCharacteristicFromAction = inferAttributeFromAction;
