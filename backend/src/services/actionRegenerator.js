import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';

const VALID_TONES = [
  'thoughtful', 'bold', 'stupid', 'aggressive',
  'neutral', 'conciliatory', 'sleazy', 'empathetic',
];

const TONE_DESCRIPTIONS = {
  thoughtful:   'przemyślane — analityczne, ostrożne, oparte na logice i obserwacji',
  bold:         'odważne — ryzykowne, śmiałe, pewne siebie, brawurowe',
  stupid:       'głupie — absurdalne, irracjonalne, komicznie niedorzeczne',
  aggressive:   'agresywne — konfrontacyjne, groźby, zastraszanie, siłowe rozwiązania',
  neutral:      'neutralne — wyważone, pragmatyczne, bez emocji',
  conciliatory: 'ugodowe — dyplomatyczne, łagodzące napięcia, szukające kompromisu',
  sleazy:       'obleśne — dwuznaczne, nieprzyzwoite, prowokujące obrzydliwie',
  empathetic:   'empatyczne — współczujące, troskliwe, wczuwające się w emocje innych',
};

function buildSystemPrompt() {
  return `You are an action-suggestion generator for a Polish-language tabletop RPG (d50 system).
You return ONLY valid JSON: { "suggestedActions": ["action1", "action2", "action3"] }
Rules:
- Exactly 3 actions, in Polish, 1st person PC voice (e.g. "Przeszukuję pokój").
- Exactly 1 action must be direct speech (e.g. "Mówię: \\"...\\"" or "Krzyczę: \\"...\\"").
- Reference concrete NPCs, objects, or locations from the scene by name.
- Ground actions in character capabilities (no spells if mana=0, no items not in inventory).
- Each action: max 120 characters.`;
}

function buildUserPrompt({ narrative, npcs, currentLocation, characterName, tone }) {
  const toneDesc = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.neutral;
  const npcNames = (npcs || []).map((n) => n.name || n).filter(Boolean).slice(0, 5);

  const parts = [
    `Ton/styl akcji: ${toneDesc}`,
    '',
    `Scena: ${(narrative || '').slice(0, 800)}`,
  ];
  if (currentLocation) parts.push(`Lokacja: ${currentLocation}`);
  if (characterName) parts.push(`Postać gracza: ${characterName}`);
  if (npcNames.length > 0) parts.push(`NPC w scenie: ${npcNames.join(', ')}`);
  parts.push('', 'Wygeneruj 3 akcje w podanym tonie. JSON:');
  return parts.join('\n');
}

export async function regenerateActions({
  narrative,
  npcs = [],
  currentLocation = '',
  characterName = '',
  tone = 'neutral',
  userApiKeys = null,
  provider = 'openai',
  model = null,
}) {
  if (!VALID_TONES.includes(tone)) tone = 'neutral';

  const { text } = await callAIJson({
    provider,
    modelTier: 'nano',
    model,
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt({ narrative, npcs, currentLocation, characterName, tone }),
    maxTokens: 400,
    temperature: 0.9,
    userApiKeys,
    taskType: 'regenerate-actions',
    taskLabel: `regenerate-actions:${tone}`,
  });

  const parsed = parseJsonOrNull(text);
  const actions = parsed?.suggestedActions;
  if (Array.isArray(actions) && actions.length >= 3) {
    return actions
      .filter((a) => typeof a === 'string' && a.trim())
      .map((a) => a.trim())
      .slice(0, 3);
  }

  return null;
}

export { VALID_TONES };
