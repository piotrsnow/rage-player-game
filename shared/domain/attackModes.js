/**
 * Unified attack modes schema for weapons, spells, and items.
 *
 * Every combat-capable entity defines damage via `attackModes: { melee, ranged, aoe }`.
 * Each mode's `damageComponents` uses the existing evaluateComponent shape from damageTypes.js.
 * Non-offensive spells use `supportModes` for heals/buffs with the same melee/ranged/aoe targeting.
 */

import { z } from 'zod';
import {
  evaluateComponent,
  computeTypedDamage,
  formatComponentLabel,
  DAMAGE_TYPES,
} from './damageTypes.js';

// ── Constants ──

export const ATTACK_MODE_KEYS = ['melee', 'ranged', 'aoe'];

export const AOE_SHAPES = ['adjacent', 'cone', 'line', 'radius'];

// ── Zod Schemas ──

const DamageComponentSchema = z.object({
  type: z.string().default('fizyczne'),
  formula: z.string().optional(),
  bonus: z.number().optional(),
  flat: z.number().optional(),
  dice: z.string().optional(),
  intScale: z.number().optional(),
  fixedDamage: z.number().optional(),
});

const BaseModeSchema = z.object({
  damageComponents: z.array(DamageComponentSchema).min(1),
  qualities: z.array(z.string()).optional(),
});

const MeleeModeSchema = BaseModeSchema;

const RangedModeSchema = BaseModeSchema.extend({
  range: z.number().positive(),
});

const AoeModeSchema = BaseModeSchema.extend({
  range: z.number().positive(),
  aoeShape: z.enum(AOE_SHAPES),
  aoeSize: z.number().positive(),
});

export const AttackModesSchema = z.object({
  melee: MeleeModeSchema.nullable(),
  ranged: RangedModeSchema.nullable(),
  aoe: AoeModeSchema.nullable(),
});

// ── Helpers ──

/** Check if an entity has a specific attack mode. */
export function hasAttackMode(entity, mode) {
  return entity?.attackModes?.[mode] != null;
}

/** Return all non-null attack modes as [key, modeData] pairs. */
export function getAvailableAttackModes(entity) {
  if (!entity?.attackModes) return [];
  return ATTACK_MODE_KEYS
    .filter((k) => entity.attackModes[k] != null)
    .map((k) => [k, entity.attackModes[k]]);
}

/** Return a specific attack mode or null. */
export function getEffectiveAttackMode(entity, mode) {
  return entity?.attackModes?.[mode] ?? null;
}

/**
 * Pick the best attack mode for a given distance.
 * Prefers ranged when out of melee range, melee when adjacent, aoe when available for ranged.
 */
export function pickAttackMode(entity, distance = 0, meleeRange = 1) {
  const modes = entity?.attackModes;
  if (!modes) return null;

  if (distance <= meleeRange && modes.melee) return 'melee';
  if (distance > meleeRange && modes.ranged) return 'ranged';
  if (modes.melee) return 'melee';
  if (modes.ranged) return 'ranged';
  if (modes.aoe) return 'aoe';
  return null;
}

// ── Evaluation ──

/**
 * Evaluate an attack mode's total damage given character attributes.
 * Delegates to computeTypedDamage from damageTypes.js.
 */
export function evaluateAttackMode(mode, attrs = {}) {
  if (!mode?.damageComponents) return { components: [], total: 0 };
  return computeTypedDamage(mode.damageComponents, attrs);
}

// ── Display ──

const MODE_LABELS = {
  melee: 'Walka wręcz',
  ranged: 'Dystans',
  aoe: 'Obszar',
};

const MODE_ICONS = {
  melee: 'sword',
  ranged: 'gps_fixed',
  aoe: 'explosion',
};

export function getModeLabel(modeKey) {
  return MODE_LABELS[modeKey] || modeKey;
}

export function getModeIcon(modeKey) {
  return MODE_ICONS[modeKey] || 'help';
}

/**
 * Format a single attack mode to a human-readable damage string.
 * Example: "Fizyczne: STR+3" or "Ogień: INT/2 + 2"
 */
export function formatAttackModeLabel(mode, modeKey, attrs) {
  if (!mode?.damageComponents?.length) return null;

  const parts = mode.damageComponents.map((c) => {
    const typeDef = DAMAGE_TYPES[c.type];
    const label = typeDef?.label || c.type;
    return `${label}: ${formatComponentLabel(c)}`;
  });

  let result = parts.join(' | ');

  if (modeKey === 'ranged' && mode.range) {
    result += ` (${mode.range}m)`;
  }
  if (modeKey === 'aoe' && mode.aoeShape) {
    result += ` [${mode.aoeShape} ${mode.aoeSize}]`;
  }

  if (attrs) {
    const evaluated = evaluateAttackMode(mode, attrs);
    if (evaluated.total > 0) {
      result += ` = ${evaluated.total}`;
    }
  }

  return result;
}

/**
 * Format a full attack modes summary (all non-null modes).
 */
export function formatAttackModeSummary(attackModes, attrs) {
  if (!attackModes) return '';
  const lines = [];
  for (const key of ATTACK_MODE_KEYS) {
    const mode = attackModes[key];
    if (!mode) continue;
    const label = formatAttackModeLabel(mode, key, attrs);
    if (label) lines.push(`${getModeLabel(key)}: ${label}`);
  }
  return lines.join('\n');
}

// ── Legacy bridge ──

/**
 * Infer attackModes from legacy weapon data (pre-attackModes weapons).
 * Used during migration for backward compatibility.
 * @deprecated — use native attackModes after migration
 */
export function inferAttackModesFromLegacy(weaponData) {
  if (!weaponData) {
    return { melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 3 }] }, ranged: null, aoe: null };
  }

  if (weaponData.attackModes) return weaponData.attackModes;

  const components = weaponData.damageComponents
    || _inferLegacyComponents(weaponData);

  const isRanged = weaponData.damageType?.startsWith('ranged');
  const range = weaponData.range || 20;

  if (isRanged) {
    return {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: -2 }], qualities: ['Improvised'] },
      ranged: { damageComponents: components, range, qualities: weaponData.qualities || [] },
      aoe: null,
    };
  }

  return {
    melee: { damageComponents: components, qualities: weaponData.qualities || [] },
    ranged: null,
    aoe: null,
  };
}

function _inferLegacyComponents(weaponData) {
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
