# Frontend Structure — subdomain map

High-level map of `src/`. Not a file-by-file inventory — grep for the entry point and follow imports. Each row tells you where to start when working in that subdomain.

## State

- `src/stores/` — Zustand store + Immer handlers. Entry: [gameStore.js](../../src/stores/gameStore.js), [gameSelectors.js](../../src/stores/gameSelectors.js). Handlers split by domain in `handlers/`. See [game-state.md](game-state.md).
- `src/contexts/` — sibling contexts that stay on React Context (not Zustand):
  - [SettingsContext.jsx](../../src/contexts/SettingsContext.jsx) — prefs, API keys, DM settings, i18n, auth bootstrap (~352L, ~28 consumers)
  - [MultiplayerContext.jsx](../../src/contexts/MultiplayerContext.jsx) — composition shell
  - `multiplayer/` — `mpReducer.js`, `useMpActions.js`, `useMpWsSubscription.js`
  - `MusicContext.jsx`, `ModalContext.jsx` — small utility contexts
  - [GameContext.jsx](../../src/contexts/GameContext.jsx) — 22L backward-compat facade over `gameStore`

## Hooks

Entry-point hooks (things pages/components actually reach for):

- **Scene generation** — `src/hooks/sceneGeneration/` (orchestrator, backend stream, dialogue repair, state-change apply)
- **Campaign lifecycle** — `useGameState.js` (start/load/save), `useCampaignLoader.js` (URL-driven load)
- **Game content** — `useGameContent.js` (quest/NPC updates)
- **Combat** — `useCombatResolution.js`, `useEnemyTurnResolver.js`, `useCombatResultSync.js`, `useCombatHostResolve.js`, `useMultiplayerCombatSceneDetect.js`, `useCombatAudio.js`, `useCombatCommentary.js`
- **Image gen** — `useImageGeneration.js`, `useImageRepairQueue.js`
- **Narration** — `useNarrator.js` (TTS + word highlight + queue, ~945L — biggest remaining monolith), `useChatAutoNarration.js`
- **Viewer mode** — `useViewerMode.js` (read-only shared campaign mode)
- **Summary modal** — `useSummary.js` (recap state machine + narration + cache)
- **Multiplayer glue** — `useMultiplayerVoiceSync.js`, `useMultiplayerSceneGenTimer.js`, `useWebRTC.js`
- **Other** — `useActiveGameState.js`, `useActionTyping.js`, `useAutoPlayer.js`, `usePlayTimeTracker.js`, `useSoloActionCooldown.js`, `useIdleTimer.js`, `useModalA11y.js`, `useLocalMusic.js`, `useSpeechRecognition.js`, `useChatScrollSync.js`, `useSceneScrollSync.js`, `useDocumentTitle.js`, `useElevenlabsVoices.js`, `useMediaCacheStats.js`, `useConfigImportExport.js`, `useEvent.js` (stable callback polyfill)

## Services

### AI

- `src/services/ai/` — `service.js` (backend dispatch), `models.js`, `index.js`
- `src/services/aiResponse/` — Zod schemas + parser: `schemas.js`, `parse.js`, `dialogueRepair.js`, `index.js`
- [apiClient.js](../../src/services/apiClient.js) — JWT + refresh + CSRF + idempotency
- [localAI.js](../../src/services/localAI.js) — Ollama / LM Studio (dev path)
- [partialJsonParser.js](../../src/services/partialJsonParser.js) — streaming JSON reconciliation

### Game engines

- [combatEngine.js](../../src/services/combatEngine.js) — RPGon tactical combat
- [magicEngine.js](../../src/services/magicEngine.js) — mana-based spellcasting
- [tradeEngine.js](../../src/services/tradeEngine.js), [craftingEngine.js](../../src/services/craftingEngine.js), [alchemyEngine.js](../../src/services/alchemyEngine.js) — economy systems
- [reputationEngine.js](../../src/services/reputationEngine.js), [narrativeEngine.js](../../src/services/narrativeEngine.js)
- `src/services/mechanics/` — deterministic helpers: `skillCheck.js`, `d50Test.js`, `momentumTracker.js`, `dispositionBonus.js`, `restRecovery.js`, `creativityBonus.js`, `index.js` (resolveMechanics orchestrator)

### Persistence & networking

- [storage.js](../../src/services/storage.js) — campaign save/load/queue
- [websocket.js](../../src/services/websocket.js) — WS client for multiplayer
- [webrtc.js](../../src/services/webrtc.js) — peer connections for voice chat
- [gameDataService.js](../../src/services/gameDataService.js) — fetches static game data from backend

### Media

- [imageGen.js](../../src/services/imageGen.js) — scene images (via backend proxy)
- [imagePrompts.js](../../src/services/imagePrompts.js) — image prompt builders
- [elevenlabs.js](../../src/services/elevenlabs.js) — TTS (via backend proxy except public share-token)
- [meshyClient.js](../../src/services/meshyClient.js) — 3D model gen (via backend proxy)
- [modelResolver3d.js](../../src/services/modelResolver3d.js) — 3D model lookup for scene objects
- [assetManager.js](../../src/services/assetManager.js), [assetCache.js](../../src/services/assetCache.js)

