// World seed — canonical hand-authored starter world.
//
// Idempotent DB seed that establishes the anchor for every campaign (classic
// and Living World alike):
//   • Capital **Yeralden** at (0,0) with 11 sublocations and 13 named NPCs
//   • Village **Świetłogaj** (NE, drwale) with 2 sublocations and 2 NPCs
//   • Village **Kamionka Stara** (SW, rolnicy) with 2 sublocations and 2 NPCs
//   • Wilderness, ruins, dungeons, roadside POI scattered on the 10×10 grid
//   • Bidirectional roads from each settlement to its nearest neighbour
//   • One starter `WorldLoreSection` (slug="main")
//
// Every canonical location seeded here is `isCanonical=true`. AI-generated
// runtime locations stay `isCanonical=false` (see `processStateChanges.js`
// and the Round A fog-of-war split in `userDiscoveryService.js`).
//
// Pantheon (lore, no faction tags):
//   Serneth  — bóg życia (good, worshipped in villages)
//   Yeriala  — bogini słońca (good, worshipped in cities, capital temple)
//   Ferathon — bóg śmierci (evil, hidden cult)
//
// Sub-grid coords (`subGridX/subGridY`) are authored for every sublocation so
// the Round C drill-down map has deterministic slots. Capital sub-grid is
// 10×10 (roomy for 11 entries); village sub-grid is 5×5.
//
// The seed uses upsert-by-canonicalName / canonicalId so re-running is safe.
// It does NOT touch campaigns, user data, or existing WorldLocations/NPCs that
// are unrelated to the seed's canonical names. Safe to run on every boot.

import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { upsertEdge } from '../services/livingWorld/travelGraph.js';
import { getTemplate } from '../services/livingWorld/settlementTemplates.js';
import { batchBackfillMissing } from '../services/livingWorld/ragService.js';
import { buildNPCEmbeddingText, buildLocationEmbeddingText } from '../services/embeddingService.js';

const log = childLogger({ module: 'seedWorld' });

const REGION = 'heartland';
const CAPITAL_NAME = 'Yeralden';

// ─────────────────────────────────────────────────────────────
// Sublocation definitions — 11 children under Yeralden
// Sub-grid: 10×10. Coords hand-picked so admin map reads clean.
// ─────────────────────────────────────────────────────────────

const SUBLOCATIONS = [
  {
    key: 'palace',
    name: 'Pałac Królewski w Yeralden',
    slotType: 'palace',
    slotKind: 'required',
    description: 'Marmurowa rezydencja króla Yeraldenu. Sala tronowa lśni witrażami ku chwale Yerieli.',
    category: 'palace',
    subGridX: 5, subGridY: 8,
  },
  {
    key: 'grand_temple',
    name: 'Świątynia Yerieli',
    slotType: 'grand_temple',
    slotKind: 'required',
    description: 'Wielka świątynia bogini słońca Yerieli. Złocone kopuły górują nad dachami stolicy.',
    category: 'temple',
    subGridX: 3, subGridY: 6,
  },
  {
    key: 'tavern',
    name: 'Karczma Pod Złotym Słońcem',
    slotType: 'tavern',
    slotKind: 'required',
    description: 'Najsłynniejsza karczma stolicy — punkt zborny kupców, podróżnych i szeptanych plotek.',
    category: 'tavern',
    subGridX: 6, subGridY: 4,
  },
  {
    key: 'market',
    name: 'Wielki Targ w Yeralden',
    slotType: 'market',
    slotKind: 'required',
    description: 'Rozległy plac targowy pełen straganów z towarami z całego królestwa.',
    category: 'market',
    subGridX: 4, subGridY: 3,
  },
  {
    key: 'barracks',
    name: 'Koszary Królewskie',
    slotType: 'barracks',
    slotKind: 'required',
    description: 'Siedziba gwardii królewskiej. Twardy dryl, twarde ściany.',
    category: 'barracks',
    subGridX: 7, subGridY: 7,
  },
  {
    key: 'arena',
    name: 'Arena Chwały',
    slotType: 'arena',
    slotKind: 'optional',
    description: 'Piaszczysty krąg pod otwartym niebem, gdzie adepci walki mierzą się z mistrzami.',
    category: 'arena',
    subGridX: 8, subGridY: 5,
  },
  {
    key: 'academy',
    name: 'Akademia Yerieli',
    slotType: 'academy',
    slotKind: 'optional',
    description: 'Uczelnia prowadzona przez kapłanów Yerieli — tu studiuje się wiedzę, medycynę i alchemię.',
    category: 'academy',
    subGridX: 2, subGridY: 7,
  },
  {
    key: 'library',
    name: 'Wielka Biblioteka Yeralden',
    slotType: 'library',
    slotKind: 'optional',
    description: 'Kolekcja zwojów i ksiąg zgromadzonych przez pokolenia uczonych.',
    category: 'library',
    subGridX: 1, subGridY: 8,
  },
  {
    key: 'shadow_hall',
    name: 'Bractwo Cieni',
    slotType: null,
    slotKind: 'custom',
    description: 'Sekretna siedziba mistrzów skrytych sztuk — dostępna tylko dla wtajemniczonych.',
    category: 'hideout',
    subGridX: 9, subGridY: 2,
  },
  {
    key: 'fortune_cottage',
    name: 'Chatka Wróżbitki Korvii',
    slotType: null,
    slotKind: 'custom',
    description: 'Zakrzywiona chatka na skraju stolicy, przesycona zapachem ziół i kadzidła.',
    category: 'hut',
    subGridX: 0, subGridY: 4,
  },
  {
    key: 'hunter_camp',
    name: 'Obóz Łowców',
    slotType: null,
    slotKind: 'custom',
    description: 'Drewniane zabudowania za bramami miasta, gdzie zbierają się tropiciele i łowcy potworów.',
    category: 'camp',
    subGridX: 8, subGridY: 1,
  },
];

// ─────────────────────────────────────────────────────────────
// Named NPCs — 13 total (ruler, temple, captain, 8 trainers, innkeeper, merchant)
// `category` is the broad bucket used by questgiver pickers (Round A).
// All 5 starter categories are covered: guard, priest, adventurer, commoner, merchant.
// ─────────────────────────────────────────────────────────────

