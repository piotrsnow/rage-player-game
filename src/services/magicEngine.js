import {
  WINDS_OF_MAGIC,
  SPELLS,
  PETTY_SPELLS,
  MISCAST_TABLE,
  CHANNELLING_MODIFIERS,
} from '../data/wfrpMagic';
import { rollD100, calculateSL, getBonus } from './gameState';

const LANGUAGE_MAGICK = 'Language (Magick)';
const CHAN_BASE = 'Channelling';

function normalizeSpellName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function normalizeLoreKey(lore) {
  const k = String(lore || '')
    .trim()
    .toLowerCase();
  if (WINDS_OF_MAGIC[k]) return k;
  const found = Object.keys(WINDS_OF_MAGIC).find(
    (w) => WINDS_OF_MAGIC[w].name.toLowerCase() === k,
  );
  return found || k;
}

function findSpellByName(spellName) {
  const key = normalizeSpellName(spellName);
  return (
    SPELLS.find((s) => normalizeSpellName(s.name) === key) ||
    PETTY_SPELLS.find((s) => normalizeSpellName(s.name) === key) ||
    null
  );
}

function sumModifiers(modifiers) {
  if (!modifiers?.length) return 0;
  let sum = 0;
  for (const m of modifiers) {
    if (typeof m === 'number' && !Number.isNaN(m)) {
      sum += m;
      continue;
    }
    const entry = CHANNELLING_MODIFIERS[m];
    if (entry?.modifier != null) sum += entry.modifier;
  }
  return sum;
}

function wfrpRollSuccess(roll, target) {
  return roll <= 4 || (roll <= target && roll < 96);
}

function isMiscastDoubles(roll) {
  if (roll < 11 || roll > 99) return false;
  return roll % 11 === 0;
}

function getWp(character) {
  return character?.characteristics?.wp ?? 30;
}

function getSkillAdvances(character, skillKey) {
  const v = character?.skills?.[skillKey];
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  return 0;
}

function channellingSkillKeyForLore(loreKey) {
  if (loreKey === 'petty' || !WINDS_OF_MAGIC[loreKey]) return CHAN_BASE;
  const windName = WINDS_OF_MAGIC[loreKey].name;
  return `${CHAN_BASE} (${windName})`;
}

function getChannellingTarget(character, loreKey) {
  const wp = getWp(character);
  const specific = channellingSkillKeyForLore(loreKey);
  let advances = getSkillAdvances(character, specific);
  if (advances === 0 && specific !== CHAN_BASE) {
    advances = getSkillAdvances(character, CHAN_BASE);
  }
  return wp + advances;
}

function getCastingTarget(character) {
  return getWp(character) + getSkillAdvances(character, LANGUAGE_MAGICK);
}

const ALL_LORE_KEYS = () => Object.keys(WINDS_OF_MAGIC);

function parseArcaneMagicTalent(talent) {
  const m = String(talent).match(/Arcane Magic\s*\(([^)]+)\)/i);
  return m ? m[1].trim() : null;
}

function loresFromArcaneSuffix(suffix) {
  const s = suffix.trim().toLowerCase();
  if (s === 'any') return ALL_LORE_KEYS();
  const keys = ALL_LORE_KEYS();
  for (const key of keys) {
    const w = WINDS_OF_MAGIC[key];
    if (key === s) return [key];
    if (w.name.toLowerCase() === s) return [key];
    const shortTitle = w.title.replace(/^lore of\s+/i, '').trim().toLowerCase();
    if (shortTitle === s || w.title.toLowerCase().includes(s)) return [key];
  }
  if (s === 'witchcraft') return ['ulgu', 'ghyran', 'shyish'];
  return [];
}

function loresFromChannellingSkillKey(skillKey) {
  const m = String(skillKey).match(/^Channelling\s*\(([^)]+)\)\s*$/i);
  if (!m) return [];
  return loresFromArcaneSuffix(m[1]);
}

function characterLoreAccess(character) {
  const lores = new Set();
  const skills = character?.skills || {};
  let hasBareChannelling = false;

  for (const key of Object.keys(skills)) {
    if (key === CHAN_BASE) {
      hasBareChannelling = true;
      continue;
    }
    if (key.startsWith('Channelling')) {
      for (const lk of loresFromChannellingSkillKey(key)) lores.add(lk);
    }
  }

  if (hasBareChannelling) {
    for (const k of ALL_LORE_KEYS()) lores.add(k);
  }

  for (const t of character?.talents || []) {
    const suf = parseArcaneMagicTalent(t);
    if (suf) {
      for (const lk of loresFromArcaneSuffix(suf)) lores.add(lk);
    }
  }

  return lores;
}

function hasMagicGate(character) {
  const skills = character?.skills || {};
  const hasChan = Object.keys(skills).some((k) => k === CHAN_BASE || k.startsWith('Channelling'));
  const hasArcane = (character?.talents || []).some((t) => String(t).includes('Arcane Magic'));
  return hasChan || hasArcane;
}

function hasPettyMagicTalent(character) {
  return (character?.talents || []).some((t) => String(t).includes('Petty Magic'));
}

/**
 * Channelling test: Willpower + Channelling (lore). On success, windPoints = SL for the next cast.
 */
export function performChannellingTest(character, lore, modifiers = []) {
  const loreKey = normalizeLoreKey(lore);
  const target = getChannellingTarget(character, loreKey) + sumModifiers(modifiers);
  const roll = rollD100();
  const sl = calculateSL(roll, target);
  const success = wfrpRollSuccess(roll, target);
  const windPoints = success ? sl : 0;

  return { success, roll, target, sl, windPoints };
}

