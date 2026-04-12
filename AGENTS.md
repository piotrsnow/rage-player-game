# RPGON / Nikczemny Krzemuch — RPGon (custom RPG system) AI RPG Game

## Stack
- **Frontend**: React 18 + Vite 6, Tailwind CSS, React Three Fiber (3D scenes), i18next, Zod 4
- **Backend**: Fastify 5, Prisma (MongoDB), JWT auth, WebSocket (multiplayer)
- **Database**: MongoDB Atlas (normalized collections + vector search)
- **AI**: OpenAI (GPT-5.4/mini/nano, 4.1/mini/nano, 4o/mini, o3/o4-mini) + Anthropic (Claude Sonnet 4, Haiku 4.5) + Google Gemini — multi-provider, nano/standard/premium tiering
- **3D**: Three.js / React Three Fiber — procedural scene rendering with GLB model support
- **Media**: Sharp (image resize), ElevenLabs (TTS), Stability AI (scene images), Meshy (3D models), GCP Storage
- **Testing**: Vitest (unit), Playwright (e2e)
- **Shared**: `shared/` directory with contracts and domain logic used by both frontend and backend

## Commands
- `npm run dev` - Frontend + backend concurrently
- `npm run build` - Vite production build
- `npm test` - Vitest unit tests
- `npm run test:e2e` - Playwright e2e tests
- `cd backend && npm run db:push` - Push Prisma schema to MongoDB
- `cd backend && npx prisma generate` - Regenerate Prisma client

## Conventions
- ES Modules everywhere (`"type": "module"`)
- No ESLint/Prettier config - use sensible defaults
- Polish language in UI (i18next), English in code/comments
- No TypeScript — plain JavaScript with `.jsx` extensions
- React: Functional components only, hooks for all logic
- State: Zustand store (`src/stores/gameStore.js`) with Immer-based reducer handlers, granular selectors. Legacy `useGame()` facade in `GameContext.jsx`.
- AI responses: Always validated with Zod before dispatch
- Game mechanics: Engines in `src/services/*Engine.js`, data in `src/data/rpg*.js`
- Deterministic mechanics separated in `src/services/mechanics/`
- Styling: Tailwind utility classes, dark theme with glassmorphism (`backdrop-blur`, `bg-opacity`)
- File naming: React components `PascalCase.jsx`, services/hooks/data `camelCase.js`, tests `*.test.js` next to source
- Embeddings stored as native BSON arrays via mongodb driver (not Prisma)
- JSON fields stored as strings in Prisma (MongoDB limitation), parsed on read

## Architecture Overview

### Frontend (`src/`)
- **State**: Zustand store + Immer reducer handlers in `src/stores/`. Contexts for Settings, Multiplayer, Music, Modals.
- **Hooks**: `useAI.js` (main AI integration), `useGameState.js` (campaign lifecycle), `useSceneGeneration.js` (scene gen orchestration), `useGameContent.js` (quest/NPC updates), `useCombatResolution.js`, `useNarrator.js` (TTS)
- **Services**: AI providers (`src/services/ai/`), game engines (`*Engine.js`), deterministic mechanics (`mechanics/`), storage/sync (`storage.js`), field map (`fieldMap/`)
- **Components**: `GameplayPage` orchestrates panels (Scene, Action, Chat, Combat, Magic, Trade, Party). Character sheet, campaign creator, lobby, gallery, multiplayer, settings, 3D scene rendering (`Scene3D/`)
- **Data**: RPGon rules (`rpgSystem.js`, `rpgMagic.js`, `rpgFactions.js`), equipment, achievements, 3D prefabs

### Backend (`backend/`)
- **Routes**: auth, campaigns CRUD, characters, AI endpoints (generate-scene + SSE stream), game data, media, multiplayer WebSocket, proxy endpoints (OpenAI/Anthropic/Gemini/ElevenLabs/Stability/Meshy)
- **Services**: scene generation pipeline (`sceneGenerator.js`), intent classification (`intentClassifier.js`), context assembly (`aiContextTools.js`), memory compression (`memoryCompressor.js`), vector search, room manager, media storage (local/GCS)

### Database (MongoDB via Prisma)
| Model | Purpose |
|---|---|
| `User` | Auth, encrypted API keys, settings |
| `Campaign` | coreState (lean JSON), metadata |
| `CampaignScene/NPC/Knowledge/Codex/Quest` | Normalized with Atlas Vector Search embeddings |
| `Character` | Reusable character library |
| `MultiplayerSession` | Room state backup for crash recovery |
| `MediaAsset` | User-generated images/music/TTS |
| `PrefabAsset` / `Wanted3D` | 3D model catalog |
| `Achievement` | Per-user unlocked achievements |

## AI Architecture — Two-Stage Pipeline

