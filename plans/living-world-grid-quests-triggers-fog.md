# Living world: grid map, quest-giver binding, NPC triggers, fog-of-war

## Status (2026-04-23)

- ✅ **Round A** shipped — fog schema, NPC categories, world content expansion, World Lore (admin CRUD + scene-gen preamble), hand-authored NPC knowledge. See [knowledge/concepts/fog-of-war.md](../knowledge/concepts/fog-of-war.md), [knowledge/concepts/world-lore.md](../knowledge/concepts/world-lore.md).
- ✅ **Round B** shipped — start-spawn picker (hard-bound first scene), campaign sandbox with INDEPENDENT CampaignNPC shadow (each carries its own activeGoal — canonical NPC lives separate background life), quest trigger `onComplete.moveNpcToPlayer`, hearsay `[NPC_KNOWLEDGE]` prompt block + `locationMentioned` policy handler, AI-generated non-canonical locations via smart placer (distanceHint + optional direction + random fallback), unified `listLocationsForCampaign` helper, `[WORLD BOUNDS]` remaining-room hint, NPC source policy in quest-gen prompt. Cleanup: dropped `WorldNPC.goalTargetCampaignId`/`goalTargetCharacterId` (dead hacks). See [knowledge/concepts/campaign-sandbox.md](../knowledge/concepts/campaign-sandbox.md), [knowledge/concepts/hearsay-and-ai-locations.md](../knowledge/concepts/hearsay-and-ai-locations.md).
- ✅ **Round C** — Phase 6 (top-level tile-grid map + fog render + travel), Phase 7 (sublocation drill-down + auto-open when clicking current settlement + synthetic `Wchodzę do …` dispatch), Phase 8 (admin MapTab Force/Tile-grid toggle + admin sub-grid modal) all shipped. Key correction vs original plan: the player map is a **fixed global `-10..10` grid** (canonical world is the same for every campaign), not driven by per-campaign `Campaign.worldBounds` — that field stays as the AI/seeder placement guardrail only. See [knowledge/concepts/living-world.md](../knowledge/concepts/living-world.md) "Three things that look the same but aren't".
- ⏳ **Round D** — OPTIONAL (deferred): biome flavor, lore RAG retrieval, lore-consistency validator. Not started.
- ✅ **Round E — COMPLETE**. Full post-campaign world write-back pipeline shipped end-to-end:
  - **Phase 9** — RagService (`npc`/`location`/`lore_chunk`/`promotion_candidate`/`location_promotion_candidate`/`npc_memory` entity types, in-process cosine, fire-and-forget indexing at every entity creation site).
  - **Phases 10 + 11 + 12 + 12-lite** — shadow diff collector + LLM fact extraction (nano, bounded sources only) + resolver + shadow-diff correlation + confidence-tiered apply (HIGH NPC-kind → `WorldNPC.knowledgeBase`; all location + HIGH-unsupported-kind + MEDIUM → `PendingWorldStateChange` sticky-status upsert; narrow `alive`/`location` auto-apply on the shadow diff). `WorldLocation.knowledgeBase` + `applyLocationKnowledgeChange` / `applyNpcKnowledgeChange` / `applyApprovedPendingChange` wired for approval.
  - **Phase 12b Slice A + B** — `NPCPromotionCandidate` pipeline with stats tracking (inline interaction + return-visit counts; batch-time structural quest count) + dialog sample harvest + cross-campaign RAG dedup (`dedupeOfId`/`dedupeSimilarity` stashed in stats JSON) + Haiku verdict auto-reject on `recommend=no` or `uniqueness<5` + sticky admin status. Inline `maybePromote` removed; `assignGoalsForCampaign` now operates on all CampaignNPC rows regardless of `worldNpcId`.
  - **Phase 12c** — `LocationPromotionCandidate` pipeline (non-canonical WorldLocations scored by sceneCount + questObjective count; RAG dedup against other location candidates; sticky admin status; `promoteWorldLocationToCanonical` flips `isCanonical=true` + reindexes).
  - **Phase 13a** — admin tab "Promotions" with four panels (run-writeback trigger + pending world-state + NPC promotion candidates + location promotion candidates); backend routes `/pending-world-state-changes`, `/promotion-candidates`, `/location-promotion-candidates`, `/campaigns`, `/campaigns/:id/run-writeback` (rate-limited 5/min); sticky approve/reject with `reviewedBy`/`reviewedAt`/`reviewNotes`.
  - **Phase 13b** — admin tab "Canon" — force-directed SVG graph of canonical world (WorldLocation nodes + WorldLocationEdge lines + WorldNPC dots orbiting home/current location, colored by category). `GET /v1/admin/livingWorld/canon-graph` endpoint. Surfaces "lonely locations" (no edges) and "homeless NPCs" (no home/current link) as red-outlined lists for admin spot-check.
  - **NPC memory Stage 1 + 2a + 2a.1 + 2a.2** — baseline `knowledgeBase` → `[NPC_MEMORY]` prompt block + in-campaign `experienceLog` via `npcMemoryUpdates` bucket + importance-aware top-8 merge + cross-NPC symmetry mirror (Polish-inflection-aware) all shipped earlier.
  - **NPC memory Stage 2b** — `promoteExperienceLogsToCanonical` runs as part of writeback: for every CampaignNPC with `worldNpcId` set, major-importance `experienceLog` entries are promoted to the canonical `WorldNPC.knowledgeBase` with `source: 'campaign:<campaignId>'`. Idempotent via replace-by-source-tag. Prompt renders as `(poprzednia kampania)`.
  - **NPC memory Stage 3** — RAG-powered recall in `buildNpcMemory`. When an NPC's merged memory pool (experienceLog + cross-campaign knowledgeBase) exceeds 15 entries, replaces the static importance-slice with cosine similarity against a scene-derived query (`playerAction + currentLocation`). Entities indexed at write time (`cexp:<campaignNpcId>:<addedAt>` for experience, `wknw:<worldNpcId>:<addedAt>` for cross-campaign). Falls back to static slice on empty RAG hits or missing scene query.

**Before resuming**: run `cd backend && npm run db:push` to push the Round B + Round E schema additions to Atlas (CampaignNPC.lastLocationId/pendingIntroHint/activeGoal/goalProgress/category/experienceLog/interactionCount/dialogCharCount/questInvolvementCount/lastInteractionAt/lastInteractionSceneIndex + CampaignQuest.forcedGiver + WorldLocation fog fields from Round A + WorldLocation.knowledgeBase from Phase 12 closeout + WorldEntityEmbedding from Phase 9 + NPCPromotionCandidate from Phase 12b + PendingWorldStateChange from Phase 12 closeout + **LocationPromotionCandidate from Phase 12c**).

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

### Round A: fundament (✅ SHIPPED — commit `f6dce36 World lore, discover locations`)

**Phase 0a — World Lore document & admin UI.** ✅
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

**Phase 0 — fog-of-war schema (canonical/ephemeral split + hearsay).** ✅
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

**Phase 1 — NPC categories.** ✅ Dodanie kolumn `category`, keyword-backfill z `role` przez `categorize()` reużywający `ROLE_AFFINITY`. Seed [backend/src/scripts/seedWorld.js](backend/src/scripts/seedWorld.js) uzupełnia jawne `category` dla NAMED_NPCS i village NPCs. **Gwarancja pokrycia wszystkich 5 kategorii:**
- `guard` — Kapitan Gerent ✓
- `priest` — Arcykapłanka Lyana ✓
- `adventurer` — skill masters (Darvok, Ilara, Venadra, Taelor, Senya, Ashen, Karros, Korvia) ✓
- `commoner` — Bremys, Wiltar Olbram, Marola ✓
- `merchant` — **brakuje** → recategorize Tamar (innkeeper) jako `merchant`, ALBO dodać nowego NPC "Kupiec Dorgun" w Yeralden Market (preferowane: dodać kupca, karczmarz zostanie `commoner`).
- Otwarte TODO w kodzie: `// TODO(category-enum): rozszerzyć o hunter, noble, rogue, scholar, innkeeper, blacksmith, farmer gdy picker zacznie mieć za mało różnorodności`.

