/**
 * Yassato cameo scene — when the player mentions "Yassato" in their action,
 * the normal scene pipeline is replaced with a short, absurd cameo scene:
 * Yassato (ninja-agent-mściciel-filantrop) materialises next to the PC in
 * some ridiculous way, walks up, hands over a rolled XP reward (1/8..1/2 of
 * current character XP, min 1), and drops a snarky line whose tone scales
 * with the XP amount — the more he brings, the more zawadiacki he gets.
 *
 * Cooldown: at most one cameo per 5 scenes (looks back at the last 5
 * CampaignScene rows for a `stateChanges._yassatoCameo` marker).
 *
 * Implementation: one nano-LLM call with a deterministic fallback (5 pre-
 * written variants with per-tier snark lines). Returns a full sceneResult
 * compatible with the normal scene save path.
 */

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';

const log = childLogger({ module: 'yassatoCameo' });

const COOLDOWN_WINDOW_SCENES = 5;

/**
 * XP reward roll — random integer in [max(1, floor(xp/8)), max(1, floor(xp/2))].
 * Also classifies the draw into a swagger tier (low/medium/high) by its
 * position inside that range. Low swagger = humble-ish / ironic Yassato,
 * high swagger = zawadiacki, chełpliwy, bierze bachora za rękę jak własnego.
 *
 * Edge case: currentXp=0 (fresh character) → min=max=1, xpAmount=1, swagger='low'.
 */
export function computeYassatoXpReward(currentXp) {
  const baseXp = Math.max(0, Number.isFinite(currentXp) ? Math.floor(currentXp) : 0);
  const minXp = Math.max(1, Math.floor(baseXp / 8));
  const maxXp = Math.max(minXp, Math.floor(baseXp / 2));
  const xpAmount = minXp + Math.floor(Math.random() * (maxXp - minXp + 1));
  const range = maxXp - minXp;
  const pct = range > 0 ? (xpAmount - minXp) / range : 0;
  const swagger = pct < 0.34 ? 'low' : pct < 0.67 ? 'medium' : 'high';
  return { xpAmount, swagger, minXp, maxXp };
}

/**
 * Cheap detector — word-bounded case-insensitive "yassato" match in the
 * raw player action. No typo tolerance on purpose (avoids false positives
 * on unrelated foreign names).
 */
export function mentionsYassato(playerAction) {
  if (typeof playerAction !== 'string' || !playerAction) return false;
  return /\byassato\b/i.test(playerAction);
}

/**
 * Cooldown check — returns true if any of the last 5 persisted scenes
 * already fired a cameo (marked via stateChanges._yassatoCameo).
 */
export async function isYassatoCameoOnCooldown(campaignId) {
  const recent = await prisma.campaignScene.findMany({
    where: { campaignId },
    orderBy: { sceneIndex: 'desc' },
    take: COOLDOWN_WINDOW_SCENES,
    select: { stateChanges: true },
  });
  return recent.some((row) => row?.stateChanges?._yassatoCameo === true);
}

// ── Deterministic fallback variants (used on nano timeout / error) ──
//
// Each variant has an entrance + 3 snark lines (one per swagger tier) + an
// imageTag. Swagger scales with the XP amount Yassato drops: low = ironic,
// half-embarrassed; medium = normal Yassato; high = full zawadiacki swagger
// ("bierze dzieci za rękę jak własne", chełpliwie) with much larger XP pot.

