# Living world: grid map, quest-giver binding, NPC triggers, fog-of-war

## Context

**Problem.** Obecne kampanie startują w abstrakcyjnej "lokacji startowej" (string typu `"Yeralden"`) — bez przypięcia do sublokacji, bez wskazanego questgivera w konkretnym miejscu. Questy trzymają `questGiverId`/`locationId` jako luźne stringi, AI może halucynować gdzie kto jest. Mapa w stanie świata jest siłą-zorientowanym canvasem (force-directed), nie tile-gridem; gracz widzi "odkryte" lokacje jako nazwy w `coreState.world.locations[]`. Nie ma dungeonów, ruin, wilderness. Nie ma rozróżnienia "ważna postać kanoniczna" vs "NPC stworzony pod jedną kampanię". Nie ma triggerów, że po skończonym celu NPC przyjeżdża do gracza z wiadomością.

**Cel.** Zbudować spójny "living world" vertical slice:
- 10×10 grid z ~20 lokacjami (kapitol + 2 wioski + dungeony/wilderness/ruiny), trudność rosnąca z dystansem.
- Fog-of-war hybrydowy (canonical → `UserWorldKnowledge` per-user; non-canonical → `Campaign.discoveredLocationIds` per-kampania) z **trzema stanami**: unknown / heard-about / visited. Kapitol znany od startu, wioski odkrywane fizycznie lub przez dialog z NPC.
- **Campaign sandbox**: canonical WorldNPC/WorldLocation immutable w runtime; mutacje idą na `CampaignNPC` shadow (clone-on-first-encounter).
- Sublokacje jako drill-down z ręcznymi koordami.
- Twarde wiązanie questa start-owego z losowym {settlement → sublokacja → NPC}.
- Kategoryzacja NPC (5 szerokich).
- Mechanika "NPC przyjeżdża do gracza po ukończonym celu" (poprzez campaign shadow, nie canonical).
- Discovery przez dialog (NPC nie wszechwiedzący, `knownLocationIds` implicit+explicit, LLM emituje `locationMentioned` w stateChanges).
- **AI może tworzyć nowe lokacje mid-game** (non-canonical, per-kampania, placowane na gridzie przez BE) — discovery flows dla graczy jak dla każdej innej lokacji.
- **Unified location query** — canonical + campaign-specific połączone w promptach scene-gen, map fog i travel graph.
- **Post-campaign write-back + promotion candidates**: istotne zmiany świata + wartościowe NPC/lokacje → admin review → canonical (Round E).
- Player marker na mapie (pulsujący highlight).
- Biom jako flavor — odłożony do osobnej rundy (Round D).

## Główne decyzje

- **Siatka 10×10 = projekcja wyświetlania**, nie migracja schematu. `regionX`/`regionY` zostają jako floaty w km (1 unit = 1 km, jak dziś). UI rysuje grid `floor(regionX/1)`, `floor(regionY/1)`. Żadnego nowego `tileX/tileY`. Pozwala zostawić `worldSeeder.js` ring-spawn bez przepisywania.
- **Fog-of-war: hybryda canonical/ephemeral + trzy stany widoczności** (kluczowe ustalenie).
  - Nowe pole `WorldLocation.isCanonical: bool DEFAULT false`. Seed ustawia `true` dla wszystkich upsertowanych lokacji i sublokacji (hand-authored świat).
  - Trzy stany lokacji na mapie gracza:
    1. **Unknown** — niewidoczna.
    2. **Heard-about** — widoczna z innym stylingiem (dashed outline, przyciemniona, nazwa widoczna), bez drill-down do sublokacji. Wchodzi w ten stan przez dialog z NPC (patrz niżej).
    3. **Visited** — pełne info, drill-down aktywny.
  - **Canonical locations** (kapitol, wioski, seedowane dungeony/sublokacje) — discovery (visited) zapisywane w istniejącym `UserWorldKnowledge` (per-user globalnie). Heard-about również per-user w nowym polu `UserWorldKnowledge.heardAboutLocationIds`.
  - **Non-canonical locations** (AI-generowane mid-game: chatka myśliwego, sekretna krypta) — discovery i heard-about per-kampania: `Campaign.discoveredLocationIds`/`discoveredSubLocationIds` + `Campaign.heardAboutLocationIds`.
  - Mapa gracza w runtime łączy oba źródła: `visited = UserWorldKnowledge.discoveredLocationIds (canonical) ∪ Campaign.discoveredLocationIds (non-canonical)`, analogicznie `heardAbout = UserWorldKnowledge.heardAboutLocationIds ∪ Campaign.heardAboutLocationIds`.
  - Fizyczna wizyta awansuje "heard-about → visited" automatycznie.
  - `knownByDefault=true` tylko dla kapitolu. Wioski są canonical, ale gracz je odkrywa.
- **Discovery przez dialog (NPC hearsay).** NPC nie są wszechwiedzący — gracz może poznać lokację pytając właściwego NPC.
  - Implicit knowledge (derywowane w runtime): NPC zna swoją lokację + sublokacje + lokacje 1-hop przez `WorldLocationEdge`. Czyli merchant zna sąsiednie wioski, farmer zna tylko swoją wioskę i pola.
  - Explicit knowledge (nowe pole `WorldNPC.knownLocationIds: JSON[]`): dla kluczowych NPC autoryzujemy dodatkową wiedzę. Eleya Tropicielka zna wilderness spots, Kapitan Gerent zna dungeony, król wie o całym regionie.
  - Prompt sceny dostaje NPC.knownLocationIds (implicit + explicit) + instrukcję "tylko te lokacje możesz ujawnić; jeśli pytanie dotyczy innej — NPC mówi że nie wie lub spekuluje".
  - Nowy bucket w stateChanges `locationMentioned: [{locationId, byNpcId}]`. LLM emituje gdy NPC faktycznie ujawnia lokację w dialogu.
  - Handler w `processStateChanges` appenduje locationId do heard-about list (canonical → UserWorldKnowledge, non-canonical → Campaign).
- **Triggery questów bez nowego schematu.** Zamiast `objective.onComplete: Trigger[]` — pojedyncze pole `CampaignNPC.pendingIntroHint: string?` + nowa funkcja `setCampaignNpcLocation(campaignId, worldNpcId, locationId)` (campaign sandbox, Phase 3b). Kompletacja celu (w `processStateChanges.js`) ustawia hint + przenosi NPC **tylko w campaign shadow**; prompt sceny już wyciąga NPC przy graczu (`listNpcsAtLocation(locationId, campaignId)`) i zobaczy hint. Zero nowego rejestru.
- **Kategoria NPC** — nowa kolumna `WorldNPC.category` i `CampaignNPC.category`. Start: **5 szerokich wartości** (`guard`, `merchant`, `commoner`, `priest`, `adventurer`). Gwarantujemy minimum jednego NPC każdej kategorii w seedzie (patrz Phase 1). **TODO — rozwinąć enum w przyszłości** gdy Questgiver picker zacznie mieć za mało opcji (np. dodać `hunter`, `noble`, `rogue`, `scholar`, `innkeeper`, `blacksmith`). Backfill z istniejącego `role` przez keyword-map (reuse `ROLE_AFFINITY` z [backend/src/services/livingWorld/questGoalAssigner.js](backend/src/services/livingWorld/questGoalAssigner.js)).
- **Ephemeral NPC** — bez nowej kolumny. `CampaignNPC` bez `worldNpcId` = ephemeral z definicji. Policy w quest-gen: major step → pick spośród NPC z `worldNpcId`+`importance=major`; minor step → stwórz `CampaignNPC` bez promocji do WorldNPC.
- **Sub-lokacje z ręcznymi koordami.** Nowe pola `WorldLocation.subGridX: int?`, `subGridY: int?` (tylko gdy `parentLocationId` set). Seed ustawia każdej sublokacji precyzyjną pozycję (np. Tavern w Yeralden (2,3), Barracks (4,1), Church (1,2)). Sub-grid rozmiar dopasowany do settlementu: village 5×5, town 7×7, city/capital 10×10.
- **"Enter sublocation" UX** — klik w sublokację dispatchuje ukryty prompt gracza ("wchodzę do {nazwa}"), przechodzi przez intent classifier + scene gen. Nie omijamy pipeline'u LLM. Żadnej nowej mutacji stanu poza narracyjną.
- **Difficulty scaling dungeonów** — hand-authored `dangerLevel` przy seedzie (safe/moderate/dangerous/deadly) + dystans od kapitolu jako *wytyczna seedera*, nie runtime. Unika konfliktu z `Campaign.difficultyTier`.
- **Campaign sandbox (zasada: żadnych mutacji canonical world podczas gry).**
  - Każda mutacja canonical WorldNPC/WorldLocation w runtime idzie na clone (`CampaignNPC` z `worldNpcId`, campaign-scoped shadow). WorldNPC/WorldLocation pozostają immutable przez całą kampanię.
  - Clone-on-first-encounter: nowy helper `getOrCloneCampaignNpc(campaignId, worldNpcId)`. Przy pierwszym odwołaniu do WorldNPC w kontekście kampanii tworzy CampaignNPC snapshot.
  - Każdy istniejący writer do WorldNPC (np. `setWorldNpcLocation`, dialog append, activeGoal update) musi być przekierowany na CampaignNPC albo dostać per-campaign wariant.
  - **Post-campaign write-back** (Round E): przy finalizacji kampanii LLM extraction + embedding resolve promuje istotne zmiany shadow → canonical, żeby akcje gracza miały realny wpływ na świat w kolejnych kampaniach.
