function inferLanguageFromText(text = '') {
  if (!text || typeof text !== 'string') return 'en';
  if (/[ąćęłńóśźż]/i.test(text)) return 'pl';
  return /\b(i|oraz|się|jest|nie|czy|który|gdzie|teraz|wokół|ostrożnie|chwila)\b/i.test(text)
    ? 'pl'
    : 'en';
}

export function normalizeSuggestedActions(actions, max = 8) {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((action) => (typeof action === 'string' ? action.trim() : String(action ?? '').trim()))
    .filter(Boolean)
    .filter((action, index, arr) => arr.indexOf(action) === index)
    .slice(0, max);
}

function hashTextSeed(text = '') {
  if (!text) return 0;
  return [...String(text)].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) % 1000003, 17);
}

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

function pickVariant(variants, seed, offset = 0) {
  const idx = (seed + offset) % variants.length;
  return variants[idx];
}

function prioritizeNovelActions(actions, previousActions = [], minNovel = 2) {
  const previousSet = new Set(previousActions.map((a) => (typeof a === 'string' ? a : a?.text || '')));
  const novel = [];
  const repeated = [];
  for (const action of actions) {
    if (previousSet.has(action)) {
      repeated.push(action);
    } else {
      novel.push(action);
    }
  }
  if (novel.length >= minNovel) return [...novel, ...repeated];
  return actions;
}

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
    `${narrative}|${currentLocation}|${npcsHere.map((n) => n?.name || '').join('|')}|${sceneIndex}`
  );
  const templates = FALLBACK_ACTION_VARIANTS[inferredLanguage] || FALLBACK_ACTION_VARIANTS.en;

  const actions = [];
  const firstNpc = npcsHere[0]?.name;
  if (firstNpc) {
    actions.push(
      inferredLanguage === 'pl'
        ? `Podchodzę do ${firstNpc} i pytam, co się dzieje`
        : `I approach ${firstNpc} and ask what is going on`
    );
  }
  if (currentLocation) {
    actions.push(
      inferredLanguage === 'pl'
        ? `Rozglądam się po ${currentLocation} i szukam tropów`
        : `I look around ${currentLocation} for useful clues`
    );
  }

  actions.push(pickVariant(templates.investigate, seed, 0));
  actions.push(pickVariant(templates.social, seed, 1));
  actions.push(pickVariant(templates.tactical, seed, 2));
  actions.push(pickVariant(templates.progression, seed, 3));

  const prioritized = prioritizeNovelActions(actions, previousActions, 2);
  return normalizeSuggestedActions(prioritized, 4);
}

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
