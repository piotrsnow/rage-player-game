import { getWeaponData } from '../data/wfrpCombat';

const CATEGORY_VARIANTS = {
  meleeAttack: [
    '/battle_sfx/attack_sword_a.mp3',
    '/battle_sfx/attack_sword_b.mp3',
    '/battle_sfx/attack_sword_c.mp3',
  ],
  rangedAttack: [
    '/battle_sfx/ranged_attack_bow_a.mp3',
    '/battle_sfx/ranged_attack_bow_b.mp3',
  ],
  defend: [
    '/battle_sfx/defend_a.mp3',
    '/battle_sfx/defend_b.mp3',
  ],
  dodge: [
    '/battle_sfx/dodge_a.mp3',
    '/battle_sfx/dodge_b.mp3',
  ],
  feint: [
    '/battle_sfx/feint_a.mp3',
    '/battle_sfx/feint_b.mp3',
    '/battle_sfx/feint_c.mp3',
  ],
  charge: [
    '/battle_sfx/charge_a.mp3',
    '/battle_sfx/charge_b.mp3',
    '/battle_sfx/charge_c.mp3',
  ],
  flee: [
    '/battle_sfx/flee.mp3',
  ],
  hurt: [
    '/battle_sfx/man_hitted_a.mp3',
    '/battle_sfx/man_hitted_b.mp3',
    '/battle_sfx/man_hitted_c.mp3',
  ],
};

const BATTLE_CRY_LINES = {
  pl: [
    'Za mną, do natarcia!',
    'Niech stal przemówi!',
    'Za Imperium!',
    'Padnijcie przede mną!',
    'Bez litości, naprzód!',
    'Krew i chwała!',
    'Na ziemię z wami!',
    'To wasz koniec!',
    'Pokażę wam prawdziwą walkę!',
    'Naprzód, po zwycięstwo!',
  ],
  en: [
    'Forward, to the charge!',
    'Let steel decide!',
    'For the Empire!',
    'Fall before me!',
    'No mercy, advance!',
    'Blood and glory!',
    'Down with you!',
    'This is your end!',
    'I will show you real battle!',
    'Forward, to victory!',
  ],
};

function normalizeLanguage(language) {
  return language === 'en' ? 'en' : 'pl';
}

function getWeaponFamilyCategory(weaponName) {
  const name = `${weaponName || ''}`.toLowerCase();
  const weapon = getWeaponData(weaponName);
  const group = weapon.group || '';

  if (group === 'Ranged (Blackpowder)' || /pistol|handgun|blackpowder/.test(name)) {
    return 'rangedAttack';
  }
  if (group.startsWith('Ranged') || /bow|crossbow|bolt|arrow/.test(name)) {
    return 'rangedAttack';
  }
  return 'meleeAttack';
}

export function getCombatSfxVariants(category) {
  return CATEGORY_VARIANTS[category] || [];
}

export function getCombatBattleCryLines(language = 'pl') {
  return BATTLE_CRY_LINES[normalizeLanguage(language)];
}

export function getCombatBattleCryLine(language = 'pl', index = 0) {
  const lines = getCombatBattleCryLines(language);
  if (!lines.length) return '';
  return lines[Math.abs(index) % lines.length];
}

export function getCombatResultCategory(result) {
  if (!result?.manoeuvreKey) return null;

  if (result.manoeuvreKey === 'defend') return 'defend';
  if (result.manoeuvreKey === 'dodge') return 'dodge';
  if (result.manoeuvreKey === 'feint') return 'feint';
  if (result.manoeuvreKey === 'charge') return 'charge';
  if (result.manoeuvreKey === 'flee') return 'flee';
  if (result.manoeuvreKey === 'castSpell') return null;

  return getWeaponFamilyCategory(result.weaponName);
}

export function getCombatReactionCategory(result) {
  if (result?.outcome === 'hit' && (result.damage || 0) > 0) {
    return 'hurt';
  }
  return null;
}

function getCombatantPrimaryWeaponName(combatant) {
  const weapons = combatant?.weapons || combatant?.inventory || [];
  return weapons
    .map((weapon) => (typeof weapon === 'string' ? weapon : weapon?.name))
    .find(Boolean) || 'Hand Weapon';
}

export function getCombatPreloadCategories(combat) {
  const categories = new Set(['defend', 'dodge', 'feint', 'charge', 'flee', 'hurt']);

  for (const combatant of combat?.combatants || []) {
    const weaponName = getCombatantPrimaryWeaponName(combatant);
    const category = getWeaponFamilyCategory(weaponName);
    if (category) categories.add(category);
  }

  return Array.from(categories);
}
