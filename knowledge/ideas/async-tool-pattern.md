# Idea — async tool pattern (non-blocking tool execution)

## What it is

When an LLM invokes a tool, the handler returns immediately with `{status: "pending", taskId}` instead of blocking on the real result. The actual result arrives later as an `<event name=tool.complete>...</event>` block injected into the LLM's context on the next inference step.

Decouples **LLM inference latency** from **tool execution latency**. Also prevents the hallucination mode where the model says "I guess the move worked" because the synchronous tool result hasn't returned yet.

## Why it's not adopted now

Our scene generation is a single-shot pipeline: player action → one scene → done. There's no agent loop to decouple from. The legacy tool-use loop in [aiContextTools.js](../../backend/src/services/aiContextTools.js) is synchronous and that's fine for context assembly.

## When it becomes relevant

Adopt this pattern if/when any of these appear:

1. **Autonomous NPCs** ([autonomous-npcs.md](autonomous-npcs.md)) — NPCs with persistent goals running agent loops need non-blocking tool execution to be practical.
2. **Long-running campaign tasks** — e.g. "generate 10 quests in background and notify when ready". A blocking tool handler would tie up the agent for minutes.
3. **Parallel tool calls** — if we ever let the premium model call 3+ tools in one scene (expand location + search memory + roll dice), async tool returns would let them overlap.

## Sketch

```js
function moveNpc(npcId, destination) {
  const taskId = uuid();
  queue.enqueue('npc-move', { npcId, destination, taskId });
  return { status: 'pending', taskId };
}

// BullMQ worker processes the move, emits progress events:
publishEvent(taskId, { type: 'movement.complete', data: { location } });

// Agent loop subscriber buffers events into the next system prompt:
pubsub.subscribe(`agent:${agentId}:events`, (event) => {
  contextBuffer.push(`<event name="${event.type}">${JSON.stringify(event.data)}</event>`);
});
```

Would reuse [patterns/bullmq-queues](../patterns/bullmq-queues.md) for the queue infrastructure and the pub/sub bridge shape already used by scene-gen.

## Source

`pipecat-ai/gradient-bang` — their task agent returns `{"status": "Executed."}` and streams the real outcome via event blocks.
