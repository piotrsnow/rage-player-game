# Scene-generation prompt: refactor pod cache, delegacje i prompt-engineering best practices

## Context

Po obejrzeniu pokazu Anthropica o prompt engineeringu (5- i 10-blokowa struktura promptu) audytujemy nasz pipeline generacji sceny RPG. Cel: **zachować obecną jakość narracji i kontekst**, ale:

1. wyciąć tokeny które kod (Zod, handlers, heurystyki) i tak waliduje/wymusza,
2. naprawić kolejność bloków pod prompt-cache (Anthropic ephemeral, OpenAI auto-prefix),
3. usunąć past-decision artefakty ("side quests disabled", duplikaty PL-rules),
4. dać nano selectorowi więcej danych żeby pre-determinował difficulty/skill/pacing/creativity zamiast opisywać całą mechanikę w prompcie premium,
5. dodać JSON output prefill (`{"creativityBonus":`) — eliminuje ```` ```json ```` opakowanie i wymusza schema order.

Przy obecnym wolumenie: oszczędność ~800-1100 tok netto na scenę + większy cache hit rate (mniej fresh tokenów per call) + mniej "nano zgaduje skill" regresji.

User zatwierdził **agresywny full sweep** + **nano enrichment do 90%+ pewności** + **wszystkie 3 strukturalne ruchy** (split cache L1/L2, JSON prefill, nano-pre-decyduje meta-fields). Sacred cows: **NARRATIVE RULES** i **item validation SOFT FALLBACK** zostają nietknięte.

---

**Po drugiej rundzie audytu** (na żądanie usera) zidentyfikowano dodatkowe ~2500-4500 tok do odzyskania na typową scenę. Gros oszczędności pochodzi z **mode-specific context bundles**: dziś każda scena dostaje "all you can eat" kontekstu (questy, NPCs, codex, world bounds, settlements), a większość trybów — szczególnie travel/rest/combat — używa <30% tego. Dlatego dodajemy **Fazę 6**: nano klasyfikuje mode → backend dobiera bundle. Travel montage dziś dostaje 25 kB kontekstu, po fazie 6 — ~5 kB.

## Plan w 6 fazach (każda osobny commit, batched playtest między 1-5 a 6)

### FAZA 1 — Wyciągnięcia z `staticPrefix` (delegacja do kodu)

Plik: [backend/src/services/sceneGenerator/systemPrompt/staticRules.js](backend/src/services/sceneGenerator/systemPrompt/staticRules.js)

| Co usuwamy | Gdzie kod już to wymusza | Tok |
|---|---|---|
| Cały paragraf `Margin scaling` + instrukcję obliczania `total = base + attr + skill + creativityBonus` | [diceResolution.js:103-150](backend/src/services/sceneGenerator/diceResolution.js#L103-L150) `resolveModelDiceRolls` liczy od zera | ~200 |
| `Character XP is NOT awarded per scene` + cały komentarz o cascade | [stateValidation.js:38-40](shared/domain/stateValidation.js#L38-L40) clamp | ~80 |
| Limity `maxXp/maxItems/maxDispositionDelta` zaszyte słownie | [stateValidator.js:100-103](src/services/stateValidator.js#L100-L103) | ~120 |
| Side/faction/personal quest "disabled in this build" (artifact) | tylko komentarz w `playerInputPolicyBlock` | ~40 |
| Duplikaty PL-rules → merge do **jednego** `LANGUAGE` bloku z linkiem do jakich pól dotyczy | był w 3 miejscach | ~80 |
| Duplikat "stateChanges MUST match narrative" (był 2x) | merge | ~60 |
| `Item validation` HARD RULE → skróć do 2 linii (zostaw SOFT FALLBACK — sacred cow) | `removeItems` waliduje co jest w inv | ~80 |

**Razem: ~660 tokenów ze static prefix.**

Każde usunięcie weryfikuję czytając handler/walidator ŻE FAKTYCZNIE tak działa. Gdziekolwiek znajdę "ale to się też używa do X" — wstrzymuję cięcie i loguję.

### FAZA 2 — Wyciągnięcia z `dynamicSuffix` / `conditionalRules` + dedup/inline w renderze

Plik: [conditionalRules.js](backend/src/services/sceneGenerator/systemPrompt/conditionalRules.js), [worldBlock.js](backend/src/services/sceneGenerator/systemPrompt/worldBlock.js), [livingWorldBlock.js](backend/src/services/sceneGenerator/systemPrompt/livingWorldBlock.js), [contextSection.js](backend/src/services/sceneGenerator/contextSection.js)

| Co usuwamy / refaktorujemy | Pewność | Gdzie kod już to wymusza / dlaczego safe | Tok |
|---|---|---|---|
| `CODEX RULES` block (one fragment per interaction, dedup, max 10) | 95% | [knowledgeCodex.js:52-90](backend/src/services/sceneGenerator/processStateChanges/knowledgeCodex.js#L52-L90) + stateValidator cap | ~180 |
| `LOCATION POLICY (sublocation-allowed)` szczegóły walki (slot validation, parent reject rules) | 90% | [processStateChanges](backend/src/services/sceneGenerator/processStateChanges) silently rejects niepoprawne wpisy | ~150 |
| Heavy `COMBAT stateChanges` schema dump (gdy `intent=combat` flag już zaznaczony) → skróć do 1 linii | 90% | intent flag wystarczy, `combatUpdate` ma osobny Zod schema | ~100 |
| **#H** `ALREADY DISCOVERED BY PLAYER` codex block — usuń z baseline; on-demand gdy nano flag'uje "lore-relevant" | 88% | Aktualnie premium widzi w KAŻDEJ scenie nawet gdy player nie wykonuje akcji lore. `expand_codex` z nano i tak (per audit) nigdy się nie odpala | ~80 |
| **#M** Duplikat `[Living World] Canonical location: ...` w contextSection vs `Location:` w worldBlock | 95% | Pure dup | ~30 |
| **#P** Duplikat `Persistent NPCs here` (raz "Key characters already here", raz w SUBLOCATIONS) | 90% | Pure dup w living world block | ~40 |
| **#S** Inline render warunkowych headerów `Conditional rules:` gdy treść pusta lub 1 linia | 90% | Cosmetic — usuń pusty header | ~15 |
| **#N** Background population rule ("opisuj kolektywnie") — przenieś do mechanicsStatic L1 | 95% | To statyczna reguła stylu, nie per-scene | ~40 |

**Razem faza 2: ~635 tok.**

### FAZA 3 — Reorganizacja pod 2-warstwowy cache + XML semantic markup

Plik: [backend/src/services/sceneGenerator/systemPrompt/index.js](backend/src/services/sceneGenerator/systemPrompt/index.js) + [streamingClient.js](backend/src/services/sceneGenerator/streamingClient.js)

**Aktualny stan (zweryfikowany w kodzie):**

[systemPrompt/index.js:169](backend/src/services/sceneGenerator/systemPrompt/index.js#L169) ustawia `cache_control:{type:'ephemeral'}` **na końcu** staticPrefix. Ale staticPrefix zawiera `worldSettingBlock(campaign)` (line 92) i `buildDmSettingsBlock(campaign,dmSettings)` (line 108) — **oba per-campaign**. Anthropic cache porównuje od początku stringa: gdy user B przychodzi z innym campaign hook, jego prefix rozjeżdża się od user A na linii 92, więc **cache hituje TYLKO w ramach jednej kampanii** w 5-min oknie. Mechanika d50 (~2,989 tok) jest powtarzana w cache N razy dla N kampanii w organizacji mimo że jest identyczna.

Konkretne pomiary (estymacja znaki÷4):
- Cały staticPrefix: ~3,364 tok
- **Absolutnie statyczne** (mechanika + format + rules): ~2,989 tok
- **Per-campaign** (world hook + DM settings): ~375 tok

Anthropic minima:
- Sonnet 4 (premium): **1024 tok**
- Haiku 4.5 (nano): 2048 tok

**Nowy split (Anthropic ma 4 cache breakpointy):**
```
[L1 ephemeral cache, hit przez WSZYSTKICH userów] mechanicsStatic
  - coreRules (d50, dialog format, response shape, scene pacing, narrative rules)
  - responseFormat block
  - ~3.5kB

