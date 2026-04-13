/**
 * Translates RPGon skill/attribute names using i18next.
 * The new system uses Polish names natively, so translations are mainly for EN display.
 * Falls back to the original name when no translation exists.
 */

export function translateSkill(name, t) {
  if (!name) return name ?? '';
  return t(`rpgSkills.${name}`, { defaultValue: name });
}

export function translateAttribute(key, t) {
  if (!key) return key ?? '';
  return t(`rpgAttributes.${key}`, { defaultValue: key });
}

export function translateFaction(name, t) {
  if (!name) return name ?? '';
  return t(`rpgFactions.${name}`, { defaultValue: name });
}
