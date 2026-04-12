# Frontend File Structure

Detailed file inventory for `src/`. For high-level architecture see CLAUDE.md.

## Contexts (`src/contexts/`)
- `GameContext.jsx` - Thin Zustand facade (22 lines), re-exports `useGame()`. See [[game-context]].
- `SettingsContext.jsx` - User preferences, API keys, DM settings, i18n (352 lines, 28 consumers). Stays as Context.
- `MultiplayerContext.jsx` - WebSocket room state, player management. Stays as Context.
- `MusicContext.jsx` - Background music state. Migration candidate to Zustand.
- `ModalContext.jsx` - Modal management. Migration candidate to Zustand.
- `slices/multiplayerSlice.js` - Multiplayer state slice

## State Management (`src/stores/`)
- `gameStore.js` - Zustand store: `autoSave`, `flushPendingSave`, `getGameState`, `gameDispatch`
- `gameReducer.js` - ~1790-line reducer (extracted from old GameContext)
- `gameSelectors.js` - Granular selectors: `useGameCampaign`, `useGameCharacter`, `useGameCombat`, `useGameSlice(selector)`, ~15 others
- `handlers/` - Immer-based domain handlers split from reducer: `campaignHandlers.js`, `characterHandlers.js`, `combatHandlers.js`, `questHandlers.js`, `worldHandlers.js`, `sceneHandlers.js`, etc.

## Hooks (`src/hooks/`)
- `useAI.js` - Main AI integration hook (~1600 lines, game mechanics + AI calls)
- `useGameState.js` - Campaign state management (start/load/save)
- `useActiveGameState.js` - Active character state helpers
- `useAutoPlayer.js` - AI auto-play mode
- `useNarrator.js` - ElevenLabs TTS with word highlighting, voice queue
- `useLocalMusic.js` - Background music management
- `useCombatAudio.js` - Combat sound effects
- `useWebRTC.js` - WebRTC for multiplayer voice
- `useSpeechRecognition.js` - Browser speech-to-text input
- `useIdleTimer.js` - Idle detection for auto-play
- `useSoloActionCooldown.js` - Rate limiting for solo actions
- `useDocumentTitle.js` - Dynamic page title
- `useModalA11y.js` - Modal accessibility
- `useCampaignLoader.js` - Loads campaign from URL param when none active
- `useGameContent.js` - Game content actions (quest updates, NPC changes, etc.)
- `useCombatResolution.js` - Combat resolution logic
- `useImageGeneration.js` - Scene image generation hook
- `sceneGeneration/useSceneGeneration.js` - Scene generation orchestration
- `sceneGeneration/useSceneBackendStream.js` - SSE streaming from backend

## Services (`src/services/`)

### AI & Prompts
- `ai/service.js` - LLM calls (OpenAI + Anthropic + Gemini), retry, fallback, model selection
- `ai/models.js` - Model definitions and selection logic
- `ai/providers.js` - Provider abstraction (OpenAI, Anthropic, Gemini)
- `ai/suggestedActions.js` - Generate suggested actions
- `prompts.js` - System/user prompt construction (~1800 lines, proxy mode)
- `promptGovernance.js` - Prompt quality/safety rules
- `contextManager.js` - Long-context: compression, knowledge retrieval, memory

### Validation
- `aiResponseValidator.js` - Zod schemas for AI JSON responses, safe parsing
- `stateValidator.js` - Validates AI stateChanges (caps, clamps, RPGon rules)

### Game Engines
- `combatEngine.js` - RPGon tactical combat resolution (d50, margin-based)
- `magicEngine.js` - Spellcasting: mana-based, spell trees, scrolls
- `weatherEngine.js` - Weather simulation (season, region, transitions)
- `tradeEngine.js` - Economy: haggling, crafting, availability (NOT IMPORTED yet)
- `reputationEngine.js` - Faction reputation and NPC reactions

### Deterministic Mechanics (`src/services/mechanics/`)
- `skillCheck.js` - d50 skill test resolution (attribute + skill + momentum + creativity vs difficulty)
- `momentumTracker.js` - Momentum system (+-10 range)
- `dispositionBonus.js` - NPC disposition modifiers
- `restRecovery.js` - Rest and wound recovery

### Persistence & Networking
- `storage.js` - localStorage persistence + backend campaign sync (save queue, dedup)
- `apiClient.js` - Backend REST client with JWT auth
- `websocket.js` - WebSocket client for multiplayer
- `webrtc.js` - WebRTC peer connections
- `gameDataService.js` - Fetch game data from backend

### Media
- `elevenlabs.js` - ElevenLabs TTS + SFX API
- `imageGen.js` - Scene image generation (Stability AI)
- `meshyClient.js` - Meshy 3D model generation API client
- `modelResolver3d.js` - Resolve 3D models for scene objects
- `wanted3dClient.js` - Client for wanted 3D model requests
- `assetManager.js` - Media asset management
- `assetCache.js` - Asset caching layer

### Narrative & Parsing
- `narrativeEngine.js` - Narrative structure and pacing
- `dialogueSegments.js` - Narration <-> spoken-line splitting (NOT a dialogue mode)
- `scenePlanner.js` - Scene planning and sequencing
- `tensionTracker.js` - Story tension/pacing tracking
- `worldConsistency.js` - World state consistency checks
- `diceRollInference.js` - Infer dice checks from AI narrative (has extras vs shared/)
- `actionParser.js` - Parse player action text into structured actions

