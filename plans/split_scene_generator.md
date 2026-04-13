# Plan B.4 — Split backend/src/services/sceneGenerator.js

**Status:** in progress (session 6, 2026-04-13)
**Source:** [backend/src/services/sceneGenerator.js](../backend/src/services/sceneGenerator.js) 1901L

## Goal

Rozbić 1901L single-player scene generator (critical path) na thin facade + 12 modułów pod `sceneGenerator/`. Plus dedup `detectCombatIntent` do `shared/domain/` (3 kopie → 1 canonical).

## Audyt funkcji

| # | Funkcja | Linie | Kategoria |
|---|---|---|---|
| 1 | `fillEnemiesFromBestiary` | 48–80 (33L) | enemy stats |
| 2 | `findCombatTargetNpc` | 88–97 (10L) | combat shortcut |
| 3 | `generateShortNarrative` | 103–144 (42L) | combat shortcut |
| 4 | `calculateFreeformSkillXP` | 160–199 (40L) | dice resolution |
| 5 | `difficulty/narrative/responseLength/sliderLabel` | 203–217 | DM settings labels |
| 6 | `formatMoney` | 219–226 | DM settings labels |
| 7 | `getInlineEntityKeys` | 238–263 (26L) | context/prompt bridge |
| 8 | `buildLeanSystemPrompt` | 269–659 (**391L**) | system prompt template |
| 9 | `buildAnthropicSystemBlocks` | 660–668 | system prompt template |
| 10 | `buildPreRollInstructions` | 672–682 | user prompt |
| 11 | `applyCreativityToRoll` | 695–707 | dice resolution |
| 12 | `isCreativityEligible` | 714–722 | dice resolution |
| 13 | `resolveModelDiceRolls` | 724–784 (61L) | dice resolution |
| 14 | `detectCombatIntent` | 786–789 | **DUPLIKAT** — dedup do shared/domain |
| 15 | `buildUserPrompt` | 791–924 (134L) | user prompt |
| 16 | `buildContextSection` | 931–969 (39L) | context assembly |
| 17 | `callOpenAIStreaming` | 980–1068 (89L) | streaming client |
| 18 | `callAnthropicStreaming` | 1074–1146 (73L) | streaming client |
| 19 | `runTwoStagePipelineStreaming` | 1151–1178 (28L) | streaming client |
| 20 | **`generateSceneStream`** | 1184–1624 (**441L**) | **main orchestrator** |
| 21 | `parseAIResponse` | 1629–1679 (51L) | streaming client |
| 22 | `generateSceneEmbedding` | 1684–1696 | post-scene side-effect |
| 23 | `processStateChanges` | 1697–1901 (**205L**) | post-scene side-effect |

## Target structure

```
backend/src/services/sceneGenerator.js              — thin facade (~7L)
  • re-export: generateSceneStream

backend/src/services/sceneGenerator/
├── labels.js                   (~40L)  — 4× slider label helpers + formatMoney
├── inlineKeys.js               (~30L)  — getInlineEntityKeys
├── systemPrompt.js             (~400L) — buildLeanSystemPrompt + buildAnthropicSystemBlocks
│                                         (template stays as ONE cohesive file — prompt
│                                          readability over line count per user decision)
├── userPrompt.js               (~170L) — buildUserPrompt + buildPreRollInstructions
│                                         (imports detectCombatIntent from shared/domain/)
├── contextSection.js           (~45L)  — buildContextSection
├── diceResolution.js           (~155L) — applyCreativityToRoll, isCreativityEligible,
│                                         resolveModelDiceRolls, calculateFreeformSkillXP,
│                                         DIFFICULTY_SKILL_XP const
├── enemyFill.js                (~40L)  — fillEnemiesFromBestiary
├── shortcuts.js                (~180L) — tryTradeShortcut + tryCombatFastPath +
│                                         findCombatTargetNpc + generateShortNarrative
├── streamingClient.js          (~225L) — callOpenAIStreaming, callAnthropicStreaming,
│                                         runTwoStagePipelineStreaming, parseAIResponse
├── processStateChanges.js      (~225L) — processStateChanges (inline sub-functions per
│                                         NPCs/knowledge/codex/quests) + generateSceneEmbedding
├── campaignLoader.js           (~90L)  — loadCampaignState: DB queries + coreState hydration
└── generateSceneStream.js      (~220L) — main orchestrator
                                          (matches export name per user decision)
```

