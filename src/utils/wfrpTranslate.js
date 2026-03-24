/**
 * Translates WFRP skill/talent names using i18next.
 * Handles grouped names like "Melee (Basic)" → "Walka Wręcz (Podstawowa)".
 * Falls back to the original English name when no translation exists.
 */

const PAREN_RE = /^(.+?)\s*\((.+)\)$/;

export function translateSkill(name, t) {
  if (!name) return name ?? '';
  const match = name.match(PAREN_RE);
  if (match) {
    const base = t(`wfrpSkills.${match[1]}`, { defaultValue: match[1] });
    const spec = t(`wfrpSpec.${match[2]}`, { defaultValue: match[2] });
    return `${base} (${spec})`;
  }
  return t(`wfrpSkills.${name}`, { defaultValue: name });
}

export function translateTalent(name, t) {
  if (!name) return name ?? '';
  const match = name.match(PAREN_RE);
  if (match) {
    const base = t(`wfrpTalents.${match[1]}`, { defaultValue: match[1] });
    const spec = t(`wfrpSpec.${match[2]}`, { defaultValue: match[2] });
    return `${base} (${spec})`;
  }
  return t(`wfrpTalents.${name}`, { defaultValue: name });
}

export function translateCareer(name, t) {
  if (!name) return name ?? '';
  return t(`careers.${name}`, { defaultValue: name });
}

export function translateTierName(name, t) {
  if (!name) return name ?? '';
  return t(`tierNames.${name}`, { defaultValue: name });
}

export function translateStatus(status, t) {
  const match = status?.match(/^(\w+)\s+(.+)$/);
  if (match) {
    return `${t(`statusTier.${match[1]}`, { defaultValue: match[1] })} ${match[2]}`;
  }
  return status;
}
