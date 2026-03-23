# AGENTS.md — RPGon / Nikczemny Krzemuch

> Browser-based solo & multiplayer tabletop RPG with an AI Dungeon Master, built on Warhammer Fantasy Roleplay (WFRP) mechanics.

## Project Overview

RPGon is a React SPA + Fastify backend application where a Large Language Model acts as a Game Master. The AI returns structured JSON responses (narrative, suggested actions, dice checks, state changes) that drive the game loop. The game supports solo play with localStorage persistence and multiplayer (up to 6 players) via WebSockets with MongoDB persistence.

**App name in UI:** "Nikczemny Krzemuch"  
**Product/marketing name:** "RPGon"

---

## Tech Stack

| Layer         | Technology                                                                 |
|---------------|---------------------------------------------------------------------------|
| Frontend      | React 18, Vite 6, React Router 6, Tailwind CSS 3, i18next, Zod           |
| Backend       | Fastify 5, @fastify/websocket, @fastify/jwt, Prisma, MongoDB             |
| AI providers  | OpenAI (GPT-4o / GPT-4o-mini), Anthropic (Claude Sonnet / Haiku)         |
| Media         | ElevenLabs (TTS), Stability AI (images), Suno (music)                    |
| Storage       | localStorage (solo), MongoDB via Prisma (backend), GCS / local filesystem (media) |
| Testing       | Vitest                                                                     |

---

## Project Structure

