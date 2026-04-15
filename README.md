# RPGon — AI-Narrated Tabletop RPG

> **[English](#english)** | **[Polski](#polski)**

---

<a id="english"></a>

## English

RPGon (in-game: **Nikczemny Krzemuch**) is a browser-based tabletop RPG with an AI Game Master running on a **custom d50 system**. A multi-model LLM pipeline narrates the story, resolves mechanics, manages quests and a living world — in solo mode or multiplayer with up to 6 players.

### Key Features

- **AI Dungeon Master** — two-stage pipeline: nano model picks what context the scene needs, code assembles it in parallel, premium model writes the scene in one streamed call
- **RPGon d50 system** — custom rules designed for AI-GM play: 6 attributes (1-25), ~31 skills, 9 spell trees with mana-based magic, d50 resolution with margins, `szczęście` as auto-success chance, titles from achievements (no classes), three-tier Polish currency (Złota/Srebrna/Miedziana Korona)
- **Multi-provider AI** — OpenAI (GPT-5.4 / 4.1 / 4o / o3 / o4), Anthropic (Claude Sonnet 4, Haiku 4.5), Google Gemini, with nano/standard/premium tiering to keep costs bounded
- **Streaming UX** — scenes stream narrative chunks via SSE while still queuing through BullMQ for concurrency control and retry semantics
- **Multiplayer** — up to 6 players via WebSocket, host-authoritative state, mid-game join, solo → multiplayer conversion, optional WebRTC voice chat
- **3D scene rendering** — React Three Fiber with procedural foliage, GLB models, ambient weather/particle effects
- **Rich media** — AI-generated scene illustrations (Stability AI), voice narrator (ElevenLabs TTS with word highlighting), on-demand 3D model generation (Meshy)
- **Living world** — NPCs with dispositions, faction reputation, weather + day/night, needs system (hunger, fatigue), vector-searchable campaign memory
- **Public gallery** — publish campaigns for others to browse and fork
- **Bilingual** — Polish (default) and English UI

### Quick Start

```bash
npm run setup                          # root + backend deps, prisma generate
cp backend/.env.example backend/.env   # fill in DATABASE_URL (Atlas SRV), JWT_SECRET, keys
npm run dev                            # docker compose up --build --watch (backend :3001 + valkey)
```

**MongoDB is Atlas-only** — set `DATABASE_URL` to an Atlas SRV string in `.env` before booting. The backend is the sole AI dispatch path; users can paste their own provider keys in Settings which are stored encrypted server-side.

For vector search, run once per Atlas cluster:

```bash
cd backend && node src/scripts/createVectorIndexes.js
```

### Documentation

- **[CLAUDE.md](./CLAUDE.md)** — terse top-level guide (stack, commands, architecture, critical-path files)
- **[knowledge/](./knowledge/)** — detailed subsystem docs
  - [concepts/](./knowledge/concepts/) — how each subsystem works
  - [patterns/](./knowledge/patterns/) — reusable code patterns
  - [decisions/](./knowledge/decisions/) — why we picked option B over A/C
  - [ideas/](./knowledge/ideas/) — future concepts not yet built
- **[RPG_SYSTEM.md](./RPG_SYSTEM.md)** — full RPGon rules specification

---

<a id="polski"></a>

## Polski

RPGon to przeglądarkowa gra RPG z narratorem AI, zbudowana na **autorskim systemie d50** (RPGon). Pipeline wielomodelowy prowadzi fabułę, rozstrzyga mechaniki, zarządza questami i żywym światem — w trybie solo lub multiplayer do 6 graczy.

### Spis treści

- [Architektura](#architektura)
- [Przepływ gry](#przepływ-gry)
- [Pipeline AI (dwuetapowy)](#pipeline-ai-dwuetapowy)
- [Multiplayer](#multiplayer)
- [System RPGon](#system-rpgon)
- [Funkcjonalności](#funkcjonalności)
- [Stos technologiczny](#stos-technologiczny)
- [Struktura projektu](#struktura-projektu)
- [Uruchomienie](#uruchomienie)
- [Dokumentacja](#dokumentacja)

---

## Architektura

Backend jest jedyną ścieżką dispatcha AI — frontend nie rozmawia bezpośrednio z providerami. Strumieniowanie scen idzie przez kolejkę BullMQ z mostkiem pub/sub po Redisie, żeby utrzymać progresywny UX razem z backpressure i retry.

```mermaid
graph TB
    subgraph Frontend ["Frontend — React + Vite"]
        UI[Panele gameplay<br/>Scene/Chat/Combat/Action]
        ZS[Zustand store<br/>gameStore + handlers]
        SEL[Granularne selektory]
        SCN[useSceneGeneration<br/>+ sceneGeneration/]
        HOOKS[Combat hooks<br/>4 pure-factory + test]
        API[apiClient.js<br/>JWT + refresh + CSRF]
        WS_C[websocket.js<br/>multiplayer client]
    end

    subgraph Backend ["Backend — Fastify"]
        ROUTE_AI[/v1/ai/*<br/>SSE + single-shot + jobs]
        ROUTE_MP[/v1/multiplayer<br/>WebSocket]
        ROUTE_AUTH[/v1/auth<br/>cookie refresh + CSRF]
        ROUTE_CAMP[/v1/campaigns<br/>CRUD + share + recaps]
        SCENE_GEN[sceneGenerator/<br/>generateSceneStream]
        INTENT[intentClassifier<br/>heuristic + nano]
        CTX[aiContextTools<br/>assembleContext]
        COMP[memoryCompressor<br/>nano facts + summaries]
        MP_FLOW[multiplayerSceneFlow<br/>+ multiplayerAI/]
        ROOM[roomManager<br/>in-memory + DB backup]
    end

    subgraph Queue ["BullMQ + Valkey/Redis"]
        QUEUE[Per-provider queues<br/>ai-openai / ai-anthropic<br/>ai-gemini / ai-stability<br/>ai-meshy]
        WORKER[aiWorker<br/>handler registry]
        PUBSUB[(Pub/sub bridge<br/>scene-job:ID:events<br/>campaign-job:ID:events)]
    end

    subgraph Providers ["Providers"]
        OPENAI[OpenAI<br/>GPT-5.4/4.1/4o/o3]
        ANTHROPIC[Anthropic<br/>Claude Sonnet 4 + Haiku 4.5]
        GEMINI[Google Gemini]
        STABILITY[Stability AI<br/>obrazy scen]
        ELEVEN[ElevenLabs<br/>TTS]
        MESHY[Meshy<br/>modele 3D]
    end

    subgraph Storage ["MongoDB Atlas + Valkey"]
        ATLAS[(MongoDB Atlas<br/>Prisma: User, Campaign,<br/>Scene, NPC, Quest,<br/>Knowledge, Codex)]
        VECTOR[(Atlas Vector Search<br/>embeddings via<br/>native driver)]
        VALKEY[(Valkey<br/>refresh tokens, cache,<br/>BullMQ, idempotency)]
    end

    UI --> ZS
    ZS --> SEL
    SEL --> UI
    UI --> SCN
    SCN --> HOOKS
    SCN --> API

    API --> ROUTE_AI
    API --> ROUTE_AUTH
    API --> ROUTE_CAMP
    WS_C <-->|WebSocket| ROUTE_MP

    ROUTE_AI -->|enqueue + subscribe| QUEUE
    QUEUE --> WORKER
    WORKER --> SCENE_GEN
    WORKER --> PUBSUB
    PUBSUB -.->|SSE forward| ROUTE_AI

    SCENE_GEN --> INTENT
    SCENE_GEN --> CTX
    SCENE_GEN -.->|post-scene async| COMP
    SCENE_GEN --> OPENAI
    SCENE_GEN --> ANTHROPIC

    ROUTE_MP --> ROOM
    ROOM --> MP_FLOW
    MP_FLOW --> OPENAI
    MP_FLOW --> ANTHROPIC

    INTENT --> OPENAI
    INTENT --> ANTHROPIC
    CTX --> ATLAS
    CTX --> VECTOR
    COMP --> ATLAS

    ROUTE_AUTH --> VALKEY
    ROUTE_AUTH --> ATLAS
    ROUTE_CAMP --> ATLAS
    QUEUE --> VALKEY
    PUBSUB --> VALKEY

    ROUTE_AI -.->|proxy| ELEVEN
    ROUTE_AI -.->|proxy| STABILITY
    ROUTE_AI -.->|proxy| MESHY
    ROUTE_AI -.->|proxy| GEMINI
```

---

## Przepływ gry

```mermaid
flowchart TD
    START([Gracz otwiera aplikację]) --> AUTH_CHECK{Sesja aktywna?}
    AUTH_CHECK -->|Nie| LOGIN[Logowanie / rejestracja<br/>cookie refresh + CSRF]
    AUTH_CHECK -->|Tak| LOBBY[Lobby — kampanie + galeria]
    LOGIN --> LOBBY

    LOBBY -->|Nowa kampania| CREATE[Kreator kampanii<br/>AI generuje fundament<br/>przez SSE]
    LOBBY -->|Wczytaj kampanię| LOAD[storage.loadCampaign<br/>GET /v1/campaigns/:id]
    LOBBY -->|Dołącz do pokoju| JOIN[JoinRoomPage<br/>/join/:code]
    LOBBY -->|Przeglądaj galerię| GALLERY[Publiczne kampanie<br/>+ fork-to-play]

    CREATE --> CHAR[Tworzenie postaci<br/>RPGon: 6 atrybutów,<br/>umiejętności, tytuły]
    CHAR --> PLAY[Rozgrywka /play/:id]
    LOAD --> PLAY

    JOIN -->|WebSocket| MP_LOBBY[Lobby multiplayer<br/>oczekiwanie na graczy]
    MP_LOBBY -->|Host startuje| PLAY

    subgraph GAMEPLAY ["Pętla rozgrywki"]
        PLAY --> ACTION[Gracz wybiera akcję<br/>lub wpisuje własną]
        ACTION --> MECH[resolveMechanics — deterministic<br/>d50 + momentum + szczęście<br/>magic / combat / rest]
        MECH --> STREAM[SSE scene stream<br/>POST /generate-scene-stream]
        STREAM -->|chunk| REVEAL[Progresywne ujawnianie<br/>narracji w ChatPanel]
        STREAM -->|complete| APPLY[stateValidator →<br/>applyStateChangesHandler]
        APPLY --> SAVE[autoSave<br/>PUT /v1/campaigns/:id]
        SAVE --> ACTION
    end

    PLAY -.->|Opcjonalnie| IMG[Ilustracja sceny<br/>Stability AI via proxy]
    PLAY -.->|Opcjonalnie| TTS[Narrator głosowy<br/>ElevenLabs TTS]
    PLAY -.->|Opcjonalnie| MODEL3D[Modele 3D<br/>Meshy + katalog prefabs]
```

---

## Pipeline AI (dwuetapowy)

Zamiast wypychać cały stan kampanii do każdego zapytania ani wymagać żeby duży model wywoływał tools w pętli, używamy dwóch etapów: **nano wybiera**, **kod składa**, **premium narracja**.

```mermaid
sequenceDiagram
    participant G as Gracz
    participant FE as Frontend<br/>(useSceneGeneration)
    participant R as Route<br/>(/generate-scene-stream)
    participant Q as BullMQ + pub/sub
    participant W as Worker<br/>(generateSceneStream)
    participant N as Nano<br/>(intent + compression)
    participant DB as Atlas<br/>(+ Vector Search)
    participant P as Premium<br/>(scene narrative)

    G->>FE: Wybiera akcję
    FE->>FE: resolveMechanics<br/>(d50 + momentum + szczęście)
    FE->>R: POST /generate-scene-stream
    R->>R: writeSseHead (hijack, CORS)
    R->>Q: subscribe(channel) + enqueueJob(jobId)
    Q->>W: dispatch handler
    W->>DB: loadCampaignState<br/>(parallel: NPCs, Quests, Codex)
    W->>N: classifyIntent<br/>(heuristic → nano fallback)
    N-->>W: {expand_npcs, expand_quests, roll_skill, ...}
    W->>DB: assembleContext<br/>(parallel fetches + vector search)
    W->>W: buildLeanSystemPrompt + userPrompt
    W->>P: runTwoStagePipelineStreaming
    loop Streaming
        P-->>W: chunk
        W-->>Q: publish(event)
        Q-->>R: pub/sub message
        R-->>FE: data: {type: 'chunk', text}
        FE-->>G: Progresywne ujawnianie
    end
    P-->>W: final JSON
    W->>W: parse + validate + reconcile dice<br/>+ fillEnemiesFromBestiary<br/>+ processStateChanges
    W-->>Q: publish(complete)
    Q-->>R: pub/sub
    R-->>FE: data: {type: 'complete', scene, sceneIndex}

    par Post-scene (async, fire-and-forget)
        W->>N: compressSceneToSummary
        N-->>W: 3-7 key facts
        W->>N: generateLocationSummary<br/>(if location changed)
        W->>N: checkQuestObjectives
    and Persist
        W->>DB: POST scenes + sync normalized
    end
```

### Co zawiera odpowiedź AI

| Pole | Opis |
|---|---|
| `narrative` | Tekst narracji opisujący scenę |
| `dialogueSegments` | Segmenty dialogu z przypisanymi postaciami (do TTS + chat) |
| `suggestedActions` | Sugerowane akcje do wyboru |
| `stateChanges` | Zmiany stanu: questy, fakty o świecie, NPC, ekwipunek, rany, pieniądze, XP umiejętności |
| `diceRolls` | Max 3 rzuty d50 z pre-rolled pool (fallback gdy nano przeoczył test) |
| `combatUpdate` | `enemyHints`, `budget`, `maxDifficulty` — backend dobiera statystyki z bestiariusza |
| `scenePacing`, `atmosphere` | Metadane do muzyki / efektów wizualnych |

### Model tiering

| Tier | Modele | Używany do |
|---|---|---|
| **nano** | gpt-5.4-nano, gpt-4.1-nano, claude-haiku-4-5 | Klasyfikacja intencji, kompresja faktów, check celów questa, inferencja skill check |
| **standard** | gpt-5.4-mini, claude-haiku-4-5 | Combat commentary, story prompt, recap generation, weryfikacja celów |
| **premium** | gpt-5.4, claude-sonnet-4 | Generowanie scen, tworzenie kampanii |

### Typy zapytań AI

- **`generateCampaign`** — fundament kampanii (SSE stream z BullMQ + pub/sub bridge)
- **`generateSceneStream`** — główna pętla (SSE stream z BullMQ + pub/sub bridge)
- **`generateStoryPrompt`** — nano-model premise generator
- **`generateRecap`** — podsumowanie kampanii (chunking 25 scen/chunk)
- **`combatCommentary`** — śródwalkowa narracja i battle cries
- **`verifyObjective`** — klasyfikator spełnienia celu questa

---

## Multiplayer

**Host-authoritative state** — kanoniczny stan gry żyje w przeglądarce hosta; backend jest warstwą relay + persystencji na wypadek crashu, nie silnikiem gry.

```mermaid
sequenceDiagram
    participant H as Host
    participant S as Backend<br/>(multiplayer/connection.js)
    participant RM as roomManager
    participant DB as Atlas
    participant P as Gracz 2..6
    participant MP as multiplayerSceneFlow

    H->>S: CREATE_ROOM (WS)
    S->>RM: createRoom
    RM->>DB: saveRoomToDB (persystencja)
    RM-->>H: roomCode

    P->>S: JOIN_ROOM (kod)
    S->>RM: joinRoom
    RM->>DB: saveRoomToDB
    RM-->>P: roomState
    RM-->>H: player list update

    H->>S: START_GAME
    S->>MP: generateMultiplayerCampaign
    MP-->>S: initial game state
    S->>RM: setGameState + broadcast

    loop Runda
        P->>S: SUBMIT_ACTION
        S->>RM: pendingActions[playerId]
        RM-->>H: PENDING_ACTION
        H->>S: APPROVE_ACTIONS
        S->>MP: runMultiplayerSceneFlow<br/>(shared z SOLO_ACTION)
        MP->>MP: generateMultiplayerScene<br/>+ applySceneStateChanges
        MP->>DB: persistMultiplayerCharactersToDB
        MP-->>S: scene + stateChanges
        S->>RM: broadcast SCENE_UPDATE
    end

    alt Walka
        H->>H: combatEngine.resolveManoeuvre<br/>(lokalnie, host-authoritative)
        H->>S: COMBAT_SYNC (lastResults + ts)
        S-->>P: broadcast
        P->>P: planCombatResultDrain<br/>(ref-based dedup)
    end

    alt WebRTC voice (opcjonalne)
        H->>S: WEBRTC_OFFER
        S-->>P: relay
        Note over H,P: P2P media stream (pomija backend)
    end
```

### Cykl życia pokoju

1. Host tworzy pokój lub konwertuje kampanię solo (`CONVERT_TO_MULTIPLAYER`)
2. Gracze dołączają po kodzie — lobby aktualizuje się w czasie rzeczywistym
3. Nowy gracz może dołączyć w trakcie gry — host widzi PENDING_ACTION i zatwierdza
4. Akcje graczy wymagają zatwierdzenia hosta (`APPROVE_ACTIONS`) albo są wykonywane solo (`SOLO_ACTION`) — oba path'y przechodzą przez ten sam `runMultiplayerSceneFlow`
5. Stan pokoju jest zapisywany do DB przy każdej istotnej mutacji — przeżywa czysty restart backendu (`loadActiveSessionsFromDB` na boot)
6. Pokoje bez aktywności są automatycznie czyszczone po TTL
7. **Host migration nie jest zaimplementowana** — rozłączenie hosta w trakcie walki zamraża stan do jego powrotu

---

## System RPGon

Autorski system d50 zaprojektowany pod AI-GM. Pełna specyfikacja w [RPG_SYSTEM.md](./RPG_SYSTEM.md), pointer do kodu w [knowledge/concepts/rpgon-mechanics.md](./knowledge/concepts/rpgon-mechanics.md).

### Podstawy

- **Kości:** d50 vs `atrybut + umiejętność + modyfikatory`. Rzut 1 = sukces krytyczny, rzut 50 = fiasko krytyczne.
- **Atrybuty (1-25):** `siła`, `inteligencja`, `charyzma`, `zręczność`, `wytrzymałość`, `szczęście`. Baseline — wszystkie na 1 oprócz szczęścia (0).
- **Umiejętności:** ~31 umiejętności, każda powiązana z jednym atrybutem, poziomy 0-25. **Learn-by-doing XP** — umiejętności rosną od używania, bez trenera.
- **Magia:** 9 drzewek zaklęć, system many (bez testu rzucania), zaklęcia ze zwojów, koszt 1-5 many na zaklęcie.
- **Walka:** `obrażenia = Siła + broń - Wytrzymałość - AP`. Margines sukcesu zamiast SL.
- **Szczęście = X%** automatycznego sukcesu na dowolnym rzucie. Wartość atrybutu **jest** szansą na auto-sukces.
- **Waluta:** trójpoziomowa Korona — Złota / Srebrna / Miedziana. `1 ZK = 20 SK = 240 MK`, `1 SK = 12 MK`.
- **Tożsamość postaci:** tytuły odblokowywane z osiągnięć. Brak klas / karier.

Czego **nie ma** w przeciwieństwie do WFRP: kariery, talenty, punkty losu/fortuny, odporność/determinacja, tabela ran krytycznych, channelling, advantage.

### Pre-rolled dice fallback

Nano klasyfikator intencji przeoczy ~20% akcji wymagających testów umiejętności. Backend generuje 3 wstępnie rzucone d50 na każdą scenę — duży model może użyć ich do self-resolve testów, a backend rekoncyliuje wynik z regułami mechanicznymi. Max 3 rzuty na scenę; thresholdy trudności: easy=20, medium=35, hard=50, veryHard=65, extreme=80.

---

## Funkcjonalności

### Rozgrywka
- Narracja AI (OpenAI / Anthropic / Gemini z tieringiem)
- System d50 z marginesem sukcesu i momentum
- Questy z celami, śledzenie postępu, weryfikacja przez nano
- Bestiariusz RPGon (36 jednostek, 11 ras) z budżetem spotkań i fast-path walk dla trywialnych encounterów
- Mapa świata z NPC, fakcjami, dyspozycjami
- Pole bitwy w 3D (React Three Fiber) z proceduralną flora + modelami GLB
- System potrzeb postaci (głód, zmęczenie)
- Ilustracje scen (Stability AI via proxy)
- Narrator głosowy (ElevenLabs TTS z podświetlaniem słów)
- Modele 3D generowane na żądanie (Meshy)
- Efekty wizualne (pogoda, cząsteczki, przejścia)

### Postać (RPGon)
- 6 atrybutów (1-25): siła, inteligencja, charyzma, zręczność, wytrzymałość, szczęście
- ~31 umiejętności z learn-by-doing XP
- 9 drzewek zaklęć, mana, zwoje
- Ekwipunek z rarity modifierami (common / uncommon / rare / exotic)
- Waluta ZK/SK/MK
- Charakter level w stylu Oblivion (akumulowany z poziomów umiejętności)
- Tytuły z osiągnięć
- Blokada postaci do jednej aktywnej kampanii naraz (release przy safe-location)

### Multiplayer
- Do 6 graczy w pokoju przez WebSocket
- Host-authoritative state z persystencją pokoju do DB (crash recovery)
- System zatwierdzania akcji przez hosta
- Dołączanie w trakcie rozgrywki
- Konwersja kampanii solo → multiplayer
- Akcje solo z cooldownem
- Opcjonalny czat głosowy WebRTC (peer-to-peer)

### Infra
- Per-user szyfrowane klucze API (AES-256 na serwerze)
- Cookie-based refresh tokens (15min access JWT, 30d refresh w Valkey)
- Double-submit CSRF
- Per-user rate limiting (Valkey backed)
- Idempotency keys na krytycznych endpointach (POST /campaigns, /scenes, /scenes/bulk)
- BullMQ per-provider queues z bull-board UI na `/v1/admin/queues`
- LLM timeouts tunowalne w DM Settings (domyślnie 45s premium / 15s nano)
- Graceful fallback gdy Redis off (tylko auth wymaga Redisa)

### Zarządzanie
- Zapis/wczytywanie kampanii (auto-save queue + idempotency)
- Normalizowany schemat MongoDB (Scene, NPC, Quest, Knowledge, Codex) z Atlas Vector Search
- Eksport logów rozgrywki do markdown
- Ustawienia Mistrza Gry (styl narracji, grittiness, humor, dramat, tempo, częstotliwość testów)
- Śledzenie kosztów API per model
- Publiczna galeria kampanii z fork-to-play
- Dwujęzyczność: polski (domyślny) i angielski

---

## Stos technologiczny

| Warstwa | Technologie |
|---|---|
| **Frontend** | React 18, Vite 6, React Router 6, Tailwind CSS 3, Zustand 5 + Immer, Zod 4, i18next |
| **3D** | Three.js, React Three Fiber, @react-three/drei |
| **Backend** | Fastify 5, Prisma (MongoDB), WebSocket (ws), BullMQ, ioredis |
| **Baza danych** | MongoDB Atlas (replica set + Atlas Vector Search) |
| **Cache / kolejki** | Valkey (Redis-compatible) |
| **AI** | OpenAI (GPT-5.4 / 4.1 / 4o / o3 / o4), Anthropic (Claude Sonnet 4, Haiku 4.5), Google Gemini |
| **Media** | Sharp (image resize), ElevenLabs (TTS), Stability AI (obrazy), Meshy (modele 3D) |
| **Przechowywanie mediów** | Local filesystem lub Google Cloud Storage |
| **Auth** | JWT (15min access) + opaque refresh tokens w Valkey, double-submit CSRF |
| **Testing** | Vitest (unit), Playwright (e2e) |

---

## Struktura projektu

```
rage-player-game/
├── src/                                # Frontend
│   ├── App.jsx                         # Routing (/, /create, /play/:id, /join/:code, /view/:token)
│   ├── main.jsx                        # Providery (Settings, Multiplayer, Music, Modal)
│   ├── stores/                         # Zustand store
│   │   ├── gameStore.js                # Store + autoSave + getGameState + gameDispatch
│   │   ├── gameReducer.js              # Thin dispatcher merging handler maps
│   │   ├── gameSelectors.js            # Granularne selektory
│   │   └── handlers/                   # Per-domain action handlers (Immer)
│   ├── contexts/                       # SettingsContext, MultiplayerContext (+ slices), Music, Modal
│   ├── hooks/
│   │   ├── sceneGeneration/            # useSceneGeneration + backend stream + dialogue repair
│   │   ├── useCombatResolution.js      # + useEnemyTurnResolver, useCombatResultSync, useCombatHostResolve
│   │   └── useNarrator / useSummary / useImageRepairQueue / useViewerMode / ...
│   ├── services/
│   │   ├── ai/                         # service.js + models.js (backend dispatch)
│   │   ├── aiResponse/                 # Zod schemas + parser + dialogue repair
│   │   ├── mechanics/                  # d50Test, skillCheck, momentumTracker, dispositionBonus, restRecovery
│   │   ├── combatEngine.js             # Tactical combat
│   │   ├── magicEngine.js              # Mana-based spellcasting
│   │   ├── stateValidator.js           # AI state-change validation (+ shared/domain helpers)
│   │   ├── storage.js                  # Campaign save/load/queue
│   │   ├── apiClient.js                # JWT + refresh + CSRF + idempotency
│   │   └── fieldMap/                   # A* pathfinding + tile rules + chunk generator
│   ├── components/
│   │   ├── gameplay/                   # GameplayPage + ScenePanel/ChatPanel/CombatPanel/ActionPanel/...
│   │   │   ├── chat/                   # ChatMessageParts, ChatMessages, DiceRollMessage
│   │   │   ├── combat/                 # Combat UI sub-components
│   │   │   ├── scene/                  # OverlayDiceCard, HighlightedNarrative
│   │   │   └── Scene3D/                # Environment3D, Character3D, GLBModel, ProceduralFoliage, ...
│   │   ├── character/                  # CharacterSheet, Library, Advancement, Inventory, Quests, Codex
│   │   ├── creator/                    # Campaign creation wizard
│   │   ├── lobby/, gallery/, viewer/   # Lobby, public gallery, shared-campaign viewer
│   │   ├── multiplayer/                # Lobby, JoinRoomPage, PendingActions
│   │   ├── settings/sections/          # DM settings split into focused sections
│   │   ├── layout/                     # Header, Sidebar, Layout, MobileNav
│   │   └── ui/                         # Button, GlassCard, Slider, Toggle, ...
│   ├── data/                           # rpgSystem.js, rpgMagic.js, rpgFactions.js, achievements.js, prefabs.js
│   ├── effects/                        # EffectEngine, DiceRoller, biomeResolver
│   ├── utils/                          # rpgTranslate, ids, retry
│   └── locales/                        # en.json, pl.json
│
├── backend/                            # Backend
│   ├── prisma/schema.prisma            # User, Campaign, CampaignScene/NPC/Knowledge/Codex/Quest, Character, ...
│   └── src/
│       ├── server.js                   # Fastify boot, plugin registration, graceful shutdown
│       ├── config.js                   # Env config (single source)
│       ├── routes/
│       │   ├── auth.js                 # /v1/auth/* (register, login, refresh, logout, settings, api-keys)
│       │   ├── ai.js                   # /v1/ai/* (scene SSE + campaign SSE + single-shots + jobs)
│       │   ├── campaigns.js            # Facade → campaigns/{public,crud,sharing,recaps,schemas}.js
│       │   ├── multiplayer.js          # Facade → multiplayer/{http,connection,handlers/*}.js
│       │   ├── characters.js, gameData.js, media.js, music.js, wanted3d.js
│       │   └── proxy/                  # openai, anthropic, gemini, elevenlabs, stability, meshy
│       ├── services/
│       │   ├── sceneGenerator.js       # Facade → sceneGenerator/generateSceneStream.js (+ phases)
│       │   ├── multiplayerAI.js        # Facade → multiplayerAI/{aiClient,sceneGeneration,...}.js
│       │   ├── intentClassifier.js     # Stage 1 — heuristic + nano
│       │   ├── aiContextTools.js       # Stage 2 — assembleContext
│       │   ├── memoryCompressor.js     # Post-scene nano summaries + quest checks
│       │   ├── aiJsonCall.js           # Shared single-shot JSON helper
│       │   ├── combatCommentary.js, objectiveVerifier.js, recapGenerator.js, storyPromptGenerator.js
│       │   ├── campaignGenerator.js    # Streaming single-player campaign gen
│       │   ├── diceResolver.js         # d50 resolver + pre-roll generator
│       │   ├── characterMutations.js   # applyCharacterStateChanges, deserializeCharacterRow
│       │   ├── roomManager.js          # Multiplayer room lifecycle + DB persistence
│       │   ├── multiplayerSceneFlow.js # Shared flow for APPROVE_ACTIONS + SOLO_ACTION
│       │   ├── stateValidator.js       # MP state-change validation
│       │   ├── embeddingService.js     # OpenAI embeddings + L1/L2 cache
│       │   ├── vectorSearchService.js  # Atlas Vector Search
│       │   ├── mongoNative.js          # Raw driver (for BSON embedding arrays)
│       │   ├── redisClient.js          # Dual ioredis (regular + BullMQ)
│       │   ├── apiKeyService.js        # AES-256 key encryption
│       │   ├── refreshTokenService.js  # Opaque refresh tokens in Valkey
│       │   └── queues/aiQueue.js       # Per-provider BullMQ queues
│       ├── workers/aiWorker.js         # Handler registry + pub/sub bridge
│       ├── plugins/                    # csrf, idempotency, rateLimitKey, bullBoard, cors, auth
│       ├── lib/                        # prisma, logger
│       ├── data/equipment/             # Bestiary, weapons, armour
│       └── scripts/                    # createVectorIndexes, migrateCoreState
│
├── shared/                             # Domain logic used by FE and BE
│   ├── domain/                         # combatIntent, luck, pricing, stateValidation, dialogueRepair,
│   │                                   # skills, ids, safeLocation, achievementTracker, ...
│   ├── contracts/                      # multiplayer.js — WS message schemas
│   └── map_tiles/                      # modelCatalog3d.js
│
├── knowledge/                          # Codebase knowledge for AI agents + contributors
│   ├── concepts/                       # How subsystems work (scene-gen, combat, MP, auth, ...)
│   ├── patterns/                       # Reusable code patterns (SSE, BullMQ, pure-lift, ...)
│   ├── decisions/                      # Settled debates (two-stage pipeline, no-BYOK, RPGon, ...)
│   ├── ideas/                          # Future concepts not yet built (with "when it becomes relevant")
│   └── index.md
│
├── e2e/                                # Playwright specs + helpers + fixtures
├── CLAUDE.md                           # Top-level guide for AI agents
├── RPG_SYSTEM.md                       # RPGon rules specification
├── docker-compose.yml                  # Dev stack (backend + valkey)
├── docker-compose.prod.yml             # Prod overlay
├── package.json, vite.config.js
└── README.md
```

---

## Uruchomienie

### Wymagania

- **Node.js 18+** (lokalne testy vitest / playwright)
- **Docker + Docker Compose** (uruchomienie stacku)
- **MongoDB Atlas** — klaster (free tier wystarcza na pre-prod)
- **Klucze API:** OpenAI lub Anthropic (wymagane), Gemini / ElevenLabs / Stability / Meshy (opcjonalne)

### Instalacja

```bash
# Zależności (root + backend + prisma generate)
npm run setup

# Konfiguracja backendu
cp backend/.env.example backend/.env
# Uzupełnij DATABASE_URL (Atlas SRV), JWT_SECRET, API_KEY_ENCRYPTION_SECRET + klucze

# Uruchom pełen stack (backend :3001 + valkey)
npm run dev           # docker compose up --build --watch
npm run dev:down      # docker compose down
npm run dev:logs      # tail backend logs
```

Frontend jest serwowany przez backend (build dostarczony w obrazie Dockera) pod `http://localhost:3001`. Do e2e / szybkiej iteracji FE lokalnie użyj `npm run dev:frontend` (vite :5173) — wymagane przez Playwright.

### Jednorazowy setup — Atlas Vector Search

```bash
cd backend && node src/scripts/createVectorIndexes.js
```

Tworzy indeksy vector search na kolekcjach `CampaignScene`, `CampaignNPC`, `CampaignKnowledge`, `CampaignCodex`. Konieczne do semantycznego przeszukiwania pamięci kampanii przez AI.

### Zmienne środowiskowe (`backend/.env`)

| Zmienna | Wymagana | Opis |
|---|---|---|
| `DATABASE_URL` | **Tak** | Connection string MongoDB Atlas (SRV). Hard-failuje boot jeśli nie jest ustawiona. |
| `JWT_SECRET` | **Tak** | Sekret do podpisywania JWT access tokenów |
| `API_KEY_ENCRYPTION_SECRET` | **Tak** | 32 hex chars, do szyfrowania kluczy API przechowywanych w DB |
| `PORT` | Nie | Port serwera (domyślnie 3001) |
| `HOST` | Nie | Host binding (domyślnie 0.0.0.0) |
| `REDIS_URL` | Nie | URL do Valkey (domyślnie `redis://valkey:6379` w compose). Gdy puste = tryb fallback (auth zwraca 503) |
| `CORS_ORIGIN` | Nie | `true` dla dev albo lista originów |
| `MEDIA_BACKEND` | Nie | `local` (domyślnie) lub `gcp` |
| `MEDIA_LOCAL_PATH` | Nie | Ścieżka dla lokalnego storage mediów |
| `GCS_BUCKET_NAME`, `GOOGLE_APPLICATION_CREDENTIALS` | Nie | GCP storage gdy `MEDIA_BACKEND=gcp` |
| `OPENAI_API_KEY` | Nie | Domyślny klucz (użytkownicy mogą podać własne w Settings) |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `STABILITY_API_KEY` | Nie | j.w. — fallback dla użytkowników bez własnych kluczy |
| `AI_QUEUE_CONCURRENCY_OPENAI`, `..._ANTHROPIC`, `..._GEMINI`, `..._STABILITY`, `..._MESHY` | Nie | Per-kolejka concurrency w BullMQ (default: 100 dla text, 10 dla media) |
| `WORKER_MODE` | Nie | `1` = uruchom standalone worker zamiast in-process |

### Testy

```bash
npm test               # Vitest unit tests
npm run test:watch     # Watch mode
npm run test:e2e       # Playwright (wymaga `npm run dev:frontend` i działającego backendu)
npm run test:e2e:ui    # Playwright UI mode
```

### Tryb bez Redisa

Stos działa bez Valkey — z dwoma wyjątkami:

- **Auth wymaga Redisa.** `/v1/auth/register|login|refresh` zwracają 503 gdy Redis off (refresh tokeny nie mają sensownego in-memory fallbacku).
- **BullMQ queues off** — streaming scen przechodzi na inline SSE fallback. Mniejsza concurrency control, ale działa.

Wszystkie inne warstwy (embedding cache, rate limiter, idempotency plugin) mają graceful degradation.

---

## Dokumentacja

- **[CLAUDE.md](./CLAUDE.md)** — zwięzły przewodnik top-level (stack, komendy, architektura, krytyczne pliki)
- **[knowledge/](./knowledge/)** — szczegółowa dokumentacja subsystemów:
  - **[concepts/](./knowledge/concepts/)** — jak działa dany subsystem i gdzie jest kod (scene-generation, combat, multiplayer, auth, persistence, RPGon mechanics, AI context assembly, ...)
  - **[patterns/](./knowledge/patterns/)** — wzorce kodu do ponownego użycia (SSE streaming, BullMQ, pure-lift refactoring, hook testing, e2e seeding, ...)
  - **[decisions/](./knowledge/decisions/)** — zapadłe decyzje projektowe z alternatywami (two-stage pipeline, no-BYOK, BullMQ vs SSE, Atlas-only, custom RPGon, ...)
  - **[ideas/](./knowledge/ideas/)** — pomysły na przyszłość nieprzyjęte jeszcze do kodu (autonomous NPCs, combat auto-resolve, prompt fragment system, ...) z opisem **kiedy stają się istotne**
- **[RPG_SYSTEM.md](./RPG_SYSTEM.md)** — pełna specyfikacja reguł RPGon