[L2 ephemeral cache, hit przez całą kampanię] campaignStatic
  - worldSettingBlock (campaign hook + name + description)
  - dmSettingsBlock (narrator sliders + meta)
  - worldLorePreamble (admin-curated lore)
  - itemAttribution + dungeonStaticHint (jeśli livingWorld)
  - ~2-4kB

[fresh] perScene
  - characterBlock (PC stats, inventory)
  - worldBlock (location, NPCs here, quests, last scene)
  - conditionalRules (intent-driven)
  - contextSection (nano-driven expansions)
```

**Sprawdzenie progów minimum** (KRYTYCZNE — bez tego breakpoint odrzucony przez Anthropic API):

| Segment | Rozmiar po cięciach faz 1-2 | Sonnet 4 min (1024 tok) | Haiku 4.5 min (2048 tok) | Status |
|---|---|---|---|---|
| L1 (mechanika absolutnie statyczna) | ~2,329 tok | ✅ above | ✅ above (marża ~280 tok) | breakpoint zadziała |
| L2 (worldSetting + DM tylko, ~375 tok) | ~375 tok | ❌ POD min | ❌ POD min | **breakpoint odrzucony** |
| L2 (po dodaniu worldLorePreamble do tej grupy) | ~1,000-2,500 tok zależnie od admin lore | ⚠️ często above | ⚠️ czasem above | **breakpoint zadziała tylko jeśli admin ustawił world lore** |

**Decyzja**: L2 ma sens **tylko jeśli wciągamy do niego `worldLorePreamble`** (admin-curated lore z [worldLore.js](backend/src/services/aiContextTools/worldLore.js)). Bez tego za mały. Jeśli kampania nie ma admin lore wcale → drop L2, zostać przy 1 breakpoint (L1 only). Runtime check: `if (l2_size < 1024) skip_l2_breakpoint`.

**Co to da finansowo — ekonomia ephemeral cache 5-min** (Anthropic):

Ceny: cache write **1.25× raw input**, cache read **0.10× raw input**, no-cache **1.00×**.

Break-even per cached prefix:
| Liczba requestów w 5-min oknie | No cache | Z cache | Różnica |
|---|---|---|---|
| **1 (samotny strzał)** | 1.00× | **1.25×** | **+25% drożej** ❌ |
| 2 | 2.00× | 1.35× | -32% ✓ |
| 3 | 3.00× | 1.45× | -52% ✓ |
| 5 | 5.00× | 1.65× | -67% ✓ |

Break-even: **≥2 requesty w 5-min oknie**.

W typowej sesji RPG (10-30 scen w godzinę) cache wygrywa -50% do -78%. **Ryzyko net loss**: solo playtest 1-scena-na-10-min, lub 5 graczy każdy w innej kampanii grający w innych porach (każdy płaci L1 cache write +25%, brak shared read).

**Dlatego telemetria w fazie 5 MUSI mierzyć realny koszt $**, nie surowe input tokens. Anthropic API zwraca `cache_creation_input_tokens` (write × 1.25) i `cache_read_input_tokens` (read × 0.10) osobno — trzeba je zważyć.

Konteks dla kalkulacji: user obserwował wzrost prompt size 5k → 6.5-7k przy poprzednim wprowadzaniu cache. To NIE jest sam efekt cache write (+25% by dało 6.25k z 5k), prawdopodobnie wmieszały się **nowe features dodane razem z cache** (admin lore, world bounds, living world blocks). Diagnostyka w fazie 5 to potwierdzi.

**Hipoteza zysku po fazie 3** (do walidacji telemetrią):
- Aktywne sesje RPG (>2 scen w 5-min): -50% do -78% kosztu input
- Cross-user L1 sharing w aktywnym ruchu produkcyjnym: dodatkowe -85% na cold-start mechaniki dla N+1 usera
- Solo playtest z długimi przerwami: 0 do +25% (net loss edge case)

OpenAI dostaje wszystko w jednym system message — automatic prefix cache i tak hituje początek (mechanikę) między requestami **tego samego account**, ale OpenAI nie ma explicit breakpointów więc kontrola gorsza.

Implementacja: nowa funkcja `buildSystemPromptParts({campaign, character, world, intent, ...})` zwraca `{l1, l2, fresh}` zamiast jednego stringa. `streamingClient.js` mapuje na format provider-specific (Anthropic 3 cache breakpointy, OpenAI concat).

**XML semantic markup (90% pewności):**

Aktualnie prompt miesza 3 konwencje sekcjonowania: markdown headery (`## NPCS AT CURRENT LOCATION`), pseudo-XML bracket (`[WORLD BOUNDS]`, `[CURRENT BIOME]`, `[TRAVEL]`, `[MOVEMENT]`, `[NPC_KNOWLEDGE]`), i ALL CAPS reguły (`CORE RULES:`, `RESPONSE:`). Ujednolicamy na **prawdziwy XML** dla sekcji semantycznych — Claude jest fine-tuned na XML tagi i lepiej parsuje boundaries niż markdown.

