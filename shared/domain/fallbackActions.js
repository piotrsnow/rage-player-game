// Shared fallback/post-process helpers for AI suggested actions.
// Used by FE (src/services/ai/service.js) and BE (backend/src/services/multiplayerAI/*).

// ── Low-level helpers ──

function normalizeActionForComparison(action) {
  return String(action || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:()[\]{}"']/g, '')
    .replace(/\s+/g, ' ');
}

function hashTextSeed(text = '') {
  if (!text) return 0;
  return [...String(text)].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) % 1000003, 17);
}

function pickVariant(variants, seed, offset = 0) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  return variants[(seed + offset) % variants.length];
}

export function normalizeSuggestedActions(actions, max = 8) {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((action) => (typeof action === 'string' ? action.trim() : String(action ?? '').trim()))
    .filter(Boolean)
    .filter((action, index, arr) => arr.indexOf(action) === index)
    .slice(0, max);
}

function inferLanguageFromText(text = '') {
  if (!text || typeof text !== 'string') return 'en';
  if (/[ąćęłńóśźż]/i.test(text)) return 'pl';
  return /\b(i|oraz|się|jest|nie|czy|który|gdzie|teraz|wokół|ostrożnie|chwila)\b/i.test(text)
    ? 'pl'
    : 'en';
}

function sanitizePolishAction(action) {
  let text = action;
  text = text.replace(/^I say:\s*/i, 'Mówię: ');
  text = text.replace(/^I tell\s+([^:]+):\s*/i, 'Mówię do $1: ');
  text = text.replace(/^I ask\s+([^:]+):\s*/i, 'Pytam $1: ');
  text = text.replace(/^I shout(?:\s+(?:to|at)\s+([^:]+))?:\s*/i, (_, name) =>
    (name ? `Krzyczę do ${name}: ` : 'Krzyczę: '));
  text = text.replace(/^I whisper(?:\s+to\s+([^:]+))?:\s*/i, (_, name) =>
    (name ? `Szepczę do ${name}: ` : 'Szepczę: '));
  const polishVerbAfterI = /^I\s+([a-ząćęłńóśźż])/i;
  if (polishVerbAfterI.test(text)) {
    text = text.replace(polishVerbAfterI, (_, firstChar) => firstChar.toUpperCase());
  }
  return text;
}

function prioritizeNovelActions(actions, previousActions = [], minNovel = 2) {
  const previousSet = new Set(
    previousActions.map((a) => (typeof a === 'string' ? a : a?.text || '')),
  );
  const novel = [];
  const repeated = [];
  for (const action of actions) {
    if (previousSet.has(action)) repeated.push(action);
    else novel.push(action);
  }
  if (novel.length >= minNovel) return [...novel, ...repeated];
  return actions;
}

// ── FE-style fallback builder (dialogue + NPC/location inline) ──

function buildDialogueFallbackActions(language = 'en', { npcs = [] } = {}) {
  const npcName = npcs[0]?.name || npcs[0] || null;
  if (language === 'pl') {
    return [
      npcName
        ? `Mówię do ${npcName}: "Spokojnie, opowiedz mi po kolei, co tu zaszło."`
        : 'Mówię: "Spokojnie, opowiedzcie mi po kolei, co tu zaszło."',
      npcName
        ? `Krzyczę do ${npcName}: "Na Sigmara, bez gierek - chcę prawdy, teraz!"`
        : 'Krzyczę: "Na Sigmara, bez gierek - chcę prawdy, teraz!"',
    ];
  }
  return [
    npcName
      ? `I tell ${npcName}: "Easy now. Start from the beginning and tell me exactly what happened."`
      : 'I say: "Easy now. Start from the beginning and tell me exactly what happened."',
    npcName
      ? `I shout to ${npcName}: "By Sigmar, no games - I want the truth, now!"`
      : 'I shout: "By Sigmar, no games - I want the truth, now!"',
  ];
}

