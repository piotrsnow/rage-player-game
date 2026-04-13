# Plan B.3 — Split backend/src/services/multiplayerAI.js

**Status:** in progress (session 6, 2026-04-13)
**Source:** [backend/src/services/multiplayerAI.js](../backend/src/services/multiplayerAI.js) 1615L

## Goal

Rozbić 1615L MP AI monolith na 9 cohesive modułów pod `multiplayerAI/` + thin facade. Dodatkowo:
- usunąć dead code (`generateMidGameCharacter` 94L, `calculateMargin` ~3L)
- zdedupować `clamp` + `rollD50` z `diceResolver.js` (oba już istnieją w backendzie)
- wydobyć inline closures `normalizeDiceRoll` + `recalcDiceRoll` z `generateMultiplayerScene` do pure helperów w `diceNormalization.js`
- flagnąć FE/BE duplikację dialogue-repair/fallback-actions/parse jako post-merge follow-up (out of scope)

## Audyt

| Zakres | Linie | Co |
|---|---|---|
| Fallback suggested actions | 1–172 | `FALLBACK_ACTION_VARIANTS` + 7 helperów |
| Numeric helpers | 174–187 | `clamp` (DUPLIKAT diceResolver:67), `normalizeDifficultyModifier`, `snapDifficultyModifier` |
| Needs block | 189–219 | `NEEDS_LABELS`, `buildMultiplayerUnmetNeedsBlock` |
| Dialogue repair | 221–505 | 10 helperów + `repairDialogueSegments` + `ensurePlayerDialogue` (285L, regex-heavy) |
| System prompt | 507–718 | `buildMultiplayerSystemPrompt` (212L template) |
| Dice helpers | 720–727 | `rollD50` (DUPLIKAT diceResolver:59), `calculateMargin` (DEAD) |
| Scene prompt | 728–951 | `buildMultiplayerScenePrompt` (223L template) |
| AI client | 953–1043 | `safeParseJSONContent`, `RETRY_DELAYS`, `callAI` |
| Public: campaign | 1045–1200 | `generateMultiplayerCampaign` (156L) |
| **DEAD** | 1202–1295 | ~~`generateMidGameCharacter` (94L)~~ — 0 importerów w całym repo |
| Public: scene | 1297–1536 | `generateMultiplayerScene` (240L, zawiera inline `normalizeDiceRoll`/`recalcDiceRoll`) |
| Public: compression + verify | 1538–1615 | `needsCompression`, `compressOldScenes`, `verifyMultiplayerQuestObjective` |

## Target structure

```
backend/src/services/multiplayerAI.js             — thin facade (~20L)
  • re-exports: generateMultiplayerCampaign, generateMultiplayerScene,
                needsCompression, compressOldScenes, verifyMultiplayerQuestObjective

backend/src/services/multiplayerAI/
├── fallbackActions.js     (~180L) — FALLBACK_ACTION_VARIANTS + 7 helpers
├── dialogueRepair.js      (~290L) — regex + 10 helpers + repairDialogueSegments +
│                                    ensurePlayerDialogue
├── diceNormalization.js   (~95L)  — normalizeDifficultyModifier, snapDifficultyModifier,
│                                    normalizeDiceRoll, recalcDiceRoll, MAX_COMBINED_BONUS
│                                    (imports clamp + rollD50 z ../diceResolver.js)
├── systemPrompt.js        (~235L) — buildMultiplayerSystemPrompt + NEEDS_LABELS +
│                                    buildMultiplayerUnmetNeedsBlock
├── scenePrompt.js         (~230L) — buildMultiplayerScenePrompt
├── aiClient.js            (~90L)  — callAI + safeParseJSONContent (prywatny) + RETRY_DELAYS
├── campaignGeneration.js  (~160L) — generateMultiplayerCampaign
├── sceneGeneration.js     (~180L) — generateMultiplayerScene (orchestrator)
└── compression.js         (~80L)  — needsCompression + compressOldScenes +
                                     verifyMultiplayerQuestObjective

backend/src/services/diceResolver.js  ← 1-line change: `export` przed `function rollD50`
```

Wszystko pod senior_baseline (300L soft dla services).

## Backend-wide dedup decisions