Mapping:

```xml
<role>...</role>
<mechanics_static>                <!-- L1 cache breakpoint -->
  <dice_system>...</dice_system>
  <dialogue_format>...</dialogue_format>
  <narrative_voice>...</narrative_voice>
  <response_format>...</response_format>
  <background_population_rule>...</background_population_rule>
</mechanics_static>
<campaign_static>                 <!-- L2 cache breakpoint -->
  <world_setting>...</world_setting>
  <dm_settings>...</dm_settings>
  <world_lore>...</world_lore>
  <item_attribution_rule />        <!-- jeśli livingWorld -->
  <dungeon_static_hint />          <!-- jeśli livingWorld -->
</campaign_static>
<scene_state>                     <!-- fresh per-scene -->
  <character>...</character>
  <location current="...">...</location>
  <npcs_present>...</npcs_present>
  <active_quest>... ▶ NEXT ...</active_quest>
  <last_scene>...</last_scene>
  <conditional_rules>...</conditional_rules>
</scene_state>
<nano_pre_decision>               <!-- faza 4 -->
  <scene_pacing>dialogue</scene_pacing>
  <creativity_bonus>0</creativity_bonus>
  <proposed_rolls>
    <roll skill="Perswazja" difficulty="medium" />
  </proposed_rolls>
</nano_pre_decision>
<mode_context mode="dialogue">    <!-- faza 6 -->
  ...
</mode_context>
```

**Co zostawiamy w markdown** (bez konwersji): listy itemów, tabele difficulty thresholds, JSON mockup w `<response_format>` (już strukturalny). XML byłby tam overkill.

**Reguły zalecane** (też w nowym wzorze): "Begin output with `{` exactly", "Wszystkie pola dialogueSegments w PL".

**Koszt**: ~100-150 tok dodatkowych na tagi. Pomijalne vs ~4500 tok oszczędzane w pozostałych fazach.

