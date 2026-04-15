# Decision — BullMQ queue vs inline SSE for long AI calls

**Latest revision:** 2026-04-15 (post compress removal + concurrency re-evaluation)

## Current rule

For long-running AI calls (anything that takes >10s):

1. **Streaming progressive output required + Redis available** → **BullMQ + Redis pub/sub bridge**, with inline SSE fallback when Redis is disabled. Both `/generate-campaign` and `/generate-scene-stream` follow this shape.
2. **Streaming output required + no Redis** → inline SSE only. Same code path serves as the fallback for #1.
3. **No streaming required (background or near-instant batch result)** → BullMQ + `/ai/jobs/:id` polling.
4. **Sub-10s synchronous AI calls** → plain Fastify route, no queue. The three single-shot endpoints from the no-BYOK cleanup (`/combat-commentary`, `/verify-objective`, `/generate-recap`) live here.

The current setup: **both** `/generate-campaign` and `/generate-scene-stream` use BullMQ + pub/sub bridge with inline SSE fallback. Same pattern, same `writeSseHead` helper, same subscribe-before-enqueue ordering, same cleanup discipline. The only differences are the channel helper name (`campaignJobChannel` vs `sceneJobChannel`), the underlying generator function (`generateCampaignStream` vs `generateSceneStream`), and the safety timeout (8min vs 5min — campaigns can spike longer on Anthropic premium with full sceneGrid).

## Why the queue path matters even with streaming

The BullMQ layer adds four things that inline SSE can't provide:

1. **Concurrency cap + backpressure.** Per-provider queue concurrency (default 100 for text providers, env-tunable per [config.js](../../backend/src/config.js) `aiQueueConcurrency`) gives natural backpressure under spike loads. A 100-user simultaneous campaign creation hits OpenAI as a controlled stream of 100 in-flight requests, not 100 racing to the API. Inline SSE has no such cap — every concurrent request immediately calls the provider, which tends to trip rate limits and produce thundering-herd 429 cascades.
2. **Fair FIFO queueing.** When concurrency is saturated, BullMQ processes jobs in arrival order. Inline SSE has no queue at all — whoever wins the race to the provider gets the next slot, randomly.
3. **Retry semantics.** Default 3 attempts with exponential backoff for transient provider failures. Inline SSE just propagates the error to the client.
4. **Observability via bull-board.** `/v1/admin/queues` shows queue depth, in-flight jobs, completed history, failed reasons. Inline SSE is invisible until something breaks loudly.

The pub/sub bridge means none of this comes at the cost of streaming UX — the FE sees byte-identical event streams (`chunk`, `complete`, `error`) before and after the queue migration.

## What not to do

- **Don't ship a new streaming route without copying the pre-generated jobId + subscribe-before-enqueue pattern** from [ai.js](../../backend/src/routes/ai.js). The ordering is load-bearing — see [[../patterns/bullmq-queues#pre-generated-jobid-pattern]]. Any deviation introduces a subscribe-after-publish race that drops early events.
- **Don't poll-only anything user-facing that takes >10s.** Spinner-only UX is a product killer for interactive flows. The 2026-04-15 revert (see history below) was the lesson learned.
- **Don't remove the inline SSE fallback path** from the streaming routes. Dev/CI without Redis still needs a working stream. Keep both paths under a single `if (isRedisEnabled())` branch.
- **Don't use Anthropic Message Batches API for interactive flows.** Batch API is asynchronous (5-30 min latency, no streaming) — fine for background workloads (daily recap emails, bulk classification) but a UX regression for any flow where the user is waiting for results. See "Future optimization candidates" below.
- **Don't lower concurrency below 25 for text providers** unless explicitly testing backpressure. Default 100 reflects the I/O-bound nature of these jobs and is well within Tier 3+ provider RPM budgets. Concurrency 4 (the historical default) translates to a 25-minute tail for a 100-user spike with no upside.

## Future optimization candidates (out of scope today)

- **Anthropic Message Batches API for non-interactive workloads.** Daily recap email generation, background pre-computation of template campaigns, bulk classification, offline evaluation pipelines. 50% cost discount for accepting 5-30 min async latency. Not for interactive flows because the latency regression is severe and batch responses cannot stream. Pick this up only when a non-interactive workload appears in the roadmap.
- **Per-job-kind queue split** (e.g. dedicated `ai-campaigns` queue parallel to `ai-openai`) — would isolate campaign generation from scene generation so a campaign spike can't starve in-game scene generation. Cost: doubles bull-board complexity, loses the per-provider failure isolation that's the current design driver. Not worth it until starvation actually happens.

## History

### 2026-04-14 — initial BullMQ migration

Both routes migrated to BullMQ in the post-merge infra Item 2 push. Scene-gen got the pub/sub bridge from day one. Campaign-gen got only the queue + poll path, no bridge.

### 2026-04-15 — first revert (`281a826`)

Campaign-gen reverted from BullMQ back to inline SSE. The commit message and the original revert rationale (preserved in `aiWorker.test.js` mock setup as dead code, since cleaned up) framed this as "spinner-only delay crushed campaign-creator UX." That framing was correct in detail but **misidentified the root cause**: the problem wasn't BullMQ, it was the missing pub/sub bridge. Campaign-gen on the queue + poll path lost progressive `firstScene` reveal entirely (60-200s spinner-only), but the queue layer itself was fine. Compress was removed in the same commit, which further obscured the diagnosis.

### 2026-04-15+ — second migration (re-enabled, this commit)

After re-evaluation of two factors:

1. **Concurrency / backpressure was identified as the real BullMQ value driver.** Inline SSE has zero throttling — 100 concurrent users hit OpenAI as 100 simultaneous requests with no fair queueing. BullMQ at the new concurrency=100 default handles a 100-user spike with zero queueing AND keeps OpenAI usage at ~2% of the Tier 3+ RPM budget AND provides natural overflow handling for 500-1000+ user spikes.
2. **Pub/sub bridge pattern is now proven** by scene-gen's daily production use. Copying it to campaign-gen is mechanical (~60 LoC route + ~25 LoC handler), has zero FE impact, and resolves the original UX regression.

Result: campaign-gen back on BullMQ + pub/sub bridge with inline SSE fallback when Redis is disabled. Same shape as scene-gen. The first revert's lesson stays embedded in this doc — don't re-do that mistake.

## Related

- [[../patterns/sse-streaming]] — the `writeSseHead` invariants (hijack, identity, manual CORS, setNoDelay) that make any SSE work
- [[../patterns/bullmq-queues]] — per-provider queue split, pub/sub bridge pattern, concurrency tuning rationale
- [plans/post_merge_infra.md](../../plans/post_merge_infra.md) §2 — original BullMQ migration scope (historical context)