**Z backendem (w scope):**
- `clamp` → import z `../diceResolver.js` (już exportowane)
- `rollD50` → export z `diceResolver.js`, import do `diceNormalization.js`

**Z sceneGenerator (NIE duplikaty, zostają osobno):**
- `parseAIResponse` (sceneGenerator:1629) — zwraca lean scene object z 15 polami defaultów, not generic JSON
- `callOpenAIStreaming` / `callAnthropicStreaming` — streaming, MP używa buffered
- `buildLeanSystemPrompt` / `buildUserPrompt` — single-player prompt, inne dane kontekstowe

**Z frontendem (OUT OF SCOPE — post-merge):**
- `src/services/aiResponse/dialogueRepair.js` 550L — parallel dialogue repair
- `src/services/ai/suggestedActions.js` 264L — parallel fallback actions
- `src/services/aiResponse/parse.js` 557L — safeParseJSON variant
- `src/services/ai/service.js` 714L — parallel AI call

CLAUDE.md "Known Gaps" już flaguje to. BE↔FE dedup przez `shared/` to osobny cohesive refactor po merge'u. Dodaję explicit follow-up w [post_merge_infra.md](post_merge_infra.md).

## Lifted helpers — `normalizeDiceRoll` + `recalcDiceRoll`

Obecnie zdefiniowane jako inner closures wewnątrz `generateMultiplayerScene` (linie 1324–1380). Closure'ują:
- `actionByName` (Map z `actions.map((a) => [a.name, a])`)
- `characterByName` (Map z `gameState.characters.map(...)`)
- `actions[0]?.name` fallback dla `diceRoll` bez character

Po extracku do `diceNormalization.js`:

```js
export function normalizeDiceRoll(dr, { actionByName, characterByName, fallbackCharacterName = null }) { ... }
export function recalcDiceRoll(dr) { ... }  // czysto numeric, brak closures
```

`sceneGeneration.js` buduje mapy raz i przekazuje do normalize'a per dice roll.

## Dependency direction

```
routes/multiplayer/handlers/*
  → services/multiplayerAI.js (thin facade)
    → services/multiplayerAI/{campaignGeneration,sceneGeneration,compression}
      → services/multiplayerAI/{aiClient,systemPrompt,scenePrompt,dialogueRepair,
                                 fallbackActions,diceNormalization}
        → services/diceResolver.js (clamp, rollD50)
        → lib/{logger,prisma}, config, shared/domain/diceRollInference, shared/contracts/multiplayer
```

Pure helpers (`fallbackActions`, `diceNormalization`, `dialogueRepair`) nie importują orchestratorów. `aiClient` importuje tylko config + aiErrors + logger. Prompt builders importują tylko `dialogueRepair`/`fallbackActions` NIE — prompt-building jest pure. Żadnego circulara.

## Risks

1. **Lifted normalizeDiceRoll** — trzeba poprawnie przekazać `actionByName`/`characterByName` przez argumenty. Plus oryginal używa `actions[0]?.name` jako fallback dla `diceRoll` (nie `diceRolls`). Zachowuję przez explicit `fallbackCharacterName` parameter.
2. **`safeParseJSONContent` pozostaje prywatne** w `aiClient.js` (nie eksportujemy — nie jest częścią publicznego API).
3. **Module logger** `childLogger({ module: 'multiplayerAI' })` — każdy moduł z MP-AI używa tego samego binding, log stream bez fragmentacji.
4. **`export rollD50`** w `diceResolver.js` — 1 slowo dodane, żadnych dynamicznych ryzyk.
5. **Dead code removal** — `generateMidGameCharacter` (94L) + `calculateMargin` (3L). Grep potwierdza 0 zewnętrznych użyć.
6. **Consumers** — 3 pliki importują z `multiplayerAI.js`, thin facade re-export zachowuje kontrakt 1:1.

## Test impact

- Brak `multiplayerAI.test.js`.
- Brak testów dla `generateMidGameCharacter` (usuwane dead code).
- `diceResolver.js` export nie łamie istniejących importów (dodajemy export, nie zmieniamy sygnatury).

## Git strategy

Jeden cohesive commit: `refactor: split multiplayerAI.js into modules + dedup helpers + remove dead code`. Walidacja: `npm test` + smoke import `multiplayerAI.js`.