**Bonus**: nano-prompt też może użyć XML dla input data (`<player_action>`, `<location>`, `<npcs_at_location>`, `<recent_quests>`, `<previous_scene>`, `<pc_summary>`) — łatwiej parsuje, mniej konfunkcji nano modelu. Implementacja: razem z fazą 4 (nano enrichment).

### FAZA 4 — Nano enrichment + przesunięcie meta-fields do nano

Plik: [backend/src/services/intentClassifier/nanoSelector.js](backend/src/services/intentClassifier/nanoSelector.js) + [nanoPrompt.js](backend/src/services/intentClassifier/nanoPrompt.js)

**A) Wzbogać input nano** (~150 tok wzrostu w nano input, ale cache-friendly bo PC zmienia się rzadko):

- PC summary: top-8 skills (`skill:level→ATTR:value`), 6 attribues, **pełna lista 31 skill names** (constant, część cache L1), money tier
- Inventory categorized counts (`weapons:1, armor:1, potions:0, tools:2, consumables:3`) zamiast pełnej listy item names
- `player_input_kind` (custom/suggested/auto) — wpływa na creativity scoring
- Active companions count + flags (czy ktoś walczy obok)

**B) Rozszerz output schema nano**:

```js
{
  // istniejące: expand_npcs, expand_quests, expand_location, needs_memory_search, memory_query, combat_enemies, clear_combat, quest_offer_likely
  // USUNIĘTE: expand_codex (nigdy nie wybierane)
  
  // NOWE pre-decyzje:
  scene_pacing: 'combat'|'dialogue'|'exploration'|'travel_montage'|'rest'|'celebration'|'dramatic'|'chase'|'stealth'|'dream'|'cutscene',
  creativity_bonus: 0-10,  // dla suggested/auto zawsze 0
  roll_skills: [{ skill: string, difficulty: 'easy'|'medium'|'hard'|'veryHard'|'extreme' }] | [],  // max 3, [] jeśli auto-success/impossible
}
```

**C) Premium prompt dostaje wynik nano jako WYMÓG** (z safety net):

Zamiast całych sekcji o margin/skill picking/creativity scoring, premium dostaje:
```
[NANO PRE-DECISION]
scenePacing: dialogue
creativityBonus: 0  
rolls: [{skill: "Perswazja", difficulty: "medium"}]

— Match scenePacing in your prose density.
— Use creativityBonus as-is in totals.
— Use proposed rolls; OVERRIDE only if action genuinely needs different/additional skill — emit your own diceRolls[] in that case.
```

Premium może nadpisać (safety net dla 10% multi-skill trudnych przypadków).

**Oszczędność premium:** usunięcie creativity scoring rules + scenePacing table + skill calculation paragraphs ≈ **~200 tok**.

**Heurystyki obchodzące nano** (combat regex, travel intent, [TALK:], [ATTACK:]) — bez zmian, mają już swoje fallbacki dla scenePacing/creativity (defaultują na sensowne).

### FAZA 5 — JSON output prefill + cleanup output-fields + telemetria

Plik: [streamingClient.js](backend/src/services/sceneGenerator/streamingClient.js), [systemPrompt/staticRules.js](backend/src/services/sceneGenerator/systemPrompt/staticRules.js) (RESPONSE block)

**JSON prefill:**
- Anthropic: dodaj `messages: [..., {role:'assistant', content:'{"creativityBonus":'}]`. Parser już parsuje od `{` więc nic nie pęknie.
- OpenAI: sprawdź czy używamy `response_format: json_object`. Jeśli tak, prefill nie potrzebny. Jeśli nie, dodaj 1-linijkową regułę.

**Cleanup output-fields (pewność 85-95%):**
- **#K** Field-level descriptions w RESPONSE block dla `imagePrompt`/`soundEffect`/`musicPrompt`/`atmosphere`/`cutscene` — kondensacja z 5 linii do 1: `// English flavor fields, max 200 chars each`. Te pola nie wpływają na narrację i są deterministycznie emitowane. ~80 tok
- Usuń `expand_codex` ze wszystkich miejsc — **najpierw zweryfikuj telemetrią w fazie 5**: dodaj log który zlicza ile razy nano emituje `expand_codex` przez 5-10 scen. Jeśli faktycznie ~0%, usuń. Jeśli >5%, zostaw.
- Usuń `dialogueIfQuestTargetCompleted` description ze schemy RESPONSE (pojawia się 2x — top-level pole + opis w mockup-ie). Zostaw 1 linię w mockup-ie.
- Sprawdź czy `creativityBonus` description jest aktualny (po fazie 4 jest pre-decyzją z nano — opis powinien to odzwierciedlać).

**Telemetria do dodania (wymagane przed fazą 6 — kluczowa do walidacji że cache split NIE zwiększa kosztów):**

