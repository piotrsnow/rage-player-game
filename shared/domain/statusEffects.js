/**
 * Status Effects (Efekty Statusowe) — shared domain logic.
 *
 * Pure helpers for computing effect modifiers, ticking durations,
 * checking restrictions, and managing the active effects array.
 * Used by both frontend (combat engine, store handlers) and backend
 * (characterMutations, prompt builder).
 */

import { z } from 'zod';

// ── Schema ──

export const EFFECT_SOURCES = ['spell', 'item', 'combat', 'trap', 'environmental', 'ai'];
export const EFFECT_CATEGORIES = ['buff', 'debuff', 'dot', 'control', 'mixed'];
export const DURATION_TYPES = ['rounds', 'scenes', 'time', 'permanent', 'until_rest', 'manual'];
export const RESTRICTIONS = ['no_attack', 'no_movement', 'no_magic', 'skip_turn'];

export const EffectMechanicsSchema = z.object({
  attributeMods: z.record(z.string(), z.number()).optional().default({}),
  skillMods: z.record(z.string(), z.number()).optional().default({}),
  testMod: z.number().optional().default(0),
  damageReduction: z.number().optional().default(0),
  dotDamage: z.number().optional().default(0),
  dotHeal: z.number().optional().default(0),
  movementMod: z.number().optional().default(0),
  restrictions: z.array(z.enum(RESTRICTIONS)).optional().default([]),
  resistCheck: z.object({
    attribute: z.string(),
    threshold: z.number(),
  }).nullable().optional().default(null),
}).passthrough().optional().default({});

export const EffectDurationSchema = z.object({
  type: z.enum(DURATION_TYPES),
  remaining: z.number().nullable().optional().default(null),
}).passthrough();

export const StatusEffectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.enum(EFFECT_SOURCES).optional().default('ai'),
  category: z.enum(EFFECT_CATEGORIES).optional().default('debuff'),
  duration: EffectDurationSchema,
  mechanics: EffectMechanicsSchema,
  stackable: z.boolean().optional().default(false),
  description: z.string().optional().default(''),
}).passthrough();

// ── Helpers ──

const MAX_STACKS = 5;
export const MIN_EFFECT_DURATION_ROUNDS = 2;

/**
 * Sum all attribute/skill/test modifiers from active effects into a single
 * aggregate object. Used by combat engine to pre-add mods before d50 rolls.
 */
export function computeEffectiveMods(activeEffects) {
  const result = {
    attributeMods: {},
    skillMods: {},
    testMod: 0,
    damageReduction: 0,
    movementMod: 0,
  };
  if (!Array.isArray(activeEffects)) return result;

  for (const fx of activeEffects) {
    const m = fx.mechanics;
    if (!m) continue;
    if (m.attributeMods) {
      for (const [attr, val] of Object.entries(m.attributeMods)) {
        result.attributeMods[attr] = (result.attributeMods[attr] || 0) + val;
      }
    }
    if (m.skillMods) {
      for (const [skill, val] of Object.entries(m.skillMods)) {
        result.skillMods[skill] = (result.skillMods[skill] || 0) + val;
      }
    }
    result.testMod += (m.testMod || 0);
    result.damageReduction += (m.damageReduction || 0);
    result.movementMod += (m.movementMod || 0);
  }
  return result;
}

/**
 * Tick effects of a given duration type. Decrements `remaining`, applies
 * resist checks, and separates remaining vs expired effects.
 *
 * @param {Array} effects - current activeEffects array
 * @param {'rounds'|'scenes'|'time'|'until_rest'} tickType
 * @param {object} [opts]
 * @param {(attribute: string, threshold: number) => boolean} [opts.resistRoll]
 *   If provided, called for each effect with a resistCheck. Return true = saved.
 * @returns {{ remaining: Array, expired: Array, dotDamage: number, dotHeal: number }}
 */