**12 plików + facade.**

## Dedup — shared/domain/combatIntent.js

`detectCombatIntent` istnieje dziś w 3 miejscach:
- [backend/src/services/sceneGenerator.js:786](../backend/src/services/sceneGenerator.js#L786) — basic regex (3L inline)
- [backend/src/services/intentClassifier.js:20](../backend/src/services/intentClassifier.js#L20) — basic regex + COMBAT_REGEX const (extracted from sceneGenerator, same behavior)
- [src/services/mechanics/combatIntent.js](../src/services/mechanics/combatIntent.js) — **richer FE version** with:
  - Expanded Polish conjugations (`atakuj[eę]?`, `walk[eęiąa]`, `bij[eę]`, `wyci[aą]gam`)
  - Weapon-draw patterns (`draw my sword`, `wyciągam miecz`)
  - Early-return `false` on `[Combat resolved:`
  - Early-return `true` on `[INITIATE COMBAT]` / `[ATTACK:` system tags

FE użyte w: [src/hooks/sceneGeneration/applySceneStateChanges.js:6](../src/hooks/sceneGeneration/applySceneStateChanges.js#L6)

**Akcja:** Create `shared/domain/combatIntent.js` z **FE wersją** jako canonical (strict nadzbiór — więcej matches, graceful system-tag handling). Update:
1. Create `shared/domain/combatIntent.js`
2. Delete `src/services/mechanics/combatIntent.js`
3. Update `src/hooks/sceneGeneration/applySceneStateChanges.js` import → `shared/domain/combatIntent.js`
4. Remove local `COMBAT_REGEX` + `detectCombatIntent` from `intentClassifier.js`, import from shared
5. Remove local `detectCombatIntent` from new `userPrompt.js`, import from shared

Behavioral check: BE call sites (`intentClassifier` heuristic + `buildUserPrompt` hint) handle system tags via other branches BEFORE reaching `detectCombatIntent`. Using FE version is strictly additive — no regression risk.

## Ryzyka

1. **`generateSceneStream` extract** — 441L orchestrator z 10 fazami. Rozbiję na:
   - `campaignLoader.loadCampaignState()` (phase 1)
   - `shortcuts.tryTradeShortcut()` / `shortcuts.tryCombatFastPath()` (phases 2a/2a2)
   - `generateSceneStream.js` = reszta (phases 2b-10)
   Shortcuts zwracają `{ handled: boolean, result?: object }` tak że orchestrator wie kiedy return.
2. **Template 391L** — `buildLeanSystemPrompt` zostaje 1:1, pod 500L hard i cohesive.
3. **`applyCreativityToRoll` mutation** — in-place mutation zachowana.
4. **FE import path** — `shared/domain/combatIntent.js` musi być importowalny zarówno z FE (Vite) jak i BE (Node ESM). Inne shared/domain/ pliki już działają — sprawdzę wzorzec importu.

## Test impact

- Brak `sceneGenerator.test.js` / `intentClassifier.test.js`.
- FE/BE unit tests nie dotykają combatIntent bezpośrednio.
- Smoke import backend po splicie: `multiplayerRoutes` + `multiplayerAI` (dalej) + nowy `sceneGenerator.js` powinny zwracać swoje publiczne API.

## Git strategy

Jeden cohesive commit: `refactor: split sceneGenerator.js into modules + dedup detectCombatIntent to shared/domain`.

Walidacja: `npm test` + smoke import `backend/src/services/sceneGenerator.js`.