const FALLBACK_VARIANTS = [
  {
    entrance:
      'Coś pęka nad wami. Z dachu sąsiedniego budynku — albo z najbliższego drzewa, bo Yassato nie rozróżnia — zjeżdża głową w dół po niewidzialnej nitce, jak bardzo profesjonalny pająk w czarnym stroju.',
    lineByTier: {
      low: 'Modliłeś się? Dobrze, że ktoś odbiera. Masz {xp} XP, nie wydaj wszystkiego naraz.',
      medium: 'Modlitwa dotarła. Zabieram ci od siebie {xp} XP. Nie, nie dziękuj mi, dziękuj swojej jakości modlitwy — była przeciętna.',
      high: 'SŁUCHAJ MNIE! Przyniosłem CI {xp} PUNKTÓW DOŚWIADCZENIA, bo dziś jestem w formie, bo dziś jestem HOJNY jak cesarski poborca po trzecim piwie. Ciesz się, śmiertelniku, i pamiętaj to imię: YASSATO.',
    },
    imageTag: 'ninja descending upside down from rooftop on silk thread, comedic entrance',
  },
  {
    entrance:
      'Z kanału burzowego tuż obok wyskakuje pokrywa. Wystaje spod niej ręka w czarnej rękawicy, a za nią Yassato — lekko wilgotny, z liściem na ramieniu, jakby właśnie wracał ze spotkania rady miejskiej szczurów.',
    lineByTier: {
      low: 'Wiesz, że to była modlitwa w strefie kanalizacyjnej? I tak przyszedłem. Masz {xp} XP, filantropia mnie wykończy.',
      medium: 'Szczury przekazały. Przyniosłem {xp} XP, minus podatek zapachowy. To i tak więcej, niż zasłużyłeś.',
      high: 'Widziałeś? WIDZIAŁEŚ? Wyszedłem Z KANAŁU jak smok z jamy, z {xp} punktami doświadczenia W KIESZENI, i nie zmoczyłem nawet jednego liścia. Pokaż mi to kto inny. No właśnie. Bierz.',
    },
    imageTag: 'ninja climbing out of sewer manhole with leaf on shoulder, comedic',
  },
  {
    entrance:
      'Odsuwasz rękaw żeby się podrapać. Z fałdy materiału wypada coś wielkości palca — Yassato, złożony w zgrabną origami-ninję. Rozkłada się z trzaskiem papieru do pełnej wielkości tuż obok ciebie.',
    lineByTier: {
      low: 'Mieszkam tam od tygodnia. Czystość jak czystość, ale dzisiaj pachnie modlitwą. Masz {xp} XP, zacznij używać mydła.',
      medium: 'Obserwuję cię od trzech dni. Trzy dni, {xp} XP, ani razu się nie umyłeś. Ty zbieraj, ja idę kąpać się w mgle.',
      high: 'Z RĘKAWA! Z RĘKAWA WYSZEDŁEM! I jeszcze niosę ci {xp} punktów doświadczenia, ręcznie zwinięte, własną stopą podpisane. Bohaterowie opowiadają takie rzeczy wnukom, a ty to MASZ teraz, za friko.',
    },
    imageTag: 'tiny ninja unfolding from sleeve into full size, paper origami effect, comedic',
  },
  {
    entrance:
      'Latarnia obok was nagle mruga. Potem jeszcze raz. Po trzecim mrugnięciu schodzi z niej Yassato i strząsa z siebie ćmę, jakby nic się nie stało. „Zmiana kończy się za dwie minuty", rzuca w bok do nikogo.',
    lineByTier: {
      low: 'Dorabiam jako oświetlenie uliczne, kiedy budżet zemsty jest napięty. Masz {xp} XP. Proszę, nie każ mi wracać na słupek.',
      medium: 'Świeciłem tu całą noc, widziałem twoją modlitwę, widziałem też gorsze rzeczy. Dostajesz {xp} XP i radę: nie módl się w świetle latarń.',
      high: 'BYŁEM LATARNIĄ, mój drogi, i oświetlałem CAŁĄ DZIELNICĘ gdy ty bełkotałeś moje imię. W podzięce niosę ci {xp} punktów doświadczenia i autograf świetlny na twoim czole. Patrz, jak miasto bez mnie gaśnie — to moja wizytówka.',
    },
    imageTag: 'ninja stepping off a lamp post disguised as streetlight, moth flying off, comedic night scene',
  },
  {
    entrance:
      'Z przechodzącego obok worka ryżu wysypuje się kilka ziaren, a zaraz potem cały worek eksploduje — w środku siedział Yassato, zwinięty jak kot z ambicją. Otrzepuje się, wypluwa ziarnko ryżu, kiwa ci głową.',
    lineByTier: {
      low: 'Podróżuję ekonomicznie. Słyszałem cię z worka, akustyka w zbożu jest niesamowita. Masz {xp} XP. Nie chwal się.',
      medium: 'Worek był tańszy niż dyliżans, a {xp} XP masz i tak. Podziękowanie odbiorę następnym razem, w formie zupy.',
      high: 'PODRÓŻOWAŁEM ryżem, drogi. RYŻEM. Z trzech prowincji, zaklejony ziarnem, bo dla mnie i ciebie żadna trasa nie jest za długa — a teraz łap {xp} punktów doświadczenia, bo Yassato dostarcza, nawet jak go nikt nie zamawiał, zwłaszcza gdy go nikt nie zamawiał.',
    },
    imageTag: 'ninja bursting out of rice sack, grains flying, comedic surprise',
  },
];