### Validation & state change

- [stateValidator.js](../../src/services/stateValidator.js) — clamps/validates AI-emitted state changes (solo path). Shares helpers with backend via `shared/domain/stateValidation.js`.
- [stateChangeMessages.js](../../src/services/stateChangeMessages.js) — human-readable messages for state change chat entries
- [actionParser.js](../../src/services/actionParser.js) — parse player text into structured actions
- [achievementTracker.js](../../src/services/achievementTracker.js) — achievement state machine
- [campaignGuard.js](../../src/services/campaignGuard.js) — `canLeaveCampaign` (safe-location check)

### Other

- [costTracker.js](../../src/services/costTracker.js), [performanceTracker.js](../../src/services/performanceTracker.js)
- [exportLog.js](../../src/services/exportLog.js), [characterHistory.js](../../src/services/characterHistory.js)
- [characterVoiceResolver.js](../../src/services/characterVoiceResolver.js) — character → TTS voice mapping
- [dialogueSegments.js](../../src/services/dialogueSegments.js) — narration ↔ spoken-line splitting
- [diceRollInference.js](../../src/services/diceRollInference.js) — FE-side skill inference (has legacy aliases not in shared/)
- [summaryBlockBuilder.js](../../src/services/summaryBlockBuilder.js) — recap modal block builder
- [scenePlanner.js](../../src/services/scenePlanner.js), [tensionTracker.js](../../src/services/tensionTracker.js), [worldConsistency.js](../../src/services/worldConsistency.js)
- `src/services/fieldMap/` — tile-based field map: A* pathfinding, chunk generator, tile rules, seeded PRNG

## Components

- `gameplay/` — main play screen. Entry: [GameplayPage.jsx](../../src/components/gameplay/GameplayPage.jsx). Panels: Scene, Action, Chat, Combat, Magic, Trade, Party, Needs, Autoplayer. Sub-folders: `chat/`, `scene/`, `combat/`, `action/`, `field/`, `gm/`, `world/`, `summary/`, `Scene3D/`
- `character/` — character sheet, creator, library, advancement, inventory, codex, quests, achievements, portrait generator
- `creator/` — campaign creation wizard
- `lobby/` — lobby page + campaign cards + auth panel
- `viewer/` — public campaign viewer (read-only)
- `gallery/` — public campaign gallery with fork-to-play
- `settings/` — all settings pages. Sections split under `settings/sections/`
- `multiplayer/` — lobby, join room, pending actions
- `layout/` — Header, Sidebar, Layout, MobileNav
- `ui/` — shared primitives (Button, GlassCard, Slider, Toggle, etc.)

## Data

- [src/data/rpgSystem.js](../../src/data/rpgSystem.js) — core rules, attributes, skills, limits, XP formulas
- [src/data/rpgMagic.js](../../src/data/rpgMagic.js) — spell trees, mana progression
- [src/data/rpgFactions.js](../../src/data/rpgFactions.js) — factions
- [src/data/achievements.js](../../src/data/achievements.js) — achievement catalog
- [src/data/prefabs.js](../../src/data/prefabs.js) — 3D prefab asset catalog
- [src/data/sceneAnchors.js](../../src/data/sceneAnchors.js) — scene anchor points for 3D

## Effects (3D + particles)

- `src/effects/` — `EffectEngine.js`, `SceneRenderer.js`, `DiceRoller.jsx`, `biomeResolver.js`, `resolveEffects.js`, `sceneData.js`, `sceneSprites.js`, `layers/`

## Utils

- `src/utils/` — `rpgTranslate.js`, `ids.js` (shortId), `retry.js` (withRetry)

## Entry-point cheat sheet

| Task | Start here |
|---|---|
| Scene generation bug | [src/hooks/sceneGeneration/useSceneGeneration.js](../../src/hooks/sceneGeneration/useSceneGeneration.js) → [backend/src/services/sceneGenerator/generateSceneStream.js](../../backend/src/services/sceneGenerator/generateSceneStream.js) |
| Combat logic | [src/services/combatEngine.js](../../src/services/combatEngine.js) + the 4 combat hooks |
| AI state change didn't apply | [src/services/stateValidator.js](../../src/services/stateValidator.js) → [src/stores/handlers/applyStateChangesHandler.js](../../src/stores/handlers/applyStateChangesHandler.js) |
| Save/load bug | [src/services/storage.js](../../src/services/storage.js) |
| Auth issue | [src/services/apiClient.js](../../src/services/apiClient.js) + [src/contexts/SettingsContext.jsx](../../src/contexts/SettingsContext.jsx) bootstrap effect |
| Multiplayer desync | `src/contexts/multiplayer/` + [backend/src/routes/multiplayer/handlers/](../../backend/src/routes/multiplayer/handlers/) |
| Dice wrong | `src/services/mechanics/` + [shared/domain/luck.js](../../shared/domain/luck.js) |
| Image gen failing | [src/services/imageGen.js](../../src/services/imageGen.js) + [src/hooks/useImageRepairQueue.js](../../src/hooks/useImageRepairQueue.js) |
