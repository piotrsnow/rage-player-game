/**
 * Background goal pool — deterministic sideways agendas for NPCs with no
 * active quest role AND already at home.
 *
 * Lets globally-living NPCs "do things" without a dedicated nano call per
 * scene. The text feeds back into nano tick normally; the pool is just a
 * priming source so the NPC isn't idle.
 *
 * Entries tagged with `offerable: true` + `template: 'X'` can be offered
 * to the PC as a radiant quest when the player walks into the NPC's lokacja
 * (G3, inspired by Skyrim/Oblivion radiant markers). Premium AI decides
 * IF and HOW to offer; the pool just surfaces the hook and a template key
 * the scene-gen layer uses to shape the quest object.
 */

const goal = (text, offerable = false, template = null) => ({ text, offerable, template });

const BACKGROUND_POOL = {
  karczmarz: [
    goal('Obsłużę dzisiejszych gości w karczmie.'),
    goal('Policzę kasę i sprawdzę zapasy piwa.'),
    goal('Mam dość bandytów nękających podróżnych na drodze — szukam kogoś, kto by ich rozgonił.', true, 'bounty_bandits'),
  ],
  kowal: [
    goal('Wykuję dzisiaj nowe podkowy i naostrzę ostrza.'),
    goal('Sprawdzę zapasy węgla i żelaza.'),
    goal('Zgubiłem w lesie cenne narzędzie — chętnie zapłacę komuś za odnalezienie.', true, 'find_missing_item'),
  ],
  strażnik: [
    goal('Obchodzę patrol wokół swojej lokacji.'),
    goal('Sprawdzam czy nikt obcy nie kręci się pod murami.'),
    goal('Kapitan zlecił list do sąsiedniego garnizonu — potrzeba posłańca.', true, 'deliver_message'),
  ],
  żołnierz: [
    goal('Trenuję z bronią.'),
    goal('Sprawdzam warty i umacniam pozycje.'),
    goal('Patroluję okolicę.'),
  ],
  wieśniak: [
    goal('Pracuję w polu/przy stadzie.'),
    goal('Naprawiam coś w gospodarstwie.'),
    goal('Wilki porwały mi jedną sztukę bydła — trzeba by je odstraszyć.', true, 'bounty_beasts'),
  ],
  kupiec: [
    goal('Sprawdzam stan towarów i liczę zyski.'),
    goal('Negocjuję ceny z lokalnymi dostawcami.'),
    goal('Czekam na dostawę, która się opóźnia — bałbym się, że coś spotkało karawanę.', true, 'find_caravan'),
  ],
  mag: [
    goal('Studiuję stare zwoje.'),
    goal('Praktykuję drobne zaklęcia.'),
    goal('Potrzebuję rzadkiego składnika z jaskini za miastem — nie mam czasu iść sam.', true, 'fetch_ingredient'),
  ],
  kapłan: [
    goal('Odmawiam modlitwy przy ołtarzu.'),
    goal('Wysłuchuję spowiedzi wiernych.'),
    goal('Relikwia została skradziona — błagam o pomoc w jej odnalezieniu.', true, 'recover_relic'),
  ],
  rozbójnik: [
    goal('Siedzę z kompanami przy ognisku.'),
    goal('Planuję następną zasadzkę.'),
    goal('Ostrzę broń i sprawdzam strzały.'),
  ],
  szlachcic: [
    goal('Prowadzę dzień dworski.'),
    goal('Przyjmuję petentów lub prowadzę audiencję.'),
    goal('Ktoś szantażuje mnie listami — dyskretnie potrzebuję pomocy, by znaleźć autora.', true, 'investigate_blackmail'),
  ],
};

const BACKGROUND_DEFAULT = [
  goal('Zajmuję się codziennymi sprawami w swojej lokacji.'),
  goal('Kręcę się po okolicy, robiąc drobne prace.'),
  goal('Spoczywam chwilę i obserwuję życie dookoła.'),
];

export function generateBackgroundGoal(npc, { seed = Date.now() } = {}) {
  if (!npc) return null;
  const role = String(npc.role || npc.personality || '').toLowerCase();
  let pool = BACKGROUND_DEFAULT;
  for (const key of Object.keys(BACKGROUND_POOL)) {
    if (role.includes(key)) {
      pool = BACKGROUND_POOL[key];
      break;
    }
  }
  // Stable pick within a scene — seed defaults to now but caller can pass
  // the sceneGameTime for determinism within tests.
  const idx = Math.abs(Math.floor(seed / 1000)) % pool.length;
  return pool[idx];
}
