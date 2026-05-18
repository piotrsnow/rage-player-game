import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import { AttackModesSchema } from '../../../shared/domain/attackModes.js';
import { RARITY_ORDER, normalizeItemRarity, bumpRarity } from '../../../shared/domain/itemKeys.js';

/**
 * Nano LLM that proposes the *narrative shape* of an enchanted item.
 *
 * The route layer already decided this is a success — the analyzer's job is
 * to pick a name / boosted rarity / boosted attackModes that respects the
 * source item and the spell flavor. Strict-greater-power enforcement
 * (resultPower > originalPower) is done by the route after the LLM returns;
 * this prompt only provides a *starting* shape.
 *
 * Returns:
 *   { name, rarity, baseType?, description, longDescription?, attackModes?,
 *     type?, icon?, enchantEffect, narrativeFlavor }
 *
 * — name: short item name (≤80 chars), Polish, hints at enchantment
 * — rarity: bumped by ≥1 tier vs source (rare → epic etc.); capped at legendary
 * — attackModes: validated against AttackModesSchema or dropped to null
 * — enchantEffect: 1-sentence mechanical effect summary (Polish)
 * — narrativeFlavor: 1-sentence flavor description of the enchantment
 */

const RARITY_LIST = RARITY_ORDER.join('|');

const SYSTEM_PROMPT = `Jesteś ekspertem od magicznego ekwipunku w grze RPGon. Zaczarowywujesz przedmiot zaklęciem.

ZASADA NAJWAŻNIEJSZA:
- Wynik MUSI być **silniejszy** niż oryginał. Wzmocnij jego attackModes lub dorzuć obrażenia/efekt pasujący do szkoły magii.
- Rzadkość przedmiotu MUSI wzrosnąć przynajmniej o jeden poziom (np. uncommon → rare).
- Nazwa wyniku ma zdradzać zaklęcie (np. "Płonący miecz", "Lodowy sztylet runiczny", "Naelektryzowana włócznia").

ZWRACAJ WYŁĄCZNIE JSON o kształcie:
{
  "name": "string (krótka nazwa, max 80 znaków, po polsku)",
  "rarity": "${RARITY_LIST}",
  "baseType": "string|null (zachowaj typ bazowy oryginału jeśli pasuje)",
  "type": "weapon|armor|tool|misc|...",
  "description": "string (1-2 zdania, jak teraz wygląda i działa)",
  "longDescription": "string|null (opcjonalnie 2-4 zdania klimatyczne — jak zaklęcie scaliło się z przedmiotem)",
  "attackModes": {
    "melee": { "damageComponents": [{ "type": "fizyczne|ogien|lod|...", "formula": "str|str*2|...", "bonus": int }] } | null,
    "ranged": { "damageComponents": [...], "range": number } | null,
    "aoe": null
  },
  "icon": "string|null (Material Symbols Outlined name like 'auto_fix_high', 'local_fire_department', 'ac_unit')",
  "enchantEffect": "string (1 zdanie mechaniczne — np. 'Dodaje 1k4 obrażeń od ognia do każdego ataku w zwarciu.')",
  "narrativeFlavor": "string (1 zdanie klimatu — np. 'Ostrze tańczy płomieniami za każdym ruchem.')"
}

REGUŁY:
- Jeśli oryginał miał attackModes, wynik MUSI mieć attackModes (i wyraźnie silniejsze — wyższy bonus albo dodatkowy damageComponent z typu pasującego do szkoły).
- Jeśli oryginał nie miał attackModes a zaklęcie jest bojowe, możesz nadać sensowne attackModes (np. mikstura wybuchowa → aoe).
- powerRoll wpływa na poziom wzmocnienia — wysoki powerRoll → epic/legendary + wyraźny boost; niski → tylko nieznaczny boost.
- Szkoła zaklęcia dyktuje typ obrażeń: ogień → ogien, lód → lod, błyskawica → blyskawica, etc.
- Wszystkie pola po polsku; klucze i wartości typów (rarity, type) zostają po angielsku jak w schemacie.
- ZERO dodatkowego tekstu poza JSON-em.`;

function sanitizeName(value, fallback) {
  const s = String(value || '').trim();
  if (!s) return fallback;
  return s.length > 80 ? s.slice(0, 80) : s;
}

