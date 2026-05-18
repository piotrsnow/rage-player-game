import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import {
  inferAttackModesFromLegacy,
  AttackModesSchema,
} from '../../../shared/domain/attackModes.js';

const SHORT_BLADE_ATTACK_MODES = {
  melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 2 }] },
  ranged: null,
  aoe: null,
};

const ONE_HANDED_WEAPON_ATTACK_MODES = {
  melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 3 }] },
  ranged: null,
  aoe: null,
};

const NON_WEAPON_TYPES = new Set([
  'adventuring_gear',
  'armor',
  'armour',
  'book',
  'clothing',
  'consumable',
  'food',
  'gear',
  'jewelry',
  'material',
  'medical',
  'misc',
  'potion',
  'resource',
  'tool',
  'tools',
]);

const WEAPON_TYPE_HINTS = new Set(['weapon', 'weapons']);

const SHORT_BLADE_RE = /(^|[\s"'()[\]{}.,;:!?_-])(n[oó]ż|knife|sztylet|dagger|kordzik)(?=$|[\s"'()[\]{}.,;:!?_-])/i;
const ONE_HANDED_WEAPON_RE = /(^|[\s"'()[\]{}.,;:!?_-])(miecz|sword|top[oó]r|axe|maczuga|mace|pa[lł]ka|club|rapier|szabla|sabre|saber)(?=$|[\s"'()[\]{}.,;:!?_-])/i;
const NON_WEAPON_RE = /(^|[\s"'()[\]{}.,;:!?_-])(plecak|backpack|torba|bag|ksi[aą][żz]ka|book|jedzenie|food|ubranie|clothing|p[oó]łbuty|buty|shoes|boots|mikstura|potion|narz[eę]dzie|tool)(?=$|[\s"'()[\]{}.,;:!?_-])/i;

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function hasLegacyWeaponFields(props) {
  return !!(
    props
    && typeof props === 'object'
    && (
      props.damageType
      || props.damageComponents
      || props.fixedDamage !== undefined
      || props.range !== undefined
    )
  );
}

function cloneAttackModes(modes) {
  return modes ? structuredClone(modes) : null;
}

function hasDamageSource(component) {
  return !!(
    component
    && (
      component.formula
      || component.dice
      || typeof component.intScale === 'number'
      || (typeof component.flat === 'number' && component.flat > 0)
      || (typeof component.fixedDamage === 'number' && component.fixedDamage > 0)
      || (typeof component.bonus === 'number' && component.bonus > 0)
    )
  );
}

function hasAnyDamageSource(modes) {
  return ['melee', 'ranged', 'aoe'].some((key) =>
    modes?.[key]?.damageComponents?.some(hasDamageSource));
}

function clampExplanation(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 300 ? trimmed.slice(0, 297) + '...' : trimmed || null;
}

/**
 * Cheap, deterministic guardrail for common inventory items.
 *
 * Returns `{ resolved: true, attackModes }` when code can decide without LLM,
 * including non-combat items (`attackModes: null`). Returns `{ resolved: false }`
 * when the item needs cached data or the nano fallback.
 */
export function inferDeterministicItemAttackModes(item) {
  const props = (typeof item?.props === 'object' && item.props) || {};
  const nameText = normalizeText(`${item?.displayName || ''} ${item?.name || ''} ${item?.itemKey || ''}`);
  const type = normalizeText(props.type || item?.type || '');

  if (SHORT_BLADE_RE.test(nameText)) {
    return { resolved: true, attackModes: cloneAttackModes(SHORT_BLADE_ATTACK_MODES) };
  }

  if (ONE_HANDED_WEAPON_RE.test(nameText) || WEAPON_TYPE_HINTS.has(type)) {
    return { resolved: true, attackModes: cloneAttackModes(ONE_HANDED_WEAPON_ATTACK_MODES) };
  }

  if (NON_WEAPON_TYPES.has(type) || NON_WEAPON_RE.test(nameText)) {
    return { resolved: true, attackModes: null };
  }

  if (props.attackModes !== undefined) {
    return { resolved: true, attackModes: props.attackModes };
  }

  if (hasLegacyWeaponFields(props)) {
    return { resolved: true, attackModes: inferAttackModesFromLegacy(props) };
  }

  return { resolved: false };
}

/**
 * Two-tier attack-modes resolution for items that lack the `attackModes` prop.
 *
 * Tier 1 — deterministic: classify common names/types, then use cached or
 *          real legacy weapon fields.
 * Tier 2 — LLM nano: ask a cheap model to generate combat stats from name/desc,
 *          validated against AttackModesSchema before returning.
 *
 * Returns `{ melee, ranged, aoe }` or null (non-combat item).
 */

const SYSTEM_PROMPT = `You are an RPG item stat generator for the RPGon d50 system.
Given an item, produce its attackModes as JSON.

Schema — return exactly:
{
  "attackModes": {
    "melee": { "damageComponents": [{ "type": "<damage type>", "formula": "<formula>", "bonus": <int> }] } | null,
    "ranged": { "damageComponents": [...], "range": <number in meters> } | null,
    "aoe": null
  },
  "explanation": "<1-2 sentences in Polish explaining WHY these stats were chosen>"
}

Damage types: "fizyczne", "ogien", "lod", "blyskawica", "magiczne", "trucizna", "psychiczne".
Formulas: "str" (melee 1H), "str*2" (melee 2H), "dex" (ranged), "str+dex" (thrown), "fixed" (firearms), "int" (magic staves/wands).

Rules:
- Melee weapons → melee mode with formula "str" (1H) or "str*2" (2H). Set ranged to null.
- Ranged weapons → ranged mode with formula "dex" and a range value. Set melee to a weak improvised strike: { "damageComponents": [{ "type": "fizyczne", "formula": "str", "bonus": -2 }] }.
- Thrown weapons → ranged mode with "str+dex".
- Firearms/crossbows → ranged mode with "fixed" formula and "fixedDamage" in the component.
- Magic staves/wands → melee or ranged mode with formula "int".
- If the item is NOT a weapon or combat item (potions, books, tools, food, clothing, etc.), return { "attackModes": null }.
- Keep bonus values reasonable: 0-3 for basic, 4-6 for mid-tier, 7-10 for legendary.
- aoe is only for explosives or area-effect items; most items leave it null.
- "explanation" MUST be in Polish, short (max 2 sentences), and justify the chosen formula/bonus/type based on the item name, type, and rarity.`;

export async function generateItemAttackModes(item, { userApiKeys = null, userId = null, force = false } = {}) {
  const props = item.props || {};

  if (!force) {
    const deterministic = inferDeterministicItemAttackModes(item);
    if (deterministic.resolved) return { attackModes: deterministic.attackModes, explanation: null };
  }

  const name = item.displayName || item.name || '';
  const description = props.description || item.description || '';
  const type = props.type || item.type || '';

  if (!name) return { attackModes: null, explanation: null };

  const userPrompt = `Item: ${name}\nType: ${type}\nDescription: ${description || 'No description available.'}`;

  try {
    const { text } = await callAIJson({
      modelTier: 'nano',
      taskCategory: 'itemCombatStats',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 400,
      temperature: 0.3,
      userApiKeys,
      userId,
      taskType: 'item-attack-modes',
      taskLabel: 'Item attack modes generation',
    });

    const parsed = parseJsonOrNull(text);
    if (!parsed) return { attackModes: null, explanation: null };

    const explanation = clampExplanation(parsed.explanation);

    const modes = parsed.attackModes;
    if (modes === null || modes === undefined) return { attackModes: null, explanation };
    if (typeof modes !== 'object') return { attackModes: null, explanation };

    const result = AttackModesSchema.safeParse(modes);
    if (!result.success) return { attackModes: null, explanation };
    if (!hasAnyDamageSource(result.data)) return { attackModes: null, explanation };

    return { attackModes: result.data, explanation };
  } catch (err) {
    console.error('[itemAttackModesGenerator] LLM call failed:', err.message);
    return { attackModes: null, explanation: null };
  }
}

// ── Spell combat stats generation ──────────────────────────────────────

const SPELL_SYSTEM_PROMPT = `You are an RPG spell stat generator for the RPGon d50 system.
Given a custom spell, produce its combatStats as JSON.

Schema — return exactly:
{
  "combatStats": {
    "type": "offensive" | "heal" | "buff" | "control" | "utility",
    "attackModes": {
      "melee": { "damageComponents": [{ "type": "<damage type>", "intScale": <number>, "flat": <int> }] } | null,
      "ranged": { "damageComponents": [...], "range": <meters> } | null,
      "aoe": { "damageComponents": [...], "range": <meters>, "aoeShape": "adjacent"|"cone"|"line"|"radius", "aoeSize": <meters> } | null
    },
    "supportModes": {
      "melee": { "healComponents": [{ "type": "magiczne", "intScale": <number>, "flat": <int> }] } | null,
      "ranged": null,
      "aoe": null
    }
  },
  "explanation": "<1-2 sentences in Polish explaining WHY these stats were chosen>"
}

Rules:
- Offensive spells: set type="offensive", fill attackModes, set supportModes to null.
- Healing spells: set type="heal", fill supportModes with healComponents, set attackModes to null.
- Buff/control/utility spells: set type accordingly, set both attackModes and supportModes to null.
- Damage types: "fizyczne", "ogien", "lod", "blyskawica", "magiczne", "trucizna", "psychiczne".
- intScale is the INT multiplier (0.25 = INT/4, 0.5 = INT/2, 1.0 = full INT). Most spells use 0.25-0.75.
- flat is additional flat damage/healing.
- For ranged offensive spells also include a melee mode (weaker).
- Keep values balanced: low-mana spells get intScale 0.25 + flat 0-1, high-mana spells get intScale 0.5-0.75 + flat 2-5.
- "explanation" MUST be in Polish, short (max 2 sentences), and justify the type/intScale/range choices.`;

export async function generateSpellCombatStats(spell, { userApiKeys = null, userId = null } = {}) {
  const name = spell.name || '';
  if (!name) return { combatStats: null, explanation: null };

  const school = spell.school || 'nieznana';
  const description = spell.description || '';
  const manaCost = spell.manaCost ?? 2;

  const userPrompt = `Spell: ${name}\nSchool: ${school}\nMana cost: ${manaCost}\nDescription: ${description || 'No description available.'}`;

  try {
    const { text } = await callAIJson({
      modelTier: 'nano',
      taskCategory: 'spellCombatStats',
      systemPrompt: SPELL_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 500,
      temperature: 0.3,
      userApiKeys,
      userId,
      taskType: 'spell-combat-stats',
      taskLabel: 'Spell combat stats generation',
    });

    const parsed = parseJsonOrNull(text);
    if (!parsed) return { combatStats: null, explanation: null };

    const explanation = clampExplanation(parsed.explanation);

    const cs = parsed.combatStats;
    if (!cs || typeof cs !== 'object') return { combatStats: null, explanation };
    if (!cs.type) return { combatStats: null, explanation };

    return { combatStats: cs, explanation };
  } catch (err) {
    console.error('[itemAttackModesGenerator] spell combat stats LLM call failed:', err.message);
    return { combatStats: null, explanation: null };
  }
}