const NAMED_NPCS = [
  {
    canonicalId: 'king_torvan_iv',
    name: 'Król Torvan IV',
    role: 'władca Yeraldenu',
    personality: 'Stanowczy, ceni lojalność ponad talent. Nie lubi zaskoczeń.',
    alignment: 'good',
    location: 'palace',
    category: 'guard', // władca, nominalnie "commoner" wg enuma, ale w dialogu zachowuje się jak dowódca; mapujemy do guard
    baselineKnowledge: [
      'Wie o napięciach z sąsiednimi lennami — baronia Varnhold jawnie wymaga więcej niezależności; król podejrzewa, że stoi za tym ktoś z jego własnego dworu.',
      'Pamięta wojnę o Dolinę Cierni sprzed dwudziestu lat — stracił tam starszego brata; nie mówi o tym, ale temat odbiera osobiście.',
      'Dyskretnie wspiera Akademię — uważa że wyszkolony uczony wart jest dwóch rycerzy, choć publicznie nigdy tego nie powie.',
    ],
  },
  {
    canonicalId: 'arcykaplanka_lyana',
    name: 'Arcykapłanka Lyana',
    role: 'arcykapłanka Yerieli',
    personality: 'Łagodna, mądra, nie traci spokoju nawet w obliczu herezji.',
    alignment: 'good',
    location: 'grand_temple',
    category: 'priest',
    baselineKnowledge: [
      'Zna tekst zakazanego apokryfu Ferathona — kult boga śmierci działa w ukryciu od pokoleń; nikt poza nią i dwoma braćmi w świątyni tego nie wie.',
      'Wierzy że Serneth (bóg życia) i Yeriala (bogini słońca) są w istocie dwoma aspektami jednej siły — to teza pisana przez nią w zaciszu, nigdy nie wygłaszana publicznie.',
      'Pamięta dzień koronacji Torvana IV — błogosławiła go osobiście; uważa go za dobrego człowieka, ale niepewnego władcę.',
    ],
  },
  {
    canonicalId: 'kapitan_gerent',
    name: 'Kapitan Gerent',
    role: 'dowódca gwardii królewskiej',
    personality: 'Szorstki, praktyczny, nie znosi dworskich intryg — woli prostą odpowiedź i dobrze naostrzony miecz.',
    alignment: 'neutral',
    location: 'barracks',
    category: 'guard',
    baselineKnowledge: [
      'Prowadził trzy ekspedycje do dungeonów wokół Yeraldenu — wie dokładnie które z nich są śmiertelne, a które da się oczyścić z dwudziestoma ludźmi.',
      'Zna sekretne przejście z koszar na dziedziniec pałacowy — otworzone tylko w razie zamachu; król o tym wie, Arcykapłanka nie.',
      'Prywatnie gardzi magami bojowymi — raz widział jak jeden spalił własnego sojusznika; od tej pory wymaga strażników-ochroniarzy na każdym rytuale publicznym.',
    ],
  },
  // 8 Skill Masters (Mistrzowie) → adventurer
  {
    canonicalId: 'mistrz_broni_darvok',
    name: 'Mistrz Broni Darvok',
    role: 'trener Walki wręcz, broni jedno- i dwuręcznej, Strzelectwa, Uników, Walki dwiema brońmi, Zastraszania',
    personality: 'Cichy, obserwujący każdy ruch. Mówi tylko to, co konieczne — ale gdy mówi, słucha każdy adept.',
    alignment: 'neutral',
    location: 'arena',
    category: 'adventurer',
  },
  {
    canonicalId: 'mistrz_ciala_ilara',
    name: 'Mistrzyni Ciała Ilara',
    role: 'trenerka Atletyki, Akrobatyki, Jeździectwa',
    personality: 'Energiczna, bezpośrednia, wyznaje zasadę że ciało nie kłamie.',
    alignment: 'good',
    location: 'arena',
    category: 'adventurer',
  },
  {
    canonicalId: 'mistrzyni_retoryki_venadra',
    name: 'Mistrzyni Retoryki Venadra',
    role: 'trenerka Perswazji, Blefu, Handlu, Przywództwa i Występów',
    personality: 'Elokwentna, uśmiechnięta, nigdy nie odsłania więcej niż musi.',
    alignment: 'neutral',
    location: 'market',
    category: 'adventurer',
  },
  {
    canonicalId: 'mistrz_wiedzy_taelor',
    name: 'Mistrz Wiedzy Taelor',
    role: 'trener Wiedzy ogólnej, Wiedzy o potworach, Wiedzy o naturze, Rzemiosła',
    personality: 'Pedantyczny uczony, skarbnica cytatów. Testuje adeptów zagadkami zamiast egzaminem.',
    alignment: 'good',
    location: 'academy',
    category: 'adventurer',
    baselineKnowledge: [
      'Zna legendy o Runach Pierwszej Kowalni — zapomnianym języku magicznym pisanym przez przedludzki lud Iyr. Ruiny wokół Yeraldenu często kryją ich ślady.',
      'Pamięta Wielką Zarazę sprzed osiemdziesięciu lat — jego pradziadek był jednym z trzech medyków, którzy przeżyli; lekcje z tamtego okresu wisi w Akademii w zapieczętowanym manuskrypcie.',
      'Potrafi rozpoznać każde zioło rosnące w promieniu dwóch dni marszu od stolicy, w tym cztery gatunki toksyczne zakazane w aptekach.',
    ],
  },
  {
    canonicalId: 'mistrzyni_medyka_senya',
    name: 'Mistrzyni Medyka Senya',
    role: 'trenerka Medycyny i Alchemii',
    personality: 'Spokojna, cierpliwa, bardziej oddana pacjentom niż polityce Akademii.',
    alignment: 'good',
    location: 'academy',
    category: 'adventurer',
  },
  {
    canonicalId: 'mistrz_cieni_ashen',
    name: 'Mistrz Cieni Ashen',
    role: 'trener Skradania, Otwierania zamków, Kradzieży kieszonkowej, Pułapek i mechanizmów, Spostrzegawczości',
    personality: 'Niewidoczny aż do momentu gdy sam zdecyduje się ujawnić. Sprawdza uczniów, zanim ci go zauważą.',
    alignment: 'neutral',
    location: 'shadow_hall',
    category: 'adventurer',
  },
  {
    canonicalId: 'mistrz_przetrwania_karros',
    name: 'Mistrz Przetrwania Karros',
    role: 'trener Przetrwania, Tropienia, Odporności',
    personality: 'Zgrubiały łowca, mówi krótko, ufa bardziej lasom niż ludziom.',
    alignment: 'neutral',
    location: 'hunter_camp',
    category: 'adventurer',
  },
  {
    canonicalId: 'wrozbitka_korvia',
    name: 'Wróżbitka Korvia',
    role: 'mistrzyni Fartu, Hazardu i Przeczucia',
    personality: 'Stara, przenikliwa, wypowiada zdania tak, że brzmią jak wyrok losu.',
    alignment: 'neutral',
    location: 'fortune_cottage',
    category: 'adventurer',
  },
  // Flavor NPC — innkeeper stays commoner per plan (merchant slot now filled by Dorgun)
  {
    canonicalId: 'karczmarz_tamar',
    name: 'Karczmarz Tamar',
    role: 'gospodarz Karczmy Pod Złotym Słońcem',
    personality: 'Jowialny, pamięta każdą twarz, każdą plotkę i każdy dług.',
    alignment: 'neutral',
    location: 'tavern',
    category: 'commoner',
    baselineKnowledge: [
      'Wie kto z dworzan pije samotnie — lista zmienia się co miesiąc, ale zawsze ktoś jej dotyczy; potrafi wskazać kto jest na krawędzi problemu.',
      'Pamięta każdego najemnika, który przeszedł przez karczmę w ostatnich dwudziestu latach — twarze, imiona, długi, opowieści o wilkołakach w Kamionce i goblinach pod Świetłogajem.',
      'Słyszał plotkę że pod starym kamieniem młyńskim na tyłach karczmy jest schowek kontrabandy z czasów dziadka — nigdy tego nie sprawdził, bo nie chce wiedzieć.',
    ],
  },
  // Round A — fresh merchant. The market previously only housed Venadra
  // (adventurer-bucket trainer); we now guarantee a pure merchant NPC so
  // the 5-category coverage is real.
  {
    canonicalId: 'kupiec_dorgun',
    name: 'Kupiec Dorgun',
    role: 'handlarz dalekich karawan, stały bywalec Wielkiego Targu',
    personality: 'Przebiegły, ale uczciwy w liczbach — lubi rozmawiać cenami i plotkami z trzech krain na raz.',
    alignment: 'neutral',
    location: 'market',
    category: 'merchant',
    baselineKnowledge: [
      'Prowadzi trasy do trzech odległych krain — Varnhold (żelazo), Sołtystwo Mchu (wełna), Wybrzeże Słone (ryby i sól). Wie które trakty są bezpieczne o tej porze roku, a które kontrolują bandyci.',
      'Zna dokładne ceny każdego towaru z tygodnia wstecz w stolicy i wioskach — umie wskazać gdzie gracz przepłaca, a gdzie trafia na okazję.',
      'Ma kontakty w cechu złodziei — nie sam do niego należy, ale zna dwóch fence\'ów na rynku, którzy przyjmą "delikatne" przedmioty bez pytań, za 30% wartości.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Villages around Yeralden — seeded top-level settlements.
// Positions are 1 unit = 1 km from capital at (0,0).
// Village sub-grid is 5×5.
// ─────────────────────────────────────────────────────────────

const VILLAGES = [
  {
    key: 'swietlogaj',
    canonicalName: 'Świetłogaj',
    aliases: ['Leśna Osada', 'Świetlogaj'],
    description:
      'Osada drwali na północno-wschodnich obrzeżach puszczy, około trzech kilometrów od Yeralden. Dymy z ognisk tartaku widać z murów stolicy w zimowe poranki.',
    regionX: 2.5,
    regionY: 2.0,
    sublocations: [
      {
        key: 'tavern',
        name: 'Karczma Pod Złamanym Toporem',
        slotType: 'tavern',
        slotKind: 'required',
        category: 'tavern',
        description:
          'Przysadzista karczma z belkowanym stropem, gdzie drwale piją jak gaszą ogień — szybko i głęboko. Nad paleniskiem wisi połamany topór, którego nikt nie tknął od trzech pokoleń.',
        subGridX: 2, subGridY: 3,
      },
      {
        key: 'sawmill',
        name: 'Tartak Olbrami',
        slotType: null,
        slotKind: 'custom',
        category: 'workshop',
        description:
          'Rodzinny tartak Olbramów: skrzypiące koło wodne, góry świeżo ciętych bali i zapach żywicy niesiony wiatrem aż do karczmy.',
        subGridX: 3, subGridY: 1,
      },
    ],
    npcs: [
      {
        canonicalId: 'soltys_wiltar_olbram',
        name: 'Wiltar Olbram',
        role: 'sołtys Świetłogaju i mistrz drwalski',
        personality:
          'Rozważny, opanowany, ufa tylko ludziom których sprawdził w robocie. Dba o każdą rodzinę w osadzie jak o własną.',
        alignment: 'good',
        location: 'sawmill',
        category: 'commoner',
        baselineKnowledge: [
          'Pamięta wszystkie ataki stworów na osadę z ostatnich piętnastu lat — daty, ofiary, miejsca startu. Widzi wzorzec: coś budzi się w puszczy co 2-3 lata, każdy raz mocniejsze.',
          'Wie że trzy rodziny we wsi wolałyby przenieść się bliżej Yeraldenu, ale nie powiedzą tego głośno — boją się że reszta wsi weźmie to za dezercję.',
          'Ma cichą umowę z łowczynią Eleyą — ona patroluje granice puszczy, on informuje ją o każdym obcym, który pyta o las; żaden król o tym nie wie.',
        ],
      },
      {
        canonicalId: 'tropicielka_eleya',
        name: 'Eleya Tropicielka',
        role: 'łowczyni potworów ze Świetłogaju',
        personality:
          'Cicha, czyta tropy lepiej niż twarze. Nie lubi dworu w Yeralden — woli las, który przynajmniej nie kłamie.',
        alignment: 'neutral',
        location: 'tavern',
        category: 'adventurer',
        baselineKnowledge: [
          'Zna mapę puszczy której nie ma w żadnym archiwum — w tym trzy jaskinie poza oficjalnymi traktami, dwie z widocznymi śladami kultu Ferathona.',
          'Widziała raz istotę której nie potrafiła nazwać — szła na dwóch nogach, pozostawiała ślady podobne do psich, ale zbyt duże. Nie powiedziała nikomu; wraca do tego miejsca raz w roku sprawdzić czy wróciła.',
          'Nie ufa Kapitanowi Gerentowi — uważa że jego ekspedycje wyczerpują teren; czuje że dungeony uzdrowiają się gdy ludzie trzymają się z daleka.',
        ],
      },
    ],
  },
  {
    key: 'kamionka_stara',
    canonicalName: 'Kamionka Stara',
    aliases: ['Kamionka', 'Stara Kamionka'],
    description:
      'Rolnicza osada przy starym kamiennym moście na południowo-zachodnich traktach od Yeralden. Pola pszenicy sięgają aż do skraju traktu, a wieczorem słychać dzwony świątyni Sernetha.',
    regionX: -2.0,
    regionY: -2.5,
    sublocations: [
      {
        key: 'tavern',
        name: 'Karczma Pod Czerwonym Ziarnem',
        slotType: 'tavern',
        slotKind: 'required',
        category: 'tavern',
        description:
          'Wiejska karczma pachnąca chlebem i kminkiem. Na ścianach wiszą snopy ostatnich żniw, a piec chlebowy pali się od świtu do zmierzchu.',
        subGridX: 2, subGridY: 2,
      },
      {
        key: 'church',
        name: 'Świątynia Sernetha w Kamionce',
        slotType: 'church',
        slotKind: 'optional',
        category: 'temple',
        description:
          'Niska kamienna świątynia boga życia Sernetha. Ołtarz okryty kłosami pszenicy, a w niszy leży drewniany sierp — symbol żniw i ofiary.',
        subGridX: 3, subGridY: 3,
      },
    ],
    npcs: [
      {
        canonicalId: 'kaplan_bremys',
        name: 'Bremys Pełnodłonny',
        role: 'kapłan Sernetha w Kamionce Starej',
        personality:
          'Ciepły, uczynny, wierzy że każda dłoń znajdzie robotę u Sernetha. Nieufny wobec kultu Ferathona i szepczących o nim pielgrzymów.',
        alignment: 'good',
        location: 'church',
        category: 'priest',
      },
      {
        canonicalId: 'kupcowa_marola',
        name: 'Marola Stąd',
        role: 'kupcowa traktów z Kamionki Starej',
        personality:
          'Pragmatyczna, każdy interes ma swoją cenę i swój termin. Widzi więcej niż mówi — ale to, co mówi, warto kupić.',
        alignment: 'neutral',
        location: 'tavern',
        category: 'merchant',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Wilderness / ruins / dungeons / roadside POI — 17 new canonical
// tiles scattered across the 10×10 heartland grid. Difficulty grows
// with distance from the capital. `dangerLevel` is hand-authored;
// edges to the parent travel hub inherit the matching difficulty.
// Seed carries only the top-level locations — entering a dungeon
// triggers the existing `dungeonSeedGenerator.js` for its rooms.
// ─────────────────────────────────────────────────────────────

const WILD_LOCATIONS = [
  // ── Dungeons ─────────────────────────────────────────────────
  {
    key: 'ruined_watchtower',
    canonicalName: 'Zrujnowana Wieża Strażnicza',
    description: 'Nieczynna wieża graniczna, od lat zagnieżdżona przez pająki i drobne bestie. Pierwsza próba dla młodych łowców.',
    category: 'dungeon',
    locationType: 'dungeon',
    region: REGION,
    regionX: 1.8,
    regionY: -1.2,
    dangerLevel: 'safe',
    neighborFor: ['edge'],
  },
  {
    key: 'abandoned_mineshaft',
    canonicalName: 'Zapadły Szyb Starowiary',
    description: 'Dawna kopalnia srebra przejęta przez gobliny. Głębiej w korytarzach tli się coś starszego niż goblińska brać.',
    category: 'dungeon',
    locationType: 'dungeon',
    region: REGION,
    regionX: -3.6,
    regionY: 1.4,
    dangerLevel: 'moderate',
  },
  {
    key: 'crypt_of_ferathon',
    canonicalName: 'Krypta Ferathonitów',
    description: 'Zapieczętowana krypta zwolenników boga śmierci. Cisza wewnątrz ma swój rezonans, i ten rezonans pamięta imiona.',
    category: 'dungeon',
    locationType: 'dungeon',
    region: REGION,
    regionX: 3.4,
    regionY: -4.2,
    dangerLevel: 'dangerous',
  },
  {
    key: 'dragon_hollow',
    canonicalName: 'Smocze Zapadlisko',
    description: 'Otwarta czeluść w górach heartlandu. Nikt, kto tam wszedł, nie wrócił w ostatnim pokoleniu — a stara pieśń woła tę bestię po imieniu.',
    category: 'dungeon',
    locationType: 'dungeon',
    region: REGION,
    regionX: -4.5,
    regionY: -4.5,
    dangerLevel: 'deadly',
  },

  // ── Wilderness tiles ─────────────────────────────────────────
  {
    key: 'blackwood_edge',
    canonicalName: 'Skraj Czarnoboru',
    description: 'Ciemny pas starodrzewia, gdzie słońce nie dochodzi w pełni nawet w południe. Miejsce zbioru ziół i zasadzek.',
    category: 'wilderness',
    locationType: 'forest',
    region: REGION,
    regionX: 2.2,
    regionY: 3.5,
    dangerLevel: 'moderate',
  },
  {
    key: 'sunwheat_plains',
    canonicalName: 'Słoneczne Łany',
    description: 'Rozległe pola pszenicy i łąki ciągnące się od Kamionki ku zachodowi. Bezpieczne za dnia, ale nocą pojawiają się mgielne ogniki.',
    category: 'wilderness',
    locationType: 'wilderness',
    region: REGION,
    regionX: -3.0,
    regionY: -0.8,
    dangerLevel: 'safe',
  },
  {
    key: 'stone_tooth_pass',
    canonicalName: 'Przełęcz Kamiennego Zęba',
    description: 'Wąski trakt między dwoma iglicami skalnymi. Wiatr tnie tu jak nóż, a echo niesie głosy, których nikt nie wypowiada.',
    category: 'wilderness',
    locationType: 'mountain',
    region: REGION,
    regionX: -3.8,
    regionY: -3.0,
    dangerLevel: 'dangerous',
  },
  {
    key: 'silverflow_river',
    canonicalName: 'Srebrny Nurt',
    description: 'Szeroka rzeka opływająca wschodnią część heartlandu. Brody zmieniają się z sezonu na sezon, a stare mosty pamiętają jeszcze króla Torvana II.',
    category: 'wilderness',
    locationType: 'wilderness',
    region: REGION,
    regionX: 3.8,
    regionY: 0.8,
    dangerLevel: 'safe',
  },
  {
    key: 'wolfhowl_heath',
    canonicalName: 'Wilcze Pustkowia',
    description: 'Kamieniste wrzosowiska, gdzie wataha przewodzi stadom. Podróżnicy jadą w grupach i nigdy po zmierzchu.',
    category: 'wilderness',
    locationType: 'wilderness',
    region: REGION,
    regionX: 0.5,
    regionY: 4.3,
    dangerLevel: 'moderate',
  },
  {
    key: 'whispering_fens',
    canonicalName: 'Szeptające Trzęsawiska',
    description: 'Mokradła w dolinie nad Srebrnym Nurtem. Bulgoce w bagnach coś, co nie jest wodą, a stare historie mówią o kościach w mule.',
    category: 'wilderness',
    locationType: 'wilderness',
    region: REGION,
    regionX: 4.2,
    regionY: -2.4,
    dangerLevel: 'dangerous',
  },

  // ── Ruins ────────────────────────────────────────────────────
  {
    key: 'old_watch_stones',
    canonicalName: 'Stare Kamienie Strażnicze',
    description: 'Krąg pionowych głazów pozostawiony przez poprzedników ludzi. Runy na nich bledną, ale w pełnię księżyca lśnią własnym światłem.',
    category: 'ruins',
    locationType: 'ruin',
    region: REGION,
    regionX: -1.5,
    regionY: 2.8,
    dangerLevel: 'moderate',
  },
  {
    key: 'broken_aqueduct',
    canonicalName: 'Pęknięty Akwedukt',
    description: 'Resztki kamiennego akweduktu sprzed królestwa. Woda od dawna nie płynie, ale w komorach u podstawy gnieżdżą się przemytnicy.',
    category: 'ruins',
    locationType: 'ruin',
    region: REGION,
    regionX: 2.6,
    regionY: -3.0,
    dangerLevel: 'moderate',
  },
  {
    key: 'drowned_chapel',
    canonicalName: 'Zatopiona Kaplica',
    description: 'Ruiny kaplicy Sernetha zatopione w dolince po wiosennej powodzi. Dach wystaje nad wodę, a na nim siadają wrony, których nikt nie pamięta z młodości.',
    category: 'ruins',
    locationType: 'ruin',
    region: REGION,
    regionX: -2.8,
    regionY: -1.6,
    dangerLevel: 'safe',
  },
  {
    key: 'dead_kings_barrow',
    canonicalName: 'Kurhan Martwego Króla',
    description: 'Rozległy kopiec usypany przed wiekami. Wejście zasypane lawiną, ale kopacze grobów wciąż próbują swojego szczęścia.',
    category: 'ruins',
    locationType: 'ruin',
    region: REGION,
    regionX: 4.0,
    regionY: 2.5,
    dangerLevel: 'dangerous',
  },

  // ── Roadside POI ─────────────────────────────────────────────
  {
    key: 'crossroads_shrine',
    canonicalName: 'Kapliczka na Rozstajach',
    description: 'Drewniana kapliczka Sernetha postawiona przez pielgrzymów. Ktoś zostawia tu świeże polne kwiaty co drugi dzień — nie wiadomo kto.',
    category: 'shrine',
    locationType: 'wilderness',
    region: REGION,
    regionX: -1.0,
    regionY: -1.2,
    dangerLevel: 'safe',
  },
  {
    key: 'wayfarer_camp',
    canonicalName: 'Obóz Wędrowców',
    description: 'Utarta polana przy trakcie na wschód. Kupcy i pielgrzymi rozbijają tu namioty; gości zwykle można spotkać przy ognisku o zmierzchu.',
    category: 'camp',
    locationType: 'camp',
    region: REGION,
    regionX: 1.5,
    regionY: 1.0,
    dangerLevel: 'safe',
  },
  {
    key: 'broken_bridge_watch',
    canonicalName: 'Strażnica Przy Pękniętym Moście',
    description: 'Mała drewniana strażnica w miejscu, gdzie stary most zawalił się w minionej zimie. Pełnią tu wartę zmienni strażnicy z Yeralden.',
    category: 'camp',
    locationType: 'camp',
    region: REGION,
    regionX: -0.8,
    regionY: -3.5,
    dangerLevel: 'safe',
  },
];

// ─────────────────────────────────────────────────────────────
// Roads — auto-built from settlement positions (nearest-neighbour
// between settlements) + an explicit fan-out from the capital to
// every wilderness/dungeon/ruin/POI tile (difficulty = tile's
// dangerLevel, so far tiles stay scary even if the road is short).
// ─────────────────────────────────────────────────────────────

const ROAD_DEFAULTS = {
  terrainType: 'road',
  difficulty: 'safe',
};

function euclideanKm(a, b) {
  const dx = a.regionX - b.regionX;
  const dy = a.regionY - b.regionY;
  return Math.sqrt(dx * dx + dy * dy);
}

// 8-way compass on a +X=E, +Y=N map.
function compassDirection(from, to) {
  const dx = to.regionX - from.regionX;
  const dy = to.regionY - from.regionY;
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return 'E';
  if (deg < 67.5) return 'NE';
  if (deg < 112.5) return 'N';
  if (deg < 157.5) return 'NW';
  if (deg < 202.5) return 'W';
  if (deg < 247.5) return 'SW';
  if (deg < 292.5) return 'S';
  return 'SE';
}

function buildNearestNeighbourRoads(locations) {
  const roads = [];
  const seen = new Set();
  for (const from of locations) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const other of locations) {
      if (other === from) continue;
      const d = euclideanKm(from, other);
      if (d < nearestDist) {
        nearest = other;
        nearestDist = d;
      }
    }
    if (!nearest) continue;
    const key = [from.canonicalName, nearest.canonicalName].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const distance = Number(nearestDist.toFixed(2));
    roads.push({
      from: from.canonicalName,
      to: nearest.canonicalName,
      distance,
      direction: compassDirection(from, nearest),
      ...ROAD_DEFAULTS,
    });
    roads.push({
      from: nearest.canonicalName,
      to: from.canonicalName,
      distance,
      direction: compassDirection(nearest, from),
      ...ROAD_DEFAULTS,
    });
  }
  return roads;
}

function buildWildRoads(capital, wildNodes) {
  // Connect every wild tile to the capital so travel graph has at least one
  // path in. Difficulty reflects the tile's dangerLevel, so the player must
  // pick when to push outward. Distance is straight-line km.
  const roads = [];
  for (const w of wildNodes) {
    const distance = Number(euclideanKm(capital, w).toFixed(2));
    const terrain =
      w.locationType === 'mountain' ? 'mountain'
      : w.locationType === 'forest' ? 'wilderness'
      : w.locationType === 'ruin' ? 'path'
      : w.locationType === 'dungeon' ? 'path'
      : 'road';
    roads.push({
      from: capital.canonicalName,
      to: w.canonicalName,
      distance,
      direction: compassDirection(capital, w),
      terrainType: terrain,
      difficulty: w.dangerLevel || 'safe',
    });
    roads.push({
      from: w.canonicalName,
      to: capital.canonicalName,
      distance,
      direction: compassDirection(w, capital),
      terrainType: terrain,
      difficulty: w.dangerLevel || 'safe',
    });
  }
  return roads;
}

// ─────────────────────────────────────────────────────────────
// Upsert helpers — every canonical upsert carries isCanonical=true
// + dangerLevel + subGrid coords where applicable.
// ─────────────────────────────────────────────────────────────

async function upsertCapital() {
  return prisma.worldLocation.upsert({
    where: { canonicalName: CAPITAL_NAME },
    update: {
      category: 'capital',
      locationType: 'capital',
      region: REGION,
      regionX: 0,
      regionY: 0,
      positionConfidence: 1.0,
      maxKeyNpcs: 70,
      maxSubLocations: 25,
      parentLocationId: null,
      isCanonical: true,
      knownByDefault: true,
      dangerLevel: 'safe',
      displayName: CAPITAL_NAME,
    },
    create: {
      canonicalName: CAPITAL_NAME,
      aliases: ['Stolica', 'Kapitol'],
      description:
        'Słoneczna stolica ludzkiego królestwa. Siedziba tronu, wielkiej świątyni Yerieli i akademii. Z każdej bramy wybiega utwardzona droga w stronę serca kontynentu.',
      category: 'capital',
      locationType: 'capital',
      region: REGION,
      regionX: 0,
      regionY: 0,
      positionConfidence: 1.0,
      maxKeyNpcs: 70,
      maxSubLocations: 25,
      parentLocationId: null,
      isCanonical: true,
      knownByDefault: true,
      dangerLevel: 'safe',
      displayName: CAPITAL_NAME,
    },
  });
}

async function upsertSublocation(parent, sub) {
  const parentX = parent?.regionX ?? 0;
  const parentY = parent?.regionY ?? 0;
  return prisma.worldLocation.upsert({
    where: { canonicalName: sub.name },
    update: {
      parentLocationId: parent.id,
      locationType: 'interior',
      slotType: sub.slotType,
      slotKind: sub.slotKind,
      category: sub.category,
      region: REGION,
      regionX: parentX,
      regionY: parentY,
      positionConfidence: 1.0,
      isCanonical: true,
      dangerLevel: 'safe',
      subGridX: sub.subGridX ?? null,
      subGridY: sub.subGridY ?? null,
      displayName: sub.name,
    },
    create: {
      canonicalName: sub.name,
      aliases: [],
      description: sub.description,
      category: sub.category,
      locationType: 'interior',
      parentLocationId: parent.id,
      slotType: sub.slotType,
      slotKind: sub.slotKind,
      region: REGION,
      regionX: parentX,
      regionY: parentY,
      positionConfidence: 1.0,
      isCanonical: true,
      dangerLevel: 'safe',
      subGridX: sub.subGridX ?? null,
      subGridY: sub.subGridY ?? null,
      displayName: sub.name,
    },
  });
}

async function upsertVillage(village) {
  const template = getTemplate('village');
  return prisma.worldLocation.upsert({
    where: { canonicalName: village.canonicalName },
    update: {
      category: 'village',
      locationType: 'village',
      region: REGION,
      regionX: village.regionX,
      regionY: village.regionY,
      positionConfidence: 1.0,
      maxKeyNpcs: template.maxKeyNpcs,
      maxSubLocations: template.maxSubLocations,
      parentLocationId: null,
      isCanonical: true,
      knownByDefault: false,
      dangerLevel: 'safe',
      displayName: village.canonicalName,
    },
    create: {
      canonicalName: village.canonicalName,
      aliases: village.aliases || [],
      description: village.description,
      category: 'village',
      locationType: 'village',
      region: REGION,
      regionX: village.regionX,
      regionY: village.regionY,
      positionConfidence: 1.0,
      maxKeyNpcs: template.maxKeyNpcs,
      maxSubLocations: template.maxSubLocations,
      parentLocationId: null,
      isCanonical: true,
      knownByDefault: false,
      dangerLevel: 'safe',
      displayName: village.canonicalName,
    },
  });
}

async function upsertWildLocation(loc) {
  return prisma.worldLocation.upsert({
    where: { canonicalName: loc.canonicalName },
    update: {
      category: loc.category,
      locationType: loc.locationType,
      region: loc.region || REGION,
      regionX: loc.regionX,
      regionY: loc.regionY,
      positionConfidence: 1.0,
      parentLocationId: null,
      isCanonical: true,
      knownByDefault: false,
      dangerLevel: loc.dangerLevel || 'safe',
      displayName: loc.canonicalName,
    },
    create: {
      canonicalName: loc.canonicalName,
      aliases: [],
      description: loc.description,
      category: loc.category,
      locationType: loc.locationType,
      region: loc.region || REGION,
      regionX: loc.regionX,
      regionY: loc.regionY,
      positionConfidence: 1.0,
      parentLocationId: null,
      isCanonical: true,
      knownByDefault: false,
      dangerLevel: loc.dangerLevel || 'safe',
      displayName: loc.canonicalName,
    },
  });
}

async function upsertNpc(npc, locationId) {
  const knownLocationIds = Array.isArray(npc.knownLocationIds) ? npc.knownLocationIds : [];

  // Stage 1 — hand-authored baseline knowledge seeded into `WorldNPC.knowledgeBase`.
  // Shape: [{ content, source: 'baseline' }]. Stage 2 (Phase 11 lived experience)
  // will append entries with `source: 'campaign:{id}'` post-campaign.
  const baselineEntries = Array.isArray(npc.baselineKnowledge)
    ? npc.baselineKnowledge.map((content) => ({ content, source: 'baseline' }))
    : [];

  // Merge-preserving update: on reseed we REPLACE the baseline slice only.
  // Entries with any other `source` (future lived experience from Phase 11)
  // are preserved so seed reboot doesn't wipe campaign-promoted memories.
  const existing = await prisma.worldNPC.findUnique({
    where: { canonicalId: npc.canonicalId },
    select: { knowledgeBase: true },
  });
  const existingArr = Array.isArray(existing?.knowledgeBase) ? existing.knowledgeBase : [];
  const preservedEntries = existingArr.filter((e) => e && e.source && e.source !== 'baseline');
  const knowledgeBase = [...baselineEntries, ...preservedEntries];

  return prisma.worldNPC.upsert({
    where: { canonicalId: npc.canonicalId },
    update: {
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      alignment: npc.alignment,
      currentLocationId: locationId,
      homeLocationId: locationId,
      keyNpc: true,
      alive: true,
      category: npc.category || 'commoner',
      knownLocationIds,
      knowledgeBase,
    },
    create: {
      canonicalId: npc.canonicalId,
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      alignment: npc.alignment,
      currentLocationId: locationId,
      homeLocationId: locationId,
      keyNpc: true,
      alive: true,
      category: npc.category || 'commoner',
      knownLocationIds,
      knowledgeBase,
    },
  });
}

async function upsertMainLoreSection() {
  return prisma.worldLoreSection.upsert({
    where: { slug: 'main' },
    update: {
      // Title stays as-is on re-seed (admin may have edited it), but we
      // guarantee the slug exists so scene-gen always has a lore preamble
      // entry to concat from.
    },
    create: {
      slug: 'main',
      title: 'Świat Yeralden',
      content: '',
      order: 0,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// NPC explicit knownLocationIds — Phase 2b. Key NPCs get
// authorized knowledge beyond their implicit 1-hop radius.
// Resolved after all locations exist so we can lookup by name.
// ─────────────────────────────────────────────────────────────

const NPC_KNOWLEDGE_SEED = [
  {
    canonicalId: 'kapitan_gerent',
    locations: [
      'Koszary Królewskie',
      'Zrujnowana Wieża Strażnicza',
      'Zapadły Szyb Starowiary',
      'Krypta Ferathonitów',
      'Smocze Zapadlisko',
      'Strażnica Przy Pękniętym Moście',
      'Kurhan Martwego Króla',
    ],
  },
  {
    canonicalId: 'tropicielka_eleya',
    locations: [
      'Skraj Czarnoboru',
      'Słoneczne Łany',
      'Przełęcz Kamiennego Zęba',
      'Srebrny Nurt',
      'Wilcze Pustkowia',
      'Szeptające Trzęsawiska',
      'Zapadły Szyb Starowiary',
    ],
  },
  {
    canonicalId: 'arcykaplanka_lyana',
    locations: [
      'Kapliczka na Rozstajach',
      'Zatopiona Kaplica',
      'Stare Kamienie Strażnicze',
      'Krypta Ferathonitów',
    ],
  },
  {
    canonicalId: 'king_torvan_iv',
    locations: [
      'Świetłogaj',
      'Kamionka Stara',
      'Zrujnowana Wieża Strażnicza',
      'Zapadły Szyb Starowiary',
      'Krypta Ferathonitów',
      'Smocze Zapadlisko',
      'Pęknięty Akwedukt',
      'Kurhan Martwego Króla',
      'Strażnica Przy Pękniętym Moście',
    ],
  },
  {
    canonicalId: 'soltys_wiltar_olbram',
    locations: [
      'Skraj Czarnoboru',
      'Kamionka Stara',
      'Obóz Wędrowców',
      'Kapliczka na Rozstajach',
    ],
  },
  {
    canonicalId: 'karczmarz_tamar',
    locations: [
      'Świetłogaj',
      'Kamionka Stara',
      'Obóz Wędrowców',
      'Kapliczka na Rozstajach',
      'Strażnica Przy Pękniętym Moście',
    ],
  },
];

async function seedNpcKnowledge(locationByName) {
  // Resolve each NPC's hinted locations → location ids, persist as JSON array.
  // Missing names are dropped silently (pre-existing DB may not have every
  // location yet — idempotent re-seeding tolerates partials).
  let updated = 0;
  for (const entry of NPC_KNOWLEDGE_SEED) {
    const ids = entry.locations
      .map((name) => locationByName[name]?.id)
      .filter(Boolean);
    if (!ids.length) continue;
    try {
      await prisma.worldNPC.update({
        where: { canonicalId: entry.canonicalId },
        data: { knownLocationIds: ids },
      });
      updated += 1;
    } catch (err) {
      log.warn({ err: err?.message, canonicalId: entry.canonicalId }, 'NPC knownLocationIds seed failed');
    }
  }
  return updated;
}

// ─────────────────────────────────────────────────────────────
// Seed execution
// ─────────────────────────────────────────────────────────────

/**
 * Run the world seed. Idempotent — upsert on every canonicalName/canonicalId.
 * Returns a summary of rows touched.
 */
// Round E Phase 9 — backfill WorldEntityEmbedding for every canonical NPC
// and WorldLocation in the seed. Runs once per boot after the seed upserts
// land — `batchBackfillMissing` skips any entity that already has a row.
// Degrades gracefully when OPENAI_API_KEY is unset (local dev).
async function backfillRagEmbeddings(locationByName) {
  if (!process.env.OPENAI_API_KEY) {
    log.info('RAG backfill skipped — OPENAI_API_KEY not set');
    return { skipped: true, reason: 'no_openai_key' };
  }

  try {
    // Canonical NPCs — name+role+personality. Seed inserts are scoped by
    // canonicalId so fetching `alive=true` catches everything seeded.
    const npcs = await prisma.worldNPC.findMany({
      where: { alive: true },
      select: { id: true, name: true, role: true, personality: true },
    });
    const npcStats = await batchBackfillMissing('npc', npcs, buildNPCEmbeddingText);

    // Canonical WorldLocations only — non-canonical entries belong to a
    // campaign and are indexed at creation time in processStateChanges.
    const locations = await prisma.worldLocation.findMany({
      where: { isCanonical: true },
      select: {
        id: true,
        canonicalName: true,
        displayName: true,
        locationType: true,
        region: true,
        description: true,
      },
    });
    const locStats = await batchBackfillMissing('location', locations, buildLocationEmbeddingText);

    return { npcs: npcStats, locations: locStats };
  } catch (err) {
    log.warn({ err: err?.message }, 'RAG backfill failed — continuing without embeddings');
    return { error: err?.message };
  }
}

export async function seedWorld() {
  // Cold-start guard. The seed is idempotent (upserts) but still does ~O(100)
  // Mongo round-trips per boot. On Cloud Run revisions 2+ the canonical world
  // is already present and re-running adds ~1s to cold start for no change.
  // Set SKIP_WORLD_SEED=true on any revision where the schema hasn't added
  // new seed content since the last successful seed. Leave unset (or explicit
  // "false") on the first deploy of new seed data.
  if (String(process.env.SKIP_WORLD_SEED || '').toLowerCase() === 'true') {
    log.info('SKIP_WORLD_SEED=true — skipping world seed');
    return { skipped: true };
  }

  try {
    const capital = await upsertCapital();

    const subByKey = {};
    for (const sub of SUBLOCATIONS) {
      const row = await upsertSublocation(capital, sub);
      subByKey[sub.key] = row;
    }

    let npcsUpserted = 0;
    for (const npc of NAMED_NPCS) {
      const sub = subByKey[npc.location];
      const locationId = sub?.id || capital.id;
      await upsertNpc(npc, locationId);
      npcsUpserted += 1;
    }

    const locationByName = { [CAPITAL_NAME]: capital };
    // Capital sublocations are also addressable by canonicalName.
    for (const sub of Object.values(subByKey)) {
      if (sub?.canonicalName) locationByName[sub.canonicalName] = sub;
    }

    let villageSubCount = 0;
    let villageNpcCount = 0;

    for (const village of VILLAGES) {
      const villageRow = await upsertVillage(village);
      locationByName[village.canonicalName] = villageRow;

      const vSubByKey = {};
      for (const sub of village.sublocations) {
        const row = await upsertSublocation(villageRow, sub);
        vSubByKey[sub.key] = row;
        if (row?.canonicalName) locationByName[row.canonicalName] = row;
        villageSubCount += 1;
      }

      for (const npc of village.npcs) {
        const sub = vSubByKey[npc.location];
        const locationId = sub?.id || villageRow.id;
        await upsertNpc(npc, locationId);
        villageNpcCount += 1;
      }
    }

    // Wild tiles — top-level dungeons, wilderness, ruins, POI.
    const wildRows = [];
    for (const loc of WILD_LOCATIONS) {
      const row = await upsertWildLocation(loc);
      wildRows.push({ ...loc, id: row.id });
      locationByName[loc.canonicalName] = row;
    }

    // Phase 2b — NPC explicit knowledge (requires all locations to exist).
    const npcKnowledgeUpdated = await seedNpcKnowledge(locationByName);

    // Roads. Settlement-to-settlement nearest-neighbour + capital→wild fan-out.
    const settlementRows = [capital, ...VILLAGES.map((v) => locationByName[v.canonicalName])].filter(Boolean);
    const settlementRoads = buildNearestNeighbourRoads(settlementRows);
    const wildRoads = buildWildRoads(capital, wildRows);
    const roads = [...settlementRoads, ...wildRoads];

    let roadsUpserted = 0;
    for (const road of roads) {
      const fromLoc = locationByName[road.from];
      const toLoc = locationByName[road.to];
      if (!fromLoc || !toLoc) {
        log.warn({ from: road.from, to: road.to }, 'Road skipped — location not found');
        continue;
      }
      const result = await upsertEdge({
        fromLocationId: fromLoc.id,
        toLocationId: toLoc.id,
        distance: road.distance,
        difficulty: road.difficulty,
        terrainType: road.terrainType,
        direction: road.direction,
      });
      if (result) roadsUpserted += 1;
    }

    const loreSection = await upsertMainLoreSection();

    // Round E Phase 9 — index canonical NPCs + locations into the RAG store.
    // Idempotent: `batchBackfillMissing` skips entities that already have an
    // embedding row. Skipped entirely when OPENAI_API_KEY is absent (dev
    // workflows without LLM keys still get a working seed, just no RAG).
    const ragStats = await backfillRagEmbeddings(locationByName);

    log.info(
      {
        capital: CAPITAL_NAME,
        sublocations: SUBLOCATIONS.length,
        npcs: npcsUpserted,
        villages: VILLAGES.length,
        villageSubs: villageSubCount,
        villageNpcs: villageNpcCount,
        wildLocations: WILD_LOCATIONS.length,
        npcKnowledgeUpdated,
        roads: roadsUpserted,
        loreSectionId: loreSection.id,
        rag: ragStats,
      },
      'World seed applied',
    );
    return {
      capitalId: capital.id,
      sublocationIds: Object.values(subByKey).map((s) => s.id),
      npcsUpserted,
      villageIds: VILLAGES.map((v) => locationByName[v.canonicalName]?.id).filter(Boolean),
      villageNpcCount,
      wildLocationIds: wildRows.map((w) => w.id),
      npcKnowledgeUpdated,
      roadsUpserted,
      rag: ragStats,
    };
  } catch (err) {
    log.error({ err: err?.message }, 'World seed failed');
    throw err;
  }
}

// Standalone invocation: `node src/scripts/seedWorld.js`
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  seedWorld()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log('Seed complete:', result);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