**Phase 2 — world content expansion + NPC knowledge seeding.** ✅ Seed dodaje ~17 nowych lokacji na gridzie 10×10:
- 4 dungeony — jeden safe (ok 2km od kapitolu), moderate (~3-4km), dangerous (~5-6km), deadly (~7-8km)
- ~6 wilderness (forest / mountains / plains)
- ~4 ruins
- ~3 roadside POI (camp, shrine, crossroads)
- Auto-build edges (istniejący kod) z `difficulty` rosnącym z dystansem
- Wszystkie nowe lokacje: `isCanonical=true`, `dangerLevel` per lokacja ręcznie, `knownByDefault=false`
- Sublokacje istniejących wiosek/kapitolu dostają ręczne `subGridX/subGridY` (np. Yeralden Palace (5,5), Grand Temple (3,6), Tavern (6,4), Market (4,3), Barracks (7,7), itd. — capital sub-grid 10×10).

**Phase 2b — seed NPC explicit knowledge.** ✅ Seed przypisuje `knownLocationIds` dla wybranych NPC:
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

### Round B: quest starter binding + triggery (✅ SHIPPED — not yet committed, Round A-B sits together in working tree)

**Ważna korekta architektury shadow vs pierwotny plan:** Pierwotny plan zakładał "mutacje canonical → clone-on-first-encounter, shadow przejmuje state, canonical zostaje zamrożone przez całą kampanię". **Ostateczna decyzja**: WorldNPC i CampaignNPC są **INDEPENDENT** — każdy ma własne `activeGoal` / `goalProgress`. Canonical NPC żyje swoim tłem (ticki `npcAgentLoop` na WorldNPC.activeGoal — np. "Gerent patroluje mury"); shadow niesie rolę NPC w tej konkretnej kampanii (assignGoalsForCampaign na CampaignNPC.activeGoal — np. "czeka aż gracz wróci z dowodami"). Nie synchronizują się. To upraszcza model i eliminuje klasę bugów "kampania popsuła canon". Zobacz `knowledge/concepts/campaign-sandbox.md`.

**Phase 3 — campaign start picker.** ✅ Nowy moduł `startSpawnPicker.js` — tylko ogranicza **gdzie** quest ma się zacząć (settlement/sublokacja/NPC). Całą treść questa dalej generuje large model w `campaignGenerator.js` z pełną swobodą; picker tylko injectuje wybranego NPC jako questgivera do promptu.
1. Losuj settlement z `{capitol, village1, village2}` (weighted: kapitol 40%, każda wioska 30%).
2. Losuj sublokację w settlementcie, która ma ≥1 NPC (jakiejkolwiek kategorii — large model dopasuje ton questa do typu NPC).
3. Losuj NPC z tej sublokacji.
4. Ustaw kampanii: `currentLocation` = sublokacja, `currentWorldLocationId` = jej `id`.
5. Przy generowaniu `initialQuest` w [backend/src/services/sceneGenerator/campaignGenerator.js](backend/src/services/sceneGenerator/campaignGenerator.js) twardo wymuś `questGiverId=<CampaignNPC.npcId>`, `locationId=<sublokacja>`, `forcedGiver=true`. Prompt large modela dostaje: "starting NPC is {name} (category: {cat}, personality: {...}) at {sublokacja}; wygeneruj quest który ten NPC mógłby wiarygodnie dawać".
6. Pierwsza scena: gracz jest już w tej sublokacji, NPC dostępny (auto-clone z WorldNPC do CampaignNPC via `getOrCloneCampaignNpc`).

**Phase 3b — campaign sandbox.** ✅ (zmodyfikowana vs pierwotny plan — shadow jest niezależny, nie "migruje writers z canonical")
- Audit wszystkich call-sites `setWorldNpcLocation`, dialog write do `WorldNPC.dialogHistory`, `activeGoal` update, `alive=false` na WorldNPC. Grep i lista.
- Każdy writer podczas play → przekierowany na odpowiedni field na `CampaignNPC`:
  - `setWorldNpcLocation` → nowy `setCampaignNpcLocation(campaignId, worldNpcId, locationId)` ustawia `CampaignNPC.lastLocationId`.
  - Dialog append → `CampaignNPC.dialogHistory` (już istnieje? sprawdź schema).
  - activeGoal, alive, etc. → `CampaignNPC.*`.
- Helper `getOrCloneCampaignNpc(campaignId, worldNpcId)`:
  - Jeśli CampaignNPC z tym worldNpcId już istnieje → zwróć.
  - Inaczej → stwórz snapshot z WorldNPC (name, role, personality, alignment, currentLocationId → lastLocationId, keyNpc, category, activeGoal, knownLocationIds).
- `listNpcsAtLocation(locationId, campaignId)` (nowa sygnatura): zwraca CampaignNPCs gdzie `lastLocationId=locationId`, plus auto-clone dla WorldNPCs których canonical `currentLocationId=locationId` + brak CampaignNPC yet.

**Phase 4 — quest triggers (movement).** ✅ Rozszerzenie `processStateChanges.js` (miejsce gdzie questUpdates flagują objective complete, ok. linii 612-660):
- Po zakończeniu celu, jeśli w metadanych celu (generowanych przez LLM) jest `onComplete: { moveNpcToPlayer: npcId, message }`:
  - `getOrCloneCampaignNpc(campaignId, npcId)` → zapewnia clone.
  - `setCampaignNpcLocation(campaignId, npcId, player.currentLocationId)` — **nie dotyka WorldNPC**.
  - Zapisz `pendingIntroHint` na CampaignNPC.
- Scene assembler ([backend/src/services/sceneGenerator/aiContextTools.js:604](backend/src/services/sceneGenerator/aiContextTools.js)) już wciąga NPC z lokacji — zmień źródło z `listNpcsAtLocation(locationId)` na `listNpcsAtLocation(locationId, campaignId)` które zwraca CampaignNPC shadow + auto-clone.
- `ambientNpcsWithGoals` dołącza `introHint` gdy jest na CampaignNPC.
- Prompt LLM dostaje jasną wskazówkę: "NPC X właśnie przybył i chce przekazać: {message}".
- Po wygenerowaniu sceny hint jest czyszczony.

**Phase 4b — hearsay discovery przez dialog.** ✅
- Scene assembler dla każdego NPC dostępnego w lokacji buduje `knownLocations = implicit(1-hop via edges) ∪ npc.knownLocationIds`. Resolve na listę `{id, name, hint}` — gdzie `hint` to krótki opis (np. "dungeon known to be dangerous", "village nearby").
- Prompt LLM wzbogacony o sekcję `[NPC_KNOWLEDGE]` per NPC obecny w scenie + instrukcję: "jeśli gracz pyta o miejsca, tylko z tej listy możesz ujawnić; poza listą — NPC nie wie lub spekuluje bez szczegółów".
- Nowy bucket w stateChanges wyjściowych LLM: `locationMentioned: [{locationId, byNpcId}]`.
- Handler w `processStateChanges`: dla każdego mentioned → `markLocationHeardAbout(campaignId, userId, locationId)` (helper z Phase 0).
- Edge case: jeśli NPC wygada lokację spoza swojego `knownLocations` (halucynacja), skip + log warning. Nie chcemy żeby LLM "dodawał wiedzy" ignorując policy.

**Phase 4c — AI-created campaign locations (non-canonical).** ✅ (z dodatkiem: smart placer — BE akceptuje lokacje bez direction+distance, losuje kąt + radius wg `distanceHint`: close=0.1-2 km, far=2.1-4 km, default=close, direction brany pod uwagę z jitter ±22.5°).
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