export function buildFallbackActions(
  language = 'en',
  { narrative = '', currentLocation = '', npcs = [] } = {},
  { sceneIndex = 0 } = {},
) {
  const npcName = npcs[0]?.name || npcs[0] || null;
  const location = typeof currentLocation === 'string' ? currentLocation.trim() : '';
  const narrativeHint = typeof narrative === 'string' ? narrative.trim() : '';
  const safeSceneIndex = Math.max(0, Number.isFinite(sceneIndex) ? sceneIndex : 0);
  const seed = hashTextSeed(`${narrativeHint}|${location}|${npcName || ''}|${safeSceneIndex}`);
  if (language === 'pl') {
    const investigateVariants = [
      'Analizuję świeże tropy z tej sytuacji, zanim ruszę dalej',
      'Składam fakty w całość i szukam luki w tym, co widzę',
      'Badam najważniejsze szczegóły, żeby nie przegapić zagrożenia',
      'Odtwarzam w myślach przebieg zdarzeń i szukam słabego punktu',
    ];
    const tacticalVariants = [
      'Sprawdzam, który ruch da mi teraz najbezpieczniejszą przewagę',
      'Ustawiam się tak, by mieć osłonę i dobry ogląd sytuacji',
      'Wybieram pozycję, z której łatwo zareaguję na nagłą zmianę',
      'Oceniam drogę odwrotu i miejsca, gdzie mogę zyskać przewagę',
    ];
    return [
      npcName
        ? pickVariant([
          `Podchodzę do ${npcName} i pytam o szczegóły`,
          `Zagaduję ${npcName}, żeby wydobyć konkrety`,
          `Próbuję wyciągnąć od ${npcName} najważniejsze informacje`,
          `Prowokuję ${npcName} do szczerej odpowiedzi`,
        ], seed, 0)
        : pickVariant([
          'Pytam najbliższą osobę o to, co właśnie się wydarzyło',
          'Wypytuję świadków, kto i dlaczego wywołał zamieszanie',
          'Zbieram krótkie relacje od ludzi wokół',
          'Szukam kogoś, kto widział najwięcej i pytam o fakty',
        ], seed, 0),
      location
        ? pickVariant([
          `Sprawdzam dokładnie okolice ${location}`,
          `Przeszukuję ${location} w poszukiwaniu świeżych śladów`,
          `Obchodzę ${location}, szukając czegoś podejrzanego`,
          `Badam ${location} punkt po punkcie`,
        ], seed, 1)
        : pickVariant([
          'Przeszukuję najbliższą okolicę w poszukiwaniu śladów',
          'Rozpoznaję teren i szukam punktów zaczepienia',
          'Sprawdzam otoczenie, czy coś nie pasuje do sytuacji',
          'Badam najbliższe miejsce, gdzie mogło dojść do zdarzenia',
        ], seed, 1),
      narrativeHint
        ? pickVariant(investigateVariants, seed, 2)
        : 'Wybieram ostrożniejszą pozycję i obserwuję reakcje otoczenia',
      pickVariant(tacticalVariants, seed, 3),
      ...(buildDialogueFallbackActions(language, { npcs })),
    ];
  }
  const investigateVariants = [
    'I analyze the latest development before committing to a direction',
    'I piece together what just happened and look for weak points',
    'I inspect the most relevant details before moving',
    'I mentally reconstruct the sequence of events for clues',
  ];
  const tacticalVariants = [
    'I pick the move that gives me the safest immediate advantage',
    'I reposition where I can react quickly if this escalates',
    'I secure a better vantage point before acting',
    'I check my fallback route and likely threat angles',
  ];
  return [
    npcName
      ? pickVariant([
        `I approach ${npcName} and ask for concrete details`,
        `I question ${npcName} directly about what triggered this`,
        `I press ${npcName} for the most important facts`,
        `I challenge ${npcName} to clarify what is being hidden`,
      ], seed, 0)
      : pickVariant([
        'I ask the nearest person what exactly just happened',
        'I question the witnesses about who started this and why',
        'I gather quick statements from people nearby',
        'I find the most informed witness and ask for facts',
      ], seed, 0),
    location
      ? pickVariant([
        `I inspect ${location} for immediate clues`,
        `I sweep ${location} for fresh signs of trouble`,
        `I examine ${location} step by step`,
        `I search around ${location} for anything out of place`,
      ], seed, 1)
      : pickVariant([
        'I search the nearby area for concrete clues',
        'I scout the immediate surroundings for points of interest',
        'I check the area for anything that does not fit',
        'I examine the closest likely scene for evidence',
      ], seed, 1),
    narrativeHint
      ? pickVariant(investigateVariants, seed, 2)
      : 'I shift to a safer position and watch how others react',
    pickVariant(tacticalVariants, seed, 3),
    ...(buildDialogueFallbackActions(language, { npcs })),
  ];
}