function pickFallback() {
  return FALLBACK_VARIANTS[Math.floor(Math.random() * FALLBACK_VARIANTS.length)];
}

function buildSceneResult({ entrance, line, imageTag, xpAmount, swagger }) {
  const handoverText = swagger === 'high'
    ? `Yassato podchodzi jak cesarz po swoje, klepie cię w ramię z hukiem i teatralnym gestem wręcza ci ${xpAmount} punktów doświadczenia — cała ulica musi to zobaczyć.`
    : swagger === 'medium'
      ? `Yassato podchodzi niespiesznie, wciska ci w dłoń ${xpAmount} punktów doświadczenia i spogląda z łagodną wyższością.`
      : `Yassato podchodzi cicho, wciska ci w dłoń ${xpAmount} punktów doświadczenia i unika kontaktu wzrokowego.`;

  const exitText = swagger === 'high'
    ? 'Odwraca się, poprawia szarfę, znika w obłoku dymu który sam sobie rozrzucił. Gdzieś z dachu słychać jeszcze jego śmiech.'
    : 'Po chwili już go nie ma. Był tu w ogóle?';

  return {
    narrative: `${entrance}\n\n${handoverText} „${line}" ${exitText}`,
    dialogueSegments: [
      { type: 'narration', text: entrance },
      { type: 'narration', text: handoverText },
      { type: 'dialogue', character: 'Yassato', gender: 'male', text: line },
      { type: 'narration', text: exitText },
    ],
    scenePacing: 'cutscene',
    suggestedActions: [
      'Patrzę za Yassato i próbuję zrozumieć co się właśnie stało',
      'Sprawdzam rękaw / dach / latarnię w poszukiwaniu drugiego Yassato',
      'Mówię głośno: "Dziękuję, Yassato."',
    ],
    atmosphere: {
      weather: 'clear',
      particles: swagger === 'high' ? 'sparks' : 'none',
      mood: 'chaotic',
      lighting: 'natural',
      transition: 'dissolve',
    },
    imagePrompt: `${imageTag}, dark fantasy world, protagonist reacting with confusion, cinematic`,
    soundEffect: swagger === 'high'
      ? 'dramatic whoosh, theatrical flourish, distant laugh'
      : 'quick whoosh, soft thud, silence',
    musicPrompt: null,
    questOffers: [],
    cutscene: null,
    dilemma: null,
    creativityBonus: 0,
    stateChanges: {
      xp: xpAmount,
      timeAdvance: { hoursElapsed: 0.1 },
      _yassatoCameo: true,
    },
    dialogueIfQuestTargetCompleted: null,
  };
}

function buildFallbackSceneResult({ xpAmount, swagger }) {
  const variant = pickFallback();
  const lineTpl = variant.lineByTier[swagger] || variant.lineByTier.medium;
  const line = lineTpl.replace('{xp}', String(xpAmount));
  return buildSceneResult({
    entrance: variant.entrance,
    line,
    imageTag: variant.imageTag,
    xpAmount,
    swagger,
  });
}

// ── Nano call ──

const SWAGGER_DESCRIPTIONS = {
  low: 'NISKI poziom zawadiactwa — Yassato jest dziś oszczędny w słowach, lekko zakłopotany małą hojnością, rzuca suchą ironią. Ton: cichy, ironiczny, jakby sam się wstydził.',
  medium: 'ŚREDNI poziom zawadiactwa — standardowy Yassato: pewny siebie, ukąśliwy, trochę chełpliwy, ale jeszcze bez teatru. Ton: stand-up, lekko arogancki.',
  high: 'WYSOKI poziom zawadiactwa — Yassato dziś promienieje zadufaniem, daje ogromną sumę doświadczenia i MUSI to skomentować. Teatralnie, chełpliwie, przypomina graczowi swoje imię, lubuje się w swoim geście, mówi o sobie w wielkich literach. Ton: cesarz w stroju komedianta, DUŻE GESTY.',
};