Log per scena (z Anthropic response):
```js
{
  static_tokens, dynamic_tokens, context_tokens, output_tokens,
  cache_creation_input_tokens,   // tokens napisane do cache (×1.25)
  cache_read_input_tokens,       // tokens czytane z cache (×0.10)
  uncached_input_tokens,         // tokens normal (×1.00)
  effective_input_cost_units:    // weighted suma
    cache_creation × 1.25 + cache_read × 0.10 + uncached × 1.00,
  baseline_no_cache_units:       // counterfactual
    (cache_creation + cache_read + uncached) × 1.00,
  delta_pct:                     // czy cache wygrał czy przegrał
    (effective - baseline) / baseline × 100
}
```

Dump do logs jako JSON. Po 1 sesji playtestowej (10-15 scen):
- **Średnie `delta_pct`**: oczekuję −40% do −60% w aktywnej sesji. Jeśli pokaże +X% → cache jest net loss, trzeba zdecydować rollback fazy 3 lub przejście na 1-hour beta TTL.
- **Distribution `delta_pct` per scene**: znajdź outlierów (samotne strzały z +25%) — czy są akceptowalne czy częste.
- **Baseline porównawczy**: musisz zachować surowe pomiary z **przed** fazą 3 (1 sesja na obecnym kodzie, potem 1 sesja po fazie 3).

### FAZA 6 — Mode-specific context bundles (osobny PR po stabilizacji 1-5)

**Centralna idea**: Aktualnie premium dostaje "all you can eat" kontekst niezależnie od mode. Travel montage / rest / combat używają <30% tego. Wprowadzamy **bundle resolver**: nano klasyfikuje mode → backend dobiera tylko potrzebne bloki.

#### Design

Nowa funkcja [contextBundleResolver.js](backend/src/services/sceneGenerator/contextBundleResolver.js):

```js
// Każdy mode definiuje 3 grupy bloków:
// MUST = zawsze włączone dla tego mode
// EXPANDABLE = nano może je włączyć przez expand_*
// CUT = NIGDY nie wpinaj dla tego mode
const BUNDLES = {
  dialogue: {
    must: ['speakingNpcFull', 'currentLocation', 'lastScene', 'pcSocialSkills', 'questNextObjective'],
    expandable: ['relatedQuest', 'codexEntry'],
    cut: ['worldBounds', 'encounterPool', 'seededSettlements', 'sublocationsOpenSlots', 'distantNpcs', 'biomeDetails', 'codexBaseline'],
  },
  combat: {
    must: ['enemies', 'pcCombatSkills', 'pcAttributes', 'pcWeaponsArmor', 'currentLocation', 'last2ScenesNarrative'],
    expandable: ['companions', 'questIfCombatRelated'],
    cut: ['codexBaseline', 'keyPlotFacts', 'dmMemory', 'seededSettlements', 'sublocations', 'worldBounds', 'fullQuestList'],
  },
  travel: {
    must: ['pcMinimum', 'currentLocation', 'targetLocation', 'scanPathPois', 'biomeTransitions', 'arrivalNpcIfApplicable'],
    expandable: ['questObjectiveAtTarget', 'targetLocationFull'],
    cut: ['fullActiveQuests', 'distantNpcs', 'codex', 'needs', 'dmMemory', 'conditionalCombatRules', 'conditionalCodexRules', 'seededSettlements', 'keyPlotFacts'],
  },
  exploration: {
    must: ['currentLocationFull', 'npcsAtLocation', 'pcObservationSkills', 'codexBaseline', 'questNextObjective'],
    expandable: ['nearbyNpcs', 'dmMemoryForLocation', 'keyPlotFactsLocationRelevant'],
    cut: ['worldBounds', 'distantSettlements', 'distantNpcs', 'fullQuestList'],
  },
  rest: {
    must: ['pcStateMinimum', 'wounds', 'mana', 'hunger', 'thirst', 'timeOfDay', 'currentLocationSafety'],
    expandable: ['companions'],
    cut: ['everythingNarrativeHeavy'],
  },
  stealth: {
    must: ['locationLayout', 'npcsWithAttention', 'pcStealthSkills', 'pcStealthEquipment'],
    expandable: ['guardPatrolPattern', 'targetItem'],
    cut: ['distantNpcs', 'fullQuestList', 'worldBounds', 'codexBaseline'],
  },
  craft: {
    must: ['pcCraftingSkills', 'pcMaterials', 'pcTools', 'currentLocationWorkbench'],
    expandable: ['recipeKnowledge'],
    cut: ['mostNarrativeContext', 'distantNpcs', 'worldBounds'],
  },
  // trade już ma tryTradeShortcut() — nie ruszamy
  // dream / cutscene — minimal context, kept as scene-pacing not bundle
};
```

#### Konkretne ruchy (twoje przykłady)

