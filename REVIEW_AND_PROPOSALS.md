# RPGon — Review & Propozycje Rozwoju

> Kompleksowe review projektu RPGon / Nikczemny Krzemuch  
> Data: 2026-03-28

---

## CZĘŚĆ I: REVIEW KONCEPCYJNE

### 1. Ogólna ocena koncepcji

**Ocena: 8.5/10** — Projekt jest ambitny, dobrze przemyślany i znacznie wykracza poza MVP spec. Połączenie mechaniki WFRP 4e z AI GM to unikalna propozycja na rynku.

#### ✅ Mocne strony koncepcyjne

1. **Unique Selling Point jest silny** — AI Dungeon Master oparty o realne, granularne mechaniki WFRP (d100, SL, kariery, wiatry magii) to coś, czego nie oferuje żaden konkurent. AI Dungeon czy Novel AI mają luźne systemy narracyjne — tutaj jest prawdziwy "crunch" RPG.

2. **Tryb solo BEZ backendu** — to genialna decyzja architektoniczna. Użytkownik może zacząć grać natychmiast, bez rejestracji, podając tylko klucz API. Obniża barierę wejścia do minimum.

3. **Konwersja solo→multiplayer** — elegancki flow. Gracz nie musi zaczynać od nowa żeby zaprosić znajomych.

4. **System Codex** — "encyklopedia wiedzy" odkrywanej przez gracza to świetny mechanizm budowania immersji. Różne NPC znają różne aspekty (uczony wie historię, strażnik zna lokalizacje) — to inteligentne.

