# Idea — deferred event batching

## What it is

When multiple events arrive in a short window (~500-1500ms), coalesce them into a single batch before triggering an LLM inference. Prevents thrashing when 5 events fire in 100ms.

Key parts:

- **Debounce window** — typically 500-1500ms
- **Batch formatter** — terse summary of all events, not one-by-one
- **Immediate flush for high priority** — combat / player action bypass the window
- **Buffer size ceiling** — flush early if N events accumulate before the window expires

## Why it's not adopted now

Scene generation is single-shot: player action → one scene → done. Zero event thrashing. The SSE events we emit (`intent`, `dice_early`, `chunk`, `complete`) are one-way server→client and don't feed back into another LLM call. Nothing to batch.

## When it becomes relevant

Adopt when any of these ship:

1. **Idle world events** — NPCs act in the background, emit state-change events that should reach the player via narrative. Multiple events in a few seconds should batch into one scene hook.
2. **Multiplayer action queueing** — 3 players submit actions in a 100ms window, the scene should consider all 3 together (not generate 3 scenes).
3. **Combat tick stream** — real-time combat with per-tick events; a 500ms debounce prevents one narration per tick.

## Sketch

```js
class EventBatcher {
  constructor({ windowMs, maxBufferSize, onFlush }) {
    this.buffer = [];
    this.flushTimer = null;
    this.windowMs = windowMs;
    this.maxBufferSize = maxBufferSize;
    this.onFlush = onFlush;
  }

  push(event) {
    if (event.priority === 'high') {
      this.flush();
      this.onFlush([event]);
      return;
    }
    this.buffer.push(event);
    if (this.buffer.length >= this.maxBufferSize) return this.flush();
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.windowMs);
    }
  }

  flush() {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    this.onFlush(batch);
  }
}
```

Lives in room manager / multiplayer coordinator when adopted.

## Related

- [declarative-event-routing](declarative-event-routing.md) — `Priority` here is the same field
- [autonomous-npcs](autonomous-npcs.md) — idle world events are the main driver

## Source

`pipecat-ai/gradient-bang` — `event_relay.py` debouncing behavior.