- **Player marker na mapie.** Bieżący tile gracza renderowany z pulsującym highlightem (reuse kod z obecnego `MapCanvas.jsx` gradient golden/brown). Źródło: `campaign.currentLocation` (już śledzone).

## Nowe pola w schemacie

- `WorldLocation.isCanonical: bool DEFAULT false` — `true` dla hand-authored seed; decyduje czy discovery idzie do `UserWorldKnowledge` (canonical) czy `Campaign.discoveredLocationIds` (non-canonical).
- `WorldLocation.dangerLevel: enum(safe|moderate|dangerous|deadly) DEFAULT safe` — używane przy dungeonach/wilderness/ruin, kapitol/wioski zostają `safe`.
- `WorldLocation.knownByDefault: bool DEFAULT false` — `true` **tylko dla kapitolu**. Wioski są `isCanonical=true`, ale `knownByDefault=false` (gracz je odkrywa).
- `WorldLocation.subGridX: int?`, `subGridY: int?` — ręczne koordy sublokacji w drill-down gridzie (tylko gdy `parentLocationId` set).
- `WorldLocation.createdByCampaignId: string?` — non-null dla AI-generowanych mid-game lokacji (per-campaign). Canonical lokacje mają `null`. Po promocji (Round E) pole zostaje jako audit trail (wiadomo skąd lokacja przyszła).
- `WorldLocation.displayName: string?` — wyświetlana nazwa. Dla canonical = `canonicalName`. Dla non-canonical = originalna nazwa bez suffixu (bo `canonicalName` dostaje auto-suffix `_{campaignIdShort}` dla unikatowości globalnej).
- `WorldNPC.category: string` (enum w kodzie: `guard|merchant|commoner|priest|adventurer`, string w bazie).
- `WorldNPC.knownLocationIds: JSON[]` — explicit wiedza o lokacjach (dodatek do implicit 1-hop). Backfill w seedzie dla kluczowych NPC.
- `CampaignNPC.category: string`.
- `CampaignNPC.pendingIntroHint: string?` — jednorazowa wskazówka dla LLM "ten NPC właśnie przyszedł z X, chce przekazać Y".
- `CampaignNPC.lastLocationId: string?` (FK do WorldLocation) — per-campaign shadow `WorldNPC.currentLocationId`. Istniejące `lastLocation: string` zostaje jako fallback/display, ale writes idą do `lastLocationId`.
- `CampaignNPC.interactionCount: int DEFAULT 0` — inkrementowane przy każdej scenie z NPC w dialogu.
- `CampaignNPC.dialogCharCount: int DEFAULT 0` — suma znaków dialogów z NPC (proxy głębokości interakcji).
- `CampaignNPC.questInvolvementCount: int DEFAULT 0` — ile quest objectives dotyczyło tego NPC.
- `CampaignNPC.lastInteractionAt: DateTime?` — timestamp ostatniej interakcji.
- `WorldEntityEmbedding` (nowa tabela): `{ id, entityType: 'npc'|'location', entityId, embedding: JSON[number] }` — do write-backu (Round E). Generowane przy seedzie + mid-game entity creation.
- `NPCPromotionCandidate` (nowa tabela): `{ id, campaignId, campaignNpcId, stats: JSON, dialogSample: text, smallModelVerdict: JSON, status: 'pending'|'approved'|'rejected', reviewedBy: string?, reviewedAt: DateTime?, createdAt: DateTime }`.
- `LocationPromotionCandidate` (nowa tabela, analogiczna): `{ id, campaignId, worldLocationId (non-canonical), stats: JSON, smallModelVerdict: JSON, status, reviewedBy, reviewedAt, createdAt }`.
- `Campaign.discoveredLocationIds: JSON[]`, `Campaign.discoveredSubLocationIds: JSON[]` — "visited" fog-of-war tylko dla non-canonical.
- `Campaign.heardAboutLocationIds: JSON[]` — "heard-about" tylko dla non-canonical.
- `UserWorldKnowledge.heardAboutLocationIds: JSON[]` — "heard-about" tylko dla canonical (per-user globalnie, analogicznie do istniejącego `discoveredLocationIds`).
- `CampaignQuest.questGiverId` (istniejące, string) — autorytatywne powiązanie z CampaignNPC przez `CampaignNPC.npcId`. Zarówno canonical-clone'owany NPC, jak i ephemeral campaign NPC zawsze istnieją jako CampaignNPC, więc jedna ścieżka. **Nie dodajemy `questGiverWorldNpcId`** — campaign scope wystarczy.
- `CampaignQuest.forcedGiver: bool DEFAULT false` — sygnał że `pickQuestGiver()` ma być pominięty.
- `WorldLoreSection` (nowa tabela): `{ id, slug: string @unique, title: string, content: text, order: int, updatedAt, updatedBy: string? }` — sekcje globalnego lore świata, editowalne z admin panelu, injectowane do scene/campaign promptów.

## Fazy implementacji (kolejność)

### Round A: fundament (1 PR, 1 playtest na końcu)

**Phase 0a — World Lore document & admin UI.**
- Schema `WorldLoreSection` (patrz wyżej).
- Seed: jedna sekcja `slug="main"`, `title="Świat Yeralden"`, pusty content (user wypełni).
- Admin endpoints:
  - `GET /v1/admin/livingWorld/lore` — list all sections ordered.
  - `PUT /v1/admin/livingWorld/lore/:slug` — update/create section.
  - `DELETE /v1/admin/livingWorld/lore/:slug` — remove section.
  - `POST /v1/admin/livingWorld/lore/reorder` — bulk reorder.
- Admin UI: nowa zakładka "World Lore" w `AdminLivingWorldPage.jsx`:
  - Lista sekcji z drag-to-reorder.
  - Markdown editor per sekcja (reuse istniejący md editor jeśli jest w app, inaczej prosty textarea + preview).
  - Save button, optimistic update.
  - "Add section" button.
- Scene-gen integration:
  - Nowy helper `buildWorldLorePreamble()` w [backend/src/services/sceneGenerator/aiContextTools.js](backend/src/services/sceneGenerator/aiContextTools.js) — query wszystkie sekcje `ORDER BY order`, concat `## {title}\n{content}\n\n`, truncate do ~2500 tokens (tiktoken-ish counter).
  - Cache w pamięci procesu: klucz `max(updatedAt)` — invalidate gdy lore edytowane.
  - Prepend w prompt scene-gen przed `[NPC_KNOWLEDGE]`, quest context, etc., jako `[WORLD LORE]\n{preamble}\n[/WORLD LORE]`.
  - Tak samo w campaignGenerator.js dla initialQuest generation — lore kształtuje starting story.

**Phase 0 — fog-of-war schema (canonical/ephemeral split + hearsay).**
- Dodanie `WorldLocation.isCanonical: bool`. Seed upserty ustawiają `true`. AI-generowane lokacje default `false`.
- Dodanie `Campaign.discoveredLocationIds` + `discoveredSubLocationIds` + `heardAboutLocationIds` (tylko non-canonical).
- Dodanie `UserWorldKnowledge.heardAboutLocationIds` (tylko canonical, parallel do istniejącego `discoveredLocationIds`).
- Nowy helper `markLocationDiscovered(campaignId, userId, locationId)` w [backend/src/services/livingWorld/userDiscoveryService.js](backend/src/services/livingWorld/userDiscoveryService.js):
  - Jeśli `location.isCanonical=true` → append do `UserWorldKnowledge.discoveredLocationIds` dla tego usera.
  - Jeśli `false` → append do `Campaign.discoveredLocationIds`.
  - W obu przypadkach: remove z odpowiedniego `heardAboutLocationIds` (awans heard-about → visited).