5. **Narrative Seeds (Chekhov's Guns)** — system "zasiewania" elementów fabularnych z późniejszą wypłatą to zaawansowana technika narracyjna, rzadko spotykana nawet w grach AAA.

6. **Szczegółowa mechanika WFRP** — kariery z 4 tierami, krytyczne rany, system reputacji frakcji, potrzeby postaci, ekonomia GC/SS/CP — to pełnoprawna implementacja RPG, nie uproszczenie.

#### ⚠️ Ryzyka koncepcyjne

1. **Złożoność vs onboarding** — Projekt wyrósł daleko poza MVP. Nowy gracz widzi: lobby, kreator kampanii, ogromny ekran gry z panelami walki, magii, mapy, postaci, questów, NPC, kodeksu, pogody, potrzeb... Brak tutorialu lub guided experience. **Ryzyko: przytłoczenie użytkownika**.

2. **Zależność od jakości AI** — Cała gra opiera się na AI zwracającym poprawny JSON z ogromną ilością pól (narrative, actions, diceCheck, stateChanges z ~25 podpolami, dialogueSegments, imagePrompt, musicPrompt, soundEffect, questOffers, codexUpdates, knowledgeUpdates...). System prompt w `prompts.js` jest MASYWNY (setki linii). To powoduje:
   - **Wysokie koszty** — każdy prompt to tysiące tokenów samego systemu
   - **Ryzyko halucynacji** — im więcej pól, tym więcej potencjalnych błędów
   - **Latency** — generacja sceny trwa długo z tak dużym kontekstem

3. **Brak graceful degradation** — gdy AI zwróci niepoprawne dane, system loguje warning ale kontynuuje. Nie ma fallbacków dla kluczowych scenariuszy (co gdy AI konsekwentnie ignoruje quest objectives? Co gdy narrative jest pusty?).

4. **Multiplayer w pamięci** — Stan multiplayer jest in-memory (`roomManager.js`). Backup do DB istnieje, ale odtwarzanie jest "best effort". Przy crash/restart serwera, gry mogą być utracone.

5. **Brak monetyzacji / modelu biznesowego** — Gracz płaci za swoje klucze API. Przy intensywnej grze koszty mogą być znaczne (GPT-5.4 + Stability + ElevenLabs). Brak mechanizmu ograniczania kosztów poza cost trackerem.

---

### 2. Analiza game design

#### Pętla rozgrywki
```
Scena → Akcja gracza → (Test d100) → AI przetwarza → Aktualizacja stanu → Następna scena
```
**Ocena: Solidna**, ale brakuje:
- **Tension arc** — `tensionTracker.js` istnieje, ale wpływa tylko na pacing. Nie ma mechanizmu budowania napięcia w ramach aktu/kampanii
- **Player agency w walce** — Walka jest rozstrzygana przez `combatEngine.js` (silnik klient-side z turami), co jest świetne. Ale **magia** i **dialog** mają osobne panele/silniki, co fragmentuje doświadczenie
- **Brak fail states** — Poza "TPK" (total party kill), nie ma mechanizmów porażki. Kampania może trwać w nieskończoność bez konkluzji

#### System potrzeb (hunger, thirst, rest, hygiene, bladder)
**Ocena: Ciekawy, ale ryzykowny.** System potrzeb to "realism tax" — dodaje immersji, ale wymaga od AI ciągłego uwzględniania. Gracz musi regularnie jeść, pić, spać, myć się, korzystać z toalety. To może:
- Przeszkadzać w epickich momentach ("bitwę przerywa potrzeba toalety")
- Wymuszać powtarzalne sceny ("znowu jemy w karczmie")
- Jest domyślnie wyłączony (`needsSystemEnabled: false`) — co sugeruje, że twórca sam nie jest pewien

#### System questów
**Ocena: Bardzo dobry.** System z objectives, turn-in NPC, weryfikacją AI, quest offers (propozycje w trakcie gry), deadline'ami — to kompletna implementacja. Quest gating (player musi wrócić do NPC żeby zakończyć quest) dodaje taktycznej głębi.

---

### 3. Analiza user experience

#### Pozytywne
- Dwujęzyczność (PL/EN) od startu
- Glassmorphism dark theme — estetyczny, spójny
- Export/import konfiguracji i kampanii
- AutoPlayer (AI gra sam) — świetne do demo/testów
- Mobile nav z responsywnością

#### Problematyczne
- **Brak onboarding/tutoriala** — nowy gracz nie wie od czego zacząć
- **Ogromna ilość ustawień** — DM Settings ma ~15 sliderów, API keys dla 5+ serwisów, lokalne LLM, autoPlayer...
- **Brak progress indication** — generacja sceny trwa 5-15s, jedyny feedback to spinner
- **Brak error recovery UI** — gdy coś nie działa, gracz widzi console.warn, nie komunikat

---

## CZĘŚĆ II: REVIEW KODOWE

### 1. Architektura — ogólna ocena

**Ocena: 7.5/10** — Architektura jest logiczna i dobrze zorganizowana, ale pewne elementy wymagają uwagi.

#### ✅ Mocne strony

1. **Czysty podział frontend/backend** z możliwością pracy bez backendu
2. **useReducer w kontekstach** — prawidłowe zarządzanie złożonym stanem
3. **Walidacja Zod** na odpowiedziach AI — krytyczne i dobrze wykonane
4. **Engines w services/** — combatEngine, magicEngine, weatherEngine, reputationEngine — logika gry jest wyizolowana z UI
5. **Context manager** z kompresją scen i RAG-like knowledge retrieval
6. **Retry z fallback na alternatywnego providera** (OpenAI→Anthropic i vice versa)
7. **Rate limiting** na backendzie z per-scope konfiguracją
8. **Dockerfile multi-stage** — poprawny, lekki obraz produkcyjny

#### ⚠️ Obszary do poprawy

### 2. GameContext.jsx — "God Context"

**Problem:** `GameContext.jsx` to **1646 linii** z jednym gigantycznym reducerem (~50 case'ów). Zarządza WSZYSTKIM: kampanią, postacią, party, światem, questami, scenami, chatem, walką, dialogiem, magią, achievementami, undo stackiem, kosztami AI, multiplayer state...

**Konsekwencje:**
- Każdy dispatch powoduje re-render całego drzewa komponentów
- Trudno testować poszczególne slice'y stanu
- Nowe features = nowe case'y w jednym pliku
- Łatwo o regression — zmiana w `APPLY_STATE_CHANGES` (300+ linii sam case) może zepsuć cokolwiek

### 3. System promptów — rozmiar i koszty

**Problem:** `prompts.js` buduje system prompt z ~40 sekcji. Pełny prompt łatwo przekracza 8000+ tokenów samego systemu. Przy każdym `generateScene` płaci się za:
- System prompt: ~8000 tokens
- User prompt: ~500-1000 tokens  
- Kontekst (sceny, historia, codex): ~2000-4000 tokens
- Odpowiedź: ~1500-2000 tokens

**Koszt jednej sceny:** ~$0.03-0.10 (GPT-5.4) lub ~$0.05-0.15 (Claude Sonnet 4). Przy 100 scenach kampanii: **$3-15 samego AI**.

### 4. Pokrywanie testami

**Status:**
- Frontend: 8 plików testowych (stateValidator, achievementTracker, aiResponseValidator, combatEngine, diceRollInference, imageGen, worldConsistency, autoPlayer, combatAudio + useAutoPlayer hook)
- Backend: 1 plik testowy (roomManager)

**Brakuje testów dla:**
- `prompts.js` — najkrytyczniejszy plik (buduje prompty)
- `ai.js` — logika retry/fallback
- `contextManager.js` — kompresja i retrieval
- `storage.js` — sync, migracja, quota handling
- `GameContext.jsx` — reducer logic
- Backend routes (auth, campaigns, multiplayer)
- WebSocket communication flow

### 5. Bezpieczeństwo

**Pozytywne:**
- JWT auth na backendzie
- Szyfrowanie API keys w DB (`API_KEY_ENCRYPTION_SECRET`)
- Helmet.js
- Rate limiting per scope
- CORS konfigurowalny
- Klucze API nie leakują (sanitizeSettings usuwa je z exportu)

**Ryzyka:**
- `anthropic-dangerous-direct-browser-access: true` w `ai.js` — klucz Anthropic jest wysyłany bezpośrednio z przeglądarki. To intended (tryb bez backendu), ale headers name mówi sam za siebie
- Brak input sanitization na WebSocket messages — `multiplayer.js` parsuje JSON i dispatchy bez walidacji payloadu
- `bodyLimit: 50MB` na głównej instancji Fastify — otwiera na abuse (duże uploady)
- Brak CSRF protection
- localStorage zawiera pełny game state z potencjalnie wrażliwymi danymi

### 6. Wydajność

**Problemy:**
- **Re-renders:** Brak `React.memo`, `useMemo`, `useCallback` na komponentach gameplay — każdy dispatch w GameContext powoduje kaskadę re-renderów
- **localStorage thrashing:** `autoSave` jest wywoływany po każdej scenie i trzyma WSZYSTKIE kampanie w jednym kluczu JSON. Przy dużych kampaniach (100+ scen z obrazami) łatwo o QuotaExceededError
- **Brak lazy loading:** Wszystkie komponenty (viewer, gallery, multiplayer, 3D) ładowane eagerly
- **prompts.js importuje wszystkie wfrp* moduły** — bestiary, factions, criticals, magic, equipment, talents — nawet gdy nie są potrzebne dla danej sceny

### 7. Duplikacja kodu

- `stateValidator.js` istnieje zarówno w `src/services/` jak i `backend/src/services/` — podobna logika, ale nie współdzielona (folder `shared/` ma tylko `modelCatalog3d.js`)
- `stateChangeMessages.js` jest zduplikowany front/backend
- `timeUtils.js` jest zduplikowany front/backend  
- Logika normalizacji pieniędzy istnieje w 3+ miejscach (GameContext, MultiplayerContext, stateValidator)
- Prompt-related `max_tokens` jest hardcoded w wielu miejscach zamiast w jednej konfiguracji

### 8. Obsługa błędów

- Wiele `catch {}` (puste catch bloki) — błędy są połykane bez logowania
- `console.warn` jako jedyny mechanizm raportowania błędów — brak error boundary na poziomie komponentów
- Brak retry UI — gdy generacja sceny się nie uda, gracz musi ręcznie powtórzyć akcję
- Promise rejections w `storage.js` mogą crashować aplikację (brak global error handler)

---

## CZĘŚĆ III: PROPOZYCJE ROZWIĄZAŃ I ROZWOJU

### 🔴 Priorytet KRYTYCZNY (powinno być zrobione jak najszybciej)

#### P1. Rozbicie GameContext na slice'y
**Problem:** Monolityczny reducer 1600+ linii  
**Rozwiązanie:**
```
contexts/
  GameContext.jsx          → provider + orkiestrator
  reducers/
    campaignReducer.js     → START_CAMPAIGN, LOAD_CAMPAIGN
    characterReducer.js    → UPDATE_CHARACTER, ADVANCE_*, kariera
    worldReducer.js        → UPDATE_WORLD, lokacje, NPC, fakcje, pogoda
    questReducer.js        → ADD_QUEST, COMPLETE_QUEST, questUpdates
    sceneReducer.js        → ADD_SCENE, UPDATE_SCENE_*
    combatReducer.js       → START/UPDATE/END_COMBAT
    dialogueReducer.js     → START/UPDATE/END_DIALOGUE
    multiplayerReducer.js  → LOAD_MULTIPLAYER_STATE, MP_*
```
Każdy slice eksportuje pod-reducer. GameContext combinuje je. **Zysk:** testowalność, mniejsze pliki, lepsze performance (selektywne dispatche).

#### P2. Error Boundaries i retry UI
**Problem:** Brak obsługi błędów na poziomie UI  
**Rozwiązanie:**
- React Error Boundary wokół GameplayPage, CreatorPage
- Toast system do wyświetlania błędów (istnieje ui/ ale brak toast)
- "Retry" button po failed scene generation
- Fallback UI zamiast białego ekranu

#### P3. Współdzielenie kodu frontend/backend
**Problem:** Duplikacja stateValidator, timeUtils, stateChangeMessages  
**Rozwiązanie:** Rozszerzyć folder `shared/` o wspólne moduły:
```
shared/
  stateValidator.js
  timeUtils.js
  stateChangeMessages.js
  moneyUtils.js
  modelCatalog3d.js
```
Importować z `../../shared/` w obu projektach. Vite alias + backend import resolution.

---

### 🟡 Priorytet WYSOKI (wpływ na UX i koszty)

#### P4. Optymalizacja promptów — "Context Budget"
**Problem:** Masywne prompty = wysokie koszty  
**Rozwiązanie:** System budżetu kontekstowego:
- Bazowy prompt (reguły WFRP, format odpowiedzi): ~2000 tokenów (stały)
- Kontekstowe moduły (bestiary, magia, handel, frakcje) ładowane TYLKO gdy scenariusz tego wymaga (już częściowo zrobione, ale agresywniejsze filtrowanie)
- Suwak "Context Budget" w DM Settings (już istnieje `contextDepth`, ale nie wpływa na system prompt, tylko na historię)
- Cache'owanie base system prompt (nie budować od zera co scenę)
- **Estymowany zysk: 30-50% redukcja kosztów per scena**

#### P5. Tutorial / Onboarding flow
**Problem:** Nowy gracz jest przytłoczony  
**Rozwiązanie:**
- "Quick Start" — gotowa krótka kampania do zagrania bez konfiguracji (prebuilt JSON)
- Tooltips na pierwszych 3 scenach wyjaśniające UI
- "Simplified Mode" — ukrywa zaawansowane panele (magia, walka taktyczna, potrzeby) aż gracz je potrzebuje
- Kreator kampanii w trybie "guided" (krok po kroku) vs "advanced" (obecny formularz)

#### P6. Lazy Loading komponentów
**Problem:** Cały bundle ładowany na starcie  
**Rozwiązanie:**
```jsx
const GameplayPage = lazy(() => import('./components/gameplay/GameplayPage'));
const GalleryPage = lazy(() => import('./components/gallery/GalleryPage'));
const CampaignViewerPage = lazy(() => import('./components/viewer/CampaignViewerPage'));
// + React.Suspense z fallback
```
Szczególnie ważne: `@react-three/fiber` i `three` to duże paczki, powinny być ładowane tylko gdy 3D viewer jest używany.

#### P7. Persistent multiplayer state
**Problem:** Stan multiplayer in-memory ginie przy restart  
**Rozwiązanie:** 
- Obecny backup do DB (`MultiplayerSession`) powinien być synchroniczny (nie "best effort")
- Write-ahead log: każda zmiana stanu → zapis do DB (debounced 5s)
- Przy starcie serwera: automatyczny load i broadcast do reconnecting graczy
- Częściowo zrobione (`loadActiveSessionsFromDB`), ale wymaga hardening

---

### 🟢 Priorytet NORMALNY (ulepszenia)

#### P8. Streaming AI responses
**Problem:** Gracz czeka 5-15s na pełną odpowiedź  
**Rozwiązanie:**
- OpenAI i Anthropic wspierają streaming (SSE)
- Narrative tekst streamowany w czasie rzeczywistym → gracz widzi tekst pojawiający się słowo po słowie
- Po zakończeniu streamu → parse JSON, apply state changes
- **Zysk: Perceived latency spada z 10s do <1s**

#### P9. IndexedDB zamiast localStorage
**Problem:** localStorage ma limit ~5-10MB, kampanie z obrazami łatwo go przekraczają  
**Rozwiązanie:**
- Migracja na IndexedDB (np. `idb-keyval` lub natywne API)
- Obrazy scene'ów przechowywane jako Blob, nie base64 w JSON
- Brak limitu rozmiaru
- Async API (już częściowo przygotowane: `getCampaignsAsync`)

#### P10. System "Campaign Templates"
**Problem:** Każda kampania zaczyna od zera  
**Rozwiązanie:**
- Prebuilt campaign templates (np. "The Enemy Within" inspired, "Mordheim Expedition", "Chaos Wastes Journey")
- Template = predefiniowany setting + questy startowe + mapa + NPC
- Społeczność może tworzyć i udostępniać template'y (rozszerzenie Gallery)
- Integracja z fork-to-play z Gallery

#### P11. AI Provider abstraction layer
**Problem:** `ai.js` ma osobne funkcje `callOpenAI`, `callAnthropic`, `callOpenAIViaProxy`, `callAnthropicViaProxy` — 4 niemal identyczne implementacje  
**Rozwiązanie:**
```js
class AIProvider {
  constructor(config) { ... }
  async chat(systemPrompt, userPrompt, options) { ... }
}

class OpenAIProvider extends AIProvider { ... }
class AnthropicProvider extends AIProvider { ... }
class ProxyProvider extends AIProvider { ... }
class LocalProvider extends AIProvider { ... }
```
Jeden interfejs, łatwe dodanie nowych providerów (Gemini, Mistral, etc.).

#### P12. Rozszerzenie testów
**Priorytetowe testy do dodania:**
1. `prompts.test.js` — weryfikacja struktury promptów, poprawność JSON instructions
2. `GameContext.test.js` — unit testy każdego case w reducerze
3. `contextManager.test.js` — compression threshold, knowledge retrieval scoring
4. `storage.test.js` — quota handling, sync logic, migration
5. Backend integration tests — auth flow, campaign CRUD, WebSocket lifecycle
6. E2E test — pełny flow: create campaign → play 3 scenes → save → reload

#### P13. WebSocket message validation (backend)
**Problem:** Brak walidacji payloadu WebSocket messages  
**Rozwiązanie:**
- Zod schema dla każdego typu message (CREATE_ROOM, JOIN_ROOM, SUBMIT_ACTION, etc.)
- Odrzucanie malformed messages z error response
- Rate limiting per-user na WebSocket (ochrona przed flood)

#### P14. Campaign analytics / statistics dashboard
**Problem:** Gracz nie widzi swoich statystyk  
**Rozwiązanie:**
- Dashboard z: liczba scen, czas gry, najczęstsze testy, win/loss walki, reputacja frakcji w czasie
- Wykres tension score przez kampanię
- "Campaign report" po zakończeniu (epilog + statystyki)
- Bazowa implementacja: achievements + aiCosts już śledzą dane

#### P15. Offline support / PWA
**Problem:** Gra wymaga internetu (API calls)  
**Rozwiązanie:**
- Service Worker cacheuje statyczne zasoby
- Kampanie solo zapisane lokalnie działają offline (UI, kontynuacja)
- Queue akcji gdy brak internetu → sync po powrocie online
- Integracja z local LLM (Ollama) dla pełnego offline — już częściowo zaimplementowana (`localAI.js`)

---

### 🔵 Priorytet PRZYSZŁOŚCIOWY (nowe funkcjonalności)

#### P16. Voice input (Speech-to-Action)
**Problem:** Gracz musi pisać akcje  
**Rozwiązanie:** `useSpeechRecognition.js` już istnieje — integracja z ActionPanel:
- Gracz mówi → transkrypcja → wstawienie jako custom action
- Immersja "mówienia do Mistrza Gry"
- Obsługa PL i EN (Web Speech API wspiera oba)

#### P17. Campaign branching / "What if" mode
**Problem:** Decyzje są nieodwracalne (undo stack ograniczony do 10)  
**Rozwiązanie:**
- Fork kampanii w dowolnym momencie
- "What if?" — cofnij do sceny X, powtórz z inną decyzją
- Drzewo decyzji jako wizualizacja (rozszerzenie MapCanvas)

#### P18. NPC Portrait Gallery z persistent memory
**Problem:** Portrety NPC są wspomniane w spec ale nie zaimplementowane  
**Rozwiązanie:**
- Generowanie portretu przy `stateChanges.npcs` z `action: 'introduce'`
- Portret powiązany z NPC name → wyświetlany w dialogach i WorldStateModal
- Przechowywanie w MediaAsset lub jako base64 w game state

#### P19. Tactical combat map (2D/isometric)
**Problem:** `combatEngine.js` ma system pozycji (`position`, `BATTLEFIELD_MAX`), ale UI nie wizualizuje taktycznej mapy  
**Rozwiązanie:**
- Grid/hex mapa z pozycjami combatantów
- Drag & drop movement
- Wizualizacja zasięgu broni (melee range)
- Użycie istniejącego `MapCanvas.jsx` jako bazy

#### P20. Plugin / Mod system
**Problem:** Projekt jest zamknięty na customizację  
**Rozwiązanie:**
- System pluginów: custom rule engines, nowe dane (bestiariusze, fakcje, zaklęcia)
- Format: JS module z exports `{ data, engine, prompts }`
- Społeczność tworzy content packs ("Dark Heresy rules", "D&D 5e conversion")
- Runtime loading via dynamic import

---

## Podsumowanie priorytetów

| # | Propozycja | Priorytet | Wysiłek | Wpływ |
|---|-----------|-----------|---------|-------|
| P1 | Rozbicie GameContext | 🔴 KRYTYCZNY | Duży | Wysoki (maintainability, perf) |
| P2 | Error Boundaries + retry UI | 🔴 KRYTYCZNY | Średni | Wysoki (UX) |
| P3 | Shared code front/back | 🔴 KRYTYCZNY | Mały | Średni (DRY) |
| P4 | Optymalizacja promptów | 🟡 WYSOKI | Średni | Wysoki (koszty -30-50%) |
| P5 | Tutorial / onboarding | 🟡 WYSOKI | Duży | Wysoki (user retention) |
| P6 | Lazy loading | 🟡 WYSOKI | Mały | Średni (initial load) |
| P7 | Persistent multiplayer | 🟡 WYSOKI | Średni | Wysoki (reliability) |
| P8 | Streaming AI responses | 🟢 NORMALNY | Średni | Wysoki (perceived perf) |
| P9 | IndexedDB | 🟢 NORMALNY | Średni | Średni (quota) |
| P10 | Campaign templates | 🟢 NORMALNY | Średni | Średni (onboarding) |
| P11 | AI Provider abstraction | 🟢 NORMALNY | Średni | Średni (extensibility) |
| P12 | Rozszerzenie testów | 🟢 NORMALNY | Duży | Wysoki (stability) |
| P13 | WS message validation | 🟢 NORMALNY | Mały | Średni (security) |
| P14 | Campaign analytics | 🟢 NORMALNY | Średni | Niski (nice-to-have) |
| P15 | PWA / offline | 🟢 NORMALNY | Duży | Średni (accessibility) |
| P16 | Voice input | 🔵 PRZYSZŁOŚĆ | Mały | Średni (immersja) |
| P17 | Campaign branching | 🔵 PRZYSZŁOŚĆ | Duży | Średni (replayability) |
| P18 | NPC portraits | 🔵 PRZYSZŁOŚĆ | Średni | Średni (immersja) |
| P19 | Tactical map | 🔵 PRZYSZŁOŚĆ | Duży | Średni (gameplay depth) |
| P20 | Plugin system | 🔵 PRZYSZŁOŚĆ | Ogromny | Wysoki (ecosystem) |

---

*Wygenerowano na podstawie pełnej analizy kodu źródłowego projektu RPGon.*
