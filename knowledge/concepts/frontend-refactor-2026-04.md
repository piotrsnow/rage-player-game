# Frontend Refactor — April 2026

Large-scale decomposition of god-components and monolithic hooks on the `new_rpg_system` branch. Plan at `C:\Users\patry\.claude\plans\shimmering-inventing-cosmos.md`. Status file at `memory/project_frontend_refactor.md`.

## File trajectory (start → current)

| File | Before | After | Δ |
|---|---|---|---|
| `components/gameplay/GameplayPage.jsx` | 2306 | 1160 | −50% |
| `components/gameplay/CombatPanel.jsx` | 1249 | 909 | −27% |
| `components/settings/DMSettingsPage.jsx` | 806 | 205 | −75% |
| `components/gameplay/ChatPanel.jsx` | 956 | 147 | −85% |
| `components/gameplay/ScenePanel.jsx` | 772 | 450 | −42% |
| `components/gameplay/SummaryModal.jsx` | 776 | 564 | −27% |

Total: ~3.3k lines moved out of six god-components into focused modules.

## PR stack on `new_rpg_system`

- **PR #1** — Route-level code splitting (`src/App.jsx`, all 6 routes lazy).
- **PR #2** — GameContext → Zustand facade (`src/stores/gameStore.js` + `gameSelectors.js`). `useGame()` API preserved as thin backward-compat facade.
- **PR #3-5** — Initial hook extractions (usePlayTimeTracker, useStreamingNarrator, useMultiplayerSceneGenTimer, useSceneScrollSync, useChatScrollSync, useChatAutoNarration, useCombatCommentary, useElevenlabsVoices, useMediaCacheStats, useConfigImportExport) + first DMSettings section splits + hot-path migration to slice selectors in 16 files.
- **PR #6** — GameplayPage decomposition (6 hooks + `GameplayHeader.jsx` + `GameplayModals.jsx`).
- **PR #7** — `useCombatResolution` (dedup 6 End/Surrender/Truce handlers) + `CombatLogEntry.jsx` pure lift + `useEnemyTurnResolver` + `useCombatResultSync`.
- **PR #8** — DMSettingsPage full section decomposition (6 section components, shared `Toggle` inline-duplicated in 3 files).
- **PR #9** — ChatPanel message family split (`chat/ChatMessageParts.jsx`, `chat/ChatMessages.jsx`, `chat/DiceRollMessage.jsx`).
- **PR #10** — ScenePanel overlay lift (`scene/OverlayDiceCard.jsx`, `scene/HighlightedNarrative.jsx`) + SummaryModal `summaryBlockBuilder.js` util.

## Extracted hooks (new since plan)

- `useImageRepairQueue` — current / viewer / migration-sweep effects + 6 refs + constants.
- `useSummary` — story recap state machine + narration + cache.
- `useCampaignLoader`, `useViewerMode`, `useMultiplayerVoiceSync`, `useMultiplayerCombatSceneDetect` — narrow-purpose GameplayPage effects.
- `useCombatResolution` — merges 6 solo/MP combat-end handlers with shared helpers.
- `useEnemyTurnResolver`, `useCombatResultSync` — non-host combat plumbing split from CombatPanel.
- `useCombatHostResolve` — replaces static-leak pattern (`CombatPanel.resolveRemoteManoeuvre = ...`) with dedicated hook reading MP context internally.
- `useEvent` (`src/hooks/useEvent.js`) — stable callback polyfill for React's `useEffectEvent`. Used in all 4 combat hooks.

## Service splits (April 2026)

- `src/services/aiResponseValidator.js` (1523L) → `src/services/aiResponse/` (schemas + parse + dialogueRepair + barrel)
- `src/services/ai.js` (1004L) → `src/services/ai/` (models + providers + suggestedActions + service + barrel)
- `src/services/prompts.js` (1315L → ~970L) — image builders → `src/services/imagePrompts.js`, combat intent → `src/services/mechanics/combatIntent.js`, combat commentary + objective verification inlined into `src/services/ai/service.js`
- `src/hooks/useSceneGeneration.js` (902L) → `src/hooks/sceneGeneration/` (orchestrator + useSceneBackendStream + processSceneDialogue + applySceneStateChanges + barrel)
- `src/services/aiStream.js` — new shared `callBackendStream()` for SSE + partial JSON parsing
- `src/utils/retry.js` — `withRetry` extracted from aiResponseValidator (generic utility)

## BE endpoints added

- `POST /ai/generate-story-prompt` — non-streaming, `backend/src/services/storyPromptGenerator.js`
- `POST /ai/generate-campaign` — SSE streaming, `backend/src/services/campaignGenerator.js`

## Decomposed sub-components (pure lifts)

- `gameplay/GameplayHeader.jsx` — scene counter + action buttons (~373L).
- `gameplay/GameplayModals.jsx` — world/GM/MP/advancement/achievements/auto-player/summary/video modal layer (~127L).
- `gameplay/chat/ChatMessageParts.jsx` — HighlightedText, DialogueSegments, NarratorHeaderButtons, StreamingContent, dedup helpers.
- `gameplay/chat/ChatMessages.jsx` — DmMessage, CombatCommentaryMessage, PlayerMessage, SystemMessage (+ SUBTYPE_STYLES), TypingIndicator.
- `gameplay/chat/DiceRollMessage.jsx` — DiceRollMessage + ModifierIconTag + BonusTags + RollEdgeBadge (falls back to SystemMessage).
- `gameplay/CombatLogEntry.jsx` — AnimatedTextSegment, AnimatedCombatLogText, CombatLogEntry, buildCombatLogDetails.
- `gameplay/scene/OverlayDiceCard.jsx` — overlay card with internal helpers.
- `gameplay/scene/HighlightedNarrative.jsx` — highlighted narrative + splitIntoSentences.
- `settings/sections/NarrativeAnchorsSection`, `NarratorStyleSection`, `SceneVisualizationSection`, `NarratorVoicesSection`, `AudioSections`, `EffectIntensitySection`.
- `services/summaryBlockBuilder.js` — pure util: buildSummaryBlocks, formatPoemForDisplay + internal chunking.

## Related
- [[frontend-refactor-regressions]] — manual testing watchlist
- [[../patterns/reducer-context]] (now Zustand facade over reducer)
- [[../patterns/component-decomposition]]