| # | Ruch | Pewność | Implementacja |
|---|---|---|---|
| **#1** | Filtr Key NPCs po lokacji + relevant questach (zamiast top-8 dispositionu z całej kampanii) | 95% | W bundle resolver: `npcs at currentLocation` + `quest giver/target NPCs aktywnych questów` zamiast `top 8 by disposition` w worldBlock.js:55-72. Nano `expand_npcs:[name]` nadpisuje gdy player wzmiankuje innego |
| **#3** | Active Quests: tylko ▶ NEXT + opcjonalnie 1 future dla hook'ów | 88% | W worldBlock.js:109-141 zmiana: render `▶ NEXT` + następny pending objective bez listy completed. ObjectiveId jest indexem — sprawdzić że gdy widoczne `0. ▶ NEXT` + `1. [ ] Future`, LLM emituje poprawne `objectiveId:"0"` |
| **#5** | WORLD BOUNDS on-demand: cut z baseline, dorzucaj gdy backend wykrywa `applyMovementVector` clamp (gracz uderza w granicę) | 92% | Nowy helper `buildWorldBoundsHintIfRelevant(travelBlock)`: gdy `barrierHit !== null` → render konkretnego strażnika tylko. Gracz pyta o granicę bez ruchu → fallback "nie wiesz, nikt nie wracał" jest OK |
| **#6** | Travel mode = travel bundle (wyżej) | 90% | Główny ruch fazy 6 — bundle "travel" wycina ~60% kontekstu vs full |
| **#G** | Reszta bundlów (combat/dialogue/rest/exploration/stealth/craft) | 85% | Wdrożenie wzoru z #6 na pozostałe modes |
| **#I** | DM memory + Pending hooks — tylko entries powiązane z scene-relevant NPCs/locations | 80% | Filtr po `relatedTo` field gdy istnieje, fallback keyword match (NPC name in scene text). Pending hooks zostają (motor narracji). **Wątpliwość 20%**: relevance match wymaga dobrego tagowania w DB — sprawdzić schema |
| **#L** | `[NPC_KNOWLEDGE]` tylko dla NPCs aktywnych w scenie (nano `expand_npcs`) | 80% | Cut z baseline render w livingWorld context, dorzucaj per-NPC w handler |
| **#Q** | `SEEDED SETTLEMENTS` lista — tylko current settlement; reszta gdy travel intent | 85% | Cut z baseline, dorzucaj w travel bundle |
| **#R** | `SUBLOCATIONS IN <city>` + Open optional slots — cut z baseline; dorzucaj gdy player w mieście robi navigation lub tworzy sublocation | 80% | Wymaga nano flag "intra-city movement". **Wątpliwość 20%** — mniej deterministyczne niż reszta; może lepiej zostawić w exploration bundle |

#### Wpięcie w pipeline

[generateSceneStream.js](backend/src/services/sceneGenerator/generateSceneStream.js):
1. Po nano (faza 4) mamy `nanoResult.scene_pacing` + `nanoResult.expand_*` + heurystyka intent
2. Mapowanie `scene_pacing → mode`: combat→combat, dialogue→dialogue, travel_montage→travel, exploration→exploration, rest→rest, chase→combat (treat as), stealth→stealth, dream→exploration (default), cutscene→exploration, celebration→dialogue
3. `bundleResolver.buildContextForMode(mode, state, nanoExpansions)` zwraca strukturę `{must:[...], expanded:[...]}` którą renderer składa
4. Graceful degradation: jeśli mode nieznany lub bundle resolver błąd → fallback do dzisiejszego "all you can eat" (nie blokuj sceny)

#### Token budget per mode (estymacja)

| Mode | Dziś | Po fazie 6 | Redukcja |
|---|---|---|---|
| dialogue | ~25 kB | ~8-10 kB | ~60% |
| combat | ~25 kB | ~7-9 kB | ~64% |
| travel | ~25 kB | ~4-5 kB | ~80% |
| exploration | ~25 kB | ~12-15 kB | ~40% |
| rest | ~25 kB | ~3-4 kB | ~85% |
| stealth | ~25 kB | ~7-9 kB | ~64% |
| craft | ~25 kB | ~5-6 kB | ~76% |

**Łączna oszczędność (waga średnia po typowej dystrybucji modes): ~55% kontekstu.**

#### Ryzyko fazy 6

- **15% ryzyko** że za agresywne filtrowanie zabija nieoczekiwane momenty (combat-scene gdzie gracz zauważy lore-przedmiot na ścianie). Mitigacja: nano `expandable` ma codex/quest/npc jako nadpisywalne; player input "patrzę na ścianę" w combat → nano flag'uje exploration aspekt → expandable włącza codexBaseline.
- **10% ryzyko** że mode misclassification (player pisze "mówię i atakuję" — dialogue czy combat?) → mode resolver musi mieć tie-breaking. Default: jeśli intent flag `[ATTACK:]` to combat wygrywa. Inaczej heurystyka first-verb.
- **Mitigacja ogólna**: feature flag `USE_MODE_BUNDLES=true/false` w env. Faza 6 mergowana behind flag, A/B testowana ręcznie 1 sesją on / 1 sesją off, decyzja pozostawienia.

---

## Krytyczne pliki do edycji

