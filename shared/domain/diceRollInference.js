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

// RPGon skill → parent attribute mapping (31 canonical skills + backward-compat aliases)
const SKILL_ATTRIBUTE_BASE = new Map([
  // === Sila (5 skills) ===
  ['walkawrecz', 'sila'],
  ['walkabroniajdednorecna', 'sila'],
  ['walkabronijednorecna', 'sila'],
  ['walkabroniadwurecna', 'sila'],
  ['zastraszanie', 'sila'],
  ['atletyka', 'sila'],
  // Diacritical variants
  ['walkabroniąjednoręczną', 'sila'],
  ['walkabroniądwuręczną', 'sila'],
  ['walkawręcz', 'sila'],
  // English aliases
  ['melee', 'sila'],
  ['unarmedcombat', 'sila'],
  ['onehandedweapon', 'sila'],
  ['twohandedweapon', 'sila'],
  ['intimidate', 'sila'],
  ['athletics', 'sila'],
  ['climb', 'sila'],
  // Backward-compat: old skills → new canonical skills
  ['bijatyka', 'sila'],           // → Walka wrecz
  ['mocowanie', 'sila'],          // → Walka wrecz
  ['wspinaczka', 'sila'],         // → Atletyka
  ['dzwiganie', 'sila'],          // → Atletyka
  ['plywanie', 'sila'],           // → Atletyka (was wytrzymalosc, now merged into Atletyka/sila)
  ['pływanie', 'sila'],           // diacritical variant of plywanie

  // === Zrecznosc (8 skills) ===
  ['strzelectwo', 'zrecznosc'],
  ['uniki', 'zrecznosc'],
  ['akrobatyka', 'zrecznosc'],
  ['jezdziectwo', 'zrecznosc'],
  ['jeździectwo', 'zrecznosc'],
  ['skradanie', 'zrecznosc'],
  ['otwieraniezamkow', 'zrecznosc'],
  ['otwieranie zamkow', 'zrecznosc'],
  ['otwieraniezamków', 'zrecznosc'],
  ['kradiezkieszonkowa', 'zrecznosc'],
  ['kradziez kieszonkowa', 'zrecznosc'],
  ['kradzieżkieszonkowa', 'zrecznosc'],
  ['pulapkiimechanizmy', 'zrecznosc'],
  ['pułapkiimechanizmy', 'zrecznosc'],
  // English aliases
  ['ranged', 'zrecznosc'],
  ['shooting', 'zrecznosc'],
  ['dodge', 'zrecznosc'],
  ['acrobatics', 'zrecznosc'],
  ['ride', 'zrecznosc'],
  ['stealth', 'zrecznosc'],
  ['picklock', 'zrecznosc'],
  ['sleightofhand', 'zrecznosc'],
  ['traps', 'zrecznosc'],
  // Backward-compat: old skills → new canonical skills
  ['celnosc', 'zrecznosc'],       // → Strzelectwo
  ['celność', 'zrecznosc'],
  ['rzucanie', 'zrecznosc'],      // → Strzelectwo
  ['refleks', 'zrecznosc'],       // → Uniki
  ['skradaniesie', 'zrecznosc'],  // → Skradanie
  ['skradaniesię', 'zrecznosc'],
  ['zonglerkaisztuczki', 'zrecznosc'], // → Akrobatyka (removed skill, closest match)
  ['żonglerkaisztuczki', 'zrecznosc'],

  // === Charyzma (5 skills) ===
  ['perswazja', 'charyzma'],
  ['blef', 'charyzma'],
  ['handel', 'charyzma'],
  ['przywodztwo', 'charyzma'],
  ['przywództwo', 'charyzma'],
  ['wystepy', 'charyzma'],
  ['występy', 'charyzma'],
  // English aliases
  ['persuade', 'charyzma'],
  ['persuasion', 'charyzma'],
  ['charm', 'charyzma'],
  ['bluff', 'charyzma'],
  ['trade', 'charyzma'],
  ['haggle', 'charyzma'],
  ['leadership', 'charyzma'],
  ['entertain', 'charyzma'],
  ['perform', 'charyzma'],
  ['bribery', 'charyzma'],
  // Backward-compat: old skills → new canonical skills
  ['targowanie', 'charyzma'],     // → Handel
  ['ocenianiewartosci', 'charyzma'], // → Handel
  ['ocenianiewartości', 'charyzma'],
  ['plotkowanie', 'charyzma'],    // → Wystepy
  ['etykieta', 'charyzma'],      // → Wystepy
  ['dowodzenie', 'charyzma'],    // → Przywodztwo
  ['uwodzenie', 'charyzma'],     // → Blef
  ['negocjacje', 'charyzma'],    // → Perswazja
  ['przekonywanietlumu', 'charyzma'], // → Perswazja
  ['przekonywanietłumu', 'charyzma'],
  ['gossip', 'charyzma'],

  // === Inteligencja (8 skills) ===
  ['wiedzaogolna', 'inteligencja'],
  ['wiedzaogólna', 'inteligencja'],
  ['wiedzaopotworach', 'inteligencja'],
  ['wiedzaonaturze', 'inteligencja'],
  ['medycyna', 'inteligencja'],
  ['alchemia', 'inteligencja'],
  ['rzemioslo', 'inteligencja'],
  ['rzemiosło', 'inteligencja'],
  ['spostrzegawczosc', 'inteligencja'],
  ['spostrzegawczość', 'inteligencja'],
  ['tropienie', 'inteligencja'],
  // English aliases
  ['lore', 'inteligencja'],
  ['generalknowledge', 'inteligencja'],
  ['monsterknowledge', 'inteligencja'],
  ['natureknowledge', 'inteligencja'],
  ['heal', 'inteligencja'],
  ['medicine', 'inteligencja'],
  ['alchemy', 'inteligencja'],
  ['craft', 'inteligencja'],
  ['perception', 'inteligencja'],
  ['track', 'inteligencja'],
  ['research', 'inteligencja'],
  ['evaluate', 'inteligencja'],
  // Backward-compat: old skills → new canonical skills
  ['sledztwo', 'inteligencja'],           // → Spostrzegawczosc
  ['śledztwo', 'inteligencja'],
  ['wydobywanieinformacji', 'inteligencja'], // → Spostrzegawczosc
  ['strategia', 'inteligencja'],          // → Wiedza ogolna
  ['taktyka', 'inteligencja'],            // → Wiedza ogolna
  ['czytanieipisanie', 'inteligencja'],   // → Wiedza ogolna
  ['wiedzaoreligiachiwierzeniach', 'inteligencja'], // → Wiedza ogolna

  // === Wytrzymalosc (2 skills) ===
  ['przetrwanie', 'wytrzymalosc'],
  ['odpornosc', 'wytrzymalosc'],
  ['odporność', 'wytrzymalosc'],
  // English aliases
  ['survival', 'wytrzymalosc'],
  ['endurance', 'wytrzymalosc'],
  ['resilience', 'wytrzymalosc'],
  ['cool', 'wytrzymalosc'],
  ['swim', 'wytrzymalosc'],
  // Backward-compat: old skills → new canonical skills
  ['odpornoscnabol', 'wytrzymalosc'],             // → Odpornosc
  ['odpornośćnaból', 'wytrzymalosc'],
  ['odpornoscnatrucizy', 'wytrzymalosc'],         // → Odpornosc
  ['odpornośćnatrucizy', 'wytrzymalosc'],
  ['wytrwalosc', 'wytrzymalosc'],                 // → Przetrwanie
  ['wytrwałość', 'wytrzymalosc'],
  ['marszdlugodystansowy', 'wytrzymalosc'],       // → Przetrwanie
  ['marszdługodystansowy', 'wytrzymalosc'],
  ['odpornoscnaglodipragnienie', 'wytrzymalosc'], // → Przetrwanie
  ['odpornośćnagłódipragnienie', 'wytrzymalosc'],
  ['hartducha', 'wytrzymalosc'],                  // → Odpornosc (removed skill, closest match)

  // === Szczescie (3 skills) ===
  ['fart', 'szczescie'],
  ['hazard', 'szczescie'],
  ['przeczucie', 'szczescie'],
  // English aliases
  ['gamble', 'szczescie'],
  ['intuition', 'szczescie'],
  ['hunch', 'szczescie'],
  // Backward-compat: old skills → new canonical skills
  ['uniklosu', 'szczescie'],         // → Przeczucie
  ['szukanieokazji', 'szczescie'],   // → Przeczucie
  ['wyczucmoment', 'szczescie'],     // → Przeczucie
  ['wyczućmoment', 'szczescie'],
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
