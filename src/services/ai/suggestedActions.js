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

export function collectRecentActionSet(gameState, sceneWindow = 3) {
  return (gameState?.scenes || [])
    .slice(-Math.max(1, sceneWindow))
    .flatMap((scene) => (Array.isArray(scene?.actions) ? scene.actions : []))
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter(Boolean);
}

export function isGenericFillerAction(action, language = 'en') {
  const normalized = normalizeActionForComparison(action);
  if (!normalized) return true;
  const enPatterns = [
    /^i look around$/,
    /^look around$/,
    /^i move on$/,
    /^move on$/,
    /^i continue$/,
    /^continue$/,
    /^i wait$/,
    /^wait$/,
    /^i observe$/,
    /^observe$/,
    /^i talk to someone$/,
    /^talk to someone$/,
    /^i investigate$/,
    /^investigate$/,
    /^i proceed$/,
    /^proceed$/,
    /^i press forward$/,
    /^press forward$/,
  ];
  const plPatterns = [
    /^rozgladam sie$/,
    /^rozgladam sie uwaznie po okolicy$/,
    /^idę dalej$/,
    /^ide dalej$/,
    /^ruszam dalej$/,
    /^kontynuuje$/,
    /^czekam$/,
    /^obserwuje$/,
    /^obserwuję$/,
    /^rozmawiam z kims$/,
    /^rozmawiam z kimś$/,
    /^badam sytuacje$/,
    /^badam sytuację$/,
    /^idziemy dalej$/,
    /^idzmy dalej$/,
    /^idźmy dalej$/,
  ];
  const patterns = language === 'pl' ? plPatterns : enPatterns;
  return patterns.some((pattern) => pattern.test(normalized));
}

export function isDialogueStyleAction(action, language = 'en') {
  const text = String(action || '').trim();
  if (!text) return false;
  if (/[""„].+[""]/.test(text)) return true;
  if (language === 'pl') {
    return /^(mówię|pytam|szepczę|krzyczę|wołam|mowie|pytam)\b/i.test(text);
  }
  return /^(i say|i ask|i whisper|i shout|i call out|i tell)\b/i.test(text);
}

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

export function buildFallbackActions(language = 'en', { narrative = '', currentLocation = '', npcs = [] } = {}, { sceneIndex = 0 } = {}) {
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
      narrativeHint ? pickVariant(investigateVariants, seed, 2) : 'Wybieram ostrożniejszą pozycję i obserwuję reakcje otoczenia',
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
    narrativeHint ? pickVariant(investigateVariants, seed, 2) : 'I shift to a safer position and watch how others react',
    pickVariant(tacticalVariants, seed, 3),
    ...(buildDialogueFallbackActions(language, { npcs })),
  ];
}

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

export function buildFallbackNarrative(language = 'en') {
  if (language === 'pl') {
    return 'Sytuacja wokół ciebie pozostaje napięta, ale czytelna. Zbierasz myśli, oceniasz zagrożenia i możliwości, a świat reaguje na twoją obecność subtelnymi sygnałami. To dobry moment, by świadomie wybrać kolejny krok.';
  }
  return 'The situation around you stays tense but readable. You gather your thoughts, assess risks and opportunities, and notice subtle reactions in the world around you. This is a good moment to choose your next move deliberately.';
}

function sanitizePolishAction(action) {
  let text = action;
  text = text.replace(/^I say:\s*/i, 'Mówię: ');
  text = text.replace(/^I tell\s+([^:]+):\s*/i, 'Mówię do $1: ');
  text = text.replace(/^I ask\s+([^:]+):\s*/i, 'Pytam $1: ');
  text = text.replace(/^I shout(?:\s+(?:to|at)\s+([^:]+))?:\s*/i, (_, name) =>
    name ? `Krzyczę do ${name}: ` : 'Krzyczę: ');
  text = text.replace(/^I whisper(?:\s+to\s+([^:]+))?:\s*/i, (_, name) =>
    name ? `Szepczę do ${name}: ` : 'Szepczę: ');
  const polishVerbAfterI = /^I\s+([a-ząćęłńóśźż])/i;
  if (polishVerbAfterI.test(text)) {
    text = text.replace(polishVerbAfterI, (_, firstChar) => firstChar.toUpperCase());
  }
  return text;
}

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
  const contextualFallback = buildFallbackActions(language, { narrative, currentLocation, npcs }, { sceneIndex });
  return contextualFallback.slice(0, 3);
}