### Other Services
- `autoPlayer.js` - AI auto-play logic
- `characterAge.js` - Character aging mechanics
- `characterVoiceResolver.js` - Map characters to TTS voices
- `stateChangeMessages.js` - Human-readable messages for state changes
- `achievementTracker.js` - Achievement state machine
- `costTracker.js` - API usage cost calculation per model/service
- `exportLog.js` - Gameplay log export to markdown
- `characterHistory.js` - Character history/timeline construction
- `gameState.js` - Game state utilities
- `gmDataTransformer.js` - Transform data for GM modal display
- `graphLayout.js` - Graph layout for relationship visualizations
- `localAI.js` - Ollama / LM Studio integration for local LLMs
- `timeUtils.js` - Time/period utilities

### Field Map (`src/services/fieldMap/`)
- `index.js`, `constants.js`, `chunkGenerator.js`, `tileRules.js`
- `pathfinding.js` - A* pathfinding on tile grid
- `atlasIndex.js`, `prng.js` - Tile atlas + seeded PRNG

## Components (`src/components/`)

### Gameplay (`gameplay/`)
- `GameplayPage.jsx` - Central play screen, orchestrates all panels
- `ScenePanel.jsx` - Scene narrative with narrator highlighting
- `ActionPanel.jsx` - Player action selection / free-text input
- `ChatPanel.jsx` - Chat / game log
- `CombatPanel.jsx` - Tactical RPGon combat UI
- `CombatCanvas.jsx` - Visual combat map
- `CombatDetailPanel.jsx` - Combat detail overlay
- `CutscenePanel.jsx` - Cutscene presentation
- `MagicPanel.jsx` - Spellcasting UI
- `TradePanel.jsx`, `CraftingPanel.jsx`, `AlchemyPanel.jsx` - Economy panels
- `PartyPanel.jsx` - Party management
- `MapCanvas.jsx` - Force-directed world map (canvas)
- `FieldMapCanvas.jsx` - Tile-based field map (canvas)
- `SceneCanvas.jsx` - 2D scene illustration
- `SceneGridMap.jsx` - Grid-based scene map
- `WorldStateModal.jsx` - World overview modal
- `NeedsPanel.jsx` - Character needs (hunger, fatigue)
- `QuestOffersPanel.jsx` - Quest offer display
- `AutoPlayerPanel.jsx` - Auto-play controls
- `IdleTimer.jsx`, `DiceRollAnimationOverlay.jsx`, `TypewriterActionOverlay.jsx`
- `SceneGenerationProgress.jsx` - AI generation progress indicator
- `SummaryModal.jsx` - Session summary
- `GameplayModals.jsx` - Modal orchestration
- `GameplayHeader.jsx` - Header for gameplay page
- `gm/` - GM debug modal: `GMModal`, `GMOverviewTab`, `GMEntitiesTab`, `GMEntityDetail`, `GMQuestsTab`, `GMJournalTab`, `GMGraphTab`, `GMAssetsTab`
- `world/NpcTab.jsx` - NPC management tab

### Scene 3D (`gameplay/Scene3D/`)
- `Scene3DPanel.jsx`, `Environment3D.jsx`, `Lighting3D.jsx`, `CameraController.jsx`
- `Character3D.jsx`, `Object3D.jsx`, `GLBModel.jsx`, `PlaceholderMesh.jsx`
- `ProceduralFoliage3D.jsx`, `ProceduralStructures3D.jsx`, `DistantBackdrop3D.jsx`
- `AmbientEffects3D.jsx` - Weather/particle effects
- `proceduralSceneUtils.js`, `useSceneCommands.js`

### Character (`character/`)
- `CharacterSheet.jsx` - Full character sheet modal
- `CharacterCreationModal.jsx` - Character creation flow
- `CharacterPanel.jsx` - Compact character view
- `AdvancementPanel.jsx` - XP spending / attribute & skill advancement, spell trees
- `Inventory.jsx`, `StatsGrid.jsx`, `QuestLog.jsx`, `CodexPanel.jsx`
- `AchievementsPanel.jsx`, `PortraitGenerator.jsx`

### Other Pages
- `lobby/LobbyPage.jsx`, `CampaignCard.jsx`, `AuthPanel.jsx`
- `creator/CampaignCreatorPage.jsx` - Campaign creation wizard
- `viewer/CampaignViewerPage.jsx` - Public campaign viewer (read-only)
- `gallery/GalleryPage.jsx` - Public campaign gallery with fork-to-play
- `settings/DMSettingsPage.jsx` - All settings
- `multiplayer/` - Multiplayer lobby, join room, pending actions
- `layout/` - Header, Sidebar, Layout, MobileNav
- `ui/` - Shared UI primitives (Button, GlassCard, Slider, etc.)

## Data (`src/data/`)
- `rpgSystem.js` - Core: 6 attributes (1-25), ~60 skills, species, difficulty thresholds
- `rpgMagic.js` - 9 spell trees, scroll mechanics, mana progression
- `rpgFactions.js` - Faction definitions with Polish names
- `wfrpEquipment.js` - Equipment catalog with pricing (legacy, to be migrated)
- `achievements.js` - Achievement catalog, categories, conditions
- `prefabs.js` - 3D prefab asset catalog
- `sceneAnchors.js` - Scene anchor point definitions for 3D

## Effects (`src/effects/`)
- `EffectEngine.js`, `SceneRenderer.js`, `DiceRoller.jsx`
- `biomeResolver.js`, `resolveEffects.js`
- `sceneData.js`, `sceneSprites.js`, `layers/`

## Utils (`src/utils/`)
- `rpgTranslate.js` - RPGon PL<->EN translations for attributes, skills, spell names
