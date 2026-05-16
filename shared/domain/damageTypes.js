/**
 * RPGon damage type system.
 *
 * Single source of truth for damage types, dice rolling, typed damage
 * computation, resistance application, and display helpers.
 *
 * Used by both frontend (combatEngine, MagicPanel, CombatLogEntry) and
 * backend (bestiary, combatTurnResolver, system prompts).
 */

// ── Damage type registry ──

export const DAMAGE_TYPES = {
  fizyczne:   { id: 'fizyczne',   label: 'Fizyczne',   icon: 'gavel',                 color: 'text-gray-300' },
  ogien:      { id: 'ogien',      label: 'Ogień',      icon: 'local_fire_department',  color: 'text-orange-400' },
  lod:        { id: 'lod',        label: 'Lód',        icon: 'ac_unit',                color: 'text-cyan-300' },
  blyskawica: { id: 'blyskawica', label: 'Błyskawica', icon: 'bolt',                   color: 'text-yellow-300' },
  magiczne:   { id: 'magiczne',   label: 'Magiczne',   icon: 'auto_awesome',            color: 'text-purple-300' },
  trucizna:   { id: 'trucizna',   label: 'Trucizna',   icon: 'science',                 color: 'text-green-400' },
  psychiczne: { id: 'psychiczne', label: 'Psychiczne', icon: 'psychology',              color: 'text-pink-300' },
};

export const DAMAGE_TYPE_IDS = Object.keys(DAMAGE_TYPES);
export const DEFAULT_RESISTANCE = 1.0;

// ── Resistance labels for UI ──

export const RESISTANCE_LABELS = {
  0:   'Odporny',
  0.5: 'Odporny',
  1:   null,
  1.5: 'Wrażliwy',
  2:   'B. wrażliwy',
};

export function getResistanceLabel(value) {
  if (value === 0) return 'Immunitet';
  if (value <= 0.5) return 'Odporny';
  if (value >= 2) return 'B. wrażliwy';
  if (value >= 1.5) return 'Wrażliwy';
  return null;
}

// ── Dice parsing + rolling ──

const DICE_RE = /^(\d+)k(\d+)$/;

/**
 * Parse dice notation like "2k6" → { count: 2, sides: 6 }.
 * Returns null for invalid notation.
 */
export function parseDice(notation) {
  if (!notation || typeof notation !== 'string') return null;
  const m = notation.match(DICE_RE);
  if (!m) return null;
  return { count: Number(m[1]), sides: Number(m[2]) };
}

/**
 * Roll damage dice: "2k6" → sum of 2 six-sided dice.
 * Returns 0 for null/invalid notation.
 */
export function rollDamageDice(notation) {
  const parsed = parseDice(notation);
  if (!parsed) return 0;
  let sum = 0;
  for (let i = 0; i < parsed.count; i++) {
    sum += Math.floor(Math.random() * parsed.sides) + 1;
  }
  return sum;
}

// ── Typed damage computation ──

/**
 * Evaluate a single damage component to a numeric amount.
 *
 * Component shape (any combination):
 *   { type, formula?, bonus?, flat?, dice?, intScale? }
 *
 * - formula: 'str' → sila, 'dex' → zrecznosc, 'str+dex' → both
 * - bonus: flat added to formula result
 * - flat: standalone flat value
 * - dice: "NkS" notation (e.g. "1k6") — rolled and added
 * - intScale: multiplied by inteligencja (for spells)
 */
export function evaluateComponent(component, attrs = {}) {
  let amount = 0;

  if (component.formula) {
    const f = component.formula;
    if (f === 'str') amount += (attrs.sila ?? 0);
    else if (f === 'dex') amount += (attrs.zrecznosc ?? 0);
    else if (f === 'str+dex') amount += (attrs.sila ?? 0) + (attrs.zrecznosc ?? 0);
    else if (f === 'str*2') amount += (attrs.sila ?? 0) * 2;
  }

  if (component.intScale) {
    amount += Math.floor((attrs.inteligencja ?? 0) * component.intScale);
  }

  if (typeof component.bonus === 'number') amount += component.bonus;
  if (typeof component.flat === 'number') amount += component.flat;
  if (component.dice) amount += rollDamageDice(component.dice);

  return Math.max(0, amount);
}

/**
 * Compute typed damage from an array of damage components.
 * Returns { components: [{ type, amount }], total }.
 */
export function computeTypedDamage(damageComponents, attrs = {}) {
  if (!Array.isArray(damageComponents) || damageComponents.length === 0) {
    return { components: [], total: 0 };
  }
  const components = damageComponents.map((c) => ({
    type: c.type || 'fizyczne',
    amount: evaluateComponent(c, attrs),
  }));
  const total = components.reduce((s, c) => s + c.amount, 0);
  return { components, total };
}

// ── Resistance + DR application ──

/**
 * Get the effective resistance multiplier for a damage type.
 * Missing types default to DEFAULT_RESISTANCE (1.0).
 */
export function getResistance(resistances, type) {
  if (!resistances || typeof resistances !== 'object') return DEFAULT_RESISTANCE;
  return resistances[type] ?? DEFAULT_RESISTANCE;
}

/**
 * Get the typed DR for a damage type from an armor `dr` map.
 * Falls back to 0 for unspecified types.
 * If no `dr` map exists but `damageReduction` is set, treats it as fizyczne-only.
 */
export function getTypedDR(armorData, type) {
  if (!armorData) return 0;
  if (armorData.dr && typeof armorData.dr === 'object') {
    return armorData.dr[type] ?? 0;
  }
  if (typeof armorData.damageReduction === 'number' && type === 'fizyczne') {
    return armorData.damageReduction;
  }
  return 0;
}