- Nowy helper `markLocationHeardAbout(campaignId, userId, locationId)` w tym samym pliku:
  - Skip jeśli lokacja już visited (nie degraduj stanu).
  - Append do odpowiedniej listy wg `isCanonical`.
- Nowy helper `markEdgeDiscovered(campaignId, edgeId)`:
  - Append `campaignId` do `WorldLocationEdge.discoveredByCampaigns` jeśli jeszcze go tam nie ma.
  - Wywoływany przy każdym travel: gdy gracz przechodzi z A→B, edge(A,B) trafia do discovered. Inaczej mapa pokaże lokacje ale drogi między nimi będą ciemne.
- Seed: kapitol `knownByDefault=true`. Przy tworzeniu kampanii auto-dodawany do UserWorldKnowledge (już tak robi istniejący kod w `userDiscoveryService.js:122`).
- Wioski: `knownByDefault=false` — gracz odkrywa.

**Phase 1 — NPC categories.** Dodanie kolumn `category`, keyword-backfill z `role` przez `categorize()` reużywający `ROLE_AFFINITY`. Seed [backend/src/scripts/seedWorld.js](backend/src/scripts/seedWorld.js) uzupełnia jawne `category` dla NAMED_NPCS i village NPCs. **Gwarancja pokrycia wszystkich 5 kategorii:**
- `guard` — Kapitan Gerent ✓
- `priest` — Arcykapłanka Lyana ✓
- `adventurer` — skill masters (Darvok, Ilara, Venadra, Taelor, Senya, Ashen, Karros, Korvia) ✓
- `commoner` — Bremys, Wiltar Olbram, Marola ✓
- `merchant` — **brakuje** → recategorize Tamar (innkeeper) jako `merchant`, ALBO dodać nowego NPC "Kupiec Dorgun" w Yeralden Market (preferowane: dodać kupca, karczmarz zostanie `commoner`).
- Otwarte TODO w kodzie: `// TODO(category-enum): rozszerzyć o hunter, noble, rogue, scholar, innkeeper, blacksmith, farmer gdy picker zacznie mieć za mało różnorodności`.

**Phase 2 — world content expansion + NPC knowledge seeding.** Seed dodaje ~17 nowych lokacji na gridzie 10×10:
- 4 dungeony — jeden safe (ok 2km od kapitolu), moderate (~3-4km), dangerous (~5-6km), deadly (~7-8km)
- ~6 wilderness (forest / mountains / plains)
- ~4 ruins
- ~3 roadside POI (camp, shrine, crossroads)
- Auto-build edges (istniejący kod) z `difficulty` rosnącym z dystansem
- Wszystkie nowe lokacje: `isCanonical=true`, `dangerLevel` per lokacja ręcznie, `knownByDefault=false`
- Sublokacje istniejących wiosek/kapitolu dostają ręczne `subGridX/subGridY` (np. Yeralden Palace (5,5), Grand Temple (3,6), Tavern (6,4), Market (4,3), Barracks (7,7), itd. — capital sub-grid 10×10).

**Phase 2b — seed NPC explicit knowledge.** Seed przypisuje `knownLocationIds` dla wybranych NPC:
- Kapitan Gerent → wszystkie dungeony + barracks + ruiny (wojskowa wiedza)
- Eleya Tropicielka → wszystkie wilderness + 2-3 ukryte spots (tropiciel-hunter)
- Arcykapłanka Lyana → shrine POI + ruins z religijnym backgroundem
- King Torvan IV → wszystko w regionie (władca)
- Wiltar Olbram (sołtys) → okoliczne wioski + wilderness w okolicy
- Tamar (innkeeper) → wioski + roadside camps (plotki)
- Reszta NPC: pusta lista, polegają na implicit 1-hop knowledge.

**Krytyczne pliki Round A:**
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — nowe pola
- [backend/src/scripts/seedWorld.js](backend/src/scripts/seedWorld.js) — content + backfill + seed main lore section
- [backend/src/services/livingWorld/questGoalAssigner.js](backend/src/services/livingWorld/questGoalAssigner.js) — reuse ROLE_AFFINITY dla `categorize()`
- [backend/src/routes/campaigns/crud.js](backend/src/routes/campaigns/crud.js) — inicjalizacja `discoveredLocationIds`
- [backend/src/routes/admin/livingWorldLore.js](backend/src/routes/admin/livingWorldLore.js) — nowe endpointy CRUD
- [src/components/admin/AdminLivingWorldPage.jsx](src/components/admin/AdminLivingWorldPage.jsx) — nowa zakładka "World Lore"
- [src/components/admin/AdminWorldLoreTab.jsx](src/components/admin/AdminWorldLoreTab.jsx) — nowy component
- [backend/src/services/sceneGenerator/aiContextTools.js](backend/src/services/sceneGenerator/aiContextTools.js) — `buildWorldLorePreamble()`

### Round B: quest starter binding + triggery (1 PR, 1 playtest)

**Phase 3 — campaign start picker.** Nowy moduł `startSpawnPicker.js` — tylko ogranicza **gdzie** quest ma się zacząć (settlement/sublokacja/NPC). Całą treść questa dalej generuje large model w `campaignGenerator.js` z pełną swobodą; picker tylko injectuje wybranego NPC jako questgivera do promptu.
1. Losuj settlement z `{capitol, village1, village2}` (weighted: kapitol 40%, każda wioska 30%).
2. Losuj sublokację w settlementcie, która ma ≥1 NPC (jakiejkolwiek kategorii — large model dopasuje ton questa do typu NPC).
3. Losuj NPC z tej sublokacji.
4. Ustaw kampanii: `currentLocation` = sublokacja, `currentWorldLocationId` = jej `id`.
5. Przy generowaniu `initialQuest` w [backend/src/services/sceneGenerator/campaignGenerator.js](backend/src/services/sceneGenerator/campaignGenerator.js) twardo wymuś `questGiverId=<CampaignNPC.npcId>`, `locationId=<sublokacja>`, `forcedGiver=true`. Prompt large modela dostaje: "starting NPC is {name} (category: {cat}, personality: {...}) at {sublokacja}; wygeneruj quest który ten NPC mógłby wiarygodnie dawać".
6. Pierwsza scena: gracz jest już w tej sublokacji, NPC dostępny (auto-clone z WorldNPC do CampaignNPC via `getOrCloneCampaignNpc`).

**Phase 3b — campaign sandbox migration.**
- Audit wszystkich call-sites `setWorldNpcLocation`, dialog write do `WorldNPC.dialogHistory`, `activeGoal` update, `alive=false` na WorldNPC. Grep i lista.
- Każdy writer podczas play → przekierowany na odpowiedni field na `CampaignNPC`:
  - `setWorldNpcLocation` → nowy `setCampaignNpcLocation(campaignId, worldNpcId, locationId)` ustawia `CampaignNPC.lastLocationId`.
  - Dialog append → `CampaignNPC.dialogHistory` (już istnieje? sprawdź schema).
  - activeGoal, alive, etc. → `CampaignNPC.*`.
- Helper `getOrCloneCampaignNpc(campaignId, worldNpcId)`:
  - Jeśli CampaignNPC z tym worldNpcId już istnieje → zwróć.
  - Inaczej → stwórz snapshot z WorldNPC (name, role, personality, alignment, currentLocationId → lastLocationId, keyNpc, category, activeGoal, knownLocationIds).
- `listNpcsAtLocation(locationId, campaignId)` (nowa sygnatura): zwraca CampaignNPCs gdzie `lastLocationId=locationId`, plus auto-clone dla WorldNPCs których canonical `currentLocationId=locationId` + brak CampaignNPC yet.

**Phase 4 — quest triggers (movement).** Rozszerzenie `processStateChanges.js` (miejsce gdzie questUpdates flagują objective complete, ok. linii 612-660):
- Po zakończeniu celu, jeśli w metadanych celu (generowanych przez LLM) jest `onComplete: { moveNpcToPlayer: npcId, message }`:
  - `getOrCloneCampaignNpc(campaignId, npcId)` → zapewnia clone.
  - `setCampaignNpcLocation(campaignId, npcId, player.currentLocationId)` — **nie dotyka WorldNPC**.
  - Zapisz `pendingIntroHint` na CampaignNPC.
