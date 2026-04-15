# Decision — Two-stage pipeline (context selection over tool calling)

## Context

The AI needs campaign-specific context to generate a good scene: current NPCs, active quests, location details, codex entries, past events via semantic search. A naïve approach stuffs everything into the prompt (10-30k tokens, expensive + slow, tokens compete for the model's attention). Another common approach lets the model call tools in a loop — one call asks for context, the model decides what it needs, tool call returns the data, model calls again.

## Options considered

### A) Kitchen-sink prompt

Load the full campaign state — all NPCs, all quests, all codex, all scene history — into every prompt.

- ✓ Model always has everything it might need
- ✓ Zero pipeline complexity
- ✗ 15-30k tokens per scene (expensive; worse at long campaigns)
- ✗ Attention dilution — the model buries important signal in noise
- ✗ Fact consistency degrades as the prompt grows
- ✗ Scales with campaign length in exactly the wrong direction

Fatal at ~20 scenes in.

### B) AI-driven tool calling loop

Model sees a thin prompt with tool definitions (`search_memory`, `get_npc`, `get_quest`, etc.). Model decides what it needs, calls tools, reads results, calls more if needed, eventually emits the scene.

- ✓ Model dynamically fetches only what it needs
- ✓ Terse base prompt
- ✗ Multiple round-trips per scene (latency + cost multiplier)
- ✗ Tool-call overhead adds 2-5s per scene
- ✗ Model sometimes forgets to call tools, or calls the wrong one, or calls in a wasteful order
- ✗ Harder to debug — loop can branch differently each run
- ✗ Premium model cost on bulk selection work

The legacy tool-use loop in `aiContextTools.js` still exists (kept for some non-scene paths like campaign creation) but was NOT the right shape for the hot scene-gen path.

### C) Two-stage pipeline: nano selects, code assembles — CHOSEN

Stage 1: a **nano model** (gpt-5.4-nano / gpt-4.1-nano / Haiku 4.5) reads the player action and emits a structured selection result: which NPCs to expand, which quests to fetch, whether to run a memory search, etc. Nano is cheap enough to run once per scene without thinking about cost.

Stage 2: backend code reads the selection result and runs **parallel DB fetches** for exactly the categories nano asked for. No more loops, no more guessing. One big premium model call with the assembled context.

```
Player action
  → classifyIntent (nano)          ← Stage 1: what context is needed?
  → assembleContext (code)         ← Stage 2: fetch exactly that
  → runTwoStagePipelineStreaming   ← one premium call, ~3.5-7k tokens
```

- ✓ Cheap: nano cost is a rounding error (~$0.0001/call at Tier 3+)
- ✓ Fast: no round-trips during scene gen — nano decides up front, DB fetches run in parallel
- ✓ Bounded prompt size: selection caps (max 3 NPCs, max 3 quests, etc.) keep total tokens in ~3.5-7k range
- ✓ Debuggable: nano's selection output is logged as one JSON blob
- ✓ Mechanical validation possible: can add a rule-based layer that ensures required entities are always expanded (e.g. "always expand current location NPCs")
- ✗ Nano model misses ~20% of edge cases — caught by the pre-rolled dice fallback and heuristic intent layer ([concepts/rpgon-mechanics.md](../concepts/rpgon-mechanics.md))
- ✗ Requires two model calls per scene instead of one — but nano cost is negligible

### D) Heuristic regex only

For structured markers (`[ATTACK:X]`, `[TALK:Y]`), regex alone is enough — no nano call needed.

- ✓ Zero cost
- ✓ Zero latency
- ✗ Only catches ~70% of action types (structured markers + a few keywords)
- ✗ Freeform player text needs nano

**Hybrid chosen:** heuristic regex runs first (free), nano runs only when the heuristic doesn't match. See `classifyIntentHeuristic` in [intentClassifier.js](../../backend/src/services/intentClassifier.js).

## Current design principles

1. **Context selection over tool calling.** Nano decides, backend assembles, premium call runs once.
2. **Game state over history.** Structured state (current character, combat, quests) over raw scene history. Reduces tokens and improves consistency.
3. **Memory compression.** Nano extracts key facts after each scene. Running facts capped at 15 per campaign — stable input size regardless of campaign length. Full scene history NOT in the prompt; recent compressed summaries are.
4. **Nano for planning.** Cheap/fast model handles intent classification, fact extraction, quest objective checks, skill check inference. Nothing quality-sensitive.
5. **Tool-use is a fallback.** Legacy tool-use loop exists but the two-stage pipeline is primary.

## Don't

- **Don't re-introduce a full tool-use loop on the scene-gen hot path.** It's measurably slower, more expensive, and harder to debug.
- **Don't let context assembly run sequential queries.** `assembleContext` uses `Promise.all`. Adding a new expansion category? Add it to the parallel fetch, not as a sequential step.
- **Don't expand the running-facts cap beyond 15** without profiling. Nano drops the oldest facts naturally; past 15 facts, retention doesn't improve but input size grows linearly.

## Related

- [concepts/scene-generation.md](../concepts/scene-generation.md) — the orchestrator that drives this
- [concepts/ai-context-assembly.md](../concepts/ai-context-assembly.md) — the implementation details
- [concepts/model-tiering.md](../concepts/model-tiering.md) — why nano is cheap enough to run on every scene
