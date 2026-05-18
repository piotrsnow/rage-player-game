import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import {
  inferAttackModesFromLegacy,
  AttackModesSchema,
} from '../../../shared/domain/attackModes.js';
import { resolveSpecialProperties } from './specialPropertyResolver.js';

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

const WEAPON_TYPE_HINTS = new Set(['weapon', 'weapons']);

const SHORT_BLADE_RE = /(^|[\s"'()[\]{}.,;:!?_-])(n[oó]ż|knife|sztylet|dagger|kordzik)(?=$|[\s"'()[\]{}.,;:!?_-])/i;
const ONE_HANDED_WEAPON_RE = /(^|[\s"'()[\]{}.,;:!?_-])(miecz|sword|top[oó]r|axe|maczuga|mace|pa[lł]ka|club|rapier|szabla|sabre|saber)(?=$|[\s"'()[\]{}.,;:!?_-])/i;

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
 * Cheap, deterministic guardrail for known weapon archetypes.
 *
 * Returns `{ resolved: true, attackModes }` when code can decide without LLM
 * (known weapon patterns, cached props, legacy fields).
 * Returns `{ resolved: false }` when the item needs the nano LLM fallback.
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
Given an item, produce its attackModes and specialProperties as JSON.
EVERY physical object can be used as a weapon — a bottle, a torch, a frying pan, a book.

Schema — return exactly:
{
  "attackModes": {
    "melee": { "damageComponents": [{ "type": "<damage type>", "formula": "<formula>", "bonus": <int> }, ...] } | null,
    "ranged": { "damageComponents": [...], "range": <number in meters> } | null,
    "aoe": null
  },
  "specialProperties": [{ "name": "<Polish, short>", "description": "<Polish, 1 sentence>", "color": "<one of: fire|frost|lightning|poison|arcane|shadow|holy|nature|blood|physical|neutral>" }, ...],
  "explanation": "<1-2 sentences in Polish explaining WHY these stats were chosen>"
}

damageComponents is an ARRAY — it can hold multiple entries for multi-typed damage.
Example — enchanted flaming sword (physical steel + fire enchant):
  "melee": { "damageComponents": [{ "type": "fizyczne", "formula": "str", "bonus": 3 }, { "type": "ogien", "flat": 4 }] }
Example — beer mug (glass + liquid splash):
  "melee": { "damageComponents": [{ "type": "fizyczne", "formula": "str", "bonus": -2 }] }
  "ranged": { "damageComponents": [{ "type": "fizyczne", "formula": "str+dex", "bonus": -3 }], "range": 5 }

Damage types: "fizyczne", "ogien", "lod", "blyskawica", "magiczne", "trucizna", "psychiczne".
Formulas: "str" (melee 1H), "str*2" (melee 2H), "dex" (ranged), "str+dex" (thrown), "fixed" (firearms), "int" (magic staves/wands).

## Proper weapons
- Melee weapons → melee mode with formula "str" (1H) or "str*2" (2H). Set ranged to null unless throwable.
- Ranged weapons → ranged mode with formula "dex" and a range value. Set melee to a weak improvised strike: { "damageComponents": [{ "type": "fizyczne", "formula": "str", "bonus": -2 }] }.
- Thrown weapons → ranged mode with "str+dex".
- Firearms/crossbows → ranged mode with "fixed" formula and "fixedDamage" in the component.
- Magic staves/wands → melee or ranged mode with formula "int".
- Enchanted physical weapons (flaming/frost/lightning sword, poisoned dagger, runic axe, etc.) MUST have BOTH a "fizyczne" component (from steel/wood, formula "str" or "str*2") AND an elemental component ("ogien"/"lod"/"blyskawica"/"trucizna"/"magiczne", usually small "flat" 2-6 or "dice" like "1k4"). Pure-magic items (staves, wands, focus crystals) may use a single elemental/magic component.
- Ordinary, non-enchanted weapons get a single "fizyczne" component only.
- Weapon bonus values: 0-3 basic, 4-6 mid-tier, 7-10 legendary.
- aoe is only for explosives or area-effect items; most items leave it null.

## Improvised weapons (NON-weapon items: tools, food, potions, books, clothing, gear, etc.)
EVERY non-weapon item MUST still get attackModes — it can always be swung or thrown.
- Melee (improvised swing): formula "str", bonus -3 to 0. Heavier items (iron tools, heavy books, chairs) get bonus -1 to 0. Light/flimsy items (cloth, paper, food) get bonus -3 to -2.
- Ranged (thrown): most small/medium items can be thrown. Formula "str+dex", bonus -3 to -1, range 3-10m. Heavier items get shorter range (3-5m) but slightly higher bonus. Light items get longer range (6-10m) but lower bonus. Very large/unwieldy items (furniture, heavy armor) may have ranged: null.
- Themed secondary damage: flasks/bottles with liquid add a secondary damageComponent matching their content (kwas/acid → trucizna flat 1-2, olej/oil → ogien flat 1, piwo/woda = just fizyczne, no extra). Torches/lanterns → secondary ogien flat 2-3. Alchemical items → trucizna or magiczne flat 1-3. Holy water → magiczne flat 2.
- NEVER return { "attackModes": null } unless the item is truly intangible (a letter, a map, pure information).

## Special properties (MANDATORY for all items)
"specialProperties" is an array of 1–4 narrative-flavor traits. EVERY item MUST have at least 1.
Examples for mundane items: "Kruchy" (fragile glass/ceramic), "Ciężki" (heavy iron/stone), "Ostry" (bladed/pointed), "Tępy" (blunt), "Łatwopalny" (flammable), "Śliski" (wet/oily), "Cuchnący" (smelly food/potion), "Solidny" (well-built tool), "Lekki" (easy to throw), "Trujący" (poisonous content).
Examples for weapons/magic: "Płonący", "Krwawiący", "Zaczarowany", "Przeklęty", "Dwuręczny".
Each has a short Polish name, a 1-sentence Polish description, and a "color" tag. These are flavor only — no gameplay mechanics.
- "color": flaming/fire→fire, frost/ice→frost, electric→lightning, poison/acid→poison, magical/runic/arcane→arcane, cursed/dark/necrotic→shadow, holy/blessed/sacred→holy, vine/leaf/druidic→nature, bleeding/sanguine→blood, heavy/sharp/mundane/blunt→physical, otherwise→neutral.

## Explanation
"explanation" MUST be in Polish, short (max 2 sentences), and justify the chosen formula/bonus/type based on the item name, type, and rarity.`;

export async function generateItemAttackModes(item, { userApiKeys = null, userId = null, force = false } = {}) {
  const props = item.props || {};

  if (!force) {
    const deterministic = inferDeterministicItemAttackModes(item);
    if (deterministic.resolved) return { attackModes: deterministic.attackModes, explanation: null, specialProperties: [] };
  }

  const name = item.displayName || item.name || '';
  const description = props.description || item.description || '';
  const type = props.type || item.type || '';

  if (!name) return { attackModes: null, explanation: null, specialProperties: [] };

  const userPrompt = `Item: ${name}\nType: ${type}\nDescription: ${description || 'No description available.'}`;

  try {
    const { text } = await callAIJson({
      modelTier: 'nano',
      taskCategory: 'itemCombatStats',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 500,
      temperature: 0.3,
      userApiKeys,
      userId,
      taskType: 'item-attack-modes',
      taskLabel: 'Item attack modes generation',
    });

    const parsed = parseJsonOrNull(text);
    if (!parsed) return { attackModes: null, explanation: null, specialProperties: [] };

    const explanation = clampExplanation(parsed.explanation);

    const specialProperties = await resolveSpecialProperties(parsed.specialProperties);

    const modes = parsed.attackModes;
    if (modes === null || modes === undefined) return { attackModes: null, explanation, specialProperties };
    if (typeof modes !== 'object') return { attackModes: null, explanation, specialProperties };

    const result = AttackModesSchema.safeParse(modes);
    if (!result.success) return { attackModes: null, explanation, specialProperties };
    if (!hasAnyDamageSource(result.data)) return { attackModes: null, explanation, specialProperties };

    return { attackModes: result.data, explanation, specialProperties };
  } catch (err) {
    console.error('[itemAttackModesGenerator] LLM call failed:', err.message);
    return { attackModes: null, explanation: null, specialProperties: [] };
  }
}

// ── Spell combat stats generation ──────────────────────────────────────

const SPELL_SYSTEM_PROMPT = `You are an RPG spell stat generator for the RPGon d50 system.
Given a custom spell, produce its combatStats and specialProperties as JSON.

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
  "specialProperties": [{ "name": "<Polish, short>", "description": "<Polish, 1 sentence>", "color": "<one of: fire|frost|lightning|poison|arcane|shadow|holy|nature|blood|physical|neutral>" }, ...],
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
- "specialProperties" is an array of 0–4 narrative-flavor traits (e.g. "Obszarowy", "Kanalizowany", "Natychmiastowy", "Żywiołowy", "Przeklęty"). Each has a short Polish name, a 1-sentence Polish description, and a "color" tag. Return [] for basic spells with no special traits. These are flavor only — no gameplay mechanics.
- "color" for each specialProperty: match to flavor — flaming/fire→fire, frost/ice→frost, electric→lightning, poison/acid→poison, magical/runic/arcane→arcane, cursed/dark/necrotic→shadow, holy/blessed/sacred→holy, vine/leaf/druidic→nature, bleeding/sanguine→blood, heavy/sharp/mundane→physical, otherwise→neutral.
- "explanation" MUST be in Polish, short (max 2 sentences), and justify the type/intScale/range choices.`;

export async function generateSpellCombatStats(spell, { userApiKeys = null, userId = null } = {}) {
  const name = spell.name || '';
  if (!name) return { combatStats: null, explanation: null, specialProperties: [] };

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
    if (!parsed) return { combatStats: null, explanation: null, specialProperties: [] };

    const explanation = clampExplanation(parsed.explanation);
    const specialProperties = await resolveSpecialProperties(parsed.specialProperties);

    const cs = parsed.combatStats;
    if (!cs || typeof cs !== 'object') return { combatStats: null, explanation, specialProperties };
    if (!cs.type) return { combatStats: null, explanation, specialProperties };

    return { combatStats: cs, explanation, specialProperties };
  } catch (err) {
    console.error('[itemAttackModesGenerator] spell combat stats LLM call failed:', err.message);
    return { combatStats: null, explanation: null, specialProperties: [] };
  }
}