function buildNanoPrompts({ playerAction, xpAmount, swagger }) {
  const system = `Jesteś scenarzystą krótkich, absurdalnych scenek komediowych do mrocznego RPG. Twoim zadaniem jest zbudować CAMEO postaci Yassato — ninja-agenta-mściciela-filantropa. Scenka ma być śmieszna, nie dramatyczna, Yassato ma się pojawić w sposób absurdalny, dać graczowi konkretną liczbę punktów doświadczenia i rzucić JEDNĄ ukąśliwą kwestię — o tonie zadanym przez "swagger level". Odpowiadasz WYŁĄCZNIE poprawnym JSON-em, bez żadnego dodatkowego tekstu.`;

  const user = `Kontekst: gracz właśnie wpisał akcję zawierającą imię Yassato:
"${playerAction.slice(0, 300)}"

Yassato to ninja-agent-mściciel-filantrop. Pojawia się obok gracza w absurdalny sposób (przykłady inspiracji, NIE kopiuj dosłownie: zjeżdża z dachu głową w dół jak pająk, wyłazi z kanalizacji, wypada graczowi z rękawa, dziś pracuje jako latarnia, wyskakuje z worka ryżu, wychodzi z beczki z soloną rzepą, okazuje się że był drugą połową ławki, itp.). Wymyśl JEDNO świeże pojawienie się — albo wariację znanego, albo coś nowego. Potem Yassato podchodzi do gracza, wciska mu dokładnie ${xpAmount} punktów doświadczenia i rzuca JEDNĄ krótką, ukąśliwą kwestię. Następnie znika.

WAŻNE — poziom zawadiactwa: "${swagger}".
${SWAGGER_DESCRIPTIONS[swagger] || SWAGGER_DESCRIPTIONS.medium}
Im większa liczba XP (dziś: ${xpAmount}), tym bardziej zawadiacki, teatralny i chełpliwy powinien być Yassato — zarówno w "entrance" (spektakularne wejście, dramatyczne detale), jak i w "snark".

Zasady:
- maksymalnie 2 krótkie akapity narracji + 1 linijka dialogu Yassato
- po polsku, lekki tonacja, absurd > powaga
- Yassato jest gender: "male"
- snark MUSI zawierać liczbę "${xpAmount}" (dosłownie tę cyfrę) oraz słowo "XP" lub "doświadczenia"
- w akcjach sugerowanych NIE proponuj walki ani atakowania Yassato
- imagePrompt po angielsku, tagi rozdzielone przecinkami (6-12 tagów), konkretne rzeczowniki + przymiotniki

Zwróć WYŁĄCZNIE JSON w tym kształcie (bez komentarzy):
{
  "entrance": "1-2 zdania po polsku opisujące absurdalne pojawienie się Yassato (ton dopasowany do swagger level)",
  "snark": "1 zdanie po polsku zawierające liczbę ${xpAmount} i słowo XP/doświadczenia — ton dopasowany do swagger level",
  "suggestedActions": ["akcja 1 (PL, 1 osoba)", "akcja 2", "akcja 3"],
  "imagePrompt": "comma-separated ENGLISH tags for SDXL"
}`;

  return { system, user };
}

/**
 * Generate the cameo scene. Always returns a valid sceneResult — nano failure
 * falls back to a pre-written variant so the player is never left hanging.
 *
 * XP reward is rolled from `currentCharacterXp` (1/8..1/2 of current XP, min 1),
 * and the "swagger" tier (low/medium/high) derived from the roll drives both
 * the nano prompt tone AND the fallback variant's line tier. The MORE XP
 * Yassato brings, the MORE zawadiacki he is.
 */
