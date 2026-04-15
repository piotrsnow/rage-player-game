# AI Context Assembly

Two-stage pipeline for AI context selection. The design principle: **have the nano model pick what context is needed, then assemble it in code** — instead of letting the premium model call tools in a loop.

## Files

- [backend/src/services/intentClassifier.js](../../backend/src/services/intentClassifier.js) — Stage 1 (intent → selection result)
- [backend/src/services/aiContextTools.js](../../backend/src/services/aiContextTools.js) — Stage 2 (`assembleContext` + legacy tool-use definitions)
- [backend/src/services/memoryCompressor.js](../../backend/src/services/memoryCompressor.js) — post-scene nano fact extraction + running summaries
- [backend/src/services/sceneGenerator/contextSection.js](../../backend/src/services/sceneGenerator/contextSection.js) — formats `assembleContext` output into the prompt suffix
- [backend/src/services/sceneGenerator/inlineKeys.js](../../backend/src/services/sceneGenerator/inlineKeys.js) — `getInlineEntityKeys` skips entities already inlined in the system prompt's "Key NPCs / Active Quests / Already Discovered" section

## Stage 1 — intent classification

`classifyIntent(playerAction, { isFirstScene, dmSettings, signal })`:

1. **Heuristic layer** (free, synchronous). Structured action markers are handled by regex:
   - `[ATTACK: NpcName]` → `{expand_npcs: [name], _intent: 'combat'}`
   - `[INITIATE COMBAT]` → `{_intent: 'combat'}`
   - `[TALK: NpcName]` → `{expand_npcs: [name], _intent: 'talk'}`
   - Trade keywords (kupuj/sprzedaj/handluj/buy/sell/...) → `{_tradeOnly: true}` (short-circuits to trade shortcut in `generateSceneStream`)
   - Combat keywords via `detectCombatIntent` from `shared/domain/combatIntent.js`
2. **Nano model fallback** (`callNanoOpenAI` or `callNanoAnthropic`). Freeform player text with no structured marker goes to the nano model, which returns a JSON selection result.

### Selection result shape

```js
{
  expand_npcs: ['Bjorn', 'Elara'],      // which NPCs to inline
  expand_quests: ['Lost Relic'],         // which quests to expand
  expand_location: true,                 // include full location context
  expand_codex: ['dragon-lore'],         // codex entries
  needs_memory_search: true,             // trigger vector search
  memory_query: 'dragon attack village', // query string if search needed
  roll_skill: 'Perception',              // skill check if detected
  roll_difficulty: 'medium',             // difficulty tier
  _intent: 'explore',                    // meta — debug only
  _tradeOnly: false                      // meta — trade shortcut flag
}
```

## Stage 2 — `assembleContext`

```js
const ctx = await assembleContext(campaignId, selectionResult, currentLocation, skipKeys);
```

Runs **parallel** DB fetches (`Promise.all`) for exactly the categories the selection asked for:

- `expand_npcs` → `prisma.campaignNPC.findMany({where: {name: {in: ...}}})`
- `expand_quests` → `prisma.campaignQuest.findMany`
- `expand_location` → `getLocationSummary(currentLocation)` (already-compressed nano summary)
- `expand_codex` → `prisma.campaignCodex.findMany`
- `needs_memory_search` → `searchCampaignMemory(memory_query)` (Atlas Vector Search via `mongoNative.js`)

`skipKeys` avoids duplicating entities already inlined in the system prompt's static sections — computed by `getInlineEntityKeys`.

## Memory compression

Runs **after** the scene completes (best-effort, fire-and-forget):

- **`compressSceneToSummary(scene, coreState)`** — nano extracts 3-7 key facts from the scene narrative, appends to running facts list. **Hard cap: 15 facts per campaign** — stable input size (~7k tokens) regardless of campaign length. `Why 15`: past this cap, fact retention doesn't improve — nano drops the oldest facts naturally, and per-scene cost is <1¢.
- **`generateLocationSummary(locationName)`** — triggers on location change. Nano summarizes everything known about the new location into a terse block cached in `CampaignKnowledge`.
- **`checkQuestObjectives(scene, activeQuests)`** — nano classifies whether any active quest objective was fulfilled by the scene's events. Emits `quest_nano_update` SSE event when matches found.

All three: silent on nano timeout, return empty/null.

## Why no token budget enforcement yet

`assembleContext()` does not count tokens before building the context block. In practice:

- Heuristic intent caps `expand_npcs` at the names in the action
- `expand_codex` + `expand_quests` are capped in the nano prompt itself (max 3 each)
- Memory search is capped at top-5 results by Atlas Vector Search score
- `getInlineEntityKeys` prevents duplicates with the system prompt

Net effect: total prompt stays in the ~3.5-7k token range for typical scenes. A runaway selection could blow past that, but hasn't happened in practice. **Add explicit budget enforcement if scenes start hitting model context limits or cost spikes**.

## Legacy tool-use loop

`aiContextTools.js` also exports `CONTEXT_TOOLS_OPENAI` / `CONTEXT_TOOLS_ANTHROPIC` — tool definitions for the older AI→tool→AI function calling loop. **Not used by the current scene-gen pipeline** but kept around because a few non-scene paths (campaign creation, recap generation) still use it. When refactoring, preserve the exports.

## When debugging context issues

1. **"AI doesn't know about NPC X."** Check `selectionResult.expand_npcs` — did intent classifier name them? If not, the heuristic missed and nano didn't detect. Add a test case to `classifyIntentHeuristic` or tune the nano prompt.
2. **"AI repeats info that's already in the system prompt."** `skipKeys` isn't filtering enough. `getInlineEntityKeys` only knows about the static "Key NPCs / Active Quests / Already Discovered" section — if the system prompt inlined more, extend it.
3. **"Scene cost exploded."** `assembleContext` fetched too much. Check logs for selection result size. Could be a runaway `memory_query` (vector search returns unexpectedly large docs).
4. **"Nano intent classifier returned garbage."** Its prompt is inline in `intentClassifier.js`. Nano JSON parse failure falls back to `emptySelection()` — the scene still generates, just without the targeted context.

## Related

- [scene-generation.md](scene-generation.md) — the orchestrator that drives this
- [decisions/two-stage-pipeline.md](../decisions/two-stage-pipeline.md) — context selection vs tool calling
- [decisions/embeddings-native-driver.md](../decisions/embeddings-native-driver.md) — why Atlas Vector Search needs native BSON
