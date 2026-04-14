# Decision — BullMQ queue vs inline SSE for long AI calls

**Date:** 2026-04-15 (revert landed in commit `281a826`)
**Context:** Both `/generate-campaign` and `/generate-scene-stream` originally migrated to BullMQ in the 2026-04-14 Item 2 Stage 1 / Stage 2 push. Campaign-gen was reverted one day later.

## Decision

- **`/v1/ai/generate-campaign`** → **inline SSE only.** No BullMQ. Keep this route writing chunks directly to `reply.raw`.
- **`/v1/ai/campaigns/:id/generate-scene-stream`** → **BullMQ + Redis pub/sub bridge**, with inline SSE as fallback when Redis is disabled.

## Why the split

Campaign creation is the first user-visible interaction in the app. The user clicks "Generate campaign", waits, and the spinner needs to communicate progress. We also reveal `firstScene` progressively the moment it's parseable mid-stream (~20-30s in) instead of waiting for the full 8k-token payload — that's the campaign creator's UX hook.

Putting this route on BullMQ killed the progressive reveal entirely:
- **Queue path is poll-only from the FE's point of view.** `202 { jobId }` + `GET /v1/ai/jobs/:id` loop exposes only `state` + `progress` integer. No partial output until the job completes.
- **With an 8k-token response via Anthropic or OpenAI premium, total run time is 60-200s.** Spinner-only for the entire duration, then a cliff. Users bounced.
- **Pub/sub bridge was never wired for `/generate-campaign`** — only `/generate-scene-stream` got it. Campaign gen went straight from "streaming SSE" to "poll for a blob of JSON at the end".

Scene streaming is different: the same 60-200s latency is masked by progressive events (dice rolls, narrative chunks, quest updates, image prompts) flowing back to `ChatPanel` as they arrive. The pub/sub bridge faithfully replicates the old inline SSE behavior — the queue only adds retry + observability on top. FE sees byte-identical event streams before and after migration.

## The rule

When routing long AI calls, ask:

1. **Does the UX require progressive output mid-call?**
   - **Yes** → inline SSE (`/generate-campaign`), OR BullMQ + pub/sub bridge (`/generate-scene-stream`). Never poll-only.
   - **No** → BullMQ + `/ai/jobs/:id` poll is fine.

2. **Is the response small enough that "wait for completion" is acceptable UX (< ~10s)?**
   - **Yes** → plain synchronous route. No queue, no SSE.
   - **No** → one of the above.

The three single-shot routes that landed during the no-BYOK cleanup (`/combat-commentary`, `/verify-objective`, `/generate-recap`) are plain synchronous because their latency budget is sub-10s and there's nothing to stream. If `/generate-recap` ever grows into a 60s operation, it becomes a pub/sub streaming candidate, not a poll-only queue job.

## What not to do

- **Don't re-add BullMQ to `/generate-campaign` without a pub/sub bridge.** If the goal is retry + bull-board observability, either build the pub/sub bridge first OR accept that campaign gen is fire-and-forget inline SSE.
- **Don't poll-only anything user-facing that takes >10s.** Spinner rage is a product killer.
- **Don't ship a new streaming route without copying the `sceneJobChannel` + subscribe-before-enqueue + 5min timeout + cleanup-on-terminal-event pattern** from [ai.js `/generate-scene-stream`](../../backend/src/routes/ai.js). The ordering is load-bearing — see [[../patterns/bullmq-queues#pre-generated-jobid-pattern]].

## Related

- [[../patterns/sse-streaming]] — the hijack gotcha that makes any SSE work at all
- [[../patterns/bullmq-queues]] — full queue pattern + pub/sub bridge design
- [plans/post_merge_infra.md](../../plans/post_merge_infra.md) §2 — original BullMQ migration scope