export function tickEffects(effects, tickType, opts = {}) {
  if (!Array.isArray(effects)) return { remaining: [], expired: [], dotDamage: 0, dotHeal: 0 };

  const remaining = [];
  const expired = [];
  let dotDamage = 0;
  let dotHeal = 0;

  for (const fx of effects) {
    const dur = fx.duration;
    if (!dur) { remaining.push(fx); continue; }

    // until_rest: remove all when rest tick fires
    if (tickType === 'until_rest' && dur.type === 'until_rest') {
      expired.push(fx);
      continue;
    }

    // Only tick matching duration types
    if (dur.type !== tickType) {
      remaining.push(fx);
      continue;
    }

    // permanent / manual never auto-expire
    if (dur.type === 'permanent' || dur.type === 'manual') {
      remaining.push(fx);
      // still apply DoT
      dotDamage += (fx.mechanics?.dotDamage || 0);
      dotHeal += (fx.mechanics?.dotHeal || 0);
      continue;
    }

    // Resist check: if saved, remove the effect
    if (fx.mechanics?.resistCheck && opts.resistRoll) {
      const { attribute, threshold } = fx.mechanics.resistCheck;
      if (opts.resistRoll(attribute, threshold)) {
        expired.push(fx);
        continue;
      }
    }

    // Apply DoT before checking expiry
    dotDamage += (fx.mechanics?.dotDamage || 0);
    dotHeal += (fx.mechanics?.dotHeal || 0);

    // Decrement remaining
    const newRemaining = (dur.remaining ?? 1) - 1;
    if (newRemaining <= 0) {
      expired.push(fx);
    } else {
      remaining.push({ ...fx, duration: { ...dur, remaining: newRemaining } });
    }
  }

  return { remaining, expired, dotDamage, dotHeal };
}

/**
 * Check whether a specific action is blocked by any active effect's restrictions.
 * @param {Array} effects
 * @param {string} action - one of RESTRICTIONS values
 */
export function isRestricted(effects, action) {
  if (!Array.isArray(effects) || !action) return false;
  return effects.some((fx) => fx.mechanics?.restrictions?.includes(action));
}

/**
 * Add a new effect respecting stacking rules.
 * - Non-stackable (default): same-name effect refreshes duration.
 * - Stackable: up to MAX_STACKS instances of the same name.
 */
export function addEffect(effects, newEffect) {
  const arr = Array.isArray(effects) ? [...effects] : [];

  const clamped = clampEffectDuration(newEffect);
  const existing = arr.filter((fx) => fx.name === clamped.name);

  if (!clamped.stackable) {
    const filtered = arr.filter((fx) => fx.name !== clamped.name);
    filtered.push(clamped);
    return filtered;
  }

  if (existing.length >= MAX_STACKS) return arr;
  arr.push(clamped);
  return arr;
}

function clampEffectDuration(effect) {
  const dur = effect.duration;
  if (!dur || dur.type !== 'rounds') return effect;
  if (dur.remaining != null && dur.remaining < MIN_EFFECT_DURATION_ROUNDS) {
    return { ...effect, duration: { ...dur, remaining: MIN_EFFECT_DURATION_ROUNDS } };
  }
  return effect;
}

/**
 * Remove a single effect by id.
 */
export function removeEffect(effects, effectId) {
  if (!Array.isArray(effects)) return [];
  return effects.filter((fx) => fx.id !== effectId);
}

/**
 * Remove all effects matching a given name.
 */
export function removeEffectsByName(effects, name) {
  if (!Array.isArray(effects)) return [];
  return effects.filter((fx) => fx.name !== name);
}

/**
 * Convert old-style `statuses: string[]` to minimal activeEffects.
 * Used for backward-compat migration on load.
 */
export function migrateStatusStrings(statuses) {
  if (!Array.isArray(statuses)) return [];
  return statuses
    .filter((s) => typeof s === 'string' && s.trim())
    .map((s, i) => ({
      id: `migrated_${i}_${Date.now()}`,
      name: s.trim(),
      source: 'ai',
      category: 'debuff',
      duration: { type: 'scenes', remaining: 3 },
      mechanics: {},
      stackable: false,
      description: '',
    }));
}

/**
 * Derive legacy `statuses: string[]` view from activeEffects.
 */
export function deriveStatusNames(activeEffects) {
  if (!Array.isArray(activeEffects)) return [];
  return activeEffects.map((fx) => fx.name);
}
