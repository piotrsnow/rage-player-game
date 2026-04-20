# Living World — bugfixy + Phase 7 (topologia świata)

> Po approval: przenieść do `c:/git/rage-player-game/plans/living-world-phase-7-topology.md`.

## Kontekst

Audit po commitach `139960d` (phase 2) i `69e4db9` (idk anymore) wykrył jeden krytyczny bug który **blokuje cały Living World pipeline end-to-end**, oraz lukę architektoniczną: świat nie ma topologii (brak parent-child lokacji, brak grafu połączeń, brak population caps, NPC rośnie bez reuse). Ten plan: (1) naprawia bugi, (2) weryfikuje goal assignment działa, (3) dodaje Phase 7 — strukturalny model świata z ograniczonymi slotami sublokacji + graf połączeń + travel intent.

---

## Część A — Bugfixes (zrobić najpierw, blokuje playtest)

### Fix 1 — `relatedQuestIds` crashuje NPC introduce (KRYTYCZNY, silent)

**Plik:** [backend/src/services/sceneGenerator/processStateChanges.js:79](backend/src/services/sceneGenerator/processStateChanges.js#L79)

```js
relatedQuestIds: JSON.stringify(npcChange.relatedQuestIds || []),  // ← USUNĄĆ
```

`CampaignNPC` schema nie ma tego pola ([schema.prisma:117-142](backend/prisma/schema.prisma#L117-L142)). Prisma rzuca `PrismaClientValidationError`, outer catch połyka → NPC milcząco nie powstaje → `worldNpcId` null → `maybePromote` nie odpala → żadna Phase 1-5 nie działa. `relatedQuestIds` żyje tylko w `coreState` JSON, nigdy nie jest czytane z Prisma row (weryfikacja: grep w [shared/domain/multiplayerState.js:179](shared/domain/multiplayerState.js#L179) — runtime field na obiekcie, nie kolumna).

**Fix:** usunąć linię 79.

### Fix 2 — `item_given` WorldEvent bez `gameTime`/`worldLocationId`

**Plik:** [backend/src/services/sceneGenerator/processStateChanges.js:145-158](backend/src/services/sceneGenerator/processStateChanges.js#L145-L158)

Pass `gameTime` z scene'a + resolve `worldLocationId` przez `campaignNpc.currentLocationId`. Niekrytyczne dziś (single-campaign), naprawić przy okazji przed Phase 3 cross-user.

### Verify goal assignment

Po fixie #1, sprawdzić ręcznie że po scenie z nowym NPC z questem:
1. `db.CampaignNPC.findOne({name: "..."})` istnieje + `worldNpcId` set
2. `db.WorldNPC.findOne(...)` ma `activeGoal` ustawione (quest-driven text z `buildGoalString`)
3. Po `POST /v1/admin/livingWorld/npcs/:id/tick` → `goalProgress` się zmienia + WorldEvent zapisany

Jeśli 1 fail → bug #1 nadal. Jeśli 2 fail → bug w `questGoalAssigner` (niedopasowane `npcId` slug). Jeśli 3 fail → bug w `npcAgentLoop`.

### UX gaps do zrobienia przy okazji

- DM Settings UI dla `worldTimeRatio` / `worldTimeMaxGapDays` (dziś tylko default 24.0 / 7)
- Batch-tick button w admin page (endpoint istnieje orphan)

---

## Część B — Phase 7: Topologia świata

### B.1. Problem który rozwiązujemy

1. **AI ciągle tworzy nowe NPC** zamiast reużywać — bo w prompt kontekście nie widzi listy "kto tu jest". Output: każda scena w Watonga ma innych strażników.
2. **Brak hierarchii lokacji** — "Kościół w Watonga" i "Watonga" są osobnymi, niepowiązanymi WorldLocation. NPC "strażnik kościoła" może być w dziwnych relacjach.
3. **Brak grafu** — podróż z Watonga do Avaltro teleportuje gracza, zamiast przejść przez Las/Romanum/Kanion.
4. **Brak population caps** — 100 scen w Watonga = 100 NPC, niezarządzalne.

### B.2. Schema (additive — żadne breaking zmiany)

```prisma
model WorldLocation {
  // existing: canonicalName, aliases, description, category, region, embedding...
  parentLocationId   String?   @db.ObjectId     // null = top-level settlement/wilderness
  locationType       String    @default("generic")  // hamlet|village|town|city|capital|dungeon|forest|wilderness|interior
  slotType           String?                        // dla sublocations: tavern|church|blacksmith|... null dla top-level
  slotKind           String    @default("custom")   // required|optional|custom — tylko dla sublocations
  // Capacity (populated from locationType defaults on create; admin-tunable)
  maxKeyNpcs         Int       @default(10)
  maxSubLocations    Int       @default(5)
  // Position (MUST HAVE — used for detour detection + AI placement decisions)
  regionX            Float                           // logical 2D coord, abstract units where 1 unit ~ pół dnia marszu
  regionY            Float                           // same scale as X
  positionConfidence Float     @default(0.5)         // 0.0-1.0 — ile BE/gracz wie na pewno vs. zgadywane; rośnie przy rzeczywistej podróży tam
  @@index([parentLocationId])
  @@index([locationType])
}

model WorldLocationEdge {
  id                 String   @id @default(auto()) @map("_id") @db.ObjectId
  fromLocationId     String   @db.ObjectId
  toLocationId       String   @db.ObjectId
  distance           Int                             // abstract units (1 = ~pół dnia marszu pieszo)
  difficulty         String    @default("safe")      // safe|moderate|dangerous|deadly
  terrainType        String    @default("road")      // road|path|wilderness|river|mountain
  discoveredByCampaigns String @default("[]")        // JSON array campaignId — edge "widzialny" tylko dla tych kampanii
  createdAt          DateTime @default(now())
  @@unique([fromLocationId, toLocationId])
  @@index([fromLocationId])
  @@index([toLocationId])
}

model WorldNPC {
  // additions
  homeLocationId     String?  @db.ObjectId   // juz uzywane w questGoalAssigner return-home; jawnie w schema
  keyNpc             Boolean  @default(true)  // false = background, nie promote, nie tick
}

// Per-user world discovery state — anchor lokacje + odkryte przez podróż
model UserWorldKnowledge {
  id                     String   @id @default(auto()) @map("_id") @db.ObjectId
  userId                 String   @unique @db.ObjectId
  discoveredLocationIds  String   @default("[]")   // JSON array
  discoveredEdgeIds      String   @default("[]")   // JSON array — edges widoczne na mapie
  updatedAt              DateTime @updatedAt
  @@index([userId])
}

model Character {
  // addition
  clearedDungeonIds  String   @default("[]")  // JSON array — dungeon raz przejdziony, nie da się powtórzyć tą postacią
}

model User {
  // addition
  contentLanguage    String   @default("pl")  // pl|en — language in which AI generates world content (NPC names, locations, dialog). UI language (i18next) changes independently.
}
```

### B.3. Settlement-type defaults (konfiguracja — nie schema)

Nowy plik: `backend/src/services/livingWorld/settlementTemplates.js` — eksportuje:

```js
export const SETTLEMENT_TEMPLATES = {
  hamlet:   { maxKeyNpcs: 5,  maxSubLocations: 2, required: [], optional: ['tavern', 'elder_home'], customCap: 1 },
  village:  { maxKeyNpcs: 10, maxSubLocations: 5, required: ['tavern'], optional: ['church', 'blacksmith', 'alchemist', 'market', 'watchtower', 'mill', 'elder_home'], optionalCap: 3, customCap: 1 },
  town:     { maxKeyNpcs: 20, maxSubLocations: 10, required: ['tavern', 'market'], optional: ['church', 'blacksmith', 'alchemist', 'barracks', 'temple', 'guild_hall', 'bathhouse', 'library', 'brothel'], optionalCap: 6, customCap: 2 },
  city:     { maxKeyNpcs: 40, maxSubLocations: 18, required: ['tavern', 'market', 'barracks'], optional: [/* większa lista */], optionalCap: 12, customCap: 3 },
  capital:  { maxKeyNpcs: 70, maxSubLocations: 25, required: ['tavern', 'market', 'barracks', 'palace', 'grand_temple'], optional: [/* */], optionalCap: 18, customCap: 4 },
  dungeon:  { /* NIE używa organic slot system — patrz B.9 Dungeon Seed Generator */ generated: true },
  wilderness: { maxKeyNpcs: 3, maxSubLocations: 3, required: [], optional: ['camp', 'ruin', 'cave'], optionalCap: 3, customCap: 2 },
};
```

Uzasadnienie liczb: 10 NPC na wioskę (user's spec), miasto ~2x, stolica ~4x, dungeon głównie `custom` bo pokoje niestandardowe. **Luz na zmianę** — liczby łatwo tune'ować po playtest.

### B.4. Jak to egzekwować

**Na wejściu (scene-gen wyemitował nowe NPC/sublokację):**

1. `processStateChanges` + nowy moduł `topologyGuard.js`:
   - Sublokacja tworzona → check parent's `maxSubLocations` + `slotKind`:
     - jeśli `slotType` matchuje `required` lub `optional` w parent's template → OK
     - jeśli `slotType` null / nie matchuje → try `custom`, check `customCap`
     - over-cap → DROP (log warn "sublocation over cap, ignoring"); scene-gen dostanie feedback w następnym promptcie przez Living World block
   - Nowy NPC w lokacji → check `maxKeyNpcs`:
     - jeśli pod capem → normal promote path
     - jeśli nad capem → create `CampaignNPC` z `keyNpc=false`, NIE promote do WorldNPC (background NPC, nie tick)

**W promptcie (kierowanie premium żeby reużywał):**

W Living World context block dodać sekcję:

```
## NPCS AT CURRENT LOCATION ({name}, {locationType})
Key characters already here (USE THEIR NAMES when relevant, don't introduce duplicates):
- {Name} ({mood}, {role/quest hint})
- ...
Background population (~N): describe collectively as generic "{villagerLabel}" / "{guardLabel}" — DO NOT name them or create CampaignNPC records. ONLY promote a background NPC to named WorldNPC if the player explicitly asks "kim jesteś" / "jak masz na imię" or interacts substantively (multi-turn dialog). Generic labels per locationType: village → "Wieśniak/Wieśniaczka"; town/city → "Mieszczanin/Mieszczanka"; any → "Strażnik/Strażniczka" for guards.

## SUBLOCATIONS AVAILABLE IN {parentName} ({locationType} — N slots, M filled)
- {SubName} ({slotType} — required/optional/custom)
- ...
Open optional slots: {list}
Custom slot budget: K/N available
```

Premium teraz wie: (a) kto istnieje — powinien reużywać, (b) co wolno dodać — wolne sloty, (c) co nie wolno — brak dalszych custom slotów.

### B.4.5. Ustalanie pozycji nowej lokacji (must-have — zastępuje naive "po prostu dodaj")

**Anchor / world seed**: Stolica zawsze na `(0,0)`, hardcoded w DB seed (nowy plik `backend/src/scripts/seedWorld.js` + idempotent upsert na boot). Stolica zawiera **wszystkie kanoniczne sublokacje** (gospoda, świątynia, koszary, kuźnia, rynek, palace, biblioteka, gildia kupców, więzienie, etc. — pełna paleta wraz z named NPCs: trenerzy umiejętności, mistrzowie cechów, kapłani świątyń). Stolica jest zawsze `discovered=true` dla każdego usera. To jest "fallback location" — gracz wracający tam zawsze znajdzie kogo potrzebuje.

**Skala**: 1 unit = 1 km (per user spec). Każda nowa WorldLocation potrzebuje `regionX/Y`. Flow przy tworzeniu:

1. **Z kontekstu sceny premium znamy current location** (current.x, current.y) — to punkt odniesienia.
2. **Premium emituje nowy location z directional hint**:
   ```json
   {
     "newLocation": {
       "name": "...",
       "locationType": "village",
       "directionFromCurrent": "NE",    // N|NE|E|SE|S|SW|W|NW — 8 kierunków wystarczy
       "travelDistance": "half_day",    // short | half_day | day | two_days | multi_day
       "connectsTo": ["..."]            // opcjonalnie: canonical names lokacji które też są w zasięgu
     }
   }
   ```
3. **BE liczy raw pozycję**: `raw.x = current.x + dx(direction) * distanceUnits(travelDistance)`, gdzie `distanceUnits` = {short: 1, half_day: 2, day: 3, two_days: 4, multi_day: 5}.
4. **Spacing rule (per user spec)**: nowa lokacja musi być co najmniej **3 km** od najdalszej istniejącej WorldLocation w tym samym 8-segmentowym sektorze kierunkowym (relative do current). Jeśli raw pozycja narusza → push out aż spełni warunek. Max single-jump = **5 km** od current; jeśli `travelDistance` sugeruje więcej → splittuj na wirtualne intermediate (Iteracja 2 territory).
5. **Conflict check**: jeśli w promieniu 1 km od raw pozycji jest istniejąca WorldLocation → merge candidate. Match: fuzzy name (Levenshtein <0.3) → merge; else adjust position o min 3 km dalej w tym samym kierunku.
6. **Edge auto-create**: `WorldLocationEdge(current → new, distance = euclidean(current, new), direction)`. Jeśli `connectsTo` podany → dodatkowo edges do nich (BE weryfikuje że są w zasięgu euclidean ≤ ~10 km).
7. **positionConfidence**: 0.5 na stworzeniu (premium guess), +0.1 za każdą rzeczywistą podróż tam-z-powrotem. Capital = 1.0 hardcoded.

Przykład (user spec): stolica (0,0). Nowa wioska na E (4,1) — OK (4 km od (0,0), poniżej max 5). Druga wioska też na E — wyliczone z (4,1) musi być ≥3 km od najdalszego punktu na E, więc min (7,1). Jeśli raw daje (5,1), BE push do (7,1).

**Detour detection**: przy travel intent, po wyliczeniu path Dijkstra:
- `path_length = sum(edge.distance for edge in path)`
- `straight_line = euclidean(start.x/y, end.x/y)`
- `detour_ratio = path_length / straight_line`

Kryteria:
- `detour_ratio < 1.3` → existing path is "direct enough" — **DO NOT generate new intermediate locations**. Travel narrates istniejące waypointy.
- `detour_ratio 1.3-2.0` → sensible detour (góry, rzeka objazd) — travel via known path, NIE dodawać nowych.
- `detour_ratio > 2.0` → long detour, gracz **może** wybrać shortcut (Iteracja 2)
- Brak known path → jeden scenariusz: **exploration** — premium dostaje "no known path, player traveling straight line from (x,y) to (x,y), distance D; generate 1-2 intermediate locations en route" (Iteracja 2)

Kluczowa zmiana względem moich wcześniejszych iteracji: **nie tworzymy nowych lokacji jeśli istnieje sensowna (direct_enough) trasa**. Nowe lokacje tylko przy `detour_ratio > 2.0` + explicit shortcut intent, albo totalny brak path.

### B.5. Graph connections i travel — projekt iteracyjny

**Iteracja 1 (MVP): travel po known graph, single-scene podróż**

- Intent classifier ([intentClassifier.js](backend/src/services/intentClassifier.js)) dostaje nowy pattern `travel_intent` — wykrywa "idę do X", "wyruszam do X", "jadę do X"
- BE ekstraktuje target location, waliduje że istnieje jako WorldLocation
- BE liczy path Dijkstra po `WorldLocationEdge` (tylko edges gdzie `discoveredByCampaigns` zawiera current campaign)
- **Detour check** (B.4.5): jeśli `detour_ratio < 2.0` → use existing path, DO NOT generate new waypointy. `>= 2.0` + choice modal → Iteracja 2.
- Jeśli path istnieje i jest single-hop → scene-gen normalnie, premium dostaje "travel context: 1 edge, 0.5 day, road, safe"
- Jeśli multi-hop direct_enough → scene-gen premium tworzy JEDNĄ scenę obejmującą całą podróż, z explicit instrukcją "the player travels through waypointy [A, B, C] to [D] — weave briefly through each waypoint, do NOT invent new locations, end at destination"
- BE w context injectuje per-waypoint streszczenie recent `WorldEvent` (ostatnie 3 dni game-time) — czysty DB read
- **Plus** (per user decision): JEDEN nano call PRZED premium scene-gen — input: full path + waypointy + recent events; output: 3-5 candidate "travel events" (encounter/discovery/weather/NPC met). Premium dostaje candidates + waypoints i sam wybiera 1-2 do wplecenia + decyduje gdzie player się zatrzymuje. To jest single nano (~500ms, ~$0.0003) zamiast per-waypoint (4× tyle) — i premium ma plot agency, nie tylko narracyjną.

**Dlaczego nie nano-per-location (user's propozycja)**: dla 4-hop trasy to 4× ~500ms = 2s+ dodatkowej latencji + 4× koszt. Przy 80% scen travel to 4× koszt nano dziennie. `WorldEvent` query jest free i wystarczający w 90% przypadków. **Jeśli po playtest okaże się że narracja jest płaska → dodać JEDEN nano call który dostaje całą trasę + wszystkie eventy i zwraca per-waypoint "highlight sentences"** — batch podejście. 4 calls vs 1 call = 4x tańsze i szybsze.

**Iteracja 2 (po MVP playtest): shortcut + unknown territory**

Aktywuje się **tylko** gdy: (a) brak known path do celu, ALBO (b) `detour_ratio > 2.0` I gracz wybrał shortcut.

- Intent classifier dodaje `travel_shortcut` / `travel_offroad` pattern ("idę na przełaj", "tnę przez las", "szukam krótszej drogi")
- BE liczy straight-line distance `euclidean(start, end)` — **to jest ostateczna długość trasy**, nie szacunek
- BE generuje N intermediate coordinates równo rozłożonych na linii start→end, gdzie N = floor(straight_line / 2) (1 intermediate per 2 dni marszu pieszo)
- BE daje premium:
  - start.x/y, end.x/y
  - intermediate coords pre-computed
  - `suggested_new_locations: N` — premium **musi** stworzyć dokładnie N nowych WorldLocations, jedna per coord
  - `locationType` constraint dla każdej: derived z regionu (forest → `wilderness`, near river → `wilderness` z hint, etc.)
  - `encounter_probability: "high"` (shortcut przez dzicz)
- Po scenie: BE weryfikuje że N lokacji zostało emitted z coords ±0.5 unit od expected, tworzy edges start→new1→...→newN→end z `distance = 2` i `difficulty=dangerous` (shortcut default)
- Cap: max 3 new-locations-per-scene (anti-bloat)
- **Kluczowe**: coord-based generation znaczy że premium NIE ma swobody w "ile lokacji" — BE decyduje na podstawie euclidean. Premium tylko nazywa + opisuje + populates.

**Iteracja 3 (polish): choice modal dla known paths**

- Gdy gracz typuje "idę do Avaltro" i istnieje >1 path (known long road vs known dangerous shortcut):
- BE emituje SSE event `travel_choice { paths: [{id, description, distance, difficulty, knownDangerous}] }`
- FE pokazuje modal, gracz wybiera, BE kontynuuje scene-gen z wybraną trasą

**Iteracja 3 jest OPTIONAL** — można obejść przez intent extension "długa bezpieczna trasą" vs "na przełaj". Modal jest UX polish, nie logiczna konieczność.

### B.6. Moje zastrzeżenia (do przegadania)

DECYZJE PODJĘTE PRZEZ USERA (lock-in):
- ✅ Capital hardcoded `(0,0)` z pełną paletą sublokacji + named NPC (trenerzy, mistrzowie cechów, kapłani). World seed script.
- ✅ Spacing: ≥3 km od najdalszej w sektorze, ≤5 km single-jump. 1 unit = 1 km.
- ✅ Background NPCs (non-key): generic naming per locationType ("Wieśniak", "Mieszczanin", "Strażnik"). Promote do WorldNPC dopiero gdy gracz spyta o imię (intent-driven).
- ✅ Travel: single-scene + jeden batch nano call dla candidate events → premium decyduje co weave.
- ✅ Discovery: per-account (nie per-character), nowy model `UserWorldKnowledge { userId, discoveredLocationIds JSON }`. Capital zawsze discovered.
- ✅ Dungeon: globalny seed (deterministic = dungeonId, nie per-user). Per-character tracking cleared/uncleared (`Character.clearedDungeonIds JSON`). 3 templates na start.
- ✅ Reuse mechanizm — moja propozycja (NPCS AT LOCATION block + fuzzy match)

DODATKOWE LOCK-IN (sesja 2):

- ✅ **Język**: Single-language per account. User wybiera PL lub EN przy signup, **lockuje język generacji AI** (wszystkie NPC/lokacje/dialogi zawsze w tym języku). Osobno w UI settings można zmieniać język interfejsu (i18next), ale to NIE zmienia języka AI. Dodać `User.contentLanguage` field (default 'pl').
- ✅ **Sublokacje**: Dynamiczny prompt — required sublokacje BE tworzy automatycznie przy tworzeniu parent (AI nie dostaje ich do decyzji). Optional → prompt listuje brakujące, AI wrzuca do `optionalCap`. Custom → **BEZ ograniczeń liczbowych** (zero customCap), ale AI MUSI wyraźnie oznaczyć przez unikalną narracyjną nazwę ("Wieża Maga", "Chata Czarownicy", "Ruiny Dawnego Cmentarzyska") — generic nazwy ("mały dom") automatycznie odrzucane / klasyfikowane jako optional. Twardy cap tylko jeśli `maxSubLocations` przekroczony.
- ✅ **Reuse NPC**: Atlas FTS vector index dla WorldNPC ma być dodany niedługo (user zwolni slot). Do tego czasu — caps (maxKeyNpcs) + NPCS AT LOCATION list w promptcie wystarczą. Po dodaniu indexu → cosine ≥0.85 dedupe w `worldStateService.findOrCreateWorldNPC`.
- ✅ **Dungeon na start**: 2 themes (catacomb, cave), 3 templates per theme.

POZOSTAŁE OTWARTE (do playtestu):

1. **Background population risk** — AI może się pogubić i stworzyć imienne "Wieśniaka Janusza". Ryzyko niskie, mamy explicit prompt instruction + caps. Rewiew po playtest.
2. **Multi-hop travel — single scene vs chain.** MVP single scene; przełącz jeśli playtesty pokażą flat waypointy.
3. **Graph discoveredByCampaigns** — per-campaign visibility, cross-user w Phase 8. MVP OK.

### B.9. Dungeon seed generator (deterministyczny layout, AI tylko narruje)

**Problem**: dungeon to inna klasa lokacji niż settlement — tactical clarity wymaga deterministic "co jest w kolejnym pokoju". AI hallucynujące pokoje/pułapki/wrogów mid-scene to gameplay killer (retry = inny dungeon).

**Rozwiązanie**: gdy gracz wchodzi do `locationType="dungeon"`, BE generuje **pełny layout up-front** (pokoje, wyjścia, pułapki, wrogowie, loot). AI przy każdej scenie w dungeon dostaje explicit dane i tylko opisuje atmosferycznie.

**Model danych (reuse WorldLocation + graph):**

```prisma
model WorldLocation {
  // addition dla dungeon rooms:
  roomMetadata  String?   // JSON: { role, trapId, enemyTemplateIds, lootTableId, puzzleId, flavorSeed, entryCleared, trapSprung }
}

model WorldLocationEdge {
  // addition dla dungeon corridors:
  direction     String?   // N|S|E|W|up|down|entrance|exit — null dla overworld edges
  gated         Boolean   @default(false)  // drzwi, klucz, puzzle etc.
  gateHint      String?   // "requires brass key" — AI rozszyfruje narratywnie
}
```

Room = WorldLocation z `locationType="dungeon_room"`, `parentLocationId` = dungeon root. Corridors = WorldLocationEdge z `direction` + `terrainType="dungeon_corridor"`.

**Generator** (nowy plik `backend/src/services/livingWorld/dungeonSeedGenerator.js`):

```js
export function generateDungeonSeed(dungeon, { size, theme, difficulty, rng }) {
  // 1. Structure: graph generation (BSP / corridor+room / hand-picked templates)
  //    size: small (5-10 rooms), medium (15-25), large (30-50)
  //    theme: catacomb | ruin | cave | forest_temple | bandit_hideout | ...
  const rooms = generateRoomGraph(size, theme, rng);
  //    Returns: [{ id, localX, localY, role: 'entrance'|'boss'|'normal'|'treasure'|'puzzle', exits: [{direction, toRoomId, gated}] }]

  // 2. Populate — per-room rolls from theme+difficulty tables
  for (const room of rooms) {
    room.contents = {
      trap: rollFromTable(TRAPS[theme][difficulty], rng, { skipChance: 0.4 }),
      enemies: rollEncounter(theme, difficulty, room.role, rng),  // reuse istniejący encounter budget z bestiary.md
      loot: rollFromTable(LOOT[theme][difficulty], rng, { skipChance: room.role === 'treasure' ? 0 : 0.5 }),
      puzzle: room.role === 'puzzle' ? rollFromTable(PUZZLES[theme], rng) : null,
      flavorSeed: pickFlavor(theme, room.role, rng),  // jedno-zdaniowy atmospheric hint dla AI
    };
  }

  // 3. Persist: create WorldLocation per room + WorldLocationEdge per exit (idempotent on seed hash)
  return { dungeon, rooms, entranceRoomId, bossRoomId };
}
```

**Tables** (statyczne `backend/src/data/dungeonTemplates.js`): `TRAPS`, `LOOT`, `PUZZLES`, `ENCOUNTERS` per theme × difficulty. Wzorowane na istniejącym bestiary + equipment data (`src/data/`). **To jest czyste data — zero AI cost, generator deterministyczny przy tym samym seed.**

**Prompt dla scen dungeonowych** (rozszerzenie [contextSection.js](backend/src/services/sceneGenerator/contextSection.js)):

Gdy current location jest `dungeon_room`:

```
## DUNGEON ROOM — DETERMINISTIC CONTENTS (NARRATE EXACTLY, DO NOT INVENT)

Room: Sala Kości (room 3/12, role: normal)
Exits:
  - North → otwarty korytarz do room 4
  - East → zamknięte dębowe drzwi (requires brass key) → room 7

Trap present (not yet sprung): floor_pit — DC 15 Zręczność, 2d6 damage
Enemies present (not yet cleared): 2× szkielet_wojownik
Loot (hidden unless searched): mała skrzynia za rozsypaną sertą — 2d10 srebrnych koron

Flavor seed: "Smród rozkładu miesza się z pyłem wiekowych kości rozrzuconych po kamiennej posadzce."

RULES:
- If player enters this room for the first time, narrate combat encounter with listed enemies ONLY
- Trap activates only if player moves carelessly or fails Zręczność check
- Do NOT invent additional exits, enemies, traps, or loot beyond what's listed above
- If player asks "what else is here" — describe using flavor seed only
- After combat resolves, mark `entryCleared=true` via stateChanges.dungeonRoom.cleared
```

**Wchodzenie do dungeonów — flow:**

1. Scene-gen detects `locationType="dungeon"` w newLocation (premium emituje) lub player enters via travel intent
2. BE check: czy dungeon ma już seed (`roomMetadata` dowolnego child room)? Nie → `generateDungeonSeed()` z deterministic rng seeded on `dungeonId+userId` (same user gets same dungeon; different user re-rolls). Tak → skip
3. Player's `currentLocationId` updated to entrance room
4. Scene-gen generuje scenę z promptem powyżej
5. Player typuje kierunek ("idę na północ", "otwieram drzwi na wschód")
6. Intent classifier dostaje `dungeon_navigate` pattern → BE resolvuje exit → update `currentLocationId` → next scene

**Cleared state tracking — per character (user spec)**:
- Dungeon seed jest **globalny i deterministyczny** (`seed = hash(dungeonId)`) — wszyscy gracze widzą ten sam layout (na MVP, per-user variants później)
- Per-character progress: `Character.clearedDungeonIds JSON` — raz przejdziony dungeon nie może być powtórzony tą samą postacią
- W trakcie eksploracji per-room state (cleared/sprung/looted) trzymane w `Character.activeDungeonState JSON` (transient) — flushed do `clearedDungeonIds` po dotarciu do boss room + defeat
- Inne postacie (tego samego usera lub innych) wchodzące do dungeonu od zera dostają fresh state, ale ten sam layout
- Re-entering cleared room w tej samej rozgrywce → prompt "cleared earlier" → AI opisuje znaki walki zamiast powtórki

**Moje zastrzeżenia do przegadania:**

- **Rozmiar tabel**: `TRAPS/LOOT/PUZZLES/ENCOUNTERS` per theme × difficulty to dużo danych. Start: 2 themes (catacomb, cave) × 3 difficulties × 5-10 entries per tabela. ~60-120 rekordów ręcznie. Rozwinięcie po playtest. **Czy OK że 2 themes na start?**
- **AI narratywna swoboda vs deterministic data**: jeśli gracz robi coś nieoczekiwanego ("próbuję przebić się przez ścianę"), premium może chcieć improwizować. Prompt musi wyraźnie powiedzieć "can narrate creative player actions, but cannot add new rooms/enemies/traps". **Akceptujesz tę granicę?**
- **Re-roll vs persistent**: ten sam dungeon dla jednego gracza to ten sam layout (deterministic seed z userId+dungeonId). Ale **inny gracz widzi inny layout** — pytanie czy dla cross-user consistency (Phase 3+) potrzebujemy globalnego seeda. Na MVP: per-user seed, later upgrade.
- **Save scum**: jeśli gracz retry scenę, dungeon zachowuje cleared state (bo persisted w DB). Retry tylko zmieni narrację, nie stan. **To jest design goal, OK?**
- **Dungeon jako graph vs BSP vs dungeon templates**: BSP (binary space partition) daje pseudorandom rectangular layouts. Templates (hand-crafted "mała krypta", "jaskinia", "wieża") dają lepszą jakość ale mniej variety. **Propozycja**: start z 3 templates per theme, potem BSP jako fallback dla large dungeons. Akceptujesz?

### B.10. Critical files — Phase 7

| Zmiana | Plik |
|---|---|
| Schema: parentLocationId, locationType, slot fields, maxKeyNpcs, maxSubLocations, regionX/Y, positionConfidence, homeLocationId, keyNpc, WorldLocationEdge (+direction, gated, gateHint), roomMetadata, UserWorldKnowledge, Character.clearedDungeonIds | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) |
| Settlement templates | (nowy) [backend/src/services/livingWorld/settlementTemplates.js](backend/src/services/livingWorld/settlementTemplates.js) |
| World seed (capital + sublokacje + named NPC trenerzy) | (nowy) [backend/src/scripts/seedWorld.js](backend/src/scripts/seedWorld.js) — idempotent upsert, run on boot |
| Position calculator (spacing rules ≥3 / ≤5 km) | (nowy) [backend/src/services/livingWorld/positionCalculator.js](backend/src/services/livingWorld/positionCalculator.js) |
| Travel candidate events (single nano call) | (nowy) [backend/src/services/livingWorld/travelEventGenerator.js](backend/src/services/livingWorld/travelEventGenerator.js) |
| User discovery tracking | (nowy) [backend/src/services/livingWorld/userDiscoveryService.js](backend/src/services/livingWorld/userDiscoveryService.js) |
| Dungeon templates (traps/loot/puzzles/encounters per theme × difficulty) | (nowy) [backend/src/data/dungeonTemplates.js](backend/src/data/dungeonTemplates.js) |
| Dungeon seed generator | (nowy) [backend/src/services/livingWorld/dungeonSeedGenerator.js](backend/src/services/livingWorld/dungeonSeedGenerator.js) |
| Topology guard | (nowy) [backend/src/services/livingWorld/topologyGuard.js](backend/src/services/livingWorld/topologyGuard.js) |
| Hook: sublocation + NPC cap enforcement + dungeon entrance trigger | [backend/src/services/sceneGenerator/processStateChanges.js](backend/src/services/sceneGenerator/processStateChanges.js) |
| Prompt: NPCS AT LOCATION + SUBLOCATIONS AVAILABLE + DUNGEON ROOM blocks | [backend/src/services/sceneGenerator/contextSection.js](backend/src/services/sceneGenerator/contextSection.js) |
| Prompt: response format for new sublocations (slotType hint) + dungeon narration rules | [backend/src/services/sceneGenerator/systemPrompt.js](backend/src/services/sceneGenerator/systemPrompt.js) |
| Graph edge CRUD + Dijkstra | (nowy) [backend/src/services/livingWorld/travelGraph.js](backend/src/services/livingWorld/travelGraph.js) |
| Intent classifier: travel_intent + dungeon_navigate | [backend/src/services/intentClassifier.js](backend/src/services/intentClassifier.js) |
| Admin map view (use the new graph, show dungeons collapsed as single node) | [src/components/admin/AdminLivingWorldPage.jsx](src/components/admin/AdminLivingWorldPage.jsx) — dodać 5tą tab "Map" |

### B.8. Verification Phase 7

- Unit: `classifySublocation(slotType, parentTemplate)` → required/optional/custom/reject
- Unit: `enforceCapacity(parent, npcs, sublocations)` → array of dropped items
- Unit: Dijkstra na small graph (3 nodes, 2 edges)
- Integration: create village "Watonga" → scene-gen tworzy 5 sublokacji → 6ta drop z log warn
- Integration: create 10 NPCs w Watonga → 11ty leci jako `keyNpc=false` → nie promote
- Manual: kampania w Watonga → travel intent "idę do Avaltro" przy istniejącym path → premium dostaje travel context z waypoints + recent events → scena opowiada o przejściu przez wszystkie
- Manual: admin map pokazuje nodes=locations, edges=LocationEdges, kolor per locationType

---

## Kolejność prac (proponowana)

1. **Dzisiaj**: Fix #1 (1 linia) + fix #2 (dodać gameTime/locationId) + verify goal assignment manual test
2. **Następna sesja A — fundament topologii**: Schema + `seedWorld.js` (capital + named NPC) + `positionCalculator.js` (spacing rules) + `topologyGuard.js` (caps) + prompt NPCS/SUBLOCATIONS block + background NPC naming convention. Playtest: kampania startuje w capital → wychodzi w teren → tworzy 2-3 wioski → weryfikacja pozycji (≥3km, ≤5km), reuse named NPC, brak hallucynacji background ("Wieśniak" zamiast "Janusz").
3. **Następna sesja B — discovery + travel graph**: `UserWorldKnowledge` + Iteracja 1 travel (Dijkstra + detour check + travel candidate events nano) → playtest multi-hop podróży
4. **Potem — dungeon system**: 3 templates + `dungeonSeedGenerator.js` + dungeon room prompt. Playtest jednego dungeon end-to-end.
5. **Potem (optional)**: Iteracja 2 shortcut (jeśli playtest pokaże że jest potrzeba)

Phase 8+ (cross-user, atonement, orchestration, multilingual) — zgodnie z oryginalnym planem, po tym jak Phase 7 jest stabilny.
