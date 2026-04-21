# Idea — autonomous NPCs (background agent loops)

> **Status (2026-04):** PARTIAL realized. Phase 5 ships on-demand nano
> ticks (`npcAgentLoop.runNpcTick`) with `activeGoal` + `goalProgress`
> data model, quest-driven goal assignment, and background sideways
> goals. Event-driven global triggers (`globalNpcTriggers`) replace the
> naive per-scene scan. Clone separation (`CampaignNPC.worldNpcId` +
> `cloneReconciliation`) keeps costs flat under concurrent campaigns.
>
> Full Cloud Tasks dispatcher (NPCs tick offline without any active
> scene) is still deferred — see
> [living-world-npc-auto-dispatch.md](./living-world-npc-auto-dispatch.md).
> Scene orchestration round (parallel NPC reactions post-narration) is
> also deferred — see
> [living-world-scene-orchestration.md](./living-world-scene-orchestration.md).
>
> Canonical docs: [../concepts/living-world.md](../concepts/living-world.md),
> [../concepts/npc-clone-architecture.md](../concepts/npc-clone-architecture.md).

## What it is

Each NPC becomes an agent with a persistent goal, its own tool set, and a scheduler that ticks it forward in game-time independently of the player. The merchant actually runs out of stock. The bandit gang actually moves between hideouts. The rival adventurer progresses through the dungeon the player is also exploring. When the player meets an NPC, the NPC's state reflects what happened in the background.

## Why it's not adopted now

Every piece touches something we don't have:

- **No persistent goals.** `CampaignNPC` has personality/faction/disposition but no `activeGoal` or `goalProgress`.
- **No per-NPC scheduler.** BullMQ drives scene/campaign gen, not NPC ticks.
- **No agent loop infrastructure.** AI pipeline is strictly single-shot.
- **State reconciliation is hard.** When the player meets an NPC whose goal progressed offscreen, the narrative has to explain it believably without spoiling things the NPC shouldn't volunteer.

Multi-week design+implementation, not hours.

## When it becomes relevant

Adopt when at least two of these are true:

1. **Players complain that the world feels static** — "NPCs just stand around waiting for me."
2. **Main questline narrative demands it** — e.g. a rival party is supposed to be progressing alongside the player.
3. **Async tool pattern is already in place** ([async-tool-pattern.md](async-tool-pattern.md)) — without it, NPC ticks serialize into a queue and scale poorly.

## Sketch

### Data model

```prisma
model CampaignNPC {
  // ... existing fields
  activeGoal        String?
  goalProgress      String?   // JSON: { step, milestones[], lastAction, lastLocation }
  lastTickAt        DateTime?
  tickIntervalHours Int       @default(24)
}
```

### Scheduler

BullMQ repeatable job (every 5 min real time) queries NPCs whose `lastTickAt + tickIntervalHours` (in game-time) has elapsed, enqueues one `npc-tick` job per NPC.

### Agent loop

```js
async function runNpcTick(npcId) {
  const npc = await loadNpc(npcId);
  const systemPrompt = `You are ${npc.name}, ${npc.role}. Goal: ${npc.activeGoal}.
    Current state: ${JSON.stringify(npc.goalProgress)}.
    Call ONE tool: move_to, interact_with, update_progress, finished.`;

  const tool = await callNanoWithTools(systemPrompt, npc.context, NPC_TOOLS);
  await applyTool(npc, tool);
  await recordProgressEvent(npc, tool);
}
```

### State reconciliation on next encounter

Scene prompt includes: NPC's current location, a terse summary of what they did in the interval, updated `goalProgress`. The scene generator decides how much to reveal through dialogue/observation.

## Open questions

1. **Game-time vs real-time cadence.** Wall-clock minutes, player-scene advancement, or narrative day changes?
2. **Player-adjacent NPCs.** Should NPCs in the player's current scene skip background ticks?
3. **Goal lifecycle.** Who sets NPC goals — campaign author, scene generator, or the NPC at creation time?
4. **Budget ceiling.** 20 NPCs × 1 nano call every 5 min = ~8 nano calls/min per campaign. OK at Tier 3+ but needs graceful degradation.
5. **Narrative coherence.** If an NPC's background goal contradicts player plans, whose story wins?

## Source

`pipecat-ai/gradient-bang` — `npc-run <id> "goal text"` CLI with 100-iteration/3-error/explicit-finished guards.
