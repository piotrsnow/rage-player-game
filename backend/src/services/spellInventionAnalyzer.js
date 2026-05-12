import { callAIJson } from './aiJsonCall.js';
import { isLuckySuccess } from '../../../shared/domain/luck.js';
import {
  SPELL_MATERIAL_ICON_OPTIONS,
  normalizeSpellMaterialIcon,
  spellMaterialIconFallbackFromName,
} from '../../../shared/domain/spellMaterialIcons.js';

function rollPercentile100() {
  return Math.floor(Math.random() * 100) + 1;
}

const POWER_TIERS = ['cantrip', 'standard', 'strong', 'legendary'];
const OUTCOMES = ['success_existing', 'success_new', 'fail_circumstances', 'fail_roll'];

function clampInt(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function resolvePowerTier(powerRoll) {
  const roll = clampInt(powerRoll, 1, 50);
  if (roll <= 15) return 'cantrip';
  if (roll <= 30) return 'standard';
  if (roll <= 45) return 'strong';
  return 'legendary';
}

function sanitizeNarrative(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeExistingSpellName(name, candidates) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  const hit = candidates.find((c) => String(c.name || '').trim().toLowerCase() === target);
  return hit?.name || null;
}

function sanitizeInventedSpell(spell, fallbackManaCost = 2) {
  if (!spell || typeof spell !== 'object') return null;
  const name = String(spell.name || '').trim();
  if (!name) return null;
  const school = String(spell.school || '').trim() || 'Ogolna';
  const manaCost = clampInt(spell.manaCost, 1, 5) || fallbackManaCost;
  const description = String(spell.description || '').trim() || 'Nowe zaklęcie odkryte podczas eksperymentu magicznego.';
  const effect = String(spell.effect || '').trim() || description;
  const spellIcon = normalizeSpellMaterialIcon(spell.spellIcon);
  return { name, school, manaCost, description, effect, spellIcon };
}

function defaultFailVerdict(sum, dc) {
  return `Próba kończy się fiaskiem. Potrzebujesz sumy co najmniej ${dc}, a uzyskujesz ${sum} — energia rozprasza się bez trwałego efektu.`;
}

export async function analyzeSpellInvention({
  intent,
  successRoll,
  powerRoll,
  character,
  recentScenes,
  candidateSpells,
  userApiKeys = null,
  userId = null,
}) {
  const resolvedPowerTier = resolvePowerTier(powerRoll);
  const baseIntelligence = clampInt(character?.attributes?.inteligencja ?? 0, 0, 50);
  const luck = clampInt(character?.attributes?.szczescie ?? 0, 0, 50);
  const knownSpells = Array.isArray(character?.spells?.known)
    ? character.spells.known.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  const scenes = Array.isArray(recentScenes) ? recentScenes : [];
  const candidates = Array.isArray(candidateSpells) ? candidateSpells : [];

  const sceneBlock = scenes.map((scene, idx) => {
    const npcs = Array.isArray(scene.npcs) ? scene.npcs.map((n) => n?.name).filter(Boolean).join(', ') : '';
    return [
      `Scena ${idx + 1}:`,
      `Akcja: ${scene.chosenAction || '(brak)'}`,
      `Narracja: ${scene.narrative || '(brak)'}`,
      npcs ? `NPC: ${npcs}` : null,
    ].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');

  const candidatesBlock = candidates.map((spell, idx) => {
    const tags = Array.isArray(spell.tags) ? spell.tags.join(', ') : '';
    const summary = String(spell.summary || '').trim();
    return `${idx + 1}. ${spell.name}${spell.school ? ` [${spell.school}]` : ''}${summary ? ` — ${summary}` : ''}${tags ? ` (tagi: ${tags})` : ''}`;
  }).join('\n');

  const spellIconsBlock = SPELL_MATERIAL_ICON_OPTIONS.map((id, idx) => `${idx + 1}. ${id}`).join('\n');

  const systemPrompt = `Jesteś ekspertem od świata RPGon i oceniasz próbę "Wymyśl zaklęcie".

Ważne zasady:
- Oblicz favorability w zakresie -15..15 (warunki, nauczyciel, miejsce, rytuał, spójność z historią).
- System: suma = successRoll + inteligencja + favorability. Sukces gdy suma >= 51 (stały próg trudności).
- Osobna mechanika szczęścia: los 1–100 <= wartość szczęścia — backend to liczy, nie duplikuj w verdict.
- powerTier na podstawie powerRoll:
  - 1..15 cantrip
  - 16..30 standard
  - 31..45 strong
  - 46..50 legendary
- Jeśli sukces:
  - wybierz "success_existing" i existingSpellName gdy któryś kandydat jest bardzo podobny,
  - w przeciwnym razie "success_new" i inventedSpell.
- Ikona zaklęcia (Material Symbols Outlined — nazwa identyfikatora, dokładnie jak w liście):
  - Wybierz JEDNĄ nazwę wyłącznie z listy poniżej (50 pozycji). Bez zmian, bez synonimów.
  - Dla success_new ustaw inventedSpell.spellIcon na wybraną nazwę.
  - Dla success_existing ustaw pole spellIcon (root JSON, obok outcome) na wybraną nazwę dla tego zaklęcia.
- Jeśli porażka:
  - "fail_circumstances" gdy problem to głównie warunki fabularne,
  - "fail_roll" gdy warunki są OK, ale zawiódł rzut.

Pisz "verdict" po polsku (2-4 zdania) i "narrativeComment" po polsku (1-2 zdania, in-character).
Zwróć WYŁĄCZNIE poprawny JSON bez dodatkowego tekstu.

Dozwolone nazwy ikon (spellIcon / inventedSpell.spellIcon) — tylko te 50:
${spellIconsBlock}

Dozwolony kształt:
{
  "outcome": "success_existing" | "success_new" | "fail_circumstances" | "fail_roll",
  "favorability": number,
  "hasTeacher": boolean,
  "powerTier": "cantrip" | "standard" | "strong" | "legendary",
  "existingSpellName": "string (tylko dla success_existing)",
  "spellIcon": "string (tylko success_existing — dokładna nazwa z listy ikon)",
  "inventedSpell": {
    "name": "string",
    "school": "string",
    "manaCost": 1-5,
    "description": "string",
    "effect": "string",
    "spellIcon": "string (dokładna nazwa z listy ikon)"
  },
  "verdict": "string",
  "narrativeComment": "string"
}`;

  const userPrompt = `Dane wejściowe:
- Intencja gracza: ${intent}
- Success roll: ${successRoll}
- Power roll: ${powerRoll}
- Postać: ${character?.name || 'Nieznana'}
- Inteligencja: ${baseIntelligence}
- Szczęście: ${luck}
- Znane zaklęcia postaci: ${knownSpells.length > 0 ? knownSpells.join(', ') : '(brak)'}

Pula kandydatów (starter + codex):
${candidatesBlock || '(brak)'}

Ostatnie sceny:
${sceneBlock || '(brak scen)'}`;

  const { text } = await callAIJson({
    modelTier: 'premium',
    taskCategory: 'spellInvention',
    systemPrompt,
    userPrompt,
    maxTokens: 1500,
    temperature: 0.6,
    userApiKeys,
    userId,
    taskType: 'spell-invention',
    taskLabel: 'Spell invention analysis',
  });

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  const favorability = clampInt(parsed?.favorability ?? 0, -15, 15);
  const DC = 51;
  const sum = successRoll + baseIntelligence + luck + favorability;
  const luckRoll = rollPercentile100();
  const successByLuck = isLuckySuccess(luck, luckRoll);
  const successByThreshold = sum >= DC;
  const success = successByLuck || successByThreshold;

  let outcome = OUTCOMES.includes(parsed?.outcome) ? parsed.outcome : (success ? 'success_new' : 'fail_roll');
  if (success && !outcome.startsWith('success_')) outcome = 'success_new';
  if (!success && outcome.startsWith('success_')) outcome = 'fail_roll';

  const powerTier = POWER_TIERS.includes(parsed?.powerTier) ? parsed.powerTier : resolvedPowerTier;
  const hasTeacher = Boolean(parsed?.hasTeacher);
  let existingSpellName = normalizeExistingSpellName(parsed?.existingSpellName, candidates);
  const inventedSpell = sanitizeInventedSpell(parsed?.inventedSpell, powerTier === 'legendary' ? 5 : 2);

  const verdict = sanitizeNarrative(parsed?.verdict) || defaultFailVerdict(sum, DC);
  const narrativeComment = sanitizeNarrative(parsed?.narrativeComment);

  if (outcome === 'success_new' && !inventedSpell) {
    if (existingSpellName) {
      outcome = 'success_existing';
    } else {
      const knownLower = new Set(knownSpells.map((n) => n.toLowerCase()));
      const fallback = candidates.find((c) => !knownLower.has(String(c.name || '').toLowerCase()));
      if (fallback) {
        outcome = 'success_existing';
        existingSpellName = fallback.name;
      }
    }
  }

  const iconNameForFallback =
    outcome === 'success_existing'
      ? existingSpellName
      : inventedSpell?.name || null;
  const rawIconFromModel =
    outcome === 'success_new'
      ? inventedSpell?.spellIcon || normalizeSpellMaterialIcon(parsed?.inventedSpell?.spellIcon)
      : normalizeSpellMaterialIcon(parsed?.spellIcon);
  let spellIcon =
    normalizeSpellMaterialIcon(rawIconFromModel)
    || (iconNameForFallback ? spellMaterialIconFallbackFromName(iconNameForFallback) : null);

  return {
    outcome,
    threshold: DC,
    sum,
    favorability,
    intelligence: baseIntelligence,
    luck,
    hasTeacher,
    powerTier,
    existingSpellName,
    inventedSpell,
    spellIcon,
    verdict,
    narrativeComment,
    luckAttribute: luck,
    luckRoll,
    luckySuccess: successByLuck,
  };
}
