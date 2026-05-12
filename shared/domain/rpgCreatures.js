/** Magical creature catalog for random encounters. */

export const MAGICAL_CREATURES = [
  {
    id: 'jednorozec',
    namePl: 'Jednorożec',
    temperament: 'gentle',
    size: 'medium',
    environments: ['las', 'pole'],
    fleePenalty: 0,
    behaviorHints: ['podchodzi z ciekawością', 'emanuje spokojnym światłem', 'ocenia czystość serca podróżnika'],
    icon: 'pets',
  },
  {
    id: 'smok',
    namePl: 'Smok',
    temperament: 'aggressive',
    size: 'large',
    environments: ['gory', 'jaskinia'],
    fleePenalty: -8,
    behaviorHints: ['zieje ogniem w stronę nieba', 'wpatruje się w podróżnika z wyższością', 'jego łuski lśnią jak roztopione złoto'],
    icon: 'local_fire_department',
  },
  {
    id: 'maly_smok',
    namePl: 'Mały smok',
    temperament: 'unpredictable',
    size: 'small',
    environments: ['gory', 'ruiny'],
    fleePenalty: -3,
    behaviorHints: ['skacze chaotycznie z kamienia na kamień', 'próbuje ukraść błyszczący przedmiot', 'warczy i mruczy jednocześnie'],
    icon: 'local_fire_department',
  },
  {
    id: 'ognisty_lew',
    namePl: 'Ognisty lew',
    temperament: 'aggressive',
    size: 'medium',
    environments: ['pole', 'droga'],
    fleePenalty: -5,
    behaviorHints: ['grzywa płonie żywym ogniem', 'krąży wokół ofiary z dziką gracją', 'ryczy i ziemia drży pod łapami'],
    icon: 'local_fire_department',
  },
  {
    id: 'sniezny_kormoran',
    namePl: 'Śnieżny kormoran',
    temperament: 'gentle',
    size: 'small',
    environments: ['gory', 'wybrzeze'],
    fleePenalty: 0,
    behaviorHints: ['trzepocze skrzydłami pokrytymi szronem', 'przysiada na ramieniu podróżnika', 'zostawia lodowe piórka na ścieżce'],
    icon: 'ac_unit',
  },
  {
    id: 'krysztalowy_lis',
    namePl: 'Kryształowy lis',
    temperament: 'neutral',
    size: 'small',
    environments: ['las', 'jaskinia'],
    fleePenalty: -2,
    behaviorHints: ['przemyka między drzewami jak pryzmat światła', 'obserwuje z bezpiecznej odległości', 'jego futro załamuje światło w tęczowe refleksy'],
    icon: 'diamond',
  },
  {
    id: 'cienisty_zajac',
    namePl: 'Cienisty zając',
    temperament: 'neutral',
    size: 'tiny',
    environments: ['las', 'bagno'],
    fleePenalty: 2,
    behaviorHints: ['migocze między cieniami drzew', 'znika i pojawia się w innym miejscu', 'zostawia ślady z ciemnej mgły'],
    icon: 'dark_mode',
  },
  {
    id: 'mrozny_wilk',
    namePl: 'Mroźny wilk',
    temperament: 'aggressive',
    size: 'medium',
    environments: ['gory', 'las'],
    fleePenalty: -4,
    behaviorHints: ['oddech zamraża powietrze wokół pyska', 'szczerzy kły pokryte lodem', 'porusza się cicho po zamarzniętej ziemi'],
    icon: 'ac_unit',
  },
  {
    id: 'bursztynowy_motyl',
    namePl: 'Bursztynowy motyl (wielki)',
    temperament: 'gentle',
    size: 'medium',
    environments: ['las', 'pole'],
    fleePenalty: 3,
    behaviorHints: ['skrzydła migoczą ciepłym, złotym blaskiem', 'siada na kwiatach i ożywia je magią', 'unosi się łagodnie w promieniach słońca'],
    icon: 'filter_vintage',
  },
  {
    id: 'drzewny_duszek',
    namePl: 'Drzewny duszek',
    temperament: 'unpredictable',
    size: 'tiny',
    environments: ['las', 'bagno'],
    fleePenalty: 1,
    behaviorHints: ['chichotze ukryty w korze drzewa', 'rzuca drobne szyszki w przechodniów', 'mruga fosforyzującymi oczkami z gałęzi'],
    icon: 'park',
  },
  {
    id: 'ognisty_feniks_mlody',
    namePl: 'Ognisty feniks (młody)',
    temperament: 'neutral',
    size: 'medium',
    environments: ['gory', 'ruiny'],
    fleePenalty: -3,
    behaviorHints: ['pióra tląsię pomarańczowym żarem', 'wydaje melodyjny, ciepły trel', 'wzbija się w powietrze zostawiając smugę iskier'],
    icon: 'whatshot',
  },
  {
    id: 'szmaragdowy_waz',
    namePl: 'Szmaragdowy wąż',
    temperament: 'neutral',
    size: 'small',
    environments: ['bagno', 'jaskinia'],
    fleePenalty: -1,
    behaviorHints: ['łuski mieniąsię odcieniami zieleni', 'syczy cicho i obserwuje spod liści', 'owija się wokół gałęzi z hipnotyczną gracją'],
    icon: 'pets',
  },
  {
    id: 'lodowy_jelen',
    namePl: 'Lodowy jeleń',
    temperament: 'gentle',
    size: 'large',
    environments: ['gory', 'las'],
    fleePenalty: 0,
    behaviorHints: ['poroże lśni jak wyrzeźbione z lodu', 'stąpa cicho zostawiając mroźne ślady', 'patrzy spokojnie głębokimi, błękitnymi oczami'],
    icon: 'ac_unit',
  },
  {
    id: 'kamienny_zolw',
    namePl: 'Kamienny żółw',
    temperament: 'neutral',
    size: 'large',
    environments: ['gory', 'droga'],
    fleePenalty: 5,
    behaviorHints: ['porusza się z majestatyczną powolnością', 'pancerz pokryty jest mchem i runami', 'ziemia lekko drży przy każdym kroku'],
    icon: 'landscape',
  },
  {
    id: 'mglisty_puchacz',
    namePl: 'Mglisty puchacz',
    temperament: 'unpredictable',
    size: 'medium',
    environments: ['las', 'bagno', 'ruiny'],
    fleePenalty: 1,
    behaviorHints: ['pojawia się znikąd w kłębach mgły', 'wpatruje się nieruchomo wielkimi oczami', 'wydaje niski, wibrujący pohukiwanie'],
    icon: 'visibility',
  },
];

