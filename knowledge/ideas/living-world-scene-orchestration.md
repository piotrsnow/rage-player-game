# Idea — Living World scene orchestration (DM + agent NPC reactions)

## What it is

The "wow" part of Phase 4 from the Living World plan. Instead of premium
scene-gen writing NPC dialog directly, it emits **directives** (intent +
direction + ordering hint) for agent NPCs. After premium inference completes,
a backend orchestrator fires **parallel standard-tier calls**, one per agent
NPC, so each authors their own line. The SSE stream stays open while these
calls fire — progressive reveal:

1. **Round 1 — premium scene-gen.** Output changes shape when
   `livingWorldEnabled && hasAgentNpcsInScene`: includes an
   `agent_reactions_block: { trigger_context, agent_directives }` and a
   `proposed_state_changes` object (items, mood shifts, etc. the DM wants
   to commit on NPCs' behalf, subject to their approval).
2. **Round 2 — parallel agent NPC calls.** One standard-tier call per agent
   directive. Each NPC approves/rejects/modifies the DM's proposals and adds
   their own proactive actions. Backend emits SSE `agent_thinking { speakerId }`
   per NPC (spinners), then `agent_dialog { speakerId, text, ordering_hint }`
   as each completes — not blocking on the others.
3. **Round 3 — deterministic backend stitch.** Wait for all parallel calls,
   reconcile DM proposals vs agent responses, aggregate final state changes,
   persist WorldEvents with per-NPC attribution, emit SSE `state_changes`
   (final aggregated) + `scene_complete` → close stream.

Two buffers (critical invariant):

- **Public buffer** (streamed → FE progressively): `dice_rolls`, narration
  chunks, scripted dialog, `agent_thinking`, `agent_dialog`, final
  `state_changes`, `scene_complete`.
- **Internal buffer** (backend only, never emitted): DM raw proposals, agent
  raw responses, reconciliation deltas, validation diagnostics, retry state.

Item authority rule:

- `stateValidation` rejects `give_item` entries that lack `fromNpcId` whenever
  `livingWorldEnabled`. Items from scripted NPCs use scripted authority;
  items from agent NPCs require approval in Round 2.

## Why it's not adopted now

- **No playtesters.** Perceived latency is the single biggest UX risk — main
  narration at ~3s, agent reactions at ~4-5s — and there's no way to validate
  "does the stall feel dramatic or feel broken?" without a real user.
- **It's the largest change to the scene-gen pipeline.** `generateSceneStream`,
  `systemPrompt` RESPONSE FORMAT, `stateValidation`, SSE lifecycle in
  `writeSseHead` callers — all touched. Easy to regress non-living-world
  scenes if wiring is sloppy.
- **Agent NPC system prompts aren't designed yet.** Each NPC needs a cached
  personality prefix + filtered knowledge + outbox overlay (companions only).
  That's a prompt-engineering pass we don't want to do blind.

Phase 4 scoped (shipped 2026-04) delivered:

- `CampaignDmAgent` schema + `dmMemoryService` + `dmMemoryUpdater` (nano
  post-scene summary of what DM planned/introduced/is waiting on)
- DM memory + pending hooks injection into the Living World context block
- Conditional hint in system prompt: "when NPC gives item, tag `fromNpcId`"
- `WorldEvent.item_given` ledger entry in `processStateChanges` when
  `fromNpcId` is present — observability only, no validation gate yet

So the data path for NPC-as-giver exists; flipping on orchestration adds the
agent-dialog round without schema changes.

## When it becomes relevant

Adopt when all of:

1. **≥1 playtester confirms** they want NPCs to "talk in their own voice"
   more than the current premium-writes-everything flow.
2. **DM memory is visibly useful** — playtester reports DM correctly calling
   back to an earlier plan without being manually reminded. Signals the
   continuity plumbing works before layering orchestration on top.
3. **Latency budget can be tested.** FE shows narration streaming early;
   stall between narration-complete and final `state_changes` is ≤1.5s with
   2 agent NPCs in scene.

## Sketch

### Modified scene-gen output (conditional)

```json
{
  "diceRolls": [...],
  "narrative": "Bjorn pochyla się nad mapą...",
  "dialogueSegments": [
    { "speakerId": "barmaid", "speakerType": "scripted", "text": "Czego życzysz?" }
  ],
  "agent_reactions_block": {
    "trigger_context": "Player asked about mountain pass. Bjorn + Kiera present.",
    "agent_directives": [
      { "speakerId": "bjorn", "intent": "react_to_mountain_topic",
        "direction": "Osobiste — wspomnienie zaginionej siostry.",
        "ordering_hint": "first" },
      { "speakerId": "kiera", "intent": "offer_map",
        "direction": "Wtrąć z ofertą mapy za 50 ZK.",
        "ordering_hint": "after_bjorn" }
    ]
  },
  "proposed_state_changes": {
    "items_to_give": [
      { "fromNpcId": "kiera", "item": "mountain map", "conditional": "if player accepts" }
    ]
  }
}
```

### Orchestrator skeleton

```js
// backend/src/services/livingWorld/sceneOrchestrator.js
export async function orchestrateAgentReactions({
  campaignId, sceneParsed, sseEmit, npcDialog, timeoutMs = 3000,
}) {
  const directives = sceneParsed.agent_reactions_block?.agent_directives || [];
  if (directives.length === 0) return { agentContributions: [] };

  // Signal each agent is thinking
  for (const d of directives) sseEmit('agent_thinking', { speakerId: d.speakerId });

  // Parallel standard calls. Each resolves independently → stream out of order.
  const settled = await Promise.allSettled(
    directives.map(async (d) => {
      const result = await Promise.race([
        npcDialog({ campaignId, worldNpcId: d.speakerId, intent: d.intent, direction: d.direction }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
      sseEmit('agent_dialog', {
        speakerId: d.speakerId,
        text: result.dialog,
        ordering_hint: d.ordering_hint,
        approvesProposals: result.approvesProposals || [],
        rejectsProposals: result.rejectsProposals || [],
        proactiveActions: result.proactiveActions || [],
      });
      return { speakerId: d.speakerId, ...result };
    }),
  );

  // Timeouts → fallback emitted but marked
  const agentContributions = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : (sseEmit('agent_dialog', {
          speakerId: directives[i].speakerId,
          text: '[NPC milczy w zamyśleniu]',
          fallback: true,
        }),
        { speakerId: directives[i].speakerId, fallback: true }),
  );

  return { agentContributions };
}
```

### stateValidation hardening

```js
// shared/domain/stateValidation.js — add when livingWorldEnabled:
function validateItemAttribution(newItems, corrections) {
  for (const item of newItems || []) {
    if (!item.fromNpcId && !item.fromSource) {
      corrections.push(`Item "${item.name}" rejected: no fromNpcId/fromSource`);
      // drop or quarantine
    }
  }
}
```

### SSE lifecycle change

The route handler currently emits `scene_complete` as soon as premium
finishes. Orchestration requires:
- keep stream open after premium-done
- emit `agent_thinking`/`agent_dialog` progressively
- emit **final** `state_changes` only after Round 3 reconciliation
- only then `scene_complete` + close

FE side: `useSceneGeneration` needs to handle `agent_*` events and render
progressively. Not complex, but every SSE consumer changes.

## Related

- [knowledge/patterns/sse-streaming.md](../patterns/sse-streaming.md) — MANDATORY read before touching SSE lifecycle
- [knowledge/decisions/two-stage-pipeline.md](../decisions/two-stage-pipeline.md) — constraint: no tool-use loop on hot path. Orchestration must stay one-shot per round.
- `backend/src/services/livingWorld/dmMemoryService.js` — Phase 4 scoped (continuity plumbing already in place)
- `backend/src/services/livingWorld/companionService.js` — `getCompanions` already returns the dialogHistory the orchestrator would pass to per-NPC calls
- Plan: `plans/siemanko-chyba-znowu-nie-lucky-flask.md` — Phase 4 full spec

## Source

Phase 4 of the Living World plan. Deferred 2026-04 in favor of shipping the
DM continuity plumbing (memory + hooks + item ledger) that it layers on.