export async function generateYassatoCameoScene({
  playerAction,
  currentCharacterXp = 0,
  provider = 'openai',
  userApiKeys = null,
  llmNanoTimeoutMs = 8000,
} = {}) {
  const { xpAmount, swagger } = computeYassatoXpReward(currentCharacterXp);

  try {
    const { system, user } = buildNanoPrompts({ playerAction: playerAction || '', xpAmount, swagger });

    const callPromise = callAIJson({
      provider,
      modelTier: 'nano',
      systemPrompt: system,
      userPrompt: user,
      maxTokens: 500,
      temperature: 1.0,
      userApiKeys,
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('yassato nano timeout')), llmNanoTimeoutMs),
    );
    const { text } = await Promise.race([callPromise, timeoutPromise]);

    const parsed = parseJsonOrNull(text);
    const entrance = typeof parsed?.entrance === 'string' ? parsed.entrance.trim() : '';
    const snark = typeof parsed?.snark === 'string' ? parsed.snark.trim() : '';
    const rawActions = Array.isArray(parsed?.suggestedActions) ? parsed.suggestedActions : [];
    const imagePrompt = typeof parsed?.imagePrompt === 'string' && parsed.imagePrompt.trim()
      ? parsed.imagePrompt.trim()
      : 'ninja in absurd cameo situation, dark fantasy, comedic';

    if (!entrance || !snark) {
      log.warn({ text: (text || '').slice(0, 200) }, 'yassato nano returned unusable payload; using fallback');
      return buildFallbackSceneResult({ xpAmount, swagger });
    }

    const suggestedActions = rawActions
      .filter((a) => typeof a === 'string' && a.trim())
      .map((a) => a.trim().slice(0, 120))
      .slice(0, 3);
    while (suggestedActions.length < 3) {
      const backup = [
        'Patrzę za Yassato',
        'Sprawdzam rękaw / dach / latarnię w poszukiwaniu drugiego Yassato',
        'Mówię głośno: "Dziękuję, Yassato."',
      ];
      suggestedActions.push(backup[suggestedActions.length]);
    }

    const handoverText = swagger === 'high'
      ? `Yassato podchodzi jak cesarz po swoje, klepie cię w ramię z hukiem i teatralnym gestem wręcza ci ${xpAmount} punktów doświadczenia — cała ulica musi to zobaczyć.`
      : swagger === 'medium'
        ? `Yassato podchodzi niespiesznie, wciska ci w dłoń ${xpAmount} punktów doświadczenia i spogląda z łagodną wyższością.`
        : `Yassato podchodzi cicho, wciska ci w dłoń ${xpAmount} punktów doświadczenia i unika kontaktu wzrokowego.`;

    const exitText = swagger === 'high'
      ? 'Odwraca się, poprawia szarfę, znika w obłoku dymu który sam sobie rozrzucił. Gdzieś z dachu słychać jeszcze jego śmiech.'
      : 'Po chwili już go nie ma.';

    return {
      narrative: `${entrance}\n\n${handoverText} „${snark}" ${exitText}`,
      dialogueSegments: [
        { type: 'narration', text: entrance },
        { type: 'narration', text: handoverText },
        { type: 'dialogue', character: 'Yassato', gender: 'male', text: snark },
        { type: 'narration', text: exitText },
      ],
      scenePacing: 'cutscene',
      suggestedActions,
      atmosphere: {
        weather: 'clear',
        particles: swagger === 'high' ? 'sparks' : 'none',
        mood: 'chaotic',
        lighting: 'natural',
        transition: 'dissolve',
      },
      imagePrompt: imagePrompt.slice(0, 400),
      soundEffect: swagger === 'high'
        ? 'dramatic whoosh, theatrical flourish, distant laugh'
        : 'quick whoosh, soft thud, silence',
      musicPrompt: null,
      questOffers: [],
      cutscene: null,
      dilemma: null,
      creativityBonus: 0,
      stateChanges: {
        xp: xpAmount,
        timeAdvance: { hoursElapsed: 0.1 },
        _yassatoCameo: true,
      },
      dialogueIfQuestTargetCompleted: null,
    };
  } catch (err) {
    log.warn({ err: err?.message }, 'yassato nano failed; using deterministic fallback');
    return buildFallbackSceneResult({ xpAmount, swagger });
  }
}