/**
 * Casting test: Willpower + Language (Magick). totalSL = casting SL + stored channelling SL vs spell CN.
 * Miscast on double-digit doubles (11, 22, …, 99).
 */
export function performCastingTest(character, spell, storedWindPoints = 0, modifiers = []) {
  const cn = spell?.cn ?? 0;
  const target = getCastingTarget(character) + sumModifiers(modifiers);
  const roll = rollD100();
  const sl = calculateSL(roll, target);
  const rollOk = wfrpRollSuccess(roll, target);
  const totalSL = sl + (Number(storedWindPoints) || 0);
  const success = rollOk && totalSL >= cn;

  const miscast = isMiscastDoubles(roll);
  const miscastResult = miscast ? resolveMiscast(rollD100()) : null;

  const overcasts = success ? calculateOvercast(totalSL, cn, getWp(character)).overcasts : 0;

  return {
    success,
    roll,
    target,
    sl,
    totalSL,
    spellCn: cn,
    overcasts,
    miscast,
    miscastResult,
  };
}

/**
 * Resolve a miscast from a d100 roll against MISCAST_TABLE.
 */
export function resolveMiscast(roll) {
  let r = Number(roll);
  if (!Number.isFinite(r) || r < 1 || r > 100) r = rollD100();
  r = Math.min(100, Math.max(1, Math.floor(r)));
  const row = MISCAST_TABLE.find(
    (entry) => r >= entry.range[0] && r <= entry.range[1],
  );
  if (!row) {
    return {
      id: 'unknown',
      severity: 'unknown',
      description: 'No miscast entry matched.',
      mechanicalEffect: 'GM adjudicates.',
    };
  }
  return {
    id: `r${row.range[0]}`,
    severity: row.severity,
    description: row.description,
    mechanicalEffect: row.mechanicalEffect,
  };
}

/**
 * True if the character may attempt this spell (Language (Magick) + channelling access for lore).
 */
export function canCastSpell(character, spellName) {
  const spell = typeof spellName === 'object' && spellName?.name
    ? spellName
    : findSpellByName(spellName);
  if (!spell) return false;

  if (!(LANGUAGE_MAGICK in (character?.skills || {}))) return false;

  const lore = spell.lore === 'petty' ? 'petty' : normalizeLoreKey(spell.lore);

  if (lore === 'petty') {
    const hasChan = Object.keys(character?.skills || {}).some(
      (k) => k === CHAN_BASE || k.startsWith('Channelling'),
    );
    return hasPettyMagicTalent(character) || hasChan;
  }

  if (!WINDS_OF_MAGIC[lore]) return false;

  const access = characterLoreAccess(character);
  if (access.size === 0) return false;
  return access.has(lore);
}

/**
 * Spells the character may attempt: petty (if eligible) plus arcane spells for known lores.
 */
export function getAvailableSpells(character) {
  if (!hasMagicGate(character)) return [];

  const access = characterLoreAccess(character);
  const out = [];

  const canPetty =
    hasPettyMagicTalent(character) ||
    Object.keys(character?.skills || {}).some((k) => k === CHAN_BASE || k.startsWith('Channelling'));

  if (canPetty) {
    out.push(...PETTY_SPELLS);
  }

  if (access.size === 0) {
    return out;
  }

  for (const s of SPELLS) {
    if (access.has(s.lore)) out.push(s);
  }

  const seen = new Set();
  return out.filter((s) => {
    const k = normalizeSpellName(s.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Overcasts: each full SL above CN can be spent on damage, range, or duration (typical WFRP choice).
 * @param {number} willpowerValue - optional WP; when set, range hint uses getBonus(WP).
 */
export function calculateOvercast(sl, cn, willpowerValue) {
  const cap = Number(cn);
  const total = Number(sl);
  const overcasts = Number.isNaN(cap) || Number.isNaN(total)
    ? 0
    : Math.max(0, Math.floor(total - cap));

  const wpb = willpowerValue != null && Number.isFinite(Number(willpowerValue))
    ? getBonus(Number(willpowerValue))
    : null;

  return {
    overcasts,
    effects: {
      magnitude: overcasts,
      ...(wpb != null ? { willpowerBonus: wpb } : {}),
    },
  };
}

/**
 * Compact narration block for LLM / GM prompts.
 */
export function formatCastingResultForPrompt(result) {
  if (!result) return 'Casting: no result.';

  const lines = [
    `Casting test: d100 ${result.roll} vs target ${result.target} (casting SL ${result.sl}).`,
    `Total SL (with stored Wind): ${result.totalSL}; spell CN ${result.spellCn}.`,
    result.success ? 'Outcome: spell succeeds.' : 'Outcome: spell fails or lacks enough SL.',
  ];

  if (result.overcasts > 0) {
    const oc = calculateOvercast(result.totalSL, result.spellCn);
    const wpb = oc.effects.willpowerBonus;
    const ocSummary = wpb != null
      ? `${result.overcasts} overcast(s): each pick +1 Damage, +${wpb} yards range (WPB), or +1 duration step (GM).`
      : `${result.overcasts} overcast(s): each may improve damage (+1), range (WPB yards), or duration (GM).`;
    lines.push(`Overcasts: ${result.overcasts}. ${ocSummary}`);
  }

  if (result.miscast) {
    lines.push('Miscast (doubles on casting roll).');
    if (result.miscastResult) {
      lines.push(
        `Miscast [${result.miscastResult.severity}]: ${result.miscastResult.description} ` +
        `— ${result.miscastResult.mechanicalEffect}`,
      );
    }
  }

  return lines.join(' ');
}