// ── BE-style fallback builder (4-category variants with progression) ──

const FALLBACK_ACTION_VARIANTS = {
  pl: {
    investigate: [
      'Sprawdzam dokładnie, co tu się naprawdę wydarzyło',
      'Analizuję sytuację i szukam ukrytych szczegółów',
      'Badam miejsce zdarzenia, zanim wykonam kolejny ruch',
      'Próbuję odtworzyć przebieg wydarzeń z dostępnych śladów',
    ],
    social: [
      'Wypytuję świadków o to, co widzieli',
      'Nawiązuję rozmowę i próbuję wyciągnąć konkrety',
      'Zadaję kilka celnych pytań, by odsłonić prawdę',
      'Słucham uważnie plotek i wychwytuję sprzeczności',
    ],
    tactical: [
      'Szukam bezpiecznej pozycji i planuję kolejny krok',
      'Zabezpieczam się na wypadek, gdyby sprawa się zaogniła',
      'Sprawdzam drogi odwrotu i możliwe zasadzki',
      'Ustawiam się tak, by kontrolować sytuację w razie walki',
    ],
    progression: [
      'Ruszam w stronę celu, który obraliśmy wcześniej',
      'Pcham historię do przodu, zanim zniknie okazja',
      'Skupiam się na tym, co zbliża nas do rozstrzygnięcia',
      'Robię decydujący krok, by nie tracić tempa',
    ],
  },
  en: {
    investigate: [
      'I look for what actually happened here',
      'I examine the details nobody else noticed yet',
      'I piece together the scene before moving on',
      'I search the area for tracks and hidden clues',
    ],
    social: [
      'I question the witnesses about what they saw',
      'I strike up a conversation and press for specifics',
      'I ask pointed questions to draw out the truth',
      'I listen to the rumours and watch for contradictions',
    ],
    tactical: [
      'I find a secure angle and plan the next move',
      'I brace for trouble before committing further',
      'I check escape routes and potential ambush spots',
      'I position myself to control the fight if it breaks out',
    ],
    progression: [
      'I head toward the goal we decided on earlier',
      'I push the story forward before the chance slips away',
      'I focus on what brings us closer to the resolution',
      'I take the decisive step to keep our momentum',
    ],
  },
};

function buildFallbackSuggestedActions({
  narrative = '',
  currentLocation = '',
  npcsHere = [],
  language = 'en',
  previousActions = [],
  sceneIndex = 0,
} = {}) {
  const inferredLanguage = language === 'pl' || language === 'en'
    ? language
    : inferLanguageFromText(narrative);

  const seed = hashTextSeed(
    `${narrative}|${currentLocation}|${npcsHere.map((n) => n?.name || '').join('|')}|${sceneIndex}`,
  );
  const templates = FALLBACK_ACTION_VARIANTS[inferredLanguage] || FALLBACK_ACTION_VARIANTS.en;

  const actions = [];
  const firstNpc = npcsHere[0]?.name;
  if (firstNpc) {
    actions.push(
      inferredLanguage === 'pl'
        ? `Podchodzę do ${firstNpc} i pytam, co się dzieje`
        : `I approach ${firstNpc} and ask what is going on`,
    );
  }
  if (currentLocation) {
    actions.push(
      inferredLanguage === 'pl'
        ? `Rozglądam się po ${currentLocation} i szukam tropów`
        : `I look around ${currentLocation} for useful clues`,
    );
  }

  actions.push(pickVariant(templates.investigate, seed, 0));
  actions.push(pickVariant(templates.social, seed, 1));
  actions.push(pickVariant(templates.tactical, seed, 2));
  actions.push(pickVariant(templates.progression, seed, 3));

  const prioritized = prioritizeNovelActions(actions, previousActions, 2);
  return normalizeSuggestedActions(prioritized, 4);
}