```
rage-player-game/
├── src/                              # Frontend (React + Vite)
│   ├── App.jsx                       # Routes: /, /create, /play, /join/:code, /gallery
│   ├── main.jsx                      # Provider tree: Settings → Multiplayer → Game → App
│   ├── i18n.js                       # i18next setup (en, pl)
│   ├── components/
│   │   ├── gameplay/                 # Main game UI
│   │   │   ├── GameplayPage.jsx      # Central play screen — orchestrates all gameplay panels
│   │   │   ├── ScenePanel.jsx        # Scene narrative display with narrator highlighting
│   │   │   ├── ActionPanel.jsx       # Player action selection / free-text input
│   │   │   ├── ChatPanel.jsx         # Chat / game log
│   │   │   ├── CombatPanel.jsx       # Tactical WFRP combat UI (initiative, manoeuvres)
│   │   │   ├── MagicPanel.jsx        # Spellcasting: channelling, casting, wind management
│   │   │   ├── PartyPanel.jsx        # Party management (companions, active character)
│   │   │   ├── MapCanvas.jsx         # Force-directed world map on canvas
│   │   │   └── WorldStateModal.jsx   # World overview: NPCs, map, factions, time, journal
│   │   ├── character/
│   │   │   ├── CharacterSheet.jsx    # Full character sheet modal (stats, skills, inventory)
│   │   │   └── AchievementsPanel.jsx # Achievement browser with progress tracking
│   │   ├── lobby/                    # Campaign list, load/create
│   │   ├── creator/                  # Campaign creation wizard
│   │   ├── multiplayer/              # Multiplayer lobby, join room, pending actions
│   │   ├── settings/
│   │   │   └── DMSettingsPage.jsx    # All settings: API keys, DM sliders, backend, media
│   │   ├── gallery/
│   │   │   └── GalleryPage.jsx       # Public campaign gallery with fork-to-play
│   │   ├── layout/                   # Header, Sidebar, Layout, MobileNav
│   │   └── ui/                       # Shared UI primitives (Button, GlassCard, Slider…)
│   ├── contexts/
│   │   ├── GameContext.jsx           # Central game state (useReducer) — campaign, character,
│   │   │                             # world, quests, scenes, combat, magic, achievements
│   │   ├── SettingsContext.jsx       # User preferences, API keys, DM settings, i18n
│   │   └── MultiplayerContext.jsx    # WebSocket room state, player management
│   ├── hooks/
│   │   ├── useAI.js                  # AI orchestration: scene gen, campaign gen, dice, costs
│   │   ├── useNarrator.js            # ElevenLabs TTS with word highlighting, voice queue
│   │   ├── useGameState.js           # Game state helpers
│   │   └── useMusic.js              # Background music management
│   ├── services/
│   │   ├── ai.js                     # LLM calls (OpenAI + Anthropic), retry, fallback, model selection
│   │   ├── prompts.js                # System/user prompt construction from full game state
│   │   ├── contextManager.js         # Long-context: compression, knowledge retrieval, memory
│   │   ├── aiResponseValidator.js    # Zod schemas for AI JSON responses, safe parsing
│   │   ├── stateValidator.js         # Validates AI stateChanges (caps, clamps, WFRP rules)
│   │   ├── combatEngine.js           # WFRP tactical combat resolution
│   │   ├── magicEngine.js            # Spellcasting: channelling, casting tests, miscasts
│   │   ├── weatherEngine.js          # Weather simulation (season, region, transitions)
│   │   ├── tradeEngine.js            # Economy: haggling, crafting, availability
│   │   ├── reputationEngine.js       # Faction reputation and NPC reactions
│   │   ├── achievementTracker.js     # Achievement state machine, event → achievement mapping
│   │   ├── costTracker.js            # API usage cost calculation per model/service
│   │   ├── storage.js                # localStorage persistence + backend campaign sync
│   │   ├── localAI.js                # Ollama / LM Studio integration for local LLMs
│   │   ├── elevenlabs.js             # ElevenLabs TTS + SFX API
│   │   ├── websocket.js              # WebSocket client for multiplayer
│   │   ├── apiClient.js              # Backend REST client with JWT auth
│   │   ├── imageGen.js               # Scene image generation (Stability AI)
│   │   ├── suno.js                   # Music generation (Suno API)
│   │   └── exportLog.js              # Gameplay log export to markdown
│   ├── data/                         # WFRP game rules and content
│   │   ├── wfrp.js                   # Core: characteristics, species, skills, careers, costs
│   │   ├── wfrpBestiary.js           # Named enemies with full stat blocks
│   │   ├── wfrpCombat.js             # Manoeuvres, weapons, armour, hit locations
│   │   ├── wfrpCriticals.js          # Critical wounds by body location
│   │   ├── wfrpEquipment.js          # Equipment catalog with pricing (GC/SS/CP)
│   │   ├── wfrpFactions.js           # Faction definitions and reputation tier effects
│   │   ├── wfrpMagic.js              # Winds of magic, spells, petty spells, miscast tables
│   │   ├── achievements.js           # Achievement catalog, categories, conditions
│   │   ├── encounterTables.js        # Random encounters by terrain (weighted)
│   │   └── oldWorldMap.js            # Old World regions, provinces, geography
│   ├── effects/                      # Visual effects engine (weather, particles, transitions)
│   └── locales/
│       ├── en.json                   # English translations
│       └── pl.json                   # Polish translations (primary)
├── backend/                          # Backend (Fastify + MongoDB)
│   ├── prisma/schema.prisma          # Data models: User, Campaign, Character, MediaAsset,
│   │                                 # Achievement, MultiplayerSession
│   ├── src/
│   │   ├── server.js                 # Fastify entry: plugins, routes, WebSocket
│   │   ├── config.js                 # Env validation (JWT_SECRET, API_KEY_ENCRYPTION_SECRET)
│   │   ├── routes/
│   │   │   ├── auth.js               # /register, /login, /me, /settings, /api-keys
│   │   │   ├── campaigns.js          # CRUD + publish/public gallery
│   │   │   ├── characters.js         # Character library CRUD
│   │   │   ├── media.js              # Media upload/serve (local or GCS)
│   │   │   ├── music.js              # Music generation proxy
│   │   │   ├── multiplayer.js        # WebSocket game lifecycle + state application
│   │   │   └── proxy/                # API key proxying
│   │   │       ├── openai.js
│   │   │       ├── anthropic.js
│   │   │       ├── elevenlabs.js
│   │   │       ├── stability.js
│   │   │       └── suno.js
│   │   └── services/
│   │       ├── roomManager.js        # In-memory rooms + Prisma persistence for recovery
│   │       ├── multiplayerAI.js      # Server-side AI calls for multiplayer scenes
│   │       ├── mediaStore.js         # Media storage abstraction (local filesystem / GCS)
│   │       ├── stateValidator.js     # Multiplayer state change validation
│   │       └── timeUtils.js          # Time/period utilities
│   └── package.json
├── package.json                      # Root: scripts, frontend deps, concurrently
├── vite.config.js                    # Vite + React plugin, /suno-api proxy
├── tailwind.config.js                # Dark theme, extended color palette
└── index.html                        # SPA entry
```

---

## Architecture & Data Flow

### Solo Play

```
User action → useAI.generateScene()
  → prompts.js builds system + user prompt (full game state, WFRP rules, DM settings)
  → ai.js calls OpenAI/Anthropic (direct or via /proxy/* if backend connected)
  → AI returns JSON: { narrative, actions, diceCheck, stateChanges }
  → aiResponseValidator.js validates with Zod schemas
  → stateValidator.js caps/clamps stateChanges against WFRP rules
  → GameContext dispatches ADD_SCENE + APPLY_STATE_CHANGES
  → achievementTracker processes events
  → storage.js persists to localStorage
  → optional: image generation, TTS narration, background music
```

