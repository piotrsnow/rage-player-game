import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import {
  inferAttackModesFromLegacy,
  AttackModesSchema,
} from '../../shared/domain/attackModes.js';

/**
 * Two-tier attack-modes resolution for items that lack the `attackModes` prop.
 *
 * Tier 1 — deterministic: delegates to shared inferAttackModesFromLegacy which
 *          returns the canonical { melee, ranged, aoe } shape.
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
  }
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
- aoe is only for explosives or area-effect items; most items leave it null.`;

export async function generateItemAttackModes(item, { userApiKeys = null, userId = null } = {}) {
  const props = item.props || {};

  const legacy = inferAttackModesFromLegacy(props);
  if (legacy) return legacy;

  const name = item.displayName || item.name || '';
  const description = props.description || item.description || '';
  const type = props.type || item.type || '';

  if (!name) return null;

  const userPrompt = `Item: ${name}\nType: ${type}\nDescription: ${description || 'No description available.'}`;

  try {
    const { text } = await callAIJson({
      modelTier: 'nano',
      taskCategory: 'itemCombatStats',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 300,
      temperature: 0.2,
      userApiKeys,
      userId,
      taskType: 'item-attack-modes',
      taskLabel: 'Item attack modes generation',
    });

    const parsed = parseJsonOrNull(text);
    if (!parsed) return null;

    const modes = parsed.attackModes;
    if (modes === null || modes === undefined) return null;
    if (typeof modes !== 'object') return null;

    const result = AttackModesSchema.safeParse(modes);
    if (!result.success) return null;

    return result.data;
  } catch (err) {
    console.error('[itemAttackModesGenerator] LLM call failed:', err.message);
    return null;
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
  }
}

Rules:
- Offensive spells: set type="offensive", fill attackModes, set supportModes to null.
- Healing spells: set type="heal", fill supportModes with healComponents, set attackModes to null.
- Buff/control/utility spells: set type accordingly, set both attackModes and supportModes to null.
- Damage types: "fizyczne", "ogien", "lod", "blyskawica", "magiczne", "trucizna", "psychiczne".
- intScale is the INT multiplier (0.25 = INT/4, 0.5 = INT/2, 1.0 = full INT). Most spells use 0.25-0.75.
- flat is additional flat damage/healing.
- For ranged offensive spells also include a melee mode (weaker).
- Keep values balanced: low-mana spells get intScale 0.25 + flat 0-1, high-mana spells get intScale 0.5-0.75 + flat 2-5.`;

export async function generateSpellCombatStats(spell, { userApiKeys = null, userId = null } = {}) {
  const name = spell.name || '';
  if (!name) return null;

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
      maxTokens: 400,
      temperature: 0.2,
      userApiKeys,
      userId,
      taskType: 'spell-combat-stats',
      taskLabel: 'Spell combat stats generation',
    });

    const parsed = parseJsonOrNull(text);
    if (!parsed) return null;

    const cs = parsed.combatStats;
    if (!cs || typeof cs !== 'object') return null;
    if (!cs.type) return null;

    return cs;
  } catch (err) {
    console.error('[itemAttackModesGenerator] spell combat stats LLM call failed:', err.message);
    return null;
  }
}