/**
 * Apply armor DR and resistance multipliers to typed damage components.
 *
 * Order: raw → subtract DR per type → multiply by resistance → floor → min 0.
 *
 * Returns {
 *   components: [{ type, raw, dr, resistance, final }],
 *   total,
 *   totalBeforeDR
 * }
 */
export function applyResistancesAndDR(typedDamage, resistances, armorData) {
  if (!typedDamage?.components?.length) {
    return { components: [], total: 0, totalBeforeDR: 0 };
  }
  const resolved = typedDamage.components.map((c) => {
    const dr = getTypedDR(armorData, c.type);
    const res = getResistance(resistances, c.type);
    const afterDR = Math.max(0, c.amount - dr);
    const final = Math.max(0, Math.floor(afterDR * res));
    return { type: c.type, raw: c.amount, dr, resistance: res, final };
  });
  const total = resolved.reduce((s, c) => s + c.final, 0);
  const totalBeforeDR = typedDamage.components.reduce((s, c) => s + c.amount, 0);
  return { components: resolved, total, totalBeforeDR };
}

// ── Display helpers ──

const FORMULA_LABELS = {
  str: 'STR',
  dex: 'DEX',
  'str+dex': 'STR+DEX',
  'str*2': 'STRx2',
};

/**
 * Format a single damage component to a human-readable label.
 * Examples: "STR+3", "2 + 1k6", "INT/4 + 1"
 */
export function formatComponentLabel(component) {
  const parts = [];

  if (component.formula) {
    const f = FORMULA_LABELS[component.formula] || component.formula.toUpperCase();
    if (typeof component.bonus === 'number' && component.bonus !== 0) {
      parts.push(`${f}${component.bonus > 0 ? '+' : ''}${component.bonus}`);
    } else {
      parts.push(f);
    }
  }

  if (component.intScale) {
    const scale = component.intScale;
    const label = scale === 1 ? 'INT'
      : scale === 0.5 ? 'INT/2'
      : scale === 0.25 ? 'INT/4'
      : scale === 0.33 ? 'INT/3'
      : scale === 0.75 ? '3/4 INT'
      : `${scale}×INT`;
    if (typeof component.flat === 'number' && component.flat !== 0) {
      parts.push(`${label}+${component.flat}`);
    } else {
      parts.push(label);
    }
  }

  if (!component.formula && !component.intScale) {
    if (typeof component.flat === 'number' && component.flat !== 0) {
      parts.push(String(component.flat));
    }
    if (typeof component.bonus === 'number' && component.bonus !== 0 && !component.formula) {
      parts.push(String(component.bonus));
    }
  }

  if (component.dice) {
    if (parts.length > 0) parts.push(`+ ${component.dice}`);
    else parts.push(component.dice);
  }

  if (typeof component.fixedDamage === 'number') {
    parts.push(String(component.fixedDamage));
  }

  return parts.join(' ') || '0';
}

/**
 * Format an array of damage components into a multi-type label string.
 * Example: "Fizyczne: STR+3 | Ogień: 1k4"
 */
export function formatDamageComponents(components) {
  if (!Array.isArray(components) || components.length === 0) return '';
  return components.map((c) => {
    const typeDef = DAMAGE_TYPES[c.type];
    const label = typeDef?.label || c.type;
    return `${label}: ${formatComponentLabel(c)}`;
  }).join(' | ');
}

/**
 * Format resolved damage breakdown (post-DR/resistance) for combat log.
 * Returns an array of { type, label, raw, dr, resistance, final, color, icon }
 */
export function formatDamageBreakdown(resolvedComponents) {
  if (!Array.isArray(resolvedComponents)) return [];
  return resolvedComponents
    .filter((c) => c.raw > 0)
    .map((c) => {
      const typeDef = DAMAGE_TYPES[c.type] || DAMAGE_TYPES.fizyczne;
      return {
        type: c.type,
        label: typeDef.label,
        raw: c.raw,
        dr: c.dr,
        resistance: c.resistance,
        final: c.final,
        color: typeDef.color,
        icon: typeDef.icon,
      };
    });
}

/**
 * Infer damageComponents from legacy weapon data (pre-typed-damage weapons).
 * Used for backward compatibility when a weapon has no damageComponents field.
 */
export function inferWeaponDamageComponents(weaponData) {
  if (!weaponData) return [{ type: 'fizyczne', formula: 'str', bonus: 3 }];

  if (weaponData.damageComponents) return weaponData.damageComponents;

  switch (weaponData.damageType) {
    case 'melee-1h':
      return [{ type: 'fizyczne', formula: 'str', bonus: weaponData.bonus ?? 0 }];
    case 'melee-2h':
      return [{ type: 'fizyczne', formula: 'str*2', bonus: weaponData.bonus ?? 0 }];
    case 'ranged-dex':
      return [{ type: 'fizyczne', formula: 'dex', bonus: weaponData.bonus ?? 0 }];
    case 'ranged-str-dex':
      return [{ type: 'fizyczne', formula: 'str+dex', bonus: weaponData.bonus ?? 0 }];
    case 'ranged-fixed':
      return [{ type: 'fizyczne', fixedDamage: weaponData.fixedDamage ?? 0 }];
    default:
      return [{ type: 'fizyczne', formula: 'str', bonus: 3 }];
  }
}

/**
 * Infer armor DR map from legacy armor data (pre-typed-DR armor).
 * Returns a `dr` object: { fizyczne: N, ... }
 */
export function inferArmorDR(armorData) {
  if (!armorData) return {};
  if (armorData.dr && typeof armorData.dr === 'object') return armorData.dr;
  if (typeof armorData.damageReduction === 'number') {
    return { fizyczne: armorData.damageReduction };
  }
  return {};
}