### Multiplayer

```
Player submits action via WebSocket → backend multiplayer.js
  → roomManager validates room/player state
  → host approves pending action
  → multiplayerAI.js builds prompts + calls AI (using host's encrypted keys)
  → stateValidator validates per-character stateChanges
  → multiplayer.js applies state changes (time, map, NPCs, quests, needs)
  → roomManager broadcasts SCENE_UPDATE to all players via WebSocket
```

### Key Patterns

- **AI responses are always JSON** with a defined schema — never free-text
- **stateChanges** are validated both client-side and server-side before applying
- **Prompt construction** (`prompts.js`) injects relevant WFRP data snippets (bestiary, factions, criticals, magic, equipment, weather) based on current context
- **Context management** (`contextManager.js`) compresses old scenes to stay within token limits
- **Dice resolution** uses d100 with Success Levels (SL) and momentum — pre-rolled before AI call, results sent to AI for narrative integration
- **Cost tracking** runs per-request for all AI/media API calls

---

## Game State Shape (GameContext)

The central state managed by `useReducer` in `GameContext.jsx`:

```
{
  campaign: { id, name, genre, tone, setting, antagonist, ... },
  character: { name, species, career, characteristics, skills, talents, inventory, wounds, xp, ... },
  party: [ character, ...companions ],
  activeCharacterId: string,
  world: {
    npcs: [...],
    mapState: { locations, connections },
    currentLocation: string,
    exploredLocations: [...],
    time: { day, period, season },
    weather: {...},
    factions: { [id]: reputation },
    knowledgeBase: { events, decisions, plotThreads },
    compressedHistory: string,
    needs: { hunger, fatigue, ... }
  },
  quests: [...],
  scenes: [...],
  chatHistory: [...],
  combat: { active, combatants, round, turn, ... } | null,
  magic: { windPoints, activeEffects, ... },
  achievements: { stats, unlocked },
  aiCosts: { total, breakdown },
  momentum: number,
  undoStack: [...]
}
```

---

## WFRP Game Rules (src/data/)

The game implements a subset of Warhammer Fantasy Roleplay 4th Edition rules:

- **d100 test system** with 10 characteristics (WS, BS, S, T, I, Ag, Dex, Int, WP, Fel)
- **Success Levels (SL)** = (tens digit of target - tens digit of roll), clamped ±6
- **Careers** with 4 tiers, each unlocking skills/talents/stat advances
- **Combat**: initiative, manoeuvres (defend, dodge, flee, offensive, magic), weapon/armour stats, hit locations, critical wounds
- **Magic**: 8 Winds + petty spells, channelling tests, casting numbers (CN), overcasting, miscasts on doubles
- **Economy**: Gold Crown (GC) / Silver Shilling (SS) / Brass Penny (CP), haggling via Fellowship + reputation
- **Factions**: reputation tiers affecting prices, quest access, NPC attitudes

All rule data lives in `src/data/wfrp*.js`. Game engines (`combatEngine.js`, `magicEngine.js`, etc.) implement the mechanical resolution. The AI is grounded in these rules via prompt injection.

---

## Database Models (Prisma + MongoDB)

| Model                | Purpose                                        |
|----------------------|------------------------------------------------|
| `User`               | Auth, encrypted API keys, settings JSON        |
| `Campaign`           | Full game state JSON, public gallery metadata  |
| `Character`          | Character library (reusable across campaigns)  |
| `Achievement`        | Per-user unlocked achievements                 |
| `MultiplayerSession` | Room state backup for crash recovery           |
| `MediaAsset`         | Generated images/music/TTS with storage path   |

---

## API Routes (Backend)

| Route           | Method  | Auth | Description                                      |
|-----------------|---------|------|--------------------------------------------------|
| `/auth/register`| POST    | No   | Create account (email + password)                |
| `/auth/login`   | POST    | No   | Login → JWT token                                |
| `/auth/me`      | GET     | Yes  | Current user profile                             |
| `/auth/settings`| PUT     | Yes  | Save settings + encrypted API keys               |
| `/campaigns`    | CRUD    | Yes  | User's campaigns                                 |
| `/campaigns/public` | GET | No   | Public gallery listing                           |
| `/campaigns/:id/publish` | PATCH | Yes | Toggle public visibility                  |
| `/characters`   | CRUD    | Yes  | Character library                                |
| `/media/*`      | Various | Yes  | Upload/serve media assets                        |
| `/proxy/openai` | POST    | Yes  | Proxied OpenAI call (server-side keys)           |
| `/proxy/anthropic` | POST | Yes  | Proxied Anthropic call                           |
| `/proxy/elevenlabs` | POST| Yes  | Proxied ElevenLabs TTS                           |
| `/proxy/stability` | POST | Yes  | Proxied Stability AI image generation            |
| `/multiplayer`  | WS      | Yes  | WebSocket for multiplayer game lifecycle         |

