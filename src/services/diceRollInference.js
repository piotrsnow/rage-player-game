import { ATTRIBUTE_KEYS, ATTRIBUTE_NAMES, SKILLS, getSkillAttribute } from '../data/rpgSystem.js';

const ATTRIBUTE_KEY_SET = new Set(ATTRIBUTE_KEYS);

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'L');
}

function canonicalizeKey(value) {
  return stripDiacritics(
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
  );
}

// Build skill alias map
const SKILL_ALIAS_MAP = new Map();
for (const skill of SKILLS) {
  SKILL_ALIAS_MAP.set(canonicalizeKey(skill.name), skill.name);
}

// Legacy skill names from the old 60-skill list → new consolidated 31-skill names
const LEGACY_SKILL_ALIASES = new Map([
  ['bijatyka', 'Walka wrecz'],
  ['mocowanie', 'Walka wrecz'],
  ['celnosc', 'Strzelectwo'],
  ['rzucanie', 'Strzelectwo'],
  ['refleks', 'Uniki'],
  ['wspinaczka', 'Atletyka'],
  ['plywanie', 'Atletyka'],
  ['dzwiganie', 'Atletyka'],
  ['skradaniesie', 'Skradanie'],
  ['targowanie', 'Handel'],
  ['ocenianiewartosci', 'Handel'],
  ['plotkowanie', 'Wystepy'],
  ['dowodzenie', 'Przywodztwo'],
  ['uwodzenie', 'Blef'],
  ['etykieta', 'Wystepy'],
  ['negocjacje', 'Perswazja'],
  ['przekonywanietlumu', 'Perswazja'],
  ['sledztwo', 'Spostrzegawczosc'],
  ['wydobywanieinformacji', 'Spostrzegawczosc'],
  ['strategia', 'Wiedza ogolna'],
  ['taktyka', 'Wiedza ogolna'],
  ['czytanieipisanie', 'Wiedza ogolna'],
  ['wiedzaoreligiachiwierzeniach', 'Wiedza ogolna'],
  ['odpornoscnabol', 'Odpornosc'],
  ['odpornoscnatrucizny', 'Odpornosc'],
  ['wytrwalosc', 'Przetrwanie'],
  ['marszdlugodystansowy', 'Przetrwanie'],
  ['odpornoscnaglodipragnienie', 'Przetrwanie'],
  ['hartducha', 'Odpornosc'],
  ['uniklosu', 'Przeczucie'],
  ['szukanieokazji', 'Przeczucie'],
  ['wyczucmoment', 'Przeczucie'],
  ['zonglerkaistuczki', 'Akrobatyka'],
].map(([oldKey, newName]) => [canonicalizeKey(oldKey), newName]));

// Attribute aliases (PL + EN)
const ATTRIBUTE_ALIASES = new Map([
  ...ATTRIBUTE_KEYS.map((key) => [canonicalizeKey(key), key]),
  ...Object.entries(ATTRIBUTE_NAMES).map(([key, label]) => [canonicalizeKey(label), key]),
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
  ['luck', 'szczescie'],
  // Polish abbreviations
  ['sil', 'sila'],
  ['zrc', 'zrecznosc'],
  ['wyt', 'wytrzymalosc'],
  ['szc', 'szczescie'],
  // Common misspellings / social
  ['social', 'charyzma'],
  ['fellowship', 'charyzma'],
  ['perception', 'inteligencja'],
]);

const SOCIAL_ACTION_RE = /["""„«»]|(?:\b(?:say|tell|ask|speak|talk|persuade|convince|negotiate|bargain|haggle|bluff|lie|charm|flirt|command|order)\b)|(?:\b(?:mow(?:ie|ic)?|mówię|powiedz|pytam|rozmawiam|przekonuj|negocjuj|targuj|blefuj|kłam)\b)/iu;

export function isValidAttributeKey(value) {
  return ATTRIBUTE_KEY_SET.has(value);
}

export function normalizeAttributeKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return ATTRIBUTE_ALIASES.get(canonicalizeKey(value)) || null;
}

export function findSkillAttributeKey(skillName) {
  if (typeof skillName !== 'string' || !skillName.trim()) return null;
  const normalized = normalizeSkillName(skillName);
  const lookupName = normalized || skillName.trim();
  return getSkillAttribute(lookupName);
}

export function inferAttributeFromAction(actionText) {
  if (typeof actionText !== 'string' || !actionText.trim()) return null;
  return SOCIAL_ACTION_RE.test(actionText) ? 'charyzma' : null;
}

export function normalizeSkillName(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const key = canonicalizeKey(value);
  const canon = SKILL_ALIAS_MAP.get(key);
  if (canon) return canon;
  // Fallback: check legacy skill names from the old 60-skill system
  return LEGACY_SKILL_ALIASES.get(key) || null;
}

/**
 * Given suggested skill names, pick the one with the highest level.
 * Returns { skill, level, attribute } or null.
 */
export function pickBestSkill(suggestedSkills, characterSkills) {
  if (!Array.isArray(suggestedSkills) || suggestedSkills.length === 0) return null;

  const charSkills = characterSkills && typeof characterSkills === 'object' ? characterSkills : {};
  let best = null;

  for (const raw of suggestedSkills) {
    const normalized = normalizeSkillName(raw);
    if (!normalized) continue;

    const attrKey = findSkillAttributeKey(normalized);
    if (!attrKey) continue;

    const entry = charSkills[normalized];
    const level = typeof entry === 'object' ? (entry?.level || 0) : (entry || 0);

    if (!best || level > best.level) {
      best = { skill: normalized, level, attribute: attrKey };
    }
  }

  return best;
}

export function resolveDiceRollAttribute(diceRoll, actionText = '') {
  const explicit = normalizeAttributeKey(diceRoll?.attribute);
  if (explicit) return explicit;

  const fromSkill = findSkillAttributeKey(diceRoll?.skill);
  if (fromSkill) return fromSkill;

  return inferAttributeFromAction(actionText);
}