- Scene assembler ([backend/src/services/sceneGenerator/aiContextTools.js:604](backend/src/services/sceneGenerator/aiContextTools.js)) już wciąga NPC z lokacji — zmień źródło z `listNpcsAtLocation(locationId)` na `listNpcsAtLocation(locationId, campaignId)` które zwraca CampaignNPC shadow + auto-clone.
- `ambientNpcsWithGoals` dołącza `introHint` gdy jest na CampaignNPC.
- Prompt LLM dostaje jasną wskazówkę: "NPC X właśnie przybył i chce przekazać: {message}".
- Po wygenerowaniu sceny hint jest czyszczony.

**Phase 4b — hearsay discovery przez dialog.**
- Scene assembler dla każdego NPC dostępnego w lokacji buduje `knownLocations = implicit(1-hop via edges) ∪ npc.knownLocationIds`. Resolve na listę `{id, name, hint}` — gdzie `hint` to krótki opis (np. "dungeon known to be dangerous", "village nearby").
- Prompt LLM wzbogacony o sekcję `[NPC_KNOWLEDGE]` per NPC obecny w scenie + instrukcję: "jeśli gracz pyta o miejsca, tylko z tej listy możesz ujawnić; poza listą — NPC nie wie lub spekuluje bez szczegółów".
- Nowy bucket w stateChanges wyjściowych LLM: `locationMentioned: [{locationId, byNpcId}]`.
- Handler w `processStateChanges`: dla każdego mentioned → `markLocationHeardAbout(campaignId, userId, locationId)` (helper z Phase 0).
- Edge case: jeśli NPC wygada lokację spoza swojego `knownLocations` (halucynacja), skip + log warning. Nie chcemy żeby LLM "dodawał wiedzy" ignorując policy.

**Phase 4c — AI-created campaign locations (non-canonical).** Gdy LLM w scenie narracyjnie wprowadza nową lokację (chatka myśliwego, ukryta krypta, boczna ścieżka):
- LLM emituje `stateChanges.newLocations: [{ name, locationType, biome?, description, dangerLevel?, directionHint?, parentLocationName? }]`.
- Refactor istniejącego `processLocationChanges` (dziś dodaje tylko nazwę do `coreState.world.locations[]`):
  - Nowy helper `placeCampaignLocationOnGrid(campaignId, playerLocationId, directionHint?)`:
    1. Pobierz `regionX/regionY` gracza.
    2. Jeśli `directionHint` (np. "north", "east") → preferuj dirvector odpowiedniego znaku.
    3. Szukaj pustej kratki dist 1-3 w preferowanym kierunku (fallback: losowa adjacent tile).
    4. Sprawdź brak kolizji z jakimkolwiek istniejącym `WorldLocation.regionX/regionY` (tej kratki).
    5. Waliduj w `Campaign.worldBounds`. Jeśli wyszło poza → shrink do granicy.
    6. Return coords.
  - **LLM prompt hint o granicach świata**: scene prompt zawiera sekcję `[WORLD BOUNDS]` z info jak daleko w którą stronę gracz może jeszcze iść (np. "3 kratki na N, 5 na E, 2 na S, 4 na W — za tym edge świata"). Dzięki temu LLM nie będzie narracyjnie sugerował wyjścia poza. Źródło: obliczane z `player.regionX/Y` vs `campaign.worldBounds` przy każdej scenie.
  - Nowy helper `createCampaignLocation(campaignId, data, coords)`:
    - `canonicalName = "{name}_{campaignIdShort}"` (unikatowość globalna).
    - `displayName = name` (oryginalna).
    - `isCanonical=false`, `createdByCampaignId=campaignId`, `regionX/regionY=coords`, `dangerLevel` (z hint lub default safe), `locationType`, `description`.
    - `upsertEdge()` (istniejący [backend/src/services/livingWorld/travelGraph.js](backend/src/services/livingWorld/travelGraph.js)) — krawędź od parent/player location do nowej.
    - Add do `Campaign.discoveredLocationIds` (jeśli narracyjnie gracz ją odkrywa) ALBO `heardAboutLocationIds` (jeśli tylko wzmianka).
