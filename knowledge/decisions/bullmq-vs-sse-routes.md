# Decision — BullMQ + pub/sub bridge for long AI calls

## Context

AI calls that take 10-200s need to stay responsive. The frontend wants progressive output (streaming narrative, early dice reveals, partial JSON for image preload). The backend wants backpressure, retry semantics, and observability under spike load. These two sets of requirements are in tension — streaming is UX-driven, queueing is infra-driven.

## Options considered

### A) Plain Fastify route, synchronous

The simplest approach: a normal POST handler that calls the provider, awaits the response, returns JSON. Works for sub-10s calls.

- ✓ Zero infrastructure — no queue, no Redis, no worker
- ✓ Easy to debug
- ✗ No concurrency cap — 100 concurrent users = 100 simultaneous upstream calls = thundering-herd 429 cascades
- ✗ No progressive output; client spinner-only until the full response arrives
- ✗ No retry semantics beyond what the caller implements
- ✗ No observability

Fine for the three single-shot endpoints (`/combat-commentary`, `/verify-objective`, `/generate-recap`) — they finish in 2-5s and aren't user-interactive. Not fine for scene generation or campaign creation.

### B) Inline SSE (hijack + raw writes)

Keep the request synchronous on the HTTP side but stream chunks via SSE as the upstream provider emits them.

- ✓ Progressive streaming UX preserved
- ✓ No extra infrastructure
- ✗ No concurrency cap — same thundering herd problem as (A)
- ✗ No retry semantics
- ✗ No observability
- ✗ Each request holds a raw socket + a subscriber on the Node process; crash loses everything

Good as a **fallback** when Redis is unavailable (dev/CI), but lacks the throttling needed at scale.

### C) BullMQ + `/ai/jobs/:id` poll-only

Enqueue the job, return `202 { jobId }`, client polls. Worker calls upstream and stores `returnvalue` in the job.

- ✓ Concurrency cap, FIFO fairness, retry + backoff, bull-board observability
- ✗ **Progressive output completely lost.** A 60-200s campaign-creator call with spinner-only UX kills the user experience — the first scene used to appear progressively in ~15s, now the user stares at nothing until everything completes.

Tried this and reverted it. The first revert was misdiagnosed as "BullMQ doesn't work for streaming" — the actual root cause was the missing pub/sub bridge. Queueing was fine; the problem was losing the event stream between worker and client.

### D) BullMQ + Redis pub/sub bridge + SSE to the client — CHOSEN

Worker publishes every event to `scene-job:<jobId>:events`. The HTTP handler subscribes to the channel **before enqueuing the job** (pre-generated `jobId`) and forwards every pub/sub message verbatim as an SSE `data:` frame.

- ✓ Concurrency cap + FIFO + retry + observability from BullMQ
- ✓ Byte-identical progressive streaming UX vs inline SSE — frontend sees the same event sequence
- ✓ Graceful fallback to inline SSE when `isRedisEnabled()` is false
- ✗ More complex — two layers (queue + pub/sub)
- ✗ Requires Redis to get the benefits; inline SSE is strictly worse at scale

**This is the shape both `/generate-scene-stream` and `/generate-campaign` use today.**

## Current rule

| Scenario | Shape |
|---|---|
| Streaming output required + Redis available | **BullMQ + pub/sub bridge + SSE**, with inline SSE fallback when Redis off |
| Streaming output required + no Redis | **Inline SSE only** (same code path as the fallback) |
| No streaming, background/near-instant | **BullMQ + `/ai/jobs/:id` poll** |
| Sub-10s synchronous | **Plain Fastify route**, no queue |

## Why queueing even with streaming

The BullMQ layer adds four things inline SSE alone can't:

1. **Concurrency cap + backpressure.** Per-provider queue concurrency (default 100 for text providers) gives natural backpressure under spike loads. A 100-user simultaneous campaign creation hits OpenAI as a controlled stream of 100 in-flight requests, not 100 racing to the API. At Tier 3+ (5000 RPM per model), concurrency 100 uses ~2% of the RPM budget.
2. **Fair FIFO queueing.** When saturated, BullMQ processes jobs in arrival order. Inline SSE has no queue — whoever wins the race to the provider gets the next slot randomly.
3. **Retry semantics.** 3 attempts with exponential backoff for transient provider failures. Inline SSE propagates errors immediately.
4. **Observability via bull-board.** `/v1/admin/queues` shows queue depth, in-flight jobs, completed history, failed reasons. Inline SSE is invisible until it breaks loudly.

## Don't

- **Don't ship a new streaming route without copying the pre-generated jobId + subscribe-before-enqueue pattern** from [ai.js](../../backend/src/routes/ai.js). The ordering is load-bearing — a subscribe-after-publish race drops early events. See [patterns/bullmq-queues.md](../patterns/bullmq-queues.md).
- **Don't poll-only anything user-facing that takes >10s.** Spinner-only UX is a product killer for interactive flows.
- **Don't remove the inline SSE fallback path.** Dev/CI without Redis still needs a working stream. Keep both paths under a single `if (isRedisEnabled())` branch.
- **Don't use Anthropic Message Batches API for interactive flows.** Batch API is asynchronous (5-30 min, no streaming) — fine for background workloads (daily recap emails, bulk classification) but a UX regression for anything where the user is waiting.
- **Don't lower concurrency below 25 for text providers** unless explicitly testing backpressure. Default 100 reflects the I/O-bound nature of these jobs and stays well within Tier 3+ provider RPM budgets.

## Future optimization candidates (out of scope today)

- **Anthropic Message Batches API for non-interactive workloads.** 50% cost discount for accepting 5-30 min async latency. Use cases: daily recap emails, background template campaigns, offline evaluation pipelines. Pick this up only when a non-interactive workload appears on the roadmap.
- **Per-job-kind queue split** (dedicated `ai-campaigns` parallel to `ai-openai`) — would isolate campaign generation from scene generation so a campaign spike can't starve in-game scene gen. Cost: doubles bull-board complexity, loses per-provider failure isolation. Not worth it until starvation actually happens.

## Related

- [patterns/sse-streaming.md](../patterns/sse-streaming.md) — `writeSseHead` invariants (hijack, identity, manual CORS, setNoDelay)
- [patterns/bullmq-queues.md](../patterns/bullmq-queues.md) — per-provider split, pub/sub bridge, concurrency tuning rationale
- [concepts/scene-generation.md](../concepts/scene-generation.md) — the primary consumer