// ── NPC context helper (FE-style) ──

function pickContextualNpcs(gameState = null, stateChanges = null) {
  const currentLocation = stateChanges?.currentLocation || gameState?.world?.currentLocation || '';
  const npcsInWorld = Array.isArray(gameState?.world?.npcs) ? gameState.world.npcs : [];
  const npcsChanged = Array.isArray(stateChanges?.npcs) ? stateChanges.npcs : [];
  const merged = [...npcsChanged, ...npcsInWorld].filter(Boolean);
  if (!currentLocation) return merged;
  const normalizedCurrent = String(currentLocation).trim().toLowerCase();
  const atCurrentLocation = merged.filter((npc) => {
    const lastLoc = npc?.lastLocation;
    if (!lastLoc || typeof lastLoc !== 'string') return false;
    return lastLoc.trim().toLowerCase() === normalizedCurrent;
  });
  return atCurrentLocation.length > 0 ? atCurrentLocation : merged;
}

// ── Narrative fallback ──

export function buildFallbackNarrative(language = 'en') {
  if (language === 'pl') {
    return 'Sytuacja wokół ciebie pozostaje napięta, ale czytelna. Zbierasz myśli, oceniasz zagrożenia i możliwości, a świat reaguje na twoją obecność subtelnymi sygnałami. To dobry moment, by świadomie wybrać kolejny krok.';
  }
  return 'The situation around you stays tense but readable. You gather your thoughts, assess risks and opportunities, and notice subtle reactions in the world around you. This is a good moment to choose your next move deliberately.';
}

// ── FE entry: post-process AI suggestions (max 3, PL sanitize) ──

export function postProcessSuggestedActions({
  suggestedActions,
  language = 'en',
  gameState = null,
  narrative = '',
  stateChanges = {},
} = {}) {
  const seen = new Set();
  const aiCandidates = (Array.isArray(suggestedActions) ? suggestedActions : [])
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter(Boolean);

  const normalizedAiActions = [];
  for (const action of aiCandidates) {
    const normalized = normalizeActionForComparison(action);
    if (!normalized || seen.has(normalized)) continue;
    normalizedAiActions.push(language === 'pl' ? sanitizePolishAction(action) : action);
    seen.add(normalized);
  }
  if (normalizedAiActions.length > 0) return normalizedAiActions.slice(0, 3);

  const currentLocation = stateChanges?.currentLocation || gameState?.world?.currentLocation || '';
  const npcs = pickContextualNpcs(gameState, stateChanges);
  const sceneIndex = (gameState?.scenes?.length || 0) + 1;
  const contextualFallback = buildFallbackActions(
    language,
    { narrative, currentLocation, npcs },
    { sceneIndex },
  );
  return contextualFallback.slice(0, 3);
}

// ── BE entry: ensure payload has suggestedActions (4-category fallback) ──

export function ensureSuggestedActions(payload, {
  language = 'en',
  currentLocation = '',
  npcsHere = [],
  previousActions = [],
  sceneIndex = 0,
} = {}) {
  const normalized = normalizeSuggestedActions(payload?.suggestedActions, 8);
  if (normalized.length > 0) return normalized;

  return buildFallbackSuggestedActions({
    narrative: payload?.narrative || '',
    currentLocation,
    npcsHere,
    language,
    previousActions,
    sceneIndex,
  });
}
