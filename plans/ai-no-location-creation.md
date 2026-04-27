# Plan: AI nie tworzy lokacji w scenach

## Context

Po `woolly-inventing-stardust` (initialLocations przy creation) AI ma zaszczepione tematyczne miejsca od sceny 1. Następny krok: zabieramy AI uprawnienia do dynamicznego tworzenia top-level lokacji + emitowania `stateChanges.currentLocation`. BE staje się jedynym arbitrem "gdzie gracz jest" — bazuje na intent classifier + fog + canonical/campaign locations w zasięgu.

Korzyści:
- Brak "AI wymyśla nazwę → BE materializuje przy bugowanym smart-placerze".
- Spójność mapy: tylko canonical (seed) + initialLocations (creation) + sublokacje (mid-play wejście do budynku) + admin-promoted.
- Wilderness/biome jako bare flavor — gracz "podróżuje przez las", brak row, brak mapy entry. Zgodne z biome-tiles roadmap.

## Decyzje (potwierdzone z userem)

1. **Sublokacje zostają** — AI nadal emituje `newLocations` z `parentLocationName` set'em na canonical settlement. Tylko top-level path znika.
2. **Wilderness/biome — NIE tworzymy żadnej lokacji.** `Campaign.currentLocationName = "<flavor>"`, `currentLocationKind/Id = null`. Gracz nigdy dwa razy nie trafia w to samo "miejsce" w lesie.
3. **`stateChanges.currentLocation` znika z output AI.** BE-side resolver decyduje na podstawie intent classifier (`_travel` + `_travelTarget`).
4. **Player map UX (A):** pin znika gdy `currentLocationId=null`. Dodajemy banner nad mapą "📍 <currentLocationName>" jako fallback.
5. **Jeden sweep** — wszystkie zmiany razem, jeden manual playtest.

## Implementacja

### Krok 1 — drop `processTopLevelEntry` mid-play path
- [processStateChanges/locations.js](backend/src/services/sceneGenerator/processStateChanges/locations.js):
  - `processLocationChanges` traci top-level branch — przepuszcza tylko entries z `parentLocationName` set'em. Bez parenta → log warn "top-level emission no longer supported", drop.
  - `processTopLevelEntry` zostaje wyeksportowane (używa `initialLocationsResolver` z creation-time path) — ale nie wołane z mid-play.
  - Drop `BLOCKED_MIDPLAY_LOCATION_TYPES` (pusty cel) lub zostaw jako defensive guard wewnątrz `processTopLevelEntry`.
  - Drop `anchorRef` resolution na początku `processLocationChanges` — sublocation branch używa `resolveLocationByName` per-entry.

