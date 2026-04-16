# Idea — declarative event routing

## What it is

Each event type has a config entry that describes:

- **AppendRule** — who (which agent contexts) gets this event appended
- **InferenceRule** — does this event trigger a new LLM inference, or just update state silently
- **Priority** — HIGH (combat, player action) vs LOW (ambient status) — feeds batching decisions
- **Formatter** — produces a terse one-line summary for LLM context injection

Dispatch is config-lookup, not `if-else` cascade. Adding a new event type = one config entry; removing = deleting the entry.

## Why it's not adopted now

We have 7 SSE event types hardcoded in [generateSceneStream.js](../../backend/src/services/sceneGenerator/generateSceneStream.js):

- `intent` — after intent classifier
- `context_ready` — after DB assembly
- `dice_early` — nano resolved a dice roll
- `chunk` — streaming narrative chunks
- `complete` — final scene data
- `error` — structured error with code
Each event is emitted from exactly one place that knows when it should fire. For 6 types, a procedural approach is cleaner than a config table.

## When it becomes relevant

Adopt when the trigger is **"I have to edit 5 different places to add this event type."** Usually driven by:

1. **Multiplayer** — per-player action events, turn notifications, character-state sync
2. **Idle world events** — NPC movements, faction changes, weather shifts, scheduled quest ticks
3. **Combat tick events** — if we move combat from one-shot resolve to real-time
4. **NPC lifecycle events** — spawn, goal-updated, interacted-with, despawn

Rough threshold: 15+ event types, or the first time adding one event requires touching 4+ files.

## Sketch

```js
const EVENT_CONFIGS = {
  dice_early: {
    priority: 'high',
    appendTo: 'player_view',
    triggerInference: false,
    format: (e) => `[Dice: ${e.skill} → ${e.result}]`,
  },
  npc_movement: {
    priority: 'low',
    appendTo: 'world_context',
    triggerInference: false,
    format: (e) => `[NPC ${e.npcName} moved to ${e.destination}]`,
  },
  player_action: {
    priority: 'high',
    appendTo: 'all',
    triggerInference: true,
    format: (e) => `[Player: ${e.action}]`,
  },
};

function dispatchEvent(type, payload) {
  const cfg = EVENT_CONFIGS[type];
  if (!cfg) throw new Error(`Unknown event type: ${type}`);
  const line = cfg.format(payload);
  appendToContext(cfg.appendTo, line);
  if (cfg.triggerInference) queueInference(cfg.priority);
  emitSSE({ type, payload });
}
```

## Related

- [deferred-event-batching](deferred-event-batching.md) — the `Priority` field here feeds batching decisions there

## Source

`pipecat-ai/gradient-bang` — `event_relay.py` with `EventConfig` dataclasses.
