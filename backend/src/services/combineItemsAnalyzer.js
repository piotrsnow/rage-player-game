import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import { AttackModesSchema } from '../../../shared/domain/attackModes.js';
import { RARITY_ORDER, normalizeItemRarity } from '../../../shared/domain/itemKeys.js';

/**
 * Nano LLM that proposes the *narrative shape* of a combined item.
 *
 * The route layer already decided this is a success — the analyzer's job is
 * to pick a sensible name / rarity / attackModes that respects the input
 * sources and the player's intent. Power-floor enforcement (resultPower ≥
 * sumPower) is done by the route after the LLM returns; this prompt only
 * provides a *starting* shape.
 *
 * Returns:
 *   { name, rarity, baseType?, description, longDescription?, attackModes?,
 *     type?, icon? }
 *
 * — name: short item name (≤80 chars), Polish
 * — rarity: one of common/uncommon/rare/epic/legendary
 * — baseType: optional, snake_case key matching gameData.resolveBaseType
 * — attackModes: validated against AttackModesSchema or dropped to null
 */

const RARITY_LIST = RARITY_ORDER.join('|');

const SYSTEM_PROMPT = `Jesteś ekspertem od ekwipunku w grze RPGon. Łączysz dwa przedmioty w jeden.

ZASADA NAJWAŻNIEJSZA:
- Wynik MUSI być **co najmniej tak silny** jak najsilniejsza ze składowych. Czerp z mocy obu.
- Nazwa wyniku ma odzwierciedlać oba składniki (np. "Naoliwiona pochodnia", "Zatruty sztylet", "Runiczny miecz").

ZWRACAJ WYŁĄCZNIE JSON o kształcie:
{
  "name": "string (krótka nazwa, max 80 znaków, po polsku)",
  "rarity": "${RARITY_LIST}",
  "baseType": "string|null (jeśli pasuje do bazowego typu jak 'sword', 'dagger', 'bow' — inaczej null)",
  "type": "weapon|armor|potion|tool|misc|... (jeden z typowych)",
  "description": "string (1-2 zdania, jak wygląda i jak działa)",
  "longDescription": "string|null (opcjonalnie 2-4 zdania klimatyczne lub historia)",
  "attackModes": {
    "melee": { "damageComponents": [{ "type": "fizyczne|ogien|...", "formula": "str|str*2|dex|...", "bonus": int }] } | null,
    "ranged": { "damageComponents": [...], "range": number } | null,
    "aoe": null
  },
  "icon": "string|null (Material Symbols Outlined name like 'sword', 'auto_fix_high', 'local_fire_department')"
}

REGUŁY:
- Jeśli COKOLWIEK ze składników miało attackModes, wynik MUSI mieć attackModes (i co najmniej tak silne).
- powerRoll wpływa na poziom wyniku — wysoki powerRoll → epic/legendary + wyższe bonusy; niski → uncommon/rare.
- Rarity: domyślnie min(maxRarity_sources + 1, legendary).
- Nie wymyślaj attackModes dla przedmiotów bez sensu bojowego (mikstura + chleb = mikstura). attackModes:null jest OK wtedy.
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
    `- ${item.displayName || item.name || 'unnamed'}`,
    `  rarity: ${normalizeItemRarity(props.rarity || item.rarity || 'common')}`,
    `  type: ${props.type || item.type || 'misc'}`,
  ];
  if (props.description || item.description) {
    lines.push(`  desc: ${(props.description || item.description).slice(0, 160)}`);
  }
  if (attackModes) {
    lines.push(`  attackModes: ${JSON.stringify(attackModes)}`);
  }
  return lines.join('\n');
}

export async function analyzeItemCombination({
  sourceItems,
  intent = '',
  powerRoll,
  successRoll,
  character,
  userApiKeys = null,
  userId = null,
}) {
  const sources = Array.isArray(sourceItems) ? sourceItems.slice(0, 2) : [];
  if (sources.length < 2) {
    throw Object.assign(new Error('combine requires exactly two source items'), {
      statusCode: 400,
      code: 'COMBINE_INVALID_SOURCES',
    });
  }

  const userPrompt = `Składowe:
${sources.map(summarizeSourceForPrompt).join('\n')}

Intencja gracza: ${intent || '(brak — gracz zostawia wynik twojej kreatywności)'}
powerRoll (1-50): ${powerRoll} — czym wyższy, tym potężniejszy wynik
successRoll (1-50): ${successRoll}
Postać: ${character?.name || 'nieznana'} (poziom ${character?.characterLevel || 1})`;

  const { text } = await callAIJson({
    modelTier: 'nano',
    taskCategory: 'itemCombatStats',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 600,
    temperature: 0.5,
    userApiKeys,
    userId,
    taskType: 'item-combination',
    taskLabel: 'Item combination analysis',
  });

  const parsed = parseJsonOrNull(text) || {};

  const fallbackName = `${sources[0].displayName || sources[0].name} + ${sources[1].displayName || sources[1].name}`;
  const name = sanitizeName(parsed.name, fallbackName);
  const rarity = normalizeItemRarity(parsed.rarity);
  const description = sanitizeDescription(parsed.description,
    `Wynik połączenia: ${sources[0].displayName || sources[0].name} oraz ${sources[1].displayName || sources[1].name}.`);
  const longDescription = parsed.longDescription
    ? sanitizeDescription(parsed.longDescription, null, 800)
    : null;
  const attackModes = sanitizeAttackModes(parsed.attackModes);
  const type = typeof parsed.type === 'string' && parsed.type ? parsed.type.toLowerCase() : 'misc';
  const baseType = typeof parsed.baseType === 'string' && parsed.baseType ? parsed.baseType : null;
  const icon = typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : null;

  return {
    name,
    rarity,
    type,
    baseType,
    description,
    longDescription,
    attackModes,
    icon,
  };
}