/** Mundane wildlife for idle encounters (no magic). Same shape as `MAGICAL_CREATURES`. */
export const ANIMALS = [
  {
    id: 'sarna',
    namePl: 'Sarna',
    temperament: 'gentle',
    size: 'medium',
    environments: ['las', 'pole'],
    fleePenalty: 2,
    behaviorHints: ['zastyga z wypatrzonymi uszami', 'odsuwa się ostrożnie w zarośla', 'wącha powietrze i oddala się skokami'],
    icon: 'pets',
  },
  {
    id: 'dzik',
    namePl: 'Dzik',
    temperament: 'aggressive',
    size: 'medium',
    environments: ['las', 'pole'],
    fleePenalty: -5,
    behaviorHints: ['chrumka groźnie i kopie racicą', 'szczecie się i rusza w twoją stronę', 'ryje ziemię i patrzy spod kłów'],
    icon: 'pets',
  },
  {
    id: 'lis',
    namePl: 'Lis',
    temperament: 'neutral',
    size: 'small',
    environments: ['las', 'pole'],
    fleePenalty: 1,
    behaviorHints: ['przemyka cicho między pniami', 'zatrzymuje się i obserwuje spod płonącej sierści', 'chowa się za pierwszym lepszym kamieniem'],
    icon: 'pets',
  },
  {
    id: 'zajac_polny',
    namePl: 'Zając polny',
    temperament: 'gentle',
    size: 'small',
    environments: ['las', 'pole', 'droga'],
    fleePenalty: 4,
    behaviorHints: ['strzyże uszami i w mgnieniu oka znika za pagórkiem', 'pędzi zygzakiem przez trawę', 'wpatruje się, po czym odbija w drugą stronę'],
    icon: 'pets',
  },
  {
    id: 'bocian',
    namePl: 'Bocian',
    temperament: 'neutral',
    size: 'medium',
    environments: ['pole', 'wybrzeze'],
    fleePenalty: 2,
    behaviorHints: ['stąpa powoli po żerdzie', 'klekocze dziobem i rozprostowuje skrzydła', 'wzbija się ciężko w powietrze'],
    icon: 'pets',
  },
  {
    id: 'wilk_szary',
    namePl: 'Wilk szary',
    temperament: 'aggressive',
    size: 'medium',
    environments: ['las', 'gory'],
    fleePenalty: -6,
    behaviorHints: ['obchodzi z dołu, trzymając kontakt wzrokowy', 'waruje nisko i pokazuje kły', 'szarpie pyskiem w stronę zapachu'],
    icon: 'pets',
  },
  {
    id: 'sowa',
    namePl: 'Sowa',
    temperament: 'neutral',
    size: 'small',
    environments: ['las', 'ruiny'],
    fleePenalty: 2,
    behaviorHints: ['obraca głowę o sto osiemdziesiąt stopni', 'frunie bezszelestnie między gałęziami', 'wpatruje się żółtymi oczami z wysokiego konaru'],
    icon: 'pets',
  },
  {
    id: 'kozica',
    namePl: 'Kozica',
    temperament: 'neutral',
    size: 'small',
    environments: ['gory'],
    fleePenalty: 3,
    behaviorHints: ['stoi na urwisku jak na podium', 'skacze po skale z niewiarygodną lekkością', 'ostrzeżeniowo tupie kopytkiem'],
    icon: 'landscape',
  },
  {
    id: 'nietoperz',
    namePl: 'Nietoperz',
    temperament: 'neutral',
    size: 'tiny',
    environments: ['jaskinia', 'ruiny'],
    fleePenalty: 2,
    behaviorHints: ['krąży pod sufitem jaskini', 'mignie i znika w szczelinie', 'piski echują w mroku'],
    icon: 'dark_mode',
  },
  {
    id: 'zaba',
    namePl: 'Żaba',
    temperament: 'gentle',
    size: 'tiny',
    environments: ['bagno'],
    fleePenalty: 4,
    behaviorHints: ['kwacze i wpada do kałuży', 'siedzi nieruchomo jak kamyk', 'dmie w gardziel na błocie'],
    icon: 'pets',
  },
  {
    id: 'wez_wodny',
    namePl: 'Wąż wodny',
    temperament: 'neutral',
    size: 'small',
    environments: ['bagno', 'wybrzeze'],
    fleePenalty: 0,
    behaviorHints: ['sunie po powierzchni trzciny', 'zanurza się z cichym pluskiem', 'leży zwinięty na pniu nad wodą'],
    icon: 'pets',
  },
  {
    id: 'mewa',
    namePl: 'Mewa',
    temperament: 'unpredictable',
    size: 'small',
    environments: ['wybrzeze', 'droga'],
    fleePenalty: 3,
    behaviorHints: ['krąży nad głową krzycząc', 'wpatruje się w ewentualny prowiant', 'spuszcza się nisko i odlatuje z podmuchiem wiatru'],
    icon: 'pets',
  },
  {
    id: 'szczur',
    namePl: 'Szczur',
    temperament: 'neutral',
    size: 'tiny',
    environments: ['ruiny', 'droga', 'jaskinia'],
    fleePenalty: 5,
    behaviorHints: ['mignie w szczelinie muru', 'czochra wąsy i znika w cieniu', 'syczy cicho zza gruzu'],
    icon: 'pets',
  },
  {
    id: 'jelen_lesny',
    namePl: 'Jeleń',
    temperament: 'gentle',
    size: 'large',
    environments: ['las', 'gory'],
    fleePenalty: 1,
    behaviorHints: ['unosi głowę z wielkim porożem', 'stąpa ostrożnie po ściółce', 'prycha i oddala się majestatycznym truchtem'],
    icon: 'forest',
  },
  {
    id: 'kruk',
    namePl: 'Kruk',
    temperament: 'unpredictable',
    size: 'small',
    environments: ['pole', 'ruiny', 'droga'],
    fleePenalty: 2,
    behaviorHints: ['kracze z gałęzi jak na sygnale', 'podskakuje z ciekawością', 'odlatuje z czarnym błyskiem piór'],
    icon: 'pets',
  },
];