function sanitizeDescription(value, fallback, maxLen = 300) {
  const s = String(value || '').trim();
  if (!s) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeAttackModes(modes) {
  if (modes === null || modes === undefined) return null;
  const result = AttackModesSchema.safeParse(modes);
  if (!result.success) return null;
  return result.data;
}

function summarizeSourceForPrompt(item) {
  const props = item.props || {};
  const attackModes = props.attackModes ?? item.attackModes ?? null;
  const lines = [
    `Oryginał: ${item.displayName || item.name || 'unnamed'}`,
    `  rarity: ${normalizeItemRarity(props.rarity || item.rarity || 'common')}`,
    `  type: ${props.type || item.type || 'misc'}`,
  ];
  if (props.description || item.description) {
    lines.push(`  desc: ${(props.description || item.description).slice(0, 200)}`);
  }
  if (attackModes) {
    lines.push(`  attackModes: ${JSON.stringify(attackModes)}`);
  }
  if (Array.isArray(props.enchantments) && props.enchantments.length > 0) {
    lines.push(`  wcześniejsze zaczarowania: ${props.enchantments.map((e) => e.spell).join(', ')}`);
  }
  return lines.join('\n');
}

function summarizeSpellForPrompt(spell) {
  if (!spell) return 'brak';
  return [
    `${spell.name} (szkoła: ${spell.school || '?'}, koszt many: ${spell.manaCost ?? '?'})`,
    spell.description ? `  ${spell.description.slice(0, 220)}` : null,
  ].filter(Boolean).join('\n');
}

export async function analyzeEnchantItem({
  sourceItem,
  spell,
  intent = '',
  powerRoll,
  successRoll,
  character,
  userApiKeys = null,
  userId = null,
}) {
  if (!sourceItem) {
    throw Object.assign(new Error('enchant requires a source item'), {
      statusCode: 400,
      code: 'ENCHANT_INVALID_SOURCE',
    });
  }
  if (!spell || !spell.name) {
    throw Object.assign(new Error('enchant requires a spell'), {
      statusCode: 400,
      code: 'ENCHANT_INVALID_SPELL',
    });
  }

  const userPrompt = `${summarizeSourceForPrompt(sourceItem)}

Zaklęcie:
${summarizeSpellForPrompt(spell)}

Intencja gracza: ${intent || '(brak — zostaw kreatywności)'}
powerRoll (1-50): ${powerRoll} — czym wyższy, tym potężniejsze wzmocnienie
successRoll (1-50): ${successRoll}
Postać: ${character?.name || 'nieznana'} (poziom ${character?.characterLevel || 1})`;

  const { text } = await callAIJson({
    modelTier: 'nano',
    taskCategory: 'itemCombatStats',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 600,
    temperature: 0.55,
    userApiKeys,
    userId,
    taskType: 'enchant-item',
    taskLabel: 'Enchant item analysis',
  });

  const parsed = parseJsonOrNull(text) || {};

  const fallbackName = `${sourceItem.displayName || sourceItem.name} (zaczarowany)`;
  const name = sanitizeName(parsed.name, fallbackName);
  // Floor at bumpRarity(source) so we never regress vs original even on bad
  // LLM output. The route's enforcePowerFloor will push higher if needed.
  const sourceRarity = normalizeItemRarity(sourceItem.props?.rarity || sourceItem.rarity);
  const proposedRarity = normalizeItemRarity(parsed.rarity);
  const floor = bumpRarity(sourceRarity);
  const rarity = RARITY_ORDER.indexOf(proposedRarity) >= RARITY_ORDER.indexOf(floor)
    ? proposedRarity
    : floor;
  const description = sanitizeDescription(parsed.description,
    `${sourceItem.displayName || sourceItem.name}, teraz przesycony mocą zaklęcia ${spell.name}.`);
  const longDescription = parsed.longDescription
    ? sanitizeDescription(parsed.longDescription, null, 800)
    : null;
  const attackModes = sanitizeAttackModes(parsed.attackModes);
  const type = typeof parsed.type === 'string' && parsed.type
    ? parsed.type.toLowerCase()
    : (sourceItem.props?.type || sourceItem.type || 'misc');
  const baseType = typeof parsed.baseType === 'string' && parsed.baseType
    ? parsed.baseType
    : (sourceItem.baseType || null);
  const icon = typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : null;
  const enchantEffect = sanitizeDescription(parsed.enchantEffect,
    `Dodaje moc zaklęcia ${spell.name}.`, 200);
  const narrativeFlavor = sanitizeDescription(parsed.narrativeFlavor,
    `Przedmiot pulsuje mocą zaklęcia ${spell.name}.`, 200);

  return {
    name,
    rarity,
    type,
    baseType,
    description,
    longDescription,
    attackModes,
    icon,
    enchantEffect,
    narrativeFlavor,
  };
}