**Phase 4d — unified location queries + intent-driven knowledge injection.** ✅ (listLocationsForCampaign helper dostarczony; intent-driven NPC expansion używa istniejącego `expand_npcs` z classifier'a — już było zrobione przed Round B)
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

**Phase 5 — NPC policy dla quest steps.** ✅ (dodany do `buildCampaignCreationPrompt` jako "NPC SOURCE POLICY" block — finale/twist → existing canonical; minor → ephemeral OK; category hint per NPC)
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

### Round C: UI — tile grid map + drill-down (⏳ TODO — not started)

**Schema prerequisites already in place** (added in Round A/B): `WorldLocation.isCanonical`, `knownByDefault`, `dangerLevel`, `subGridX/Y`, `createdByCampaignId`, `displayName`; `UserWorldKnowledge.heardAboutLocationIds`; `Campaign.discoveredLocationIds/discoveredSubLocationIds/heardAboutLocationIds`. Fog helpers (`loadCampaignFog`, `markLocationDiscovered`, `markLocationHeardAbout`) exist in `backend/src/services/livingWorld/userDiscoveryService.js`. Unified location query (`listLocationsForCampaign`) exists in `backend/src/services/livingWorld/locationQueries.js`.


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

**Phase 7 — sublocation map + navigation.** ✅ shipped
- `components/gameplay/worldMap/SubLocationGrid.jsx` + `subGridRenderer.js` — canvas drill-down. Grid size zależny od typu rodzica: capital/city 10×10, town 7×7, village/hamlet/ruin/dungeon/cave 5×5.
- Seeded subs używają `subGridX/subGridY`; subs bez koordów (AI-gen) dostają auto-layout row-major w `layoutSubsWithFallback` aż grid się nie zapełni.
- Fog: canonical subs parentu visited → widoczne od razu; non-canonical wymaga `fog.discoveredSubLocationIds`. `bypassFog` prop dla admin view (Phase 8).
- Klik → nowy callback `onEnterSub(name)` → `GameplayPage.onEnterSubFromMap` zamyka World Modal i dispatchuje `handleAction(\`Wchodzę do ${name}.\`, true)` (hardcoded PL, analogicznie do istniejącego travel dispatch).
- Back button czyści subView lokalnie w `PlayerWorldMap` — żadnej zmiany stanu gry.
- Auto-open: klik w kafel parent'u w którym gracz już jest → pomijamy popover i wchodzimy prosto w sub-view (bez cross-modal state-handshake; MVP, resztę rozstrzygnij po playteście jeśli UX zawiedzie).
- `PlayerWorldMap` resolve current parent walk-up przez `parentLocationId` tak, by top-level pulse przeszedł na settlement gdy gracz jest w jego sublokacji.

**Phase 8 — admin map alignment.** ✅ shipped
- `components/admin/adminLivingWorld/tabs/MapTab.jsx` — toggle Force / Tile grid (default Force).
- Nowy `AdminTileGridView.jsx` reuse'uje `tileMapRenderer.js` primitives z pustą fogą no-op (wszystkie nody → visited).
- Klik w tile otwiera modal z `SubLocationGrid` w trybie `bypassFog` — admin widzi wszystkie subs (canonical + non-canonical), kliknięcia sublokacji są inertne (no-op `onEnter`).
- Backend: `GET /v1/admin/livingWorld/graph` dostał `dangerLevel`, `displayName`, `isCanonical`, `createdByCampaignId`. Nowy endpoint `GET /v1/admin/livingWorld/graph/sublocations/:parentId` zwraca children z `subGridX/Y` (+ slotType/slotKind/dangerLevel/description) bez fogu.

### Round D (⏳ OPCJONALNY, odłożony): biome + lore retrieval + lore consistency validator

Nie robimy teraz, ale zapisane do revisit.

**Biome intent fallback**: istniejący `WorldLocationEdge.terrainType` + `region` dają wystarczającą scenerię. Revisit gdy realnie zobaczymy sceny pozbawione flavor.

**Lore retrieval (chunking + embedding)**: gdy `WorldLoreSection` concat przekroczy ~5000 tokens, naive truncate staje się lossy. Rozwiązanie:
- Chunk każdą sekcję po N znaków (2000?) z overlapem.
- `ragService.index('lore_chunk', chunkId, text)` per chunk.
- W scene assembler: `ragService.query(sceneContext, {entityType:'lore_chunk'}, topK=5)` zamiast concat all.
- Rerun index gdy sekcja edytowana (via invalidate + re-index).

**Lore consistency validator** (dobry catch z review): post-scene mały model (Haiku) dostaje wygenerowaną scenę + relevant lore chunks → structured output `{violations: [{loreSection, sceneQuote, reason}]}`. Route violations do admin "Pending canonicalizations" → "Lore violations" tab (nowa sekcja). Admin decyduje: (a) zignoruj (jednorazowy freestyle), (b) zaktualizuj lore (scene stworzyła nowy canon), (c) retro-fix scene (scenariusz musi się dopasować). Zapobiega AI cichemu przepisywaniu canon.

### Round E: post-campaign world write-back (⏳ TODO — not started)

**Dotychczasowe przygotowanie**: CampaignNPC carry `category`, `activeGoal`, `goalProgress` independent of WorldNPC → diff collector ma jasno rozdzielone "shadow vs canonical". `WorldLocation.isCanonical` + `createdByCampaignId` → promotion path ma zaznaczone co kampania stworzyła vs co już jest canonical. Reszta zgodnie z poniższym planem.


Cel: przy finalizacji kampanii promować istotne zmiany z campaign shadow → canonical world. Akcje gracza mają realny, widoczny wpływ między kampaniami.

**Phase 9 — RagService (unified retrieval). ✅ SHIPPED**
- Schema: `WorldEntityEmbedding { id, entityType, entityId, text, embedding: Json (1536d), createdAt, updatedAt }`, unique `(entityType, entityId)`, index on `entityType`. Entity types currently accepted: `npc | location | lore_chunk | promotion_candidate`.
- Service [backend/src/services/livingWorld/ragService.js](backend/src/services/livingWorld/ragService.js):
  - `index(entityType, entityId, text)` — upserts row via `embedText` (re-uses existing [embeddingService.js](backend/src/services/embeddingService.js) L1 cache). Non-throwing; provider failures log warn and return null so entity writers stay resilient. Fire-and-forget is the canonical call pattern.
  - `query(queryText, { filters: { entityType?, entityIds? }, topK=5, minSim=0.5 })` — in-process cosine over `prisma.worldEntityEmbedding.findMany({ where: { entityType } })`. Returns `[{ entityId, entityType, similarity, text }]` sorted desc.
  - `invalidate(entityType, entityId)` — deleteMany by composite key.
  - `batchBackfillMissing(entityType, entities, textOf)` — idempotent bulk indexer. Skips entities that already have a row so repeated seed boots don't repay the embedding cost.
- New helper `buildLocationEmbeddingText(loc)` in `embeddingService.js` (mirrors `buildNPCEmbeddingText`).
- Seed wire-up ([seedWorld.js](backend/src/scripts/seedWorld.js)): `backfillRagEmbeddings()` runs at end of `seedWorld()` — `batchBackfillMissing` over all `alive=true` `WorldNPC` rows + all `isCanonical=true` `WorldLocation` rows. Skipped gracefully when `OPENAI_API_KEY` is unset.
- Mid-game wire-up: `ragService.index(...)` fire-and-forget at every WorldLocation/WorldNPC creation site — [worldStateService.js](backend/src/services/livingWorld/worldStateService.js) (`findOrCreateWorldLocation`, `findOrCreateWorldNPC`, `createSublocation`), [processStateChanges/locations.js](backend/src/services/sceneGenerator/processStateChanges/locations.js) (non-canonical AI-created locations), [worldSeeder.js](backend/src/services/livingWorld/worldSeeder.js) (per-campaign settlement seed), [dungeonSeedGenerator.js](backend/src/services/livingWorld/dungeonSeedGenerator.js) (dungeon rooms).
- **Design note — diverges from existing vector-search pattern**: campaign-scope (`CampaignScene/NPC/Knowledge/Codex`) embeddings still live inline + Atlas `$vectorSearch` (see [vectorSearchService.js](backend/src/services/vectorSearchService.js)). World-scope embeddings use the new table + in-process cosine to stay under the Atlas shared-tier search-index cap. One call-site rewrite moves us to `$vectorSearch` later if row count outgrows local scan (~5k rows / <50ms threshold).
- **Koszt**: ~$0.02 per cold seed (400-ish entities × ~50 tokens × $0.02/M). L1 cache skips duplicate re-embeds within a boot.

**Phase 10 — campaign shadow diff collector. ✅ SHIPPED (NPC-only)**
- [backend/src/services/livingWorld/postCampaignWriteback.js](backend/src/services/livingWorld/postCampaignWriteback.js) exports:
  - `diffNpcFields(clone, canonical)` — pure. Emits `[{field, oldValue, newValue}]` for {`alive`, `location`, `name`, `role`, `personality`}. `location` is a synthetic field mapping `CampaignNPC.lastLocationId → WorldNPC.currentLocationId`. Skips clone→null string drift so we never erase canonical.
  - `collectCampaignShadowDiff(campaignId)` — pulls all `CampaignNPC` with `worldNpcId!=null`, loads their WorldNPC rows in one batch, returns `{ npcDiffs, summary: { npcsExamined, npcsWithChanges, fieldCounts } }`. Ephemeral NPCs (`worldNpcId=null`) skipped — Phase 12b promotion territory.
- `CampaignLocationSummary` diff NOT implemented — requires `worldLocationId` FK on that model first (deferred with Phase 12c).
- Excluded fields (Round B architectural decision): `activeGoal`, `goalProgress` are INDEPENDENT between shadow and canonical — not a drift source, no diff emitted.
- 14 unit tests cover pure diff + filter + dryRun apply in [postCampaignWriteback.test.js](backend/src/services/livingWorld/postCampaignWriteback.test.js).

**NPC memory Stage 1 — hand-authored baseline knowledge. ✅ SHIPPED**
- Optional `baselineKnowledge: string[]` on `NAMED_NPCS` / village NPCs in [seedWorld.js](backend/src/scripts/seedWorld.js). `upsertNpc` serializes to `WorldNPC.knowledgeBase` as `[{content, source: 'baseline'}]`. Seeded today: Król Torvan IV, Arcykapłanka Lyana, Kapitan Gerent, Mistrz Wiedzy Taelor, Karczmarz Tamar, Kupiec Dorgun, Wiltar Olbram, Eleya Tropicielka.
- **Merge-preserving update**: on reseed, `upsertNpc` reads existing `knowledgeBase`, keeps entries with `source !== 'baseline'`, replaces the baseline slice. Protects Stage 2 lived experience from being wiped by seed reboot.

**NPC memory Stage 2a — in-campaign lived experience. ✅ SHIPPED**
- New `CampaignNPC.experienceLog: String @default("[]")` — append-only JSON `[{content, importance, addedAt}]`. Shadow-only write (Round B sandbox compliance).
- New stateChanges bucket `npcMemoryUpdates: [{npcName, memory, importance?}]` — emitted by premium when something narratively notable happens TO/ABOUT an NPC. Zod-validated via `parseNpcMemoryUpdates` in [schemas.js](backend/src/services/sceneGenerator/processStateChanges/schemas.js) — caps: 20 updates/scene, 300 chars/memory.
- Handler [processStateChanges/npcMemoryUpdates.js](backend/src/services/sceneGenerator/processStateChanges/npcMemoryUpdates.js) — resolves `npcName` → CampaignNPC (slug rule mirrors `processNpcChanges`), FIFO-caps per-NPC log at 20 entries, dispatched AFTER `processNpcChanges` so same-scene NPC introductions attach. NOT gated on `livingWorldEnabled` — classic campaigns benefit from cross-scene NPC consistency too.
- Prompt guidance added to [systemPrompt/staticRules.js](backend/src/services/sceneGenerator/systemPrompt/staticRules.js) — Polish, explicit "SKIP for flavor/small talk, emit ONLY for narrative beats NPC would plausibly remember". Max ~3/scene expectation.
- Builder [npcBaseline.js](backend/src/services/aiContextTools/contextBuilders/npcBaseline.js) renamed from `buildNpcBaselineKnowledge` → `buildNpcMemory` (old export kept as alias). Now merges baseline (`WorldNPC.knowledgeBase`) + experience (`CampaignNPC.experienceLog`) in two parallel batch reads. Returns `[{npcName, entries: [{content, source}]}]` with source `'baseline' | 'campaign_current'` (Stage 2b will add `'campaign:<id>'` for cross-campaign promoted memories).
- Prompt block renamed from `[NPC_BASELINE]` → `[NPC_MEMORY]`. Each entry prefixed `(zawsze)` for baseline, `(ta kampania)` for lived experience — lets premium distinguish immutable worldview from in-campaign growth.
- Caps: 6 baseline entries + 8 experience entries per NPC (newest-first slice). Will feed Stage 3 RAG retrieval when cross-campaign memories inflate the pool past naive-slice usefulness.
- 25 new unit tests across `npcBaseline.test.js` + `npcMemoryUpdates.test.js` (pure helpers only — no Prisma mocks).

**NPC memory Stage 2a.1 — importance-aware merge. ✅ SHIPPED**
- Two-pass selection in [npcBaseline.js](backend/src/services/aiContextTools/contextBuilders/npcBaseline.js) `formatExperienceEntries`: (1) rank by `importance DESC, addedAt DESC, originalIdx DESC` with `IMPORTANCE_RANK = {major: 2, minor: 1}` (missing/unknown = 0) to pick top-N, (2) re-sort survivors by `originalIdx ASC` so prompt renders chronologically (preserves old tail-slice reading order).
- `importance` field was already on entries via `toMemoryEntry`; picker just wasn't using it.
- Zero schema change. 4 new unit tests cover major-wins-over-newer-minor-flood, tie-break by recency within tier, missing-importance-drops-first, chronological render after selection.

**NPC memory Stage 2a.2 — cross-NPC symmetry hook. ✅ SHIPPED**
- Pure helpers in [processStateChanges/npcMemoryUpdates.js](backend/src/services/sceneGenerator/processStateChanges/npcMemoryUpdates.js): `buildNpcNameMatcher(nameLower)` (case-insensitive whole-word regex with Polish-inflection tolerance — final vowel swap covers Lyany/Lyaną/Lyanę/Lyano via stem + `[aąeęioóuy]` suffix), `detectMirrorTargets(memoryText, sourceName, otherNpcs, {maxTargets=3})` (skips self-mention, dedups by row id, caps fan-out), `buildMirrorEntry(sourceEntry, sourceName)` (step-down: `major → minor`, anything else → null; tags `mirror: true`; prefixes content with `[zasłyszane o {sourceName}]`).
- `processNpcMemoryUpdates` prefetches all `CampaignNPC` rows once, buckets primary entries + mirror entries by target `npcId`, issues one DB write per target regardless of how many source memories trigger mirrors. Returns `{applied, skipped, mirrored}`.
- Ping-pong prevention via `mirror: true` flag on entry — never re-mirrors.
- 15 new unit tests in `npcMemoryUpdates.test.js` (`detectMirrorTargets` + `buildMirrorEntry`) cover: single mention, multi-word names, self-mention skip, dedup on repeated mentions, fan-out cap, substring false-positive rejection, Polish inflections, minor step-down-to-null, ping-pong prevention, missing source guards.

**NPC memory Stage 3 — RAG-powered recall. ⏳ TODO (trigger: per-NPC log > 15 entries)**
- **Activation**: only kicks in when a specific `CampaignNPC.experienceLog` exceeds 15 entries. Below that, Stage 2a.1 static importance-slice stays — cheaper (no embed call per scene) and good enough for short-lived NPCs.
- **Write path**: handler in `npcMemoryUpdates.js` calls `ragService.index('npc_memory', '${campaignNpcId}:${entryIdx}', content)` fire-and-forget on every write. Same pattern as existing worldStateService entity indexing.
- **Read path**: `buildNpcMemory` checks per-NPC log length. If > 15 → query `ragService.query(sceneQueryText, { filters: { entityType: 'npc_memory' }, topK: 8 })` filtered in-process by entityId prefix matching the CampaignNPC. If ≤ 15 → static slice (Stage 2a.1).
- **Scene query text**: `playerLastAction + ' ' + currentLocationName` (keep short, single embed per scene, shared across all NPCs present — one embed, N filtered cosines).
- **Stage 3 extends 2b**: when Stage 2b promotes experienceLog → canonical WorldNPC.knowledgeBase cross-campaign, the combined pool easily exceeds 15 for recurring named NPCs. Stage 3 is what makes cross-campaign memory usable without prompt bloat.
- Tests: pure helper `shouldUseRagRecall(log)` returning threshold check; mocked `ragService.query` in integration test covering "NPC with 20 entries pulls scene-relevant top-8, not newest-8".

**Phase 12-lite — narrow auto-apply (alive + location). ✅ SHIPPED**
- `filterAutoApplyChanges(changes, autoApplyFields=['alive','location'])` — pure. Guards:
  - `alive: true→false` only. Never auto-resurrects.
  - `location`: only promotes to non-null target.
- `applyShadowDiffToCanonical({ diff, autoApplyFields, dryRun })` — writes authorized changes to WorldNPC, reports the rest as `skipped` with `reason: 'needs_review'`. Idempotent (re-running finds zero diffs for already-applied fields). `dryRun=true` skips writes.
- `runPostCampaignWorldWriteback(campaignId, opts)` — single-entry orchestrator. No route/trigger yet; callers will wire it into a future finalize endpoint / admin button.
- **Known safe overlap with Phase 3 `reputationHook.killWorldNpc`**: reputationHook already flips `WorldNPC.alive=false` during post-scene work for NPCs killed in play. Phase 12-lite becomes the belt-and-suspenders for cases the hook bailed on (missing `worldNpcId` link, name resolution failure, `livingWorldEnabled` toggled mid-campaign). Both writes are idempotent so overlap is harmless.

**Phase 11 — LLM fact extraction. ✅ SHIPPED**
- [backend/src/services/livingWorld/postCampaignFactExtraction.js](backend/src/services/livingWorld/postCampaignFactExtraction.js) — `extractWorldFacts({ campaignId, coreState, shadowDiffSummary, modelTier, provider, userApiKeys })` + pure helpers `buildFactExtractionInput`, `parseFactExtractionOutput`. Default tier `nanoReasoning` (gpt-5.4-nano / haiku-4.5), temperature 0, maxTokens 1500.
- Input slice: only bounded-summary sources — `gameStateSummary` (≤15 facts capped by memoryCompressor), `world.keyPlotFacts` (top-5 high-importance CampaignKnowledge from campaignLoader), `journalEntries` (nano-compressed per scene). No raw scene narratives. Campaign metadata + Phase 10 shadow diff summary passed as context hint ("already detected X — confirm or skip, don't duplicate").
- Zod output schema: `{ worldChanges: [{ kind: npcDeath|npcRelocation|locationBurned|newRumor|factionShift, targetHint≤150ch, newValue≤500ch, confidence 0-1, reason≤300ch }] }`, capped at 10 entries. Malformed entries dropped individually with warn log, not a whole-response failure.
- Non-throwing contract: provider error / malformed JSON / no memory → `{ changes: [], warning }`. Never blocks narrow auto-apply.
- Wired into `runPostCampaignWorldWriteback` between `collectCampaignShadowDiff` and `applyShadowDiffToCanonical`. Return shape extended: `{ ..., factExtraction: { changes, warning?, skipped? } }`. Opts: `skipExtraction: true` bypass, plus `extractionProvider`/`extractionModelTier`/`extractionUserApiKeys` forwarding.
- 22 unit tests ([postCampaignFactExtraction.test.js](backend/src/services/livingWorld/postCampaignFactExtraction.test.js)) cover input shaping, Zod salvage behavior, provider error paths, prompt forwarding. 5 wiring tests in [postCampaignWriteback.test.js](backend/src/services/livingWorld/postCampaignWriteback.test.js) verify orchestrator propagation, `skipExtraction` bypass, missing/malformed coreState tolerance, override forwarding.
- **Not in scope** (deferred): resolving `targetHint` → entity IDs (Phase 12), applying changes to WorldNPC/WorldLocation (Phase 12), confidence-tiered auto-apply (Phase 12), admin review UI (Phase 13), cross-campaign dedup (Phase 12b/c).

**Phase 12 — resolver + confidence-tiered apply (world state changes). ✅ SHIPPED**
- [backend/src/services/livingWorld/postCampaignWorldChanges.js](backend/src/services/livingWorld/postCampaignWorldChanges.js) — pipeline `resolveWorldChanges` → `correlateWithShadowDiff` → `classifyConfidence` → `applyWorldStateChanges`, composed by `runWorldStateChangePipeline({changes, shadowDiff, campaignId, dryRun, ragQuery})`.
- **Resolver**: `ragService.query(targetHint, {filters: {entityType}, topK: 1, minSim: 0.6})` per change. `entityTypeForKind` maps kinds to RAG entity types: `npc` for `npcDeath|npcRelocation|newRumor`, `location` for `locationBurned`, null for `factionShift` (no canonical target — always unresolvable). RAG errors log + return `null` without throwing.
- **Correlation**: only NPC-kind changes with a shadow-diff pathway correlate — `npcDeath` ↔ shadow `alive: true→false`, `npcRelocation` ↔ shadow `location` change. Other kinds never correlate (always LLM-only MEDIUM at best).
- **Tiering**:
  - **HIGH** — resolved + sim ≥ 0.75 + shadow-diff correlated (both sources agree on same canonical NPC). Auto-applied.
  - **MEDIUM** — resolved + sim ≥ 0.6 but missing correlation (LLM-only), OR kind has no shadow-diff pathway (`newRumor`, `locationBurned`, `factionShift`). Queued in `pending`.
  - **LOW** — unresolved (sim < 0.6 or `entityType=null`). Skipped with reason.
  - Enforces the plan's "fake progress" mitigation: LLM-only extraction never reaches HIGH; admin review is always required unless a real shadow diff corroborates.
- **Apply scope — narrow auto-apply + persisted admin queue**:
  - HIGH `npcDeath` / `npcRelocation` / `newRumor` (NPC entity + shadow corroboration) → `appendKnowledgeEntry(WorldNPC.knowledgeBase, {content: "${newValue} (${reason})", source: "llm_extraction:${campaignId}", kind, confidence, similarity, addedAt})`. FIFO-capped at 50 per NPC.
  - All **location** changes (even HIGH resolver similarity) → `PendingWorldStateChange` with reason `location_requires_review`. Rationale: no shadow-diff pathway exists for locations, so the "two sources agreed" invariant we rely on for NPC auto-apply isn't available. Admin sign-off is the safety net. Apply routine is still wired: `applyLocationKnowledgeChange({change, resolved, campaignId})` writes to [`WorldLocation.knowledgeBase`](backend/prisma/schema.prisma) (new field, mirrors WorldNPC.knowledgeBase, FIFO-capped at 50). Phase 13 approval route calls it.
  - HIGH `factionShift` + any other unsupported-kind HIGH → `PendingWorldStateChange` with reason `high_but_no_handler` / `high_but_unsupported_kind`.
  - Phase 12-lite (separately) still owns `alive` and `currentLocationId` writes via shadow diff — Phase 12 writes knowledge context on top, both idempotent.
- **MEDIUM persistence — `PendingWorldStateChange` (new table)**. Schema: `{id, campaignId, idempotencyKey, kind, targetHint, targetEntityId?, targetEntityType?, newValue, confidence, similarity?, reason, status (pending|approved|rejected default pending), reviewedBy?, reviewedAt?, reviewNotes?, createdAt, updatedAt}` with `@@unique([campaignId, idempotencyKey])` + `@@index([status, createdAt])` + `@@index([campaignId, status])`.
  - `computeIdempotencyKey({kind, targetHint, newValue})` — pure SHA-1 hash (16 hex chars) of `${kind}|${targetHint}|${newValue}`. **No normalization** by design: different phrasings of the same event (e.g. "Gerent zginął pod bramą" vs "Gerent poległ w walce") intentionally create distinct rows so admin can see competing rumors/legends from one campaign — per user guidance "tak się tworzą legendy".
  - Upsert on re-run refreshes resolver signals (`targetEntityId`/`targetEntityType`/`confidence`/`similarity`/`reason`) but **never** overwrites `status`/`reviewedBy`/`reviewedAt`/`reviewNotes`. Admin decisions survive re-runs. Same stickiness pattern as `NPCPromotionCandidate`.
  - `applyWorldStateChanges` now returns the persisted row shape in `pending` (not the ephemeral in-memory hints) so callers can observe the actual queue state.
  - Pending upsert failure is non-fatal — the item is silently dropped from the result list, pipeline continues.
- Wired into `runPostCampaignWorldWriteback` between Phase 11 extraction and Phase 12-lite narrow apply. Orchestrator opt: `skipWorldChangePipeline`. Auto-skips when `factExtraction.changes.length === 0`.
- 47 unit tests in [postCampaignWorldChanges.test.js](backend/src/services/livingWorld/postCampaignWorldChanges.test.js) cover resolver / correlation / tiering / NPC + location apply (LOW skip, MEDIUM pending-upsert, HIGH dryRun, HIGH with missing WorldNPC, write failures, location `apply` helper happy path + not-found + non-location guard, pending upsert failure). `computeIdempotencyKey` pure tests (deterministic, case-sensitive, no-normalization). 4 integration tests in [postCampaignWriteback.test.js](backend/src/services/livingWorld/postCampaignWriteback.test.js) cover pipeline propagation, auto-skip on empty changes, `skipWorldChangePipeline` bypass, shadow diff forwarding.

**Phase 12b Slice A — NPC promotion candidates (stats + persist). ✅ SHIPPED**
- Schema additions:
  - `CampaignNPC`: `interactionCount Int @default(0)`, `dialogCharCount Int @default(0)` (Slice B placeholder — not incremented yet), `questInvolvementCount Int @default(0)`, `lastInteractionAt DateTime?`, `lastInteractionSceneIndex Int?`.
  - New model `NPCPromotionCandidate`: `{id, campaignId, campaignNpcId, name, role, personality, stats (JSON string), dialogSample?, smallModelVerdict?, status (pending|approved|rejected, default pending), reviewedBy?, reviewedAt?, reviewNotes?, createdAt, updatedAt}`. Unique `@@unique([campaignId, campaignNpcId])`, index `@@index([status, createdAt])`. `dialogSample`/`smallModelVerdict` reserved for Slice B.
- **Inline stats** — [processStateChanges/npcs.js](backend/src/services/sceneGenerator/processStateChanges/npcs.js): pure helpers `computeInteractionDelta(existing, sceneIndex, now)` + `initialInteractionFields(sceneIndex, now)`. Every `processNpcChanges` bump increments `interactionCount` and stamps `lastInteractionAt`/`lastInteractionSceneIndex`; a sceneIndex gap ≥ 2 since the last interaction bumps `questInvolvementCount` (the "return visit" signal per Q3 answer). sceneIndex threaded through `processStateChanges(campaignId, stateChanges, { prevLoc, sceneIndex })` from [postSceneWork.js](backend/src/services/postSceneWork.js) via `scene.sceneIndex`. Mentions without content changes still tick stats (bare-mention = interaction) but skip the embedding re-write.
- **Batch-time structural signal** — [postCampaignPromotion.js](backend/src/services/livingWorld/postCampaignPromotion.js): `computeStructuralInvolvement(quests)` counts how many `CampaignQuest` rows list each NPC as `questGiverId`/`turnInNpcId` (once per quest, role-deduped). Kept out of inline writes so `campaignSync.upsert` stays single-query.
- **Scoring** — `score = interactionCount + questInvolvementCount*3 + structuralQuestCount*10` (structural strongest signal, return visits medium, raw interactions baseline). Zero-score candidates dropped. Tie-breaker: `lastInteractionAt DESC`.
- **Persistence** — upsert into `NPCPromotionCandidate` by `[campaignId, campaignNpcId]`. Refresh `stats`/`name`/`role`/`personality` on re-run; **never** touches `status`/`reviewedBy`/`reviewedAt`/`reviewNotes`/`dialogSample`/`smallModelVerdict` so admin feedback is sticky (Q5).
- **Orchestrator wiring** — new Phase 5 in `runPostCampaignWorldWriteback`: `runNpcPromotionPipeline({campaignId, dryRun, topN})`. Opts: `skipPromotion: true` to bypass, `promotionTopN: number` override. Return shape: `{..., promotion: {collected, persisted, skipped}}`.
- **NOT in Slice A**: no LLM verdict (Haiku/nano small-model scoring of uniqueness/worldFit), no cross-campaign dedup via embedding similarity, no refactor of `maybePromote` (still does inline `findOrCreateWorldNPC` during play). All three land in Slice B.
- 19 tests in [npcs.test.js](backend/src/services/sceneGenerator/processStateChanges/npcs.test.js) + [postCampaignPromotion.test.js](backend/src/services/livingWorld/postCampaignPromotion.test.js) cover the pure helpers (delta, initial fields, slug, structural counts, scoring, selection, tie-breaks) + pipeline integration + orchestrator wiring (3 new tests in [postCampaignWriteback.test.js](backend/src/services/livingWorld/postCampaignWriteback.test.js)).

**Phase 12b Slice B — LLM verdict + dedup + maybePromote refactor. ✅ SHIPPED**
- **Cross-campaign dedup** — [postCampaignPromotion.js](backend/src/services/livingWorld/postCampaignPromotion.js) `buildCandidateEmbeddingText` + `findDuplicateCandidate` + persist path. Before each upsert, embed `name — role — personality(truncated 200ch)` and `ragService.query({entityType: 'promotion_candidate'}, minSim=0.85)`. Match → stash `dedupeOfId` + `dedupeSimilarity` inside the row's `stats` JSON (no schema change — admin UI collapses dupes at display time per Q1 decision). After upsert, fire-and-forget `ragService.index('promotion_candidate', candidateId, text)` so the next campaign's candidates can dedup against this one.
- **Dialog sample harvest** — `bucketDialogByNpc` + `renderDialogSample` + `harvestDialogSamples`: one `campaignScene.findMany` pulls `dialogueSegments`, walks `type=dialogue` segments, buckets last 5 lines per slug, renders newline-joined sample capped at 600 chars with ellipsis-truncation on the last overflowing line. Attached as `stats.dialogSample` and stored on `NPCPromotionCandidate.dialogSample`.
- **LLM verdict** — new module [postCampaignPromotionVerdict.js](backend/src/services/livingWorld/postCampaignPromotionVerdict.js). Zod schema `{recommend: yes|no|unsure, uniqueness: 0-10 int, worldFit: 0-10 int, reasons: [string] max 5}`. Default provider `anthropic` + tier `standard` (Haiku 4.5). `runVerdictForCandidates` fans out via `Promise.allSettled` (top-N ≤5, parallel per Q4) so one failure doesn't kneecap the batch. Per-candidate failure modes logged with `warning`: `provider_error` | `invalid_json` | `schema_miss` | `missing_npc` — all non-throwing, candidate keeps `status=pending` with no auto-reason (admin decides manually).
- **Status classification** — pure `classifyVerdict` in the verdict module. `recommend=no` OR `uniqueness<5` → `status=rejected` with `reviewNotes='auto: ' + verdict.reasons[0]` (or generic auto-reject string if no reasons). Else → `status=pending`. **Stickiness rule**: on UPDATE path, if the existing row has `reviewedBy` set OR a non-`pending`/non-`rejected` status, we do NOT overwrite `status` or `reviewNotes` — admin decisions survive re-runs. Stats / dialogSample / verdict still refresh.
- **maybePromote removed** — [npcPromotion.js](backend/src/services/livingWorld/npcPromotion.js) deleted. Inline call removed from [processStateChanges/npcs.js](backend/src/services/sceneGenerator/processStateChanges/npcs.js). Canonical `WorldNPC` rows are **never** created mid-campaign. `CampaignNPC.worldNpcId` field preserved (no schema change) — admin-approve flow (Phase 13) will populate it at promotion time, which is also useful for Stage 2b knowledge write-back (user Q2 decision: "przyda się potem żeby zaktualizować wiedzę tego NPC").
- **`assignGoalsForCampaign` refactor** (Q2 option (b)) — [questGoalAssigner/index.js](backend/src/services/livingWorld/questGoalAssigner/index.js) now operates on **all** CampaignNPC rows in the campaign (dropped `worldNpcId: { not: null }` filter). Canonical WorldNPC lookup is opt-in per-row (only when shadow carries a link) and provides home-derivation fallback. Quest-tied ephemeral shadows get their goals on every scene-tick. `homeLocationId` fallback stays best-effort — ephemerals without a canonical home skip the "return home" override and fall through to background goals.
- **Known behavioural regressions vs pre-refactor** (accepted per sandbox purity):
  - `updateLoyalty` (companion drift) + `processItemAttributions` (WorldEvent `item_given` attribution) now both require the CampaignNPC to already carry `worldNpcId` (canonical seeded or admin-approved). Ephemerals silently skip both paths. Previously these worked for freshly-inline-promoted NPCs; now they wait for admin approval.
  - `npcAgentLoop` ticks only pre-seeded + admin-approved canonical WorldNPCs. Organic "NPC discovered mid-campaign ticks in background world" is deferred until admin approves (matches the Q2 "manual admin tick" model).
- **Orchestrator opts** — new `runPostCampaignWorldWriteback` knobs: `skipPromotionVerdict`, `promotionProvider` (default `'anthropic'`), `promotionModelTier` (default `'standard'`), `promotionUserApiKeys`. Forwarded to `runNpcPromotionPipeline` as `skipVerdict`/`verdictProvider`/`verdictModelTier`/`verdictUserApiKeys`.
- Tests: 48 in [postCampaignPromotion.test.js](backend/src/services/livingWorld/postCampaignPromotion.test.js), 19 in [postCampaignPromotionVerdict.test.js](backend/src/services/livingWorld/postCampaignPromotionVerdict.test.js), +3 in [postCampaignWriteback.test.js](backend/src/services/livingWorld/postCampaignWriteback.test.js) covering dedup stash, verdict classification, sticky admin status, dialog harvest, parallel verdict fan-out (with per-call failure isolation), orchestrator opt forwarding.

**Phase 12c — Location promotion candidates. ✅ SHIPPED** (MVP scope — LLM verdict deferred).
- New `LocationPromotionCandidate` table: `{id, campaignId, worldLocationId, canonicalName, displayName?, locationType?, region?, description?, stats (JSON string), smallModelVerdict?, status, reviewedBy?, reviewedAt?, reviewNotes?, createdAt, updatedAt}`. Unique `(campaignId, worldLocationId)`, index `(status, createdAt)`.
- Pipeline [postCampaignLocationPromotion.js](backend/src/services/livingWorld/postCampaignLocationPromotion.js) `runLocationPromotionPipeline({campaignId, dryRun, topN})`:
  1. Collect — `WorldLocation` rows with `isCanonical=false AND createdByCampaignId=current`.
  2. Score — `sceneCount + questObjectiveCount*5`, where sceneCount is fuzzy-name-matched against `CampaignLocationSummary.sceneCount` and questObjectiveCount counts `CampaignQuest.objectives` referencing the location by id or name.
  3. Dedup — `ragService.query({entityType: 'location_promotion_candidate'}, minSim=0.85)` — match stashes `dedupeOfId`/`dedupeSimilarity` in `stats` JSON.
  4. Persist — sticky upsert keyed by `(campaignId, worldLocationId)`; `status='pending'` default, admin decision preserved across re-runs.
  5. RAG index — fire-and-forget so next campaign's candidates dedup against this one.
- Admin approval ([adminLivingWorld.js](backend/src/routes/adminLivingWorld.js) `POST /location-promotion-candidates/:id/approve`) calls `promoteWorldLocationToCanonical` which flips `WorldLocation.isCanonical=true`, nulls out `createdByCampaignId`, and reindexes as `entityType='location'` so `findOrCreateWorldLocation` dedup sees it as canonical.
- **Deferred** (not in 12c MVP): LLM verdict pass (uniqueness + worldFit scoring), visit-count inline stats on `CampaignLocationSummary` (we use sceneCount fuzzy-match instead — works fine but drops location entries that summary writer never wrote to). Revisit once admin fatigue signals from playtest.

**Phase 13a — admin review UI (unified "Pending canonicalizations"). ✅ SHIPPED**
- Tab **Promotions** wired into [AdminLivingWorldPage.jsx](src/components/admin/AdminLivingWorldPage.jsx) — three stacked sections in [PromotionsTab.jsx](src/components/admin/adminLivingWorld/tabs/PromotionsTab.jsx):
  1. **Run write-back** — admin-triggered orchestrator call. Campaign dropdown (new admin endpoint `GET /v1/admin/livingWorld/campaigns`) + `dryRun` checkbox + result summary (npcs examined, shadow applied, LLM facts, world-changes applied/pending, promotion collected/persisted).
  2. **Pending world state changes** — table of `PendingWorldStateChange` rows with `status/kind/campaignId` filter. Approve button calls `applyApprovedPendingChange` (dispatches NPC vs location knowledgeBase append) + sticky `reviewedBy/reviewedAt` stamp. Reject does the stamp only.
  3. **NPC promotion candidates** — card list grouped by `stats.dedupeOfId` (collapse dupes under parent row, expand-on-click shows sibling candidates). Surface smallModelVerdict scores (recommend/uniqueness/worldFit/reasons) + dialog sample + stats. Approve calls `promoteCampaignNpcToWorld` (creates WorldNPC with `buildNpcCanonicalId` slug + links `CampaignNPC.worldNpcId` + RAG reindex; name+role-alive dedupe reuses existing canonical if match). Reject does stamp only.
- New routes in [adminLivingWorld.js](backend/src/routes/adminLivingWorld.js) (kept in single file per existing convention, not split into `routes/admin/` subdir):
  - `GET /pending-world-state-changes?status&kind&campaignId` + `POST /:id/approve` + `POST /:id/reject`
  - `GET /promotion-candidates?status&campaignId` + `POST /:id/approve` + `POST /:id/reject`
  - `GET /campaigns?limit=N` (admin-scope campaign picker, not per-user)
  - `POST /campaigns/:id/run-writeback` (rate-limited to 5/min, body: `{dryRun, skipExtraction, skipWorldChangePipeline, skipPromotion, skipPromotionVerdict}`)
- New service helpers:
  - [postCampaignWorldChanges.js](backend/src/services/livingWorld/postCampaignWorldChanges.js) `applyNpcKnowledgeChange` (mirror of `applyLocationKnowledgeChange`) + `applyApprovedPendingChange` (dispatches by `targetEntityType`).
  - [postCampaignPromotion.js](backend/src/services/livingWorld/postCampaignPromotion.js) `promoteCampaignNpcToWorld(campaignNpcId, {reviewedBy})` — dedupe-aware canonical creation + shadow link + RAG index.
- **Not in Phase 13a** (deferred to future slices):
  - Edit-before-approve form (admin can only approve/reject as-is today; to edit knowledge content, reject and rerun writeback with different input, or hand-edit WorldNPC via future endpoint).
  - Location promotions panel (requires Phase 12c to ship `LocationPromotionCandidate` first).
  - Auto-approve high-confidence toggle (auto-apply for HIGH + shadow-corroborated NPC changes already happens in Phase 12 pipeline; pending queue is MEDIUM + unsupported-kind HIGH + locations-by-policy — per plan those always require manual).
  - Sort/search beyond the status+kind+campaignId filters.

**Phase 13b — Canon Knowledge Graph Visualization. ✅ SHIPPED** (MVP scope).
- New admin tab "Canon" → [CanonGraphTab.jsx](src/components/admin/adminLivingWorld/tabs/CanonGraphTab.jsx). SVG render reusing `LOCATION_TYPE_COLORS` + new `NPC_CATEGORY_COLORS` palette in [mapHelpers.js](src/components/admin/adminLivingWorld/tabs/mapHelpers.js).
- Backend endpoint `GET /v1/admin/livingWorld/canon-graph` returns `{locations, edges, npcs}` — top-level canonical locations + overworld edges (non-dungeon-corridor) + alive canonical NPCs with `homeLocationId`/`currentLocationId`.
- Layout: locations placed by `(regionX, regionY)` with same projection math as `/graph`. NPCs orbit their home location (falls back to currentLocation) on a ring of radius 18px, spreading to 2 rings past 10 NPCs per location so dense settlements stay readable.
- Click any node → side panel with details. "Homeless NPCs" banner (red) lists NPCs with no home/current link — spot-check for data gaps after Round E auto-approvals.
- **Deferred** (not in 13b MVP): zoom/pan, NPC→NPC relationship edges (WorldNPC.relationships field not widely populated), non-canonical toggle for inspecting per-campaign additions. Good starting surface; revisit once canon world grows.

**Krytyczne pliki Round E:**
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — `WorldEntityEmbedding` (Phase 9), `NPCPromotionCandidate` (Phase 12b), `PendingWorldStateChange` (Phase 12 closeout), `WorldLocation.knowledgeBase` (Phase 12 closeout), `CampaignNPC` stats fields + `experienceLog` (Phase 12b + Stage 2a). `LocationPromotionCandidate` + `CampaignLocationSummary.worldLocationId`/stats still TODO (Phase 12c).
- [backend/src/services/livingWorld/ragService.js](backend/src/services/livingWorld/ragService.js) — Phase 9 shared retrieval; entity types `npc`/`location`/`promotion_candidate`/`lore_chunk`.
- [backend/src/services/livingWorld/postCampaignWriteback.js](backend/src/services/livingWorld/postCampaignWriteback.js) — top-level orchestrator `runPostCampaignWorldWriteback`. Threads Phase 10 shadow diff → Phase 11 fact extraction → Phase 12 world-change pipeline → Phase 12-lite narrow auto-apply → Phase 12b promotion pipeline.
- [backend/src/services/livingWorld/postCampaignFactExtraction.js](backend/src/services/livingWorld/postCampaignFactExtraction.js) — Phase 11 LLM extraction of world changes from compressed memory.
- [backend/src/services/livingWorld/postCampaignWorldChanges.js](backend/src/services/livingWorld/postCampaignWorldChanges.js) — Phase 12 resolver + tiering + NPC `knowledgeBase` auto-apply + `PendingWorldStateChange` upsert + `applyLocationKnowledgeChange` (called by Phase 13 approval route).
- [backend/src/services/livingWorld/postCampaignPromotion.js](backend/src/services/livingWorld/postCampaignPromotion.js) — Phase 12b Slice A + B: stats collection, dialog harvest, cross-campaign dedup via `ragService('promotion_candidate')`, sticky-status upsert into `NPCPromotionCandidate`.
- [backend/src/services/livingWorld/postCampaignPromotionVerdict.js](backend/src/services/livingWorld/postCampaignPromotionVerdict.js) — Phase 12b Slice B Haiku verdict module (Zod-validated `{recommend, uniqueness, worldFit, reasons}`, parallel fan-out via `Promise.allSettled`, non-throwing).
- [backend/src/services/sceneGenerator/processStateChanges/npcs.js](backend/src/services/sceneGenerator/processStateChanges/npcs.js) — inline stats tracking (`computeInteractionDelta`, `initialInteractionFields`). Slice B removed the inline `maybePromote` call — canonical `WorldNPC` rows are never created mid-play.
- [backend/src/services/livingWorld/questGoalAssigner/index.js](backend/src/services/livingWorld/questGoalAssigner/index.js) — Slice B refactor: operates on all `CampaignNPC` rows; canonical lookup is opt-in per-row (home-derivation only when shadow carries `worldNpcId`).
- **~~`backend/src/services/livingWorld/npcPromotion.js`~~** — deleted in Slice B. Inline promotion is gone; all canonical `WorldNPC` creation flows through admin approval now.
- **Phase 13a files (✅ SHIPPED)** — [adminLivingWorld.js](backend/src/routes/adminLivingWorld.js) extended with pending-world-state + promotion-candidate + location-promotion-candidate approve/reject + campaigns list + run-writeback routes (kept single-file per existing convention); [PromotionsTab.jsx](src/components/admin/adminLivingWorld/tabs/PromotionsTab.jsx); `applyNpcKnowledgeChange` + `applyApprovedPendingChange` in [postCampaignWorldChanges.js](backend/src/services/livingWorld/postCampaignWorldChanges.js); `promoteCampaignNpcToWorld` in [postCampaignPromotion.js](backend/src/services/livingWorld/postCampaignPromotion.js); `promoteWorldLocationToCanonical` in [postCampaignLocationPromotion.js](backend/src/services/livingWorld/postCampaignLocationPromotion.js).
- **Phase 13b files (✅ SHIPPED)** — [CanonGraphTab.jsx](src/components/admin/adminLivingWorld/tabs/CanonGraphTab.jsx); `NPC_CATEGORY_COLORS` added to [mapHelpers.js](src/components/admin/adminLivingWorld/tabs/mapHelpers.js); `GET /v1/admin/livingWorld/canon-graph` endpoint in [adminLivingWorld.js](backend/src/routes/adminLivingWorld.js).
- **Memory Stage 2b + 3 files (✅ SHIPPED)** — [postCampaignMemoryPromotion.js](backend/src/services/livingWorld/postCampaignMemoryPromotion.js) (`promoteExperienceLogsToCanonical`, pure `buildPromotableEntries` + `mergeKnowledgeBaseForCampaign`); RAG indexing added to [processStateChanges/npcMemoryUpdates.js](backend/src/services/sceneGenerator/processStateChanges/npcMemoryUpdates.js) + shared `memoryEntityId` helper; `sceneQueryText` threaded from [generateSceneStream.js](backend/src/services/sceneGenerator/generateSceneStream.js) → [assembleContext](backend/src/services/aiContextTools/index.js) → [buildLivingWorldContext](backend/src/services/aiContextTools/contextBuilders/livingWorld.js) → [buildNpcMemory](backend/src/services/aiContextTools/contextBuilders/npcBaseline.js) with `shouldUseRagRecall` threshold at 15 entries; `'npc_memory'` + `'location_promotion_candidate'` added to [ragService.js](backend/src/services/livingWorld/ragService.js) entity-type allowlist; `(poprzednia kampania)` tag rendering in [contextSection.js](backend/src/services/sceneGenerator/contextSection.js).
- **TODO (Phase 13b)** — canon knowledge graph: `backend/src/routes/admin/canonGraph.js` + `src/components/admin/adminLivingWorld/tabs/CanonGraphTab.jsx`.

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
- [ ] **Stage 2a.1**: NPC z mieszanym poolem (krytyczne memory + 10 nowszych trivialnych) — prompt `[NPC_MEMORY]` pokazuje krytyczne mimo że są stare
- [ ] **Stage 2a.2**: scene emit memory "gracz zdradził Lyanę" do Gerenta → Lyana dostaje lustrzany wpis z `source: 'mirror'` i obniżoną importance, bez ponownego mirror'owania
- [ ] **Stage 3**: NPC z 20 experience entries → prompt używa RAG query (scene-relevant top-8), nie slice newest-8. Poniżej progu 15 — slice Stage 2a.1

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
- **Grid vs `worldBounds` — rozstrzygnięte (Round C Phase 6)**: player map to **fixed global `-10..10` grid** (canonical world jest ten sam dla wszystkich kampanii — `seedWorld.js` seeduje jeden globalny świat). `Campaign.worldBounds` pozostaje tylko jako **AI placement guardrail** (worldSeeder ring radius, `processTopLevelEntry` out-of-bounds reject, `worldBoundsHint` prompt block). UI nigdy go nie konsumuje. Zob. [knowledge/concepts/living-world.md](../knowledge/concepts/living-world.md) sekcja "Three things that look the same but aren't".
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