### Krok 2 — drop `stateChanges.currentLocation` z AI output + auto-promote nowej subloc
- [processStateChanges/index.js:100-114](backend/src/services/sceneGenerator/processStateChanges/index.js#L100-L114) — drop auto-promote-to-newLocations branch.
- Dropujemy zapis do `Campaign.currentLocationName` z tego pola (BE travel resolver przejmuje).
- Pole nadal może przejść przez Zod schema (gdy AI ignoruje rule i emituje) — ale processor je IGNORUJE z log warn.
- `processCampaignComplete` + `auditQuestWorldImpact` używają `currentLocation` z payload — przełączyć na `Campaign.currentLocationName` z DB.
- **Auto-promote rule** (intra-settlement / canonical-subloc movement): po `processLocationChanges` zwróconym `createdSublocs[]`, jeśli:
  - DOKŁADNIE jedna nowo utworzona subloc tej sceny (anti-false-positive — gdy AI mentions kilka budynków, żaden nie jest auto-current'em), AND
  - jej `parent` jest w **walk-up chain** current location (current itself, current's parent, parent's parent, ...) — pokrywa: child obecnej lokacji, sibling subloc tego samego settlement, child canonical sublokacji w której gracz jest, etc.,
  → set `Campaign.currentLocation*` na utworzoną subloc.
- `processSublocationEntry` musi zwracać `{kind, row}` utworzonej subloc (dziś zwraca void).
- Walk-up helper: `walkUpAncestors(ref, {prisma})` — sleci po `parentLocationKind/Id` (canonical) lub `parentLocationId` (CampaignLocation polymorphic), zwraca chain ids set'em.

### Krok 3 — drop schema/prompt
- [staticRules.js:154](backend/src/services/sceneGenerator/systemPrompt/staticRules.js#L154):
  - Drop `"currentLocation": ""` z schema mockup.
  - Zmień `"newLocations"` na sublocation-only shape: `{name, parentLocationName, locationType:"interior", slotType, description}`.
- [livingWorldBlock.js](backend/src/services/sceneGenerator/systemPrompt/livingWorldBlock.js):
  - `buildNewLocationsFullSchema` — drop TOP-LEVEL section, zostaw SUBLOCATIONS section + comment "BE handles top-level + currentLocation server-side".
  - `buildNewLocationsStaticHint` — przepisać na sublocation-only.
- Dodać do staticRules nowy bullet: "Player movement is server-side. Don't emit `currentLocation` or top-level `newLocations`. Narrate as if you're at the BE-resolved location (provided in [CURRENT LOCATION] block)."

### Krok 4 — BE travel resolver (NEW)
- Nowy plik: `backend/src/services/livingWorld/travelResolver.js`.
- Eksport: `async function resolveTravelDestination({campaignId, userId, currentRef, intent, playerAction})`.
  - `currentRef`: `{kind, id, name, row}` z Campaign.currentLocation* + załadowany row (ma `locationType`, `parentLocationId`/`parentLocationKind`).
  - `intent`: `{_intent, _travelTarget}` z heurystyki.
  - Logika:
    1. Brak `_travelTarget` lub `_intent !== 'travel'` → return `null` (no change).
    2. Match `_travelTarget` przeciwko `listLocationsForCampaign(campaignId, {includeSubs: true})` filtered by fog (visited + heard-about). Pokrywa canonical top-level + canonical sublocations + campaign top-level + campaign sublocations.
    3. Hit → return `{kind, id, name}`.
    4. Brak match — wilderness fallback **tylko gdy** `currentRef.kind=null` LUB `currentRef.row.locationType ∈ TERRAIN_TYPES = {wilderness, forest, cave, ruin, mountain, campaignPlace, generic}`. Inaczej (settlement/interior/dungeon/dungeon_room/canonical sublocation) → return `null` (no-op, AI dostaje chance na subloc creation, post-process auto-promote się tym zajmie).
    5. Wilderness fallback: `{kind: null, id: null, name: <bare flavor>}`.
- Wywoływane w `generateSceneStream` PRZED premium scene-gen — żeby premium dostał updated `[CURRENT LOCATION]`.

### Krok 5 — wire w generateSceneStream
- [generateSceneStream.js](backend/src/services/sceneGenerator/generateSceneStream.js):
  - Po intent classifier, przed `assembleContext`: `const travelDest = await resolveTravelDestination({...})`.
  - Jeśli non-null → update Campaign.currentLocation* w DB + przekaż do contextu przez `currentRef` override.
  - SSE event `travel_resolved` (debug + FE może update mapę przed sceną).

### Krok 6 — wilderness banner (FE)
- [PlayerWorldMap.jsx](src/components/gameplay/worldMap/PlayerWorldMap.jsx) lub `GameplayPage` parent — dodać banner gdy `data.currentLocationId == null && data.currentLocationName`:
  - Render: `📍 {currentLocationName}` jako floating label nad mapą.
  - Map sam się nie zmienia — pin znika (status quo).
- Sprawdzić co zwraca `/v1/campaigns/:id/map` — jeśli `currentLocationId=null` to wystarcza, banner czyta z `Campaign.currentLocationName` (już dostępne via separate fetch lub można dodać do map response).

### Krok 7 — wilderness flavor name generator
- W `travelResolver.js` helper `generateWildernessFlavor({biome, direction, fromName})`:
  - Pre-biome-tiles: `["Las", "Pustkowia", "Wzgórza", "Mokradła", "Stepy"]` random pick + optional `${dir} od ${fromName}` suffix.
  - Post-biome-tiles: stub teraz, podmienić na `tile.name || tile.biome` gdy biomy dojadą.

### Krok 8 — drop `_intent: 'travel'` event-only consumption
- [generateSceneStream.js:102](backend/src/services/sceneGenerator/generateSceneStream.js#L102) — emit `_travelTarget` w SSE event obok `_intent` (debug).

## Out of scope

- Biome-tiles (osobny PR per knowledge/ideas/biome-tiles.md).
- Last-known location pin fallback (decyzja A — pin znika, banner zastępuje).
- Travel via map "go-to" UI (osobne wire'y).
- Multiplayer — `multiplayerAI` bypass'uje Living World, nie dotyczy.

## Verification

1. **Build**: `node --check` na każdym edytowanym pliku + nowy `travelResolver.js`.
2. **Smoke**: nowa living-world kampania, gracz emituje "idę do Modrzejowa":
   - Log: `travel_resolved {target: "Modrzejów", kind: "world", id: ...}`
   - DB: `Campaign.currentLocationKind/Id` updated.
   - Premium prompt zawiera `[CURRENT LOCATION] Modrzejów`.
3. **Smoke**: gracz emituje "idę na zachód w las":
   - Log: `travel_resolved {target: "las", kind: null, id: null, name: "Las"}`.
   - DB: `currentLocationName="Las"`, `currentLocationKind=null`, `currentLocationId=null`.
   - FE banner pokazuje "📍 Las".
4. **No regression**: AI emituje subloc (gracz wchodzi do nowej tawerny w mieście) → przechodzi przez `processSublocationEntry`, materializuje się w CampaignLocation z `parentLocationKind=world`.
5. **Defensive**: AI emituje `stateChanges.currentLocation: "Wymyślona Wioska"` (mimo prompt rule) → log warn, NIE materializuje, BE travel resolver dostaje rotation, ostateczny currentLocation z resolvera.

## Kolejność implementacji

1. Audyt: travelResolver placement w scene-gen pipeline + ` /campaigns/:id/map` response shape.
2. Krok 4 + 7 (travel resolver + wilderness flavor) — pure logic, testowalne.
3. Krok 5 (wire pre-premium).
4. Krok 1 (drop top-level mid-play path).
5. Krok 2 (drop currentLocation processor).
6. Krok 3 (schema/prompt cleanup).
7. Krok 6 (FE banner).
8. Krok 8 (SSE event extension).
9. Manual smoke (wszystkie 5 verification cases).
