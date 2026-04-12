# Frontend Refactor — Regression Watchlist

Manual test checklist and open questions flagged by the [[frontend-refactor-2026-04]] work. All of this lives on uncommitted (PR #7-#10) or recently-committed (PR #1-#6) branches of `new_rpg_system`. Tests pass (345 green) and build is clean, but many of these code paths have **zero automated coverage** and need a human smoke test.

## Priority — high risk, untested

### Combat — solo + multiplayer (biggest gap)

No combat e2e fixture exists. The plan at `shimmering-inventing-cosmos.md` explicitly flagged this gap. Changes touching combat:

- **`useCombatResolution`** merged 6 End/Surrender/Truce handlers from GameplayPage into one hook (`src/hooks/useCombatResolution.js`). Shared helpers: `pickStateChanges`, `soloPerCharForServer`, `formatRemainingEnemies`. Verify: solo victory/defeat flow, solo surrender flow, solo truce flow, MP host equivalents. Watch for `stateChanges.forceStatus = 'dead'` path and post-combat `generateScene(...)` with aftermath narration.
- **`useEnemyTurnResolver`** — auto-resolves enemy turns on a 2.5s delay. Owns `AI_TURN_DELAY_MS`. Receives `addResultToLog` + `dispatchCombatChatMessage` as callbacks (CombatPanel still owns their implementation). Watch for: enemy winning initiative, first-round enemies, MP host gating, round transitions.
- **`useCombatResultSync`** — non-host consumer of `combat.lastResults` keyed on `lastResultsTs`. Owns its own `lastProcessedTsRef`. Watch for: duplicate result application, missed results, stale ts after reconnect.
- **`CombatLogEntry.jsx`** — pure lift of 285L of log rendering. Zero-logic intent but verify: hit/miss/critical/fled/defeat/defensive entries, tooltip popups (attack/defense/cast/check breakdowns), animated character-by-character reveal, location chip, critical-name line.

### Scene image repair

`useImageRepairQueue` owns three separate effects with six refs:
- **Current-missing effect**: solo + MP host auto-repair when `currentScene.image` is empty. Verify: generation triggers after scene arrives without image, respects `imageAttemptedRef` gate, skips in viewer mode.
- **Viewer-missing effect**: read-only mode repair. Verify: `skipAutoSave: true` passed through, viewer doesn't pollute remote campaign.
- **Migration sweep**: background probe of up to 12 older scenes, 3 repairs max per pass, 12s cooldown. Verify: probe promise resolves/timeouts correctly (5s `Image` load timeout), broken URLs detected via `probeSceneImage`, cap respected.
- **Manual retry** (`resetImageAttempts` + `forceNew: true`): verify button in ScenePanel onRegenerateImage handler still works end-to-end.

### Story recap (useSummary)

`useSummary` now owns: cache lookup, streaming progress, speak timers, dialogue-segment builder, voice pool shuffle, auto-unload on unmount, narrator-start watcher. Consumer renames it to `recap` to avoid shadowing combat handler `summary` parameter.
- Verify: open summary modal from GameplayHeader → generate → cached lookup path → fresh generate path → speak (ElevenLabs) → speak (browser TTS fallback) → copy-to-clipboard toast → close and re-open preserves options but clears text.
- Verify: dialogue-detection heuristic in `buildSummaryDialogueSegments` still picks voices from male/female pools with same shuffle seed behavior.

### Viewer mode (`?view/:shareToken`)

`useViewerMode` bundles three effects:
- Force-enable narrator once on mount.
- `?scene=N` URL sync — if missing, redirect with `?scene=0`. If present, clamp to scene bounds.
- Initial chat scroll alignment — scrolls chat to the DM message matching `viewingSceneIndex` on first non-empty load. Uses `initialViewerChatAlignDoneRef` gate.
- Verify: share a campaign, open the viewer URL, narrator buttons appear + chat scrolls to the selected scene + scene param round-trips through prev/next navigation.

### Multiplayer host edge cases

**UPDATED (2026-04-12):** Static-leak pattern (`CombatPanel.resolveRemoteManoeuvre = ...`) replaced by `useCombatHostResolve` hook. Old `useMultiplayerCombatHost` renamed to `useMultiplayerCombatSceneDetect` (scene-detect only).

`useMultiplayerCombatSceneDetect` — single effect: detect `combatUpdate` in latest scene → create MP combat state → `mp.syncCombatState(state)`. Owns `lastCombatSceneRef` dedup.
`useCombatHostResolve` — reads `pendingCombatManoeuvre` from `useMultiplayer()` directly, resolves via `useEvent`-wrapped handler. Verify: joining an in-progress combat, remote player actions resolving on host, fallback enemy when AI doesn't emit enemies.

## Priority — medium risk

### DMSettingsPage sliders

All slider label tier logic was lifted from the parent into each section component with a new `tierLabel(t, value, default, [keys])` helper (`NarratorStyleSection.jsx`). The thresholds are <25 / <50 / <75 / else.
- Verify: each slider's display value shows the right tier word at boundary values (0, 24, 25, 49, 50, 74, 75, 100). Particularly `narratorPoeticism`, `narratorGrittiness` (default 30 — not 50!), `narratorDetail`, `narratorHumor` (default 20!), `narratorDrama`, `narratorSeriousness`.
- Verify: `NarrativeAnchorsSection` — `difficulty` / `chaos` / `length` / `combatCommentaryFrequency` (0 = disabled, else "every N rounds") labels.

### Chat message rendering

Pure lift to `chat/ChatMessageParts.jsx` + `chat/ChatMessages.jsx` + `chat/DiceRollMessage.jsx`. Imports cross-module: DiceRollMessage falls back to `SystemMessage` from `ChatMessages.jsx`.
- Verify: all 5 message types render (dm/combat_commentary/player/dice_roll/system).
- Verify: `HighlightedText` still highlights the active narrated word when narrator plays a DM message.
- Verify: `DialogueSegments` duplicate-dedup still filters dialogue segments whose text matches narrative text ≥90%.
- Verify: streaming narrative partial view (`StreamingContent`) — both structured segments path and regex-dialogue-detect fallback.
- Verify: dice roll collapsed button → expanded card toggle, BonusTags tooltips, RollEdgeBadge tone.

### GameplayHeader button row

~370L of UI lifted as a sub-component with ~25 props. High prop-drill surface.
- Verify every button still works: first/prev/next/last scene, tension badge, play scene narration, skip segment, auto-play scenes toggle, refresh, auto-player toggle, auto-player settings, MP invite, video chat (MP only), share-token copy, summary, achievements, world modal, GM modal, export markdown.

### GameplayPage → `useGame()` facade still in use

GameplayPage has **not** been migrated to granular Zustand selectors. It still consumes the whole `state` object via `useGame()`. This was explicit: it's the next perf-focused PR but requires its own pass. Known: every `dispatch` re-renders the 1160-line component.

## Priority — low risk (pure lifts)

These changes should be functionally inert but list them for completeness:

- `ScenePanel` — `OverlayDiceCard` (280L) + `HighlightedNarrative` (50L) moved to `scene/` subfolder. Also deleted two **dead code** functions (`CompactBonusTags`, `OverlayOutcomeTarget`) that were defined but never referenced. Verify: dice overlay still appears after skill checks, narrative highlighting still works.
- `SummaryModal` — `buildSummaryBlocks` + helpers moved to `services/summaryBlockBuilder.js`. `getRecapImages` now takes `recapScenes` as an argument instead of closing over it. Verify: story/dialogue/report/poem modes still render with distributed scene images.

## Known questions to ask in future sessions

When resuming this refactor, ask the user:

1. **Did anything break in manual play testing?** Specifically: combat (solo + MP), story recap, scene images (auto-repair + manual retry), viewer mode for shared campaigns, DM settings sliders.
2. **Should we add a combat e2e fixture now?** The plan explicitly flagged this gap. Shape: mock that sets `combat.active=true`, populates 3+ round timeline, forces enemy-win-initiative path, verifies commentary emission at the configured frequency. Blocker for safe CombatPanel/useCombatCommentary changes.
3. **Promote `<Toggle>` to `components/ui/`?** Currently inline-duplicated in `SceneVisualizationSection.jsx`, `NarratorVoicesSection.jsx`, `AudioSections.jsx` (3 copies of the same ~15-line component). Low priority, mechanical.
4. **Migrate GameplayPage to granular selectors next?** That's the biggest remaining perf win — every state change currently re-renders the full 1160L component via the `useGame()` facade.
5. **Should we commit PRs 7-10 now or bundle more?** User ran with `let it ride` — PR #7 through #10 are currently uncommitted on `new_rpg_system`. `git status` at next session start will tell the story.
6. **Touch useNarrator next?** `useNarrator.js` (945L) is the biggest remaining monolith hook. `useSceneGeneration.js` (902L) was split into `src/hooks/sceneGeneration/` (4 files) in the 2026-04-12 session. useNarrator split is deferred (playtest-driven).
7. **Was `CompactBonusTags` / `OverlayOutcomeTarget` dead-code removal a mistake?** I removed both during PR #10. Grep confirmed zero call sites, but a user might have imported them from elsewhere recently that my grep missed. If any "bonus tag" UI disappeared from dice overlays, this is why.

## Files created by the refactor (for quick navigation)

```
src/hooks/
  useEvent.js                  (12L)  — stable callback polyfill
  useImageRepairQueue.js       (237L)
  useSummary.js                (394L)
  useCampaignLoader.js
  useViewerMode.js
  useMultiplayerVoiceSync.js
  useMultiplayerCombatSceneDetect.js   — renamed from useMultiplayerCombatHost
  useCombatHostResolve.js      (~40L)  — replaces static-leak pattern
  useCombatResolution.js       (208L)
  useEnemyTurnResolver.js
  useCombatResultSync.js
  sceneGeneration/             — split from useSceneGeneration.js (902L)
    index.js
    useSceneGeneration.js      (~270L) — orchestrator
    useSceneBackendStream.js   (~170L) — streaming state/refs/onEvent
    processSceneDialogue.js    (~65L)  — dialogue repair pipeline
    applySceneStateChanges.js  (~145L) — validation + XP + achievements

src/components/gameplay/
  GameplayHeader.jsx           (373L)
  GameplayModals.jsx           (127L)
  CombatLogEntry.jsx           (285L)
  chat/ChatMessageParts.jsx    (348L)
  chat/ChatMessages.jsx        (226L)
  chat/DiceRollMessage.jsx     (253L)
  scene/OverlayDiceCard.jsx    (180L)
  scene/HighlightedNarrative.jsx (50L)

src/components/settings/sections/
  NarrativeAnchorsSection.jsx  (92L)
  NarratorStyleSection.jsx     (111L)
  SceneVisualizationSection.jsx (168L)
  NarratorVoicesSection.jsx    (194L)
  AudioSections.jsx            (93L)
  EffectIntensitySection.jsx   (31L)

src/services/
  summaryBlockBuilder.js       (209L)
  aiStream.js                  (~80L)  — callBackendStream (SSE + partial JSON)
  imagePrompts.js              (~210L) — extracted from prompts.js
  aiResponse/                  — split from aiResponseValidator.js (1523L)
    index.js, schemas.js, parse.js, dialogueRepair.js
  ai/                          — split from ai.js (1004L)
    index.js, models.js, providers.js, suggestedActions.js, service.js
  mechanics/combatIntent.js    (~9L)   — extracted from prompts.js

src/utils/
  retry.js                     (17L)   — withRetry, extracted from aiResponseValidator
```

## Related
- [[frontend-refactor-2026-04]]
- [[../patterns/component-decomposition]]