---

## Environment Configuration

### Backend (`backend/.env`)

| Variable                    | Required | Description                                   |
|-----------------------------|----------|-----------------------------------------------|
| `DATABASE_URL`              | Yes      | MongoDB connection string                     |
| `JWT_SECRET`                | Yes      | Strong secret for JWT signing                 |
| `API_KEY_ENCRYPTION_SECRET` | Yes      | Secret for encrypting user API keys in DB     |
| `PORT`                      | No       | Server port (default: 3001)                   |
| `CORS_ORIGIN`               | No       | CORS origin (default: true for dev)           |
| `MEDIA_BACKEND`             | No       | "local" or "gcp"                              |
| `MEDIA_LOCAL_PATH`          | No       | Filesystem path for local media storage       |
| `OPENAI_API_KEY`            | No       | Default OpenAI key (fallback)                 |
| `ANTHROPIC_API_KEY`         | No       | Default Anthropic key (fallback)              |
| `ELEVENLABS_API_KEY`        | No       | Default ElevenLabs key                        |
| `STABILITY_API_KEY`         | No       | Default Stability AI key                      |
| `SUNO_API_KEY`              | No       | Default Suno key                              |

### Frontend

No `.env` file. All configuration is managed through the Settings UI (`SettingsContext`) and persisted in localStorage under `nikczemny_krzemuch_settings`. API keys can be entered directly in the app or stored server-side when the backend is connected.

---

## Scripts

```bash
npm run dev          # Start frontend (Vite) + backend (Fastify) concurrently
npm run dev:frontend # Frontend only on :5173
npm run dev:backend  # Backend only on :3001
npm run build        # Production build (Vite)
npm run test         # Run Vitest
```

---

## Internationalization (i18n)

- Default language: **Polish** (`pl`)
- Supported: Polish (`pl.json`), English (`en.json`)
- Configured in `src/i18n.js`, language switch in `SettingsContext`
- Translation keys are nested: `common`, `nav`, `lobby`, `creator`, `gameplay`, `character`, `settings`, `multiplayer`, `gallery`
- When adding UI text, always use `t('key')` from `useTranslation()` and add keys to **both** locale files

---

## Testing

Tests use **Vitest** and live alongside their source files:

| Test file                                      | Covers                                          |
|------------------------------------------------|-------------------------------------------------|
| `src/services/stateValidator.test.js`          | XP caps, wound clamping, item limits, needs     |
| `src/services/achievementTracker.test.js`      | Achievement state, event processing, stats      |
| `backend/src/services/roomManager.test.js`     | WebSocket broadcast, room cleanup, host transfer|

Test coverage is minimal — when adding new engines or validators, add corresponding test files.

---

## Key Conventions

### Code Style
- **React**: Functional components only, hooks for all logic
- **State**: `useReducer` in contexts, never direct mutation
- **AI responses**: Always validated with Zod before dispatch
- **Game mechanics**: Engines in `src/services/*Engine.js`, data in `src/data/wfrp*.js`
- **Styling**: Tailwind utility classes, dark theme with glassmorphism (`backdrop-blur`, `bg-opacity`)
- **No TypeScript** — the project uses plain JavaScript with `.jsx` extensions

### File Naming
- React components: `PascalCase.jsx`
- Services/hooks/data: `camelCase.js`
- Test files: `*.test.js` next to source

### Adding New Features
1. If it involves game mechanics → add data to `src/data/` + engine to `src/services/`
2. If it needs AI awareness → update `prompts.js` to include relevant context
3. If it affects game state → add action type to `GameContext.jsx` reducer
4. If it has UI → add to appropriate `src/components/` subdirectory
5. If it needs i18n → add keys to both `en.json` and `pl.json`
6. If it needs backend → add route in `backend/src/routes/`, update `schema.prisma` if DB needed
7. If multiplayer-relevant → handle in both `MultiplayerContext` and `backend/src/routes/multiplayer.js`

### AI Prompt Engineering
- System prompts are assembled in `prompts.js` from modular blocks
- WFRP data snippets are injected selectively (not dumped wholesale)
- The AI must return valid JSON matching Zod schemas in `aiResponseValidator.js`
- `stateChanges` are the only mechanism for AI to modify game state
- DM personality is controlled via sliders in `dmSettings` (narrative detail, test frequency, danger level, humor, etc.)