- Sublokacje AI-gen analogicznie: tworzone z `parentLocationId`, `subGridX/subGridY` wyliczane (np. najniższa wolna kratka na sub-grid parent'a, albo z preferowanego slotu jeśli LLM poda).

**Phase 4d — unified location queries + intent-driven knowledge injection.**
- Nowy helper `listLocationsForCampaign(campaignId, filterOpts)`:
  - Zwraca canonical `WorldLocation` (isCanonical=true) + non-canonical tej kampanii (isCanonical=false AND createdByCampaignId=campaignId).
  - Filter options: `visibleOnly` (aplikuje fog-of-war), `withSublocations`, `topLevelOnly`.
- Używany przez:
  - Fog-of-war query w Phase 6 `/v1/campaigns/:id/discovery`.
  - Travel graph resolver (pathfinding) — musi znać campaign-specific edges.
- **Scene assembler nie wysyła wszystkich lokacji/NPC do promptu.** Zamiast nearby-filter: używamy output'u `intentClassifier` (już istnieje, pole `expand_npcs: [name]`).
  - Intent classifier (heuristic + nano) decyduje z którym NPC gracz chce rozmawiać lub na które NPC reaguje.
  - Scene assembler pulluje WYŁĄCZNIE te NPC (z `expand_npcs`) z pełnym kontekstem: `knownLocationIds` (implicit 1-hop + explicit), personality, dialog history, `pendingIntroHint`, category.
  - Pozostałe NPC w lokacji dostają tylko lightweight brief (name + role) w sekcji `[AMBIENT]`. Są obecne w scenie ale bez deep context w prompcie.
  - `expand_location=true` → pullujemy sublokacje i adjacent edges bieżącej lokacji (obecny zakres, nic więcej).
- Zero agresywnego truncate'owania. Jeśli prompt urośnie za bardzo po testach — zobaczymy co realnie tam jest i wytniemy konkretnie, nie globalnie.
- Performance: indeks composite `(isCanonical, createdByCampaignId)` dla szybkiego filter.

**Phase 5 — NPC policy dla quest steps.** W quest-gen prompcie dla LLM-a (campaignGenerator.js):
- Dla każdego objective LLM decyduje: `npcSource: 'existing'|'ephemeral'`.
- `existing` — wymaga podania `worldNpcId`, musi być category-compatible.
- `ephemeral` — generuje nowego `CampaignNPC` bez `worldNpcId`, kategoria + lokalizacja zdefiniowane w objective. Auto-spawn przy odpowiedniej scenie.
- Heurystyka w prompcie: "finale/twist/major reveal → existing + importance=major; fetch/talk/deliver → ephemeral ok".

**Krytyczne pliki Round B:**
- [backend/src/services/livingWorld/startSpawnPicker.js](backend/src/services/livingWorld/startSpawnPicker.js) — nowy plik
- [backend/src/services/livingWorld/campaignLocationPlacer.js](backend/src/services/livingWorld/campaignLocationPlacer.js) — nowy plik (Phase 4c)
- [backend/src/services/livingWorld/locationQueries.js](backend/src/services/livingWorld/locationQueries.js) — nowy plik, `listLocationsForCampaign` (Phase 4d)
- [backend/src/services/livingWorld/travelGraph.js](backend/src/services/livingWorld/travelGraph.js) — reuse `upsertEdge()` w Phase 4c
- [backend/src/services/sceneGenerator/campaignGenerator.js](backend/src/services/sceneGenerator/campaignGenerator.js)
- [backend/src/services/sceneGenerator/processStateChanges.js](backend/src/services/sceneGenerator/processStateChanges.js) — refactor `processLocationChanges`
- [backend/src/services/sceneGenerator/aiContextTools.js](backend/src/services/sceneGenerator/aiContextTools.js) — używa `listLocationsForCampaign`
- [backend/src/routes/campaigns/crud.js](backend/src/routes/campaigns/crud.js)

### Round C: UI — tile grid map + drill-down (1 PR, 1 playtest)

**Phase 6 — player world map (top-level) z trzema stanami + travel + quest markers.**
- [src/components/gameplay/MapCanvas.jsx](src/components/gameplay/MapCanvas.jsx) przepisane: tile grid 10×10 zamiast force-directed. Każdy tile renderuje node jeśli lokacja ma `regionX/regionY` w zakresie.
- Fog-of-war query łączy 4 źródła: `UserWorldKnowledge.discoveredLocationIds` (canonical visited), `UserWorldKnowledge.heardAboutLocationIds` (canonical heard), `Campaign.discoveredLocationIds` (non-canonical visited), `Campaign.heardAboutLocationIds` (non-canonical heard). Nowy endpoint `/v1/campaigns/:id/discovery` zwraca strukturę `{visited: [id], heardAbout: [id]}`.
- Stany wizualne:
  - **Visited**: pełny kolor, nazwa, klikalny (drill-down do sublokacji + "Travel here" action).
  - **Heard-about**: dashed outline, przyciemniony, nazwa widoczna, tooltip "słyszałeś o tym miejscu od X", **klikalny z opcją "Travel here"** (ale bez drill-down — nie widzisz sublokacji póki nie dotrzesz).
  - **Unknown**: niewidoczne (albo "?" glyph adjacent do visited — UX decision przy implementacji).
  - **Current player location**: pulsujący highlight (reuse kod z obecnego `MapCanvas.jsx` gradient golden/brown + pulse animation), widoczny na wierzchu stanu "visited".
  - **Quest marker**: złota ikonka (exclamation/question) overlay na tile'u gdy `activeQuest.objective.targetLocationId = thisTile`. Renderowana niezależnie od fog state — quest marker widoczny nawet na heard-about lokacjach.
- **Player-initiated travel**:
  - Klik na visited/heard-about lokację → popover z akcjami: `[Travel here]`, `[View sublocations]` (tylko visited), `[Cancel]`.
  - `Travel here` dispatchuje syntetyczny player message `"podróżuję do {locationName}"` → pipeline sceny obsługuje resztą (jak obecny flow travel).
  - `View sublocations` otwiera sub-mapę (Phase 7).
- Kapitol widoczny od startu (knownByDefault, auto-dodany do UserWorldKnowledge przy tworzeniu kampanii).
- Wchodzenie fizyczne do lokacji: awans heard-about → visited (helper `markLocationDiscovered` usuwa z heard-about) + `markEdgeDiscovered` dla edge'a traversed.

**Phase 7 — sublocation map + navigation.**
- Nowy component `SubLocationGrid.jsx`. Renderuje grid `subGridX × subGridY` wymiarowany per settlement (capital 10×10, town 7×7, village 5×5 — patrz pole `settlementSize` albo rozmiar rodzica).
- Sublokacje pozycjonowane z ręcznych koordów `subGridX/subGridY` ustawionych w seedzie.
- Klik na sublokację dispatchuje syntetyczny player message `"wchodzę do {slotType}"` przez istniejący pipeline sceny.
- **Back button** `← Back to map` w nagłówku sub-view → wraca do top-level tile grid bez dispatch'owania scene (sub-view to overlay, nie zmiana lokacji gracza).
- **Auto-open na travel**: gdy gracz dotrze do settlementu via "Travel here", sub-view auto-otwiera się pokazując sublokacje (UX: "właśnie przybyłeś do Świetłogaju, dokąd idziesz?").
- Fog-of-war sublokacji: canonical sublokacje znanego parent-location widoczne od razu (raz odkryłeś wioskę — widzisz wszystkie jej hand-authored budynki). AI-generowane sublokacje wymagają discovery per-kampania (np. "znajdujesz ukryte przejście w piwnicy").

**Phase 8 — admin map alignment.**
- [src/components/admin/AdminLivingWorldPage.jsx](src/components/admin/AdminLivingWorldPage.jsx) MapTab dostaje toggle: "Force layout" (obecny) vs "Tile grid" (nowy). Tile grid pokazuje wszystko, kolory po `dangerLevel`, ikonki po `locationType`.
- Admin sub-location view: klik na lokację w tile grid → modal z sub-gridem (ten sam component co gracz, ale bez fog).

### Round D (opcjonalny, odłożony): biome + lore retrieval + lore consistency validator

Nie robimy teraz, ale zapisane do revisit.

**Biome intent fallback**: istniejący `WorldLocationEdge.terrainType` + `region` dają wystarczającą scenerię. Revisit gdy realnie zobaczymy sceny pozbawione flavor.

**Lore retrieval (chunking + embedding)**: gdy `WorldLoreSection` concat przekroczy ~5000 tokens, naive truncate staje się lossy. Rozwiązanie:
- Chunk każdą sekcję po N znaków (2000?) z overlapem.
- `ragService.index('lore_chunk', chunkId, text)` per chunk.
- W scene assembler: `ragService.query(sceneContext, {entityType:'lore_chunk'}, topK=5)` zamiast concat all.
- Rerun index gdy sekcja edytowana (via invalidate + re-index).

**Lore consistency validator** (dobry catch z review): post-scene mały model (Haiku) dostaje wygenerowaną scenę + relevant lore chunks → structured output `{violations: [{loreSection, sceneQuote, reason}]}`. Route violations do admin "Pending canonicalizations" → "Lore violations" tab (nowa sekcja). Admin decyduje: (a) zignoruj (jednorazowy freestyle), (b) zaktualizuj lore (scene stworzyła nowy canon), (c) retro-fix scene (scenariusz musi się dopasować). Zapobiega AI cichemu przepisywaniu canon.

### Round E: post-campaign world write-back (osobny PR, playtest na końcu)

Cel: przy finalizacji kampanii promować istotne zmiany z campaign shadow → canonical world. Akcje gracza mają realny, widoczny wpływ między kampaniami.

**Phase 9 — RagService (unified retrieval).**
- Nowa tabela `WorldEntityEmbedding { id, entityType: 'npc'|'location'|'lore_chunk'|'promotion_candidate', entityId, text (source), embedding: JSON[number] (1536d), updatedAt }`.
- Nowy serwis `ragService.js` (single source of truth dla wszystkich retrieval):
  - `index(entityType, entityId, text)` — generuje embedding z `text` przez `text-embedding-3-small` (OpenAI, ~$0.02/1M tokens), upsert do tabeli.
  - `query(queryText, { filters: {entityType?, campaignId?}, topK, minSim=0.5 })` — naive cosine similarity w JS (dla ~200-500 encji bez problemu, <50ms). Zwraca `[{entityId, entityType, similarity, text}]`.
  - `invalidate(entityType, entityId)` — usuwa wpis (np. gdy encja usunięta).
- **Używany przez wszystkie features wymagające retrieval**:
  - Write-back (Phase 12): `ragService.query(factHint, {entityType:'npc'|'location'}, topK=1)` → resolve target.
  - Promotion dedup (Phase 12b/c): `ragService.query(candidateText, {entityType:'promotion_candidate'}, topK=5)` → merge podobnych.
  - Lore retrieval (Round D gdy lore urośnie): `ragService.query(sceneContext, {entityType:'lore_chunk'}, topK=5)`.
  - Scene context enrichment (jeśli w przyszłości potrzebne): same interface.
- Seed + mid-game entity creation triggeruje `ragService.index()`. Batch backfill jednorazowy dla istniejących encji.
- **Koszt**: ~$1/miesiąc przy intensywnym testowaniu (seed + rebuilds + queries). Zero budget concern.
- Jedno miejsce do swap'u gdy skala urośnie (naive JS cosine → Atlas Vector Search lub pgvector) bez dotykania call-sites.

**Phase 10 — campaign shadow diff collector.**
- Helper `collectCampaignShadowDiff(campaignId)`:
  - Dla każdego CampaignNPC z `worldNpcId` porównaj shadow fields vs WorldNPC canonical. Wygeneruj listę `{ worldNpcId, field, oldValue, newValue }`.
  - Analogiczne dla CampaignLocationSummary vs WorldLocation gdy dodamy location-level mutations.

**Phase 11 — LLM fact extraction.**
- Pobierz compressed memory vault + campaign summary dla kampanii.
- Prompt do LLM z structured output:
  ```
  { worldChanges: [{ 
      kind: "npcDeath"|"npcRelocation"|"locationBurned"|"newRumor"|"factionShift",
      targetHint: string (name/description of entity),
      newValue: string,
      confidence: 0-1,
      reason: string
  }] }
  ```
- LLM instruction: "wyciągnij tylko zmiany które logicznie powinny zostać zapamiętane przez świat (np. śmierć znanego NPC, zniszczenie miejsca, znaczący sojusz); pomiń drobiazgi".

**Phase 12 — resolver + apply (world state changes).**
- Dla każdego `targetHint` wywołaj `findSimilarEntities(hint, entityType)` → top-1 match (threshold 0.75 cosine sim).
- Confidence tiers:
  - **High** (shadow diff + LLM extraction + sim>0.85) → auto-apply do WorldNPC/WorldLocation.
  - **Medium** (jedno źródło lub sim 0.6-0.85) → queue w admin review do manual approve/reject.
  - **Low** (<0.6) → skip + log.
- **Ważne — mitigation "fake progress"**: high-confidence wymaga obu źródeł (shadow-diff + LLM-extracted). LLM-only (bez shadow diff) → maksymalnie medium → wymagany admin review. Tym samym LLM nie może sam "wymyślać" zmian canon.
- Apply:
  - `npcDeath` → `WorldNPC.alive=false` + append do `WorldNPC.knowledgeBase` z reason.
  - `npcRelocation` → `WorldNPC.currentLocationId` update.
  - `locationBurned`/`modifications` → append do nowego pola `WorldLocation.worldHistory: JSON[]` (historyczny log).
  - `newRumor`/`newKnowledge` → append do `WorldNPC.knowledgeBase` lub `WorldLocation.knowledgeBase`.

**Phase 12b — NPC promotion candidates.**
- **Inline stats tracking podczas play**: scene generator inkrementuje `CampaignNPC.interactionCount`, `dialogCharCount`, `lastInteractionAt` gdy NPC występuje w dialogu; `questInvolvementCount` gdy quest objective dotyczy NPC.
- **Refactor istniejącego `maybePromote()` w [backend/src/services/livingWorld/npcPromotion.js](backend/src/services/livingWorld/npcPromotion.js)**: zamiast inline `findOrCreateWorldNPC` (mutacja canonical world podczas gry), tworzy wpis `NPCPromotionCandidate` ze statusem `pending`. Trigger dla inline candidate: quest involvement lub named NPC z personality — zgodnie z istniejącą heurystyką, tyle że nie commit do WorldNPC.
- **Post-campaign batch** w `postCampaignPromotion.js`:
  1. Filter: top-5 CampaignNPC bez `worldNpcId` (czyli ephemeral) sortowane po `interactionCount + questInvolvementCount*10`.
  2. Deduplication: dla każdego kandydata embedding na `name + role + personality`, cosine sim search w `NPCPromotionCandidate` (pending/approved). Jeśli match >0.85 → append stats do istniejącego kandydata, skip nowy.
  3. Top-3 przechodzi przez small model (Haiku lub równoważny nano):
     - Prompt: NPC data + dialog excerpts (max 3000 chars) + quest involvement + world context summary (hand-authored region/factions, żeby model mógł ocenić worldFit).
     - Output structured: `{ recommend: 'yes'|'no'|'unsure', uniqueness: 0-10, worldFit: 0-10, reasons: [string] }`.
  4. Verdict z `recommend=yes` lub `unsure` + `uniqueness>=5` → utwórz `NPCPromotionCandidate` z `status=pending` + pełny verdict dla admin review.
  5. Rest (recommend=no lub uniqueness<5) → nie tworzy candidate, log dla debugowania.

**Phase 12c — Location promotion candidates (analogicznie do NPC).**
- Stats tracking na **`CampaignLocationSummary`** (już istnieje, name-keyed — dodać `worldLocationId` FK + nowe pola): `visitCount`, `questObjectiveCount`, `npcCount` (ilu NPC zostało tu stworzonych) — inkrementowane inline podczas kampanii. Nie trzymamy na WorldLocation, żeby stats jednej kampanii nie mieszały się z innymi.
- Post-campaign filter: top-5 non-canonical lokacji tej kampanii (`isCanonical=false AND createdByCampaignId=current`) sortowane po `visitCount + questObjectiveCount*5`.
- Deduplication: embedding sim search vs istniejące `LocationPromotionCandidate` pending/approved (z innych kampanii) — jeśli match >0.85 → append stats do istniejącego.
- Top-3 → small model verdict (uniqueness: ma distinctive features? worldFit: pasuje do regionu?).
- Candidate utworzony z `recommend=yes|unsure + uniqueness>=5`.
- Admin approval:
  - `isCanonical=true`, keep `regionX/regionY` (już na gridzie z Phase 4c).
  - Remove `createdByCampaignId` (lub zostaw jako audit).
  - Update `canonicalName` — usuń auto-suffix, conflict check (jeśli inna canonical już zajmuje nazwę → admin musi rename przed approve).
  - Rebuild embedding.
  - Od tego momentu ta lokacja pojawia się w KAŻDEJ kolejnej kampanii.

**Phase 13 — admin review UI (unified "Pending canonicalizations").**
- Nowa zakładka w Admin Living World: **"Pending canonicalizations"**. Trzy sekcje:
  - **World state changes** (z Phase 12): npcDeath/npcRelocation/locationModification — lista z kampanii, kontekst, confidence, proponowana zmiana.
  - **NPC promotions** (z Phase 12b): CampaignNPC kandydaci → WorldNPC. Pokazuje: stats, dialog sample, small model verdict (recommend + reasons + uniqueness/worldFit scores).
  - **Location promotions** (z Phase 12c): CampaignLocation kandydaci → canonical.
- Każda pozycja: approve / reject / edit-before-approve (admin może poprawić pola przed commitem, np. dopisać knowledge do WorldNPC) + notka.
- Approve pipeline:
  - World state change → apply directly to WorldNPC/WorldLocation, rebuild embedding jeśli naming/role się zmienił.
  - NPC promotion → create WorldNPC (name, role, personality z CampaignNPC + `canonicalId` generowane), link do pierwotnego CampaignNPC (`worldNpcId=nowy_id`), rebuild embedding.
  - Location promotion → `isCanonical=true` + permanent coords + rebuild embedding.
- Toggle: **"auto-approve high-confidence world state changes"** (tylko dla state changes, nigdy dla promotions — promotions zawsze wymagają manual).
- Filter/search: po kampanii, typie, status, dacie.

**Phase 13b — Canon Knowledge Graph Visualization** (nowa zakładka w Admin Living World).
- Graf obecnego canonical world state: węzły = `WorldNPC` + `WorldLocation`, krawędzie = `WorldLocationEdge` (location↔location), `WorldNPC.currentLocationId`/`homeLocationId` (NPC→location), `WorldNPC.relationships` (NPC→NPC).
- Kolory: węzły NPC po `category`, lokacje po `locationType` (reuse `LOCATION_TYPE_COLORS` z obecnego admin MapTab).
- Filter toggle: pokaż tylko `isCanonical=true` (domyślnie) albo dorzuć non-canonical per-wybrana kampania do inspekcji.
- Interakcje: zoom, pan, click na node → side panel z detalami (pola, `knowledgeBase`, promotion history jeśli był candidate).
- Zastosowanie: spot "samotne" węzły (NPC bez relationships, lokacja bez edges), sprawdź spójność canon, zobacz gaps w hand-authored world, szybki sanity check po Round E auto-approvals.
- Implementacja: reuse istniejący SVG force-directed renderer z `AdminLivingWorldPage.jsx:MapTab` ale z dodatkowymi warstwami (NPC jako mniejsze węzły przy location parent, relacje jako dashed edges).

**Krytyczne pliki Round E:**
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — WorldEntityEmbedding, NPCPromotionCandidate, LocationPromotionCandidate, WorldLocation.worldHistory, CampaignNPC stats fields, CampaignLocationSummary stats
- [backend/src/services/livingWorld/ragService.js](backend/src/services/livingWorld/ragService.js) — nowy plik (Phase 9)
- [backend/src/services/livingWorld/postCampaignPromotion.js](backend/src/services/livingWorld/postCampaignPromotion.js) — nowy plik, orchestrator (world state + NPC + location candidates)
- [backend/src/services/livingWorld/npcPromotion.js](backend/src/services/livingWorld/npcPromotion.js) — refactor `maybePromote()`: tworzy candidate zamiast commitować WorldNPC
- [backend/src/services/sceneGenerator/processStateChanges.js](backend/src/services/sceneGenerator/processStateChanges.js) — stats tracking inline (interactionCount, dialogCharCount increments)
- [backend/src/routes/admin/pendingCanonicalizations.js](backend/src/routes/admin/pendingCanonicalizations.js) — nowy endpoint (unified)
- [backend/src/routes/admin/canonGraph.js](backend/src/routes/admin/canonGraph.js) — endpoint dla Phase 13b
- [src/components/admin/AdminPendingCanonicalizationsTab.jsx](src/components/admin/AdminPendingCanonicalizationsTab.jsx) — nowy component, 3 sekcje
- [src/components/admin/AdminCanonGraphTab.jsx](src/components/admin/AdminCanonGraphTab.jsx) — nowy component (Phase 13b)

## Weryfikacja (playtesty po każdym round)

### Round A
- [ ] `npm run db:seed` wdraża nowe lokacje; `isCanonical=true`, `dangerLevel` persystuje dla wszystkich seedowanych
- [ ] Nowa kampania: `UserWorldKnowledge.discoveredLocationIds` zawiera kapitol (po auto-add), `Campaign.discoveredLocationIds=[]`. Wioski na mapie jeszcze ukryte
- [ ] Odwiedzenie wioski → trafia do `UserWorldKnowledge` (bo `isCanonical=true`)
- [ ] `CampaignNPC.category` wypełniony dla wszystkich (sprawdź w adminie); wszystkie 5 kategorii reprezentowane
- [ ] `/v1/admin/livingWorld/graph` zwraca wszystkie ~20 lokacji + sublokacje mają `subGridX/subGridY`
- [ ] Admin "World Lore" tab ładuje sekcje, edycja markdown zapisuje i odświeża
- [ ] Dodanie treści do lore → następna generowana scena zawiera lore w prompcie (sprawdź w logu promptu)
- [ ] Cache lore invaliduje się po edycji (druga scena po edycji ma zaktualizowany preamble)

### Round B
- [ ] Nowa kampania: pierwsza scena zaczyna się w konkretnej sublokacji (np. "Tawerna w Świetłogaju"), konkretny NPC (np. Eleya) jest tam dostępny i daje quest
- [ ] `CampaignQuest.questGiverWorldNpcId` wskazuje na właściwy WorldNPC, `forcedGiver=true`
- [ ] Kompletacja celu z `onComplete.moveNpcToPlayer` — w następnej scenie NPC jest przy graczu, LLM używa `introHint`
- [ ] Major quest step pickuje `existing` NPC, minor step może pickować `ephemeral` (sprawdź w paru generated questach)
- [ ] Hearsay: pytanie NPC z category=`commoner` o odległy dungeon → odmowa/spekulacja, żadne mention w stateChanges
- [ ] Hearsay: pytanie Kapitana Gerenta o dungeon z `knownLocationIds` → `locationMentioned` emitowany, dungeon trafia do heard-about list
- [ ] Wizyta w lokacji wcześniej heard-about → awans do visited, zniknięcie z heard-about list
- [ ] AI tworzy nową lokację w scenie (np. "znajdujesz chatkę na skraju lasu") → `WorldLocation` z `isCanonical=false`, `createdByCampaignId=current`, `regionX/regionY` na wolnej kratce adjacent do gracza, edge do parent location zbudowany
- [ ] `Campaign.discoveredLocationIds` zawiera nowo stworzoną lokację, widoczna na mapie gracza w tej kampanii
- [ ] `listLocationsForCampaign` zwraca canonical + campaign-specific (merged), używany przez scene assembler w prompcie
- [ ] Druga kampania tworzy lokację o tej samej oryginalnej nazwie → `canonicalName` dostaje unikalny suffix, brak kolizji, `displayName` identyczny

### Round C
- [ ] Mapa gracza renderuje tile grid, kapitol widoczny od startu, wioski i reszta ukryte/heard-about wg stanu
- [ ] Wizytowanie nowej lokacji dopisuje ją do visited, po refresh widać na mapie w pełnym kolorze; edge użyty do dotarcia trafia do `discoveredByCampaigns`
- [ ] Heard-about location wyświetla się z dashed outline, popover ma "Travel here" ale nie "View sublocations"
- [ ] Player marker pulsuje na bieżącym tile'u, aktualizuje się po zmianie lokacji
- [ ] Quest marker: aktywny quest z objective.targetLocationId → złota ikonka na mapie, widoczna nawet dla heard-about lokacji
- [ ] Klik "Travel here" na adjacent visited lokacji → scena generowana z context "podróżuję do X"
- [ ] Klik w wioskę (visited) → popover "View sublocations" → sub-mapa, klik w tawernę generuje scenę "wchodzisz do tawerny"
- [ ] Back button w sub-view wraca do top-level bez generowania sceny
- [ ] Admin MapTab toggle działa, tile grid pokazuje wszystko wraz z niedokrytymi

### Round E
- [ ] `WorldEntityEmbedding` ma wpis dla każdego canonical NPC i location po seedzie
- [ ] Stats tracking działa: po kilku scenach z NPC `interactionCount`, `dialogCharCount`, `lastInteractionAt` rosną
- [ ] Sztuczna kampania: zabij kluczowego NPC (np. Kapitan Gerent), zakończ kampanię → po finalizacji `WorldNPC.alive=false` dla tego NPC, log w knowledgeBase
- [ ] Kampania ze zniszczeniem lokacji (narracyjnie) → `WorldLocation.worldHistory` zawiera wpis
- [ ] Medium-confidence change → pojawia się w admin "Pending canonicalizations" → World state changes
- [ ] Kampania z silnie eksploatowanym ephemeral NPC (dużo dialog, quest involvement) → small model ocenia, pojawia się w "NPC promotions" tab z verdict (recommend/reasons/scores)
- [ ] Kampania z AI-gen lokacją odwiedzoną wielokrotnie → pojawia się w "Location promotions"
- [ ] Admin approve NPC promotion → tworzy się WorldNPC z `canonicalId`, embedding rebuildowany
- [ ] Nowa kampania po pierwszej: promowany NPC pojawia się w świecie (jest widoczny via canonical query)
- [ ] Nowa kampania po pierwszej: dead NPC jest faktycznie nieobecny (alive=false → clone-on-first-encounter nie spawnuje)
- [ ] Campaign sandbox: w trakcie gry `WorldNPC.currentLocationId` **nie zmienia się** gdy Phase 4 trigger przenosi NPC; tylko `CampaignNPC.lastLocationId` się zmienia
- [ ] Istniejący `maybePromote()` nie tworzy już WorldNPC inline — tylko kandydata do review
- [ ] Canon Knowledge Graph tab renderuje canonical world, węzły kolorowane po category/locationType, click → side panel z detalami
- [ ] RagService: `index()` + `query()` działają dla wszystkich typów entity; batch backfill zrobiony raz

## Co świadomie odkładam / odrzucam

- **Biome intent classifier** — odłożone (Round D). Istniejący `WorldLocationEdge.terrainType` (`road|path|wilderness|river|mountain`) + `region` wystarczą na start. Revisit gdy realnie zobaczymy sceny pozbawione flavor.
- **Ephemeral NPC jako osobne pole** — `worldNpcId IS NULL` = ephemeral. Wprowadzenie boolean `ephemeral` byłoby redundantne.
- **Nowy rejestr triggerów questów** — `pendingIntroHint` + `setWorldNpcLocation` pokrywają aktualną potrzebę. Inne kinds (unlock door, spawn encounter, change weather) dodamy gdy będą konkretnie potrzebne.
- **Multiplayer support** — poza zakresem. Living World nadal solo-only. Explicit note w docs.
- **Migracja in-flight kampanii** — feature roll-forward. Istniejące kampanie dostają puste `discoveredLocationIds=[]` → widzą tylko to, co mają w `UserWorldKnowledge` (kapitol + co odkryte przez dotychczasowe kampanie). Bez backfillu quest starter — obecne aktywne questy zostają.
- **Rozszerzenie enum kategorii NPC** — TODO w kodzie, nie dziś. Aktualne 5 wystarczy dla picker'a questgivera + scene-gen flavor.

## Otwarte ryzyka do pilnowania w implementacji

- **`CampaignLocationSummary` trzyma `locationName` string** — gdy `CampaignQuest.questGiverWorldNpcId` przejdzie na ObjectId, `questGiverId` string zostaje (flavor), ale summary pozostaje name-keyed. Jeśli nazwa się zmieni → zerwana referencja. Rozważ: utwardzić `CampaignLocationSummary.worldLocationId` w osobnej iteracji, albo tylko dokumentować quirk.
- **Seed idempotency** — nowe pola (`isCanonical`, `dangerLevel`, `subGridX/Y`, `knownByDefault`) muszą mieć defaulty. Seed przy każdym boot ponownie `upsert` ustawi, więc issue tylko dla istniejących rows *przed* deployem — migracja Prisma doda defaulty.
- **Policy: forcedGiver override vs `pickQuestGiver` locality-weighting** — gdy `forcedGiver=true`, `pickQuestGiver()` jest pomijany jawnie. Dokumentuj tę ścieżkę w [backend/src/services/livingWorld/questGoalAssigner.js](backend/src/services/livingWorld/questGoalAssigner.js).
- **Click-to-enter-sublocation UX** — dispatching syntetycznego usera-message przez pipeline LLM jest semantycznie czyste, ale droższe (nano + scene-gen call). Jeśli koszt stanie się problemem, Round D może dodać "cheap enter" mutację stanu bez regen sceny.
- **Grid 10×10 vs `worldBounds`** — kampania ma `worldBounds` (JSON `{minX, maxX, minY, maxY}`). Trzymaj grid 10×10 = `worldBounds` {min:-5, max:5} by dane pasowały. Jeśli kampania ma większe bounds (proc-gen), grid może się nie zmieścić — UI fallback: skalowanie.
- **Hearsay policy enforcement** — LLM może mimo instrukcji wygadać lokację spoza `knownLocations` NPC lub wymyślić nieistniejącą. Handler w processStateChanges musi: (1) resolve `locationId` do realnego WorldLocation (po id lub canonicalName); (2) jeśli lokacja nie istnieje → skip + log; (3) jeśli istnieje ale nie w NPC.knownLocations → skip + log jako policy violation. Nie chcemy żeby "wyciek wiedzy" przez LLM stał się bypassem fog-of-war.
- **Hearsay vs quest starter objective** — jeśli quest objective mówi "znajdź X" i X jest w heard-about, UI powinno podświetlić X na mapie (quest marker), ale nie automatycznie awansować do visited. Dopiero wizyta awansuje. Verify w playtest że nie ma doubled-marking.
- **Sandbox audit footprint** — audit "co dziś zapisuje do WorldNPC w runtime" musi być wyczerpujący. Pominięcie jednego writera sprawi że canonical world zostanie zmutowany mimo zasady. Sugerowana metoda: grep `prisma.worldNPC.update` + ręczny review każdego call-site. W razie wątpliwości dodać log/warning przy bezpośrednim write do WorldNPC w ścieżce scene-gen.
- **Post-campaign promotion — ryzyko "fake progress"** — LLM przy extraction może wygenerować wymyślone zmiany (np. "NPC odkrył nową tajemnicę" gdy tego nie było). Mitigation: wymagaj by high-confidence wymagało korelacji shadow-diff + LLM-extracted (oba źródła). Jeśli jest tylko LLM-extracted bez shadow → max medium confidence → admin review. Nie auto-apply LLM-only changes.
- **Embedding staleness** — gdy canonical entity się zmieni (rename, role change), embedding powinien być rebuildowany. Trigger: post-Round-E auto-apply wywołuje `rebuildEmbedding` dla dotkniętych encji. Admin manual edit też. Monitor: warn w seedzie jeśli entity zmieniona a embedding starszy niż N dni.
- **Refactor `maybePromote()` — regression risk** — istniejąca ścieżka "quest_involvement → WorldNPC created inline" jest obecnie oczekiwana przez sceny i prompty. Po refactorze NPC zostaje w CampaignNPC dopóki admin nie zatwierdzi. Sprawdź że prompty nie zakładają `worldNpcId!=null` dla significant NPCs. Jeśli zakładają — zmień by używały `worldNpcId ?? campaignNpcId` albo po prostu `name`.
- **Small model cost** — 3 NPC candidates × ~3000 tokens input × cena Haiku = niski, ale gdy kampanii będzie dużo, warto monitorować. Można: uruchamiać Phase 12b tylko dla kampanii oznaczonych jako "worth reviewing" (np. >N scen, main quest completed).
- **Candidate dedup across campaigns** — embedding similarity threshold dla dedup (0.85) może być za niski — ryzyko merge różnych NPC o podobnych imionach (np. "Strażnik Bjorn" vs "Strażnik Bjorn Myśliwy"). Tuning po playtestach. W razie false merge, admin reject + manual split.
- **Admin fatigue** — jeśli każda kampania generuje 3-5 candidates, admin się znudzi. Mitigation: auto-reject candidates z `recommend=no` (nawet nie pokazywane), small model threshold powinien być selective, a nie permissive.
- **Grid placement collision** — AI może wprowadzić wiele lokacji w jednej scenie narracyjnie ("natrafiasz na osadę, za nią ruiny, dalej jaskinia"). Placer musi obsłużyć batch — układać je sekwencyjnie, każda kolejna unikająca wcześniejszych. Alternatywa: placer zwraca list coords dla listy hints.
- **Out-of-bounds AI location** — LLM może chcieć lokację "daleko na zachodzie" wykraczając poza worldBounds. Placer shrink'uje do granicy; jeśli brak miejsca → odrzuca + fallback narracyjny (LLM info "miejsce jest zbyt odległe by pojawić się na mapie teraz").
- **`canonicalName` suffix przy promocji** — gdy lokacja jest promowana z non-canonical do canonical, admin musi mieć ui do rename (bo `xyz_{campaignIdShort}` jest brzydkie). Conflict check: jeśli "Chatka Myśliwego" już istnieje w canonical → wymuszaj rename "Chatka Myśliwego 2" lub rejection.
- **Campaign-created sublocations promotion** — jeśli AI stworzy sublokację w canonical village (np. "ukryta piwnica w tawernie"), czy promujemy ją do canonical razem z rodzicem? To byłaby sublokacja w globalnym świecie, która pojawia się tylko w przyszłych kampaniach po approve. Decyzja: tak, ta sama ścieżka promocji obejmuje też sublokacje. Ale tylko gdy rodzic jest canonical (bo promocja sublokacji w promoted-location musi mieć zatwierdzonego rodzica najpierw).

## Future ideas (zapisane, niezrealizowane teraz)

- **Event-sourced scene log** — zamiast mutować `coreState` in-place, każda scena emituje strukturalne eventy (`quest_advanced`, `npc_moved`, `location_discovered`) do `CampaignEventLog`. Stan derivowany z sekwencji + snapshot cache. Korzyści: replay debug (reprodukuj bug dokładnie), lepszy write-back (LLM widzi arc narracyjny, nie tylko final state), audit trail, foundation pod "undo scene"/"what if" branching. Koszt: duży refactor state management core. Revisit gdy będziemy chcieli zaawansowane debugging albo branching.
- **Lore per-NPC filtering** — sekcje `WorldLoreSection` dostają opcjonalne `audienceCategories: [priest, noble, scholar]`. Scene prompt filtruje lore per NPC w scenie — farmer nie dostaje historii królewskiej, arcykapłanka nie dostaje sekretów cechu złodziei. Realizm knowledge scope + redukcja prompt bloat. Revisit gdy lore urośnie i NPC będą mieli konflikty "kto-co-wie".
- **Faction system** — `Faction { id, name, description, alignedNpcs[], alignedLocations[] }`. `CampaignNPC.factionId` (już istnieje nieużywany) i analogicznie na lokacjach. Quest archetypes i dialogi faction-aware. **Świadomie pomijamy teraz** — user wskazał że to zaszłość z warhammera, nie kluczowe.
- **NPC schedules (daily routines)** — `WorldNPC.schedule: JSON` (już zarezerwowane w schemacie). Kapłan rano w świątyni, wieczorem w tawernie. NPC tick loop respektuje schedule. Revisit gdy chcemy immersive "living NPC day cycles".
- **In-game calendar / time-of-day** — world time (day/night, seasons) wpływa na NPC availability, scene flavor, event triggers. Revisit z NPC schedules.
- **World time sync** — NPC agents background loop (npcAgentLoop.js) może wykonywać actions także gdy gracz offline (via cron/Cloud Tasks). Istniejące ideas/living-world-npc-auto-dispatch.md to pokrywa.
- **Player action analytics dashboard** — agregat interactionCount, questCompletionRate, averageSceneLength per kampania. Admin widzi co działa, co nie.
