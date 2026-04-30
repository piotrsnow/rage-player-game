import { requireServerApiKey } from './apiKeyService.js';
import { parseProviderError } from './aiErrors.js';
import { config } from '../config.js';

/**
 * Generates a short, flavorful legend for a saved character that shows up in
 * the campaign creator. Tone shifts automatically based on the character's
 * attribute profile: capable heroes get an epic, reverent write-up; hopelessly
 * underpowered characters (all attributes small + no XP) get a mocking,
 * tongue-in-cheek roast instead. Max 3 sentences.
 */

const ATTR_KEYS = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie'];

function summarizeCharacter(character) {
  const safe = character || {};
  const attrs = safe.attributes || {};
  const attrSummary = ATTR_KEYS
    .map((k) => `${k}=${Number(attrs[k] ?? 0)}`)
    .join(', ');

  const attrTotal = ATTR_KEYS.reduce((sum, k) => sum + (Number(attrs[k]) || 0), 0);
  const maxAttr = ATTR_KEYS.reduce((max, k) => Math.max(max, Number(attrs[k]) || 0), 0);
  const level = Number(safe.characterLevel || safe.level || 1);
  const xp = Number(safe.characterXp || 0);

  // Heuristic for "hopeless loser" roast mode. Baseline characters in RPGon
  // start with all attrs at 1 (szczescie 0). If the player kept them that way
  // and has no XP, they chose to play a walking punchline and the legend
  // should lean into it.
  const isHopeless = level <= 1 && xp === 0 && maxAttr <= 3 && attrTotal <= 12;

  return {
    name: safe.name || 'Nieznany',
    species: safe.species || 'human',
    gender: safe.gender || 'unknown',
    level,
    xp,
    careerName: safe.career?.name || null,
    attrSummary,
    attrTotal,
    maxAttr,
    backstory: typeof safe.backstory === 'string' ? safe.backstory.slice(0, 600) : '',
    isHopeless,
  };
}

export async function generateCharacterLegend({
  character,
  language = 'pl',
  provider = 'openai',
  model = null,
  userApiKeys = null,
} = {}) {
  const resolvedProvider = provider === 'anthropic' ? 'anthropic' : 'openai';
  const apiKey = requireServerApiKey(
    resolvedProvider,
    userApiKeys,
    resolvedProvider === 'anthropic' ? 'Anthropic' : 'OpenAI',
  );
  const resolvedModel = model || config.aiModels.standard[resolvedProvider];

  const summary = summarizeCharacter(character);
  const isPolish = language === 'pl';

  const systemPrompt = isPolish
    ? 'Jesteś kronikarzem pisarzem legendarnych biografii postaci RPG. Piszesz zwięzłe, sugestywne, 2-3 zdaniowe wpisy do kroniki o konkretnej postaci. Zawsze odpowiadasz wyłącznie poprawnym JSON.'
    : 'You are a chronicler of legendary RPG character biographies. You write concise, evocative 2-3 sentence chronicle entries about a specific character. Always respond with valid JSON only.';

  const toneGuidance = summary.isHopeless
    ? (isPolish
      ? 'UWAGA: Ta postać to kompletna porażka — wszystkie atrybuty na minimum, brak doświadczenia. Zamiast epickiej legendy NAPISZ KRÓTKI, OSTRY ROAST w stylu tawernianych kpin. Bądź szyderczy, prześmiewczy, bezlitosny ale dowcipny (jak Pratchett). Używaj metafor z błota, pechowej gwiazdy, karczmianego wstydu. Żadnej grandezzy — tylko kpina.'
      : 'NOTE: This character is a complete failure — all attributes at minimum, no experience. Instead of an epic legend, WRITE A SHORT, SHARP ROAST in tavern-mockery style. Be cutting, derisive, merciless but witty (Pratchett-like). Use metaphors of mud, unlucky stars, tavern shame. No grandeur — pure mockery.')
    : (isPolish
      ? 'Ton: podniosły, epicki, legendarny — jak wpis do bohaterskiej kroniki. Używaj bogatego, archaicznego słownictwa. Jeśli atrybuty są niewybitne ale nie żałosne, podkreśl charakter/pech/upór zamiast siły. Nigdy nie wymyślaj konkretnych bitew ani imion, których brak w profilu.'
      : 'Tone: elevated, epic, legendary — like a hero-chronicle entry. Use rich, slightly archaic vocabulary. If attributes are mediocre but not pathetic, emphasize character/bad luck/stubbornness over raw strength. Never invent specific battles or names not in the profile.');

  const profileBlock = [
    `Imię: ${summary.name}`,
    `Rasa: ${summary.species}`,
    `Płeć: ${summary.gender}`,
    `Poziom: ${summary.level}`,
    `Doświadczenie (XP): ${summary.xp}`,
    summary.careerName ? `Kariera: ${summary.careerName}` : null,
    `Atrybuty (skala 1-25): ${summary.attrSummary}`,
    summary.backstory ? `Istniejący zarys tła: ${summary.backstory}` : null,
  ].filter(Boolean).join('\n');

  const userPrompt = [
    isPolish
      ? 'Napisz 2-3 zdania legendy dla tej postaci w RPG. Zakorzeń ją w podanym profilu — nie wymyślaj faktów spoza profilu.'
      : 'Write 2-3 sentences of legend for this RPG character. Ground it in the provided profile — do not invent facts outside the profile.',
    toneGuidance,
    `PROFIL:\n${profileBlock}`,
    isPolish
      ? `Pisz w języku polskim. Maksymalnie 3 zdania. Zwróć JSON: { "legend": "<tekst legendy>" }`
      : `Write in English. Maximum 3 sentences. Return JSON: { "legend": "<legend text>" }`,
  ].join('\n\n');

  const content = resolvedProvider === 'anthropic'
    ? await callAnthropic(apiKey, systemPrompt, userPrompt, resolvedModel)
    : await callOpenAI(apiKey, systemPrompt, userPrompt, resolvedModel);

  try {
    const parsed = JSON.parse(content);
    if (typeof parsed.legend === 'string' && parsed.legend.trim()) {
      return { legend: parsed.legend.trim() };
    }
    return { legend: content.trim(), meta: { degraded: true, reason: 'missing_legend_field' } };
  } catch {
    return { legend: content.trim(), meta: { degraded: true, reason: 'json_parse_failed' } };
  }
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 400,
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) await parseProviderError(response, 'openai');
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
    }),
  });

  if (!response.ok) await parseProviderError(response, 'anthropic');
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : text;
}
