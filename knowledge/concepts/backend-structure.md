# Backend File Structure

Detailed file inventory for `backend/` and `shared/`. For high-level architecture see CLAUDE.md.

## Routes (`backend/src/routes/`)
- `auth.js` - /register, /login, /me, /settings, /api-keys
- `campaigns.js` - Campaign CRUD (coreState + normalized collections)
- `characters.js` - Character library CRUD
- `ai.js` - AI endpoints: generate-scene, generate-scene-stream (SSE), generate-campaign, generate-story-prompt, scenes CRUD, core state
- `gameData.js` - Static game data API (equipment, etc.)
- `media.js` - Media upload/serve (local or GCS)
- `music.js` - Music generation proxy
- `multiplayer.js` - WebSocket game lifecycle + state application
- `wanted3d.js` - Wanted 3D model requests management
- `proxy/openai.js` - Proxied OpenAI calls
- `proxy/anthropic.js` - Proxied Anthropic calls
- `proxy/gemini.js` - Proxied Gemini calls
- `proxy/elevenlabs.js` - Proxied ElevenLabs TTS
- `proxy/stability.js` - Proxied Stability AI image generation
- `proxy/meshy.js` - Proxied Meshy 3D model generation

## Services (`backend/src/services/`)

### AI Pipeline
- `sceneGenerator.js` - Backend scene generation: two-stage pipeline (primary) + tool-use loop (fallback). Also handles SSE streaming via `callBackendStream()`.
- `intentClassifier.js` - Two-stage intent classification: heuristic regex (~70%) + nano model fallback. Output: context selection flags for `assembleContext()`
- `aiContextTools.js` - AI function calling tools + `assembleContext()` for two-stage pipeline context assembly
- `memoryCompressor.js` - Post-scene fact extraction via nano model. Running summary after each scene + location summary when player moves
- `multiplayerAI.js` - Server-side AI calls for multiplayer scenes
- `aiErrors.js` - Structured AI error handling

### Data & Storage
- `embeddingService.js` - OpenAI text-embedding-3-small
- `vectorSearchService.js` - MongoDB Atlas Vector Search
- `mongoNative.js` - Native MongoDB driver for embeddings (BSON arrays — Prisma can't handle them, see [[../decisions/embeddings-native-driver]])
- `mediaStore.js` - Media storage abstraction (local / GCS)
- `localStore.js` - Local filesystem storage
- `gcpStore.js` - Google Cloud Storage

### Multiplayer
- `roomManager.js` - In-memory rooms + Prisma persistence for crash recovery
- `stateValidator.js` - Multiplayer state change validation
- `stateChangeMessages.js` - Human-readable state change messages

### Auth & Utilities
- `apiKeyService.js` - API key encryption/decryption
- `hashService.js` - Content-addressable hashing for media
- `imageResize.js` - Image resizing with Sharp
- `timeUtils.js` - Time/period utilities

## Infrastructure
- `backend/src/lib/prisma.js` - Prisma client singleton
- `backend/src/middleware/requireAuth.js` - JWT auth middleware
- `backend/src/plugins/auth.js` - Fastify auth plugin
- `backend/src/plugins/cors.js` - CORS plugin

## Data
- `backend/src/data/equipment/equipment.js` - Server-side equipment data

## Scripts
- `backend/src/scripts/migrateCoreState.js` - DB migration script
- `backend/src/scripts/createVectorIndexes.js` - Create Atlas Vector Search indexes

## Shared (`shared/`)
- `contracts/multiplayer.js` - Multiplayer WebSocket message contracts (FE + BE)
- `domain/diceRollInference.js` - Shared dice roll inference logic
- `domain/multiplayerState.js` - Shared multiplayer state utilities
- `map_tiles/modelCatalog3d.js` - 3D model catalog for tile map rendering