### Design Principles
1. **Context selection over tool calling** — nano model determines what context is needed, backend assembles it, then one large model call (not AI->tool->AI loops)
2. **Game state over history** — structured state over raw scene history. Reduces tokens, improves consistency
3. **Memory compression** — nano model extracts key facts after each scene. Full history NOT in prompt
4. **Nano for planning** — cheap/fast model handles intent classification + fact extraction
5. **Tool-use is a fallback** — legacy loop exists but two-stage pipeline is primary

### Flow (Backend Mode — Primary)
```
Player Action
  → [Frontend] resolveMechanics() — deterministic d50/combat/magic
  → [Backend POST /ai/campaigns/:id/generate-scene]
      Stage 1: classifyIntent() — heuristic regex ~70% free; nano for freeform
      Stage 2: assembleContext() — parallel DB queries for needed categories
      Stage 3: runTwoStagePipeline() — single large model call, lean prompt ~3.5k tokens
  → [AI Response] → validateStateChanges() → processStateChanges()
  → [Post-scene async] compressSceneToSummary() — nano extracts facts
```

### Model Tiering
- **nano** (gpt-5.4-nano / gpt-4.1-nano): intent classification, fact extraction, skill check inference
- **standard** (gpt-5.4-mini / haiku-4.5): compression, recaps, combat commentary
- **premium** (gpt-5.4 / claude-sonnet-4): scene generation, campaign creation

### RPGon Game System (custom, replaces WFRP)
- **Dice**: d50 (not d100). Roll d50 vs attribute + skill + modifiers
- **Attributes**: 6 stats (Siła, Inteligencja, Charyzma, Zręczność, Wytrzymałość, Szczęście), scale 1-25
- **Skills**: ~60 skills, each tied to one attribute. Levels 0-25, cap system
- **Magic**: 9 spell trees, mana-based (no casting test), spells from scrolls, cost 1-5 mana
- **Combat**: d50-based, damage = Siła + weapon - Wytrzymałość - AP, margin instead of SL
- **Szczęście**: X% auto-success chance on any roll
- **No**: careers, talents, fate/fortune/resolve/resilience, critical wounds table, channelling, advantage
- Full spec: `RPG_SYSTEM.md`

## Known Gaps / Consolidation Candidates
- No token budget enforcement in `assembleContext()`
- State changes still AI-driven — no mechanical validation for buying items etc.
- `diceRollInference.js` — frontend copy has extras vs `shared/domain/` version. Merge.
- `stateValidator.js` exists in frontend + backend — extract shared logic to `shared/domain/`
- Frontend proxy mode duplicates prompt building from backend lean version

## Knowledge Base — `knowledge/`

**When working on a subsystem, read the relevant knowledge file first.** These files contain detailed information that CLAUDE.md intentionally omits to save context.

### File Inventory (read when looking for specific files)
- `concepts/frontend-structure.md` — full file listing: contexts, stores, hooks, services, components, data, effects
- `concepts/backend-structure.md` — full file listing: routes, services, shared/, scripts

### State Management & Refactoring
- `concepts/game-context.md` — Zustand facade architecture, selectors API, `getGameState()` pattern
- `concepts/context-migration-plan.md` — which contexts → Zustand (Modal, Music) vs stay (Settings, Multiplayer)
- `concepts/frontend-refactor-2026-04.md` — god-component decomposition: 6 components before/after, 10 PRs, 13 extracted hooks
- `concepts/frontend-refactor-regressions.md` — **READ BEFORE TESTING**: manual test watchlist, 7 open questions
- `patterns/reducer-context.md` — Zustand facade + granular selectors pattern
- `patterns/component-decomposition.md` — 5-step pure-lift refactoring ladder, naming conventions

### Game Systems
- `concepts/bestiary.md` — 36 units, 11 races, encounter budget system, fast-path combat
- `concepts/model-tiering.md` — ai/ submodule structure (models.js, providers.js, service.js)
- `decisions/currency-three-tier-pl.md` — 3 denominations + exchange rates
- `decisions/titles-from-achievements.md` — 12 example achievement titles with rarity + conditions
- `decisions/embeddings-native-driver.md` — why native MongoDB driver (BSON array requirement)

### Patterns
- `patterns/backend-proxy.md` — SSE endpoints (generate-scene-stream), `callBackendStream()` pattern
- `patterns/prerolled-dice-fallback.md` — pre-rolled d50 fallback: max 3 rolls/scene, thresholds 20/35/50/65/80

When coding:
- follow patterns
- reuse decisions
- avoid repeated bugs

## Important Notes
- No production backward compatibility constraints
- Frontend works in two modes: backend scene generation (preferred) or proxy (legacy, heavier)
- Vector search indexes: `cd backend && node src/scripts/createVectorIndexes.js`
- Multiplayer contracts shared via `shared/contracts/multiplayer.js`