/**
 * Pick a random creature matching the current location environment.
 * Falls back to a fully random pick if no creature matches.
 */
export function pickCreature(currentLocation) {
  const loc = (currentLocation || '').toLowerCase().trim();
  const matched = loc
    ? MAGICAL_CREATURES.filter((c) => c.environments.includes(loc))
    : [];
  const pool = matched.length > 0 ? matched : MAGICAL_CREATURES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Same as `pickCreature`, for entries in `ANIMALS`.
 */
export function pickAnimal(currentLocation) {
  const loc = (currentLocation || '').toLowerCase().trim();
  const matched = loc ? ANIMALS.filter((c) => c.environments.includes(loc)) : [];
  const pool = matched.length > 0 ? matched : ANIMALS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Idle encounter split: d100 1–3 → magical catalog, 4–100 → animals.
 * `typeRoll` must be an integer in 1..100 (caller rolls once).
 */
export function pickEncounterSubject({ currentLocation, typeRoll }) {
  const roll = Math.min(100, Math.max(1, Math.floor(Number(typeRoll)) || 1));
  if (roll <= 3) {
    return { kind: 'magical', creature: pickCreature(currentLocation) };
  }
  return { kind: 'animal', creature: pickAnimal(currentLocation) };
}

/** Resolve a catalog entry by id from either magical or mundane lists. */
export function findCreatureById(creatureId) {
  if (!creatureId || typeof creatureId !== 'string') return null;
  return (
    MAGICAL_CREATURES.find((c) => c.id === creatureId) || ANIMALS.find((c) => c.id === creatureId) || null
  );
}