| Plik | Co | Faza |
|---|---|---|
| [systemPrompt/staticRules.js](backend/src/services/sceneGenerator/systemPrompt/staticRules.js) | Wycięcia margin/XP/limits/duplikaty | 1 |
| [systemPrompt/conditionalRules.js](backend/src/services/sceneGenerator/systemPrompt/conditionalRules.js) | Codex rules + LOCATION POLICY skrót | 2 |
| [systemPrompt/index.js](backend/src/services/sceneGenerator/systemPrompt/index.js) | Nowy `buildSystemPromptParts` zwracający `{l1, l2, fresh}` | 3 |
| [streamingClient.js](backend/src/services/sceneGenerator/streamingClient.js) | Mapowanie L1/L2/fresh na cache breakpointy + JSON prefill | 3, 5 |
| [intentClassifier/nanoSelector.js](backend/src/services/intentClassifier/nanoSelector.js) | Wzbogać `buildAvailableSummary` o PC state | 4 |
| [intentClassifier/nanoPrompt.js](backend/src/services/intentClassifier/nanoPrompt.js) | Schema output: scene_pacing, creativity_bonus, roll_skills[] | 4 |
| [generateSceneStream.js](backend/src/services/sceneGenerator/generateSceneStream.js) | Wpięcie pre-decyzji nano do dynamicSuffix jako `[NANO PRE-DECISION]` blok | 4 |
| [systemPrompt/dmSettingsBlock.js](backend/src/services/sceneGenerator/systemPrompt/dmSettingsBlock.js) | Przeniesienie do L2 cache | 3 |
| [contextBundleResolver.js](backend/src/services/sceneGenerator/contextBundleResolver.js) **(NOWY)** | Definicje BUNDLES per mode + `buildContextForMode()` | 6 |
| [systemPrompt/worldBlock.js](backend/src/services/sceneGenerator/systemPrompt/worldBlock.js) | Filtr Key NPCs po lokacji+questach (#1), quest ▶ NEXT-only render (#3) | 6 |
| [aiContextTools/contextBuilders/livingWorld.js](backend/src/services/aiContextTools/contextBuilders/livingWorld.js) | WORLD BOUNDS on-demand (#5), cut SEEDED SETTLEMENTS baseline (#Q), cut SUBLOCATIONS baseline (#R), DM memory relevance filter (#I), NPC_KNOWLEDGE per-NPC (#L) | 6 |
| [aiContextTools/contextBuilders/travel.js](backend/src/services/aiContextTools/contextBuilders/travel.js) | Travel block już istnieje — używać go w bundle "travel" zamiast pełnego contextu | 6 |

## Reuse istniejących utility

- [shared/domain/diceRollInference.js](shared/domain/diceRollInference.js) — używać do walidacji nano `roll_skills[]` (czy skill istnieje w PC, czy difficulty z 5-zestawu)
- [intentClassifier/heuristics.js](backend/src/services/intentClassifier/heuristics.js) — heurystyki już zwracają `combat`/`travel`/`dungeon` flagi, mapowanie na `scene_pacing` defaulty (combat→`combat`, travel→`travel_montage`, etc.) — funkcja pomocnicza `defaultScenePacingFromIntent()`
- [stateValidator.js](src/services/stateValidator.js) — limity które nadal trzymamy w kodzie, prompt o tym milczy (ufamy że frontend valid przed dispatch)

## Verification

**Po fazach 1-5 (jeden batched playtest):**

1. **Unit tests** w `backend/tests/sceneGenerator/` (lokalizacja do potwierdzenia): nano schema akceptuje nowe pola; `defaultScenePacingFromIntent` zwraca sensowne defaulty; `defaultModeFromPacing` mapuje pacing→mode.
2. **Token telemetry** zapięty w fazie 5 — zaloguj baseline 10-15 scen przed fazą 6.
3. **Manual playtest 8-10 scen** pokrywając dialogue/single-skill/multi-skill/travel/combat/creative-custom (per `feedback_playtest_cadence.md`).
4. **Cache hit rate** (KRYTYCZNY): Anthropic `cache_read_input_tokens` w response. Trzy oczekiwane efekty:
   - **Cross-campaign hit**: dwóch userów z różnymi kampaniami w tej samej org powinno hitnąć **tę samą L1** (~2,300 tok read jako cache, nie write). Dziś: 0%, po fazie 3: ~100% (poza pierwszym requestem org).
   - **Intra-campaign hit**: kolejne sceny tego samego usera w tej samej kampanii hituja L1+L2 (~2,300+1,000 tok). Dziś: ~50-60% (5-min TTL), po fazie 3: ~85%+.
   - **L2 sanity check**: jeśli `cache_read_input_tokens` z drugiego breakpointa = 0 zawsze → L2 jest poniżej Anthropic min. Wtedy: bez paniki, runtime check `if (l2_size < 1024) skip_l2` powinien był to wyłapać; zlogować i zostać przy L1.
5. **Regression watch**: dispositionChange sensowne, questUpdates poprawne, `currentLocation` rezolwuje przy travel, `creativityBonus` z nano nie wywala extreme values, `roll_skills[]` premium akceptuje lub adjustuje (sprawdź log `nano_proposed_overridden_count`).

**Po fazie 6 (drugi playtest, mode bundles behind feature flag):**

1. **Per-mode test matrix** (każdy mode ≥1 scena):
   - dialogue: NPC mówi, brak combat/codex/encounter pool spam
   - combat: enemies obecne, walka się resolwuje, brak distant NPCs/codex
   - travel: 2-3 zdania, scanPath POIs widoczne, brak full quest list
   - rest: 1-2 zdania, brak narrative spam
   - exploration: location+NPC details, codex baseline obecny (może revealnąć)
   - stealth: layout+attention NPCs
2. **A/B compare**: 1 sesja `USE_MODE_BUNDLES=true`, 1 sesja `=false`. Porównaj subjective quality narracji + token budget per scene.
3. **Mode misclassification watch**: zaloguj `mode → resolved bundle → expansions` per scena. Jeśli >10% scen dostaje mode mismatch (np. dialogue gdzie powinien być combat) — popraw mapping.
4. **Decision point**: jeśli faza 6 → quality OK + token reduction ≥40% → flag default-on, usuń fallback path. Jeśli quality regresja → flag default-off, zostań przy fazach 1-5 (i tak ~1100 tok).

## Rollback plan

Każda faza w osobnym commicie. Jeśli playtest pokazuje regresję:
- **Faza 4** (nano pre-decyduje rolls/pacing/creativity) — najwyższe ryzyko z 1-5. Rollback: revert commit, zostaw enrichment input bez output schema changes.
- **Faza 1-2** (cięcia tekstu) — niskie ryzyko. Granularny rollback: indywidualne `git revert` per linia.
- **Faza 3** (cache split) — średnie ryzyko (Anthropic vs OpenAI mapping). Rollback: revert do jednowarstwowego cache.
- **Faza 6** (mode bundles) — najwyższe ryzyko z całego planu. Mergowana **behind feature flag `USE_MODE_BUNDLES`**. Rollback: ustaw flag=false bez revert kodu. Jeśli flag=false działa stabilnie tygodniami → kasujemy flag i fallback path. Jeśli quality regresja na konkretnym mode → granular rollback per-mode (np. `BUNDLES.combat = LEGACY_FULL_CONTEXT`).

## Open questions (do rozstrzygnięcia w trakcie / po playteście, NIE blokujące start)

- **#J Last Scene full vs digest gdy nie kontynuujemy.** 70% pewności. Pełne last scene zachowuje tone/voice continuity. Digest (1-zdanie + state diff) działa gdy player robi przeskok ("idę spać", "wracam za dzień") ale gubi się gdy gracz kontynuuje rozmowę. Wymaga walidacji w playteście fazy 6 (ostre cięcie kontekstu pokaże gdzie continuity pęka).
- **#2 Encounter pool deterministycznie z biomu + tier.** 75%. Wymaga sprawdzenia czy mamy granular biome→enemies mapping w kodzie ([backend/src/services/livingWorld/?](backend/src/services/livingWorld/) + `[shared/domain/biomeMap.js](shared/domain/biomeMap.js)`). Jeśli mamy — łatwa dodatkowa faza 6.5. Jeśli nie — to feature, nie cleanup; odkładamy.
- **#O Ambient chatter snippets ("Senya might say: 'Mhm.'")** — 80%. Czy LLM faktycznie ich używa? Worth playtesting bez nich — jeśli sceny nie tracą koloru, cut.
- **expand_codex w nano** — usuwamy w fazie 5 PO walidacji telemetrią. Jeśli faktycznie ~0% wybierania, cut. Jeśli >5%, zostawić.
- **Czy nano widzi LAST diceroll outcome z poprzedniej sceny?** Mógłby dobierać difficulty (crit fail → escalation). Niskie priority — możliwa iteracja po fazie 6.
- **`nano_proposed` vs `final` rolls telemetria.** Loguj ile razy premium nadpisuje. Po kilku sesjach decyzja czy bezpiecznie wyciąć "OVERRIDE only if..." z premium prompta i polegać tylko na nano (większa oszczędność, wyższe ryzyko).
- **Mode mapping dla edge cases**: chase=combat (podczas pościgu używa się combat skills), dream=exploration (default narrative). Czy chcesz dedykowany bundle dla chase/dream/celebration? Dziś plan: nie — pacing wystarczy. Jeśli playtest pokaże bałagan, rozważymy.
- **Cache TTL — 5-min vs 1-hour beta.** 5-min ephemeral (write 1.25×, read 0.1×) jest standardem ale przegrywa dla samotnych strzałów (>5 min między scenami). 1-hour beta (write 2×, read 0.1×) przeżywa typowe przerwy w sesji ale break-even rośnie z 2 do 3 requestów. **Decyzja po telemetrii fazy 5**: jeśli >30% scen to "samotne strzały", przejść na 1-hour. Jeśli <10%, zostać przy 5-min.
- **Conditional cache_control off dla wykrytych samotnych strzałów.** Hipotetyczny guard: jeśli runtime estymuje że scena będzie izolowana (np. po długiej przerwie aktywności usera), wyślij bez cache_control żeby uniknąć +25% write penalty. Trudne bez signala "user wraca po przerwie" — można użyć last-scene-timestamp na campaign jako proxy. NICE-TO-HAVE, nie blocker.
