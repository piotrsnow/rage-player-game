# Pattern — BullMQ queues (per-provider, pub/sub bridge, dual-mode workers)

Backend AI jobs run through BullMQ on a Valkey/Redis instance. Canonical files:

- [backend/src/services/queues/aiQueue.js](../../backend/src/services/queues/aiQueue.js) — queue factory
- [backend/src/workers/aiWorker.js](../../backend/src/workers/aiWorker.js) — worker + handler registry
- [backend/src/plugins/bullBoard.js](../../backend/src/plugins/bullBoard.js) — admin UI at `/v1/admin/queues`
- [backend/src/services/redisClient.js](../../backend/src/services/redisClient.js) — dual ioredis connections

## Per-provider queues (not per-job-type)

Five queues split by provider, not by job kind. Default concurrency (env-tunable via `AI_QUEUE_CONCURRENCY_*` per [config.js](../../backend/src/config.js)):

```
ai-openai     — concurrency 100  (text gen — I/O-bound, upstream rate limit is the ceiling)
ai-anthropic  — concurrency 100
ai-gemini     — concurrency 100
ai-stability  — concurrency 10   (image gen — heavier per-job memory + tighter upstream limits)
ai-meshy      — concurrency 10   (3D model gen — same)
```

**Reason for high text concurrency:** each job is ~95% `await fetch` to the provider — Node's event loop is free during the wait. Per-job CPU is trivial (parse SSE chunk, JSON.parse, Redis publish). Per-job memory is ~30KB. Local resources are not the bottleneck — provider rate limits are. At Tier 3+ (5000 RPM per model), concurrency 100 uses ~2% of the RPM budget while letting a 100-user spike start with zero queueing.

**Reason for per-provider split:** a rate-limit or outage on OpenAI must not starve Anthropic-backed jobs. One flaky provider only affects its own queue. Job kind is differentiated by `job.name` (`generate-campaign`, `generate-scene`, etc.) via a handler registry inside one worker process per queue.

**Queue naming constraint:** BullMQ forbids `:` in queue names (it's the internal Redis key separator). Use `-` (`ai-openai`, not `ai:openai`). Enforced by `QUEUE_NAMES` in `aiQueue.js`.

**Tuning knobs:** For a higher-tier account or horizontally scaled deployment, set `AI_QUEUE_CONCURRENCY_OPENAI=500` without a code change. For dev/CI backpressure testing, drop to 4. Defaults assume Tier 3+ — adjust if your account is lower.

## Separate Redis connection for BullMQ

BullMQ **requires** its own ioredis connection with specific options that conflict with the regular app connection:

```js
new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,   // workers use BLPOP-style blocking reads
  enableReadyCheck: false,      // disables a feature that times out BLPOP
});
```

Regular consumers (embedding cache, rate limiter, idempotency plugin) use `getRedisClient()` which has `maxRetriesPerRequest: 3` and `enableReadyCheck: true` for fail-fast semantics. You **cannot** share one connection between both worlds — BullMQ workers hanging on BLPOP would trip the retry cap and terminate.

`redisClient.js` exposes both: `getRedisClient()` for regular consumers, `getBullMQConnection()` for queues/workers/QueueEvents.

## Pre-generated jobId (subscribe-before-enqueue)

For streaming via the pub/sub bridge, the caller MUST subscribe to the pub/sub channel **before** the worker starts publishing — otherwise early events are lost. Achieved by pre-generating the jobId on the producer side:

```js
const jobId = crypto.randomUUID();
const channel = sceneJobChannel(jobId);            // or campaignJobChannel(jobId)
const subscriber = getRedisClient().duplicate();

await subscriber.subscribe(channel);                // subscribe first
await enqueueJob('generate-scene', data, { jobId }); // THEN enqueue
```

`enqueueJob(name, data, { provider, userId, jobId? })` forwards `jobId` to `queue.add(name, data, { jobId })` when provided. **Any new streaming queue consumer must copy this ordering** — don't invent another sequencing scheme.

**Per-job-kind channel helpers.** Each streaming job kind has its own helper (`sceneJobChannel`, `campaignJobChannel`) exported from `aiWorker.js`. Per-kind instead of a generic `jobChannel(kind, id)` because:

- Easier to grep across logs and bull-board (`scene-job:` vs `campaign-job:` are immediately distinct)
- Smaller blast radius for typos (kind string lives in one place per channel)
- Trivial code duplication — each helper is one line

## Pub/sub bridge for streaming jobs

When a worker wants to stream progress back to the HTTP handler that enqueued the job:

```js
// Worker side (aiWorker.js handler)
registerHandler('generate-scene', async (job) => {
  const redis = getRedisClient();
  const channel = sceneJobChannel(job.id);

  await generateSceneStream(campaignId, action, opts, (event) => {
    if (redis) {
      redis.publish(channel, JSON.stringify(event)).catch(...);  // fire-and-forget
    }
    if (event.type === 'complete') completeData = event.data;
    if (event.type === 'error') streamError = ...;
  });

  if (streamError) throw streamError;
  return { result: completeData };
});
```

The `generate-campaign` handler is structurally identical — only the channel helper name and the underlying generator function differ.

```js
// Route side (ai.js)
subscriber.on('message', (ch, msg) => {
  reply.raw.write(`data: ${msg}\n\n`);
  const event = JSON.parse(msg);
  if (event.type === 'complete' || event.type === 'error') cleanup();
});
```

**Fire-and-forget publish is acceptable** because:

1. ioredis buffers on disconnect; most drops are transient.
2. The `complete` event is authoritative — the subscriber closes on receipt.
3. A safety timeout catches dead jobs that never emit `complete` (5min for scene-gen, 8min for campaign-gen — campaigns can spike longer on Anthropic premium with full sceneGrid).

**Channel naming helper must be shared:** Both `sceneJobChannel(jobId)` and `campaignJobChannel(jobId)` are exported from `aiWorker.js` and imported by `ai.js`. Both sides must agree on the key format or messages never route.

## Current handlers

| Job name | Channel helper | Generator | Timeout |
|---|---|---|---|
| `generate-scene` | `sceneJobChannel` | `generateSceneStream` | 5 min |
| `generate-campaign` | `campaignJobChannel` | `generateCampaignStream` | 8 min |

Both routes have an inline SSE fallback path when `isRedisEnabled()` returns false or `enqueueJob` throws — dev/CI without Redis still works unchanged.

## Dual-mode workers (in-process vs standalone)

Two launch modes, controlled by `WORKER_MODE` env:

- **In-process** (default): `server.js` calls `startWorkers()` after boot when `!config.workerMode && isRedisEnabled()`. Workers and HTTP server share one Node process. Fine for single-VM prod.
- **Standalone**: `WORKER_MODE=1 node src/workers/aiWorker.js` (script alias `npm run worker`). No HTTP server, pure worker process. Used by the `backend-worker` service in [docker-compose.yml](../../docker-compose.yml) under `profiles: ["workers"]` — dormant by default, activated via `docker compose --profile workers up` when you want worker isolation or horizontal scale.

The ESM main check at the bottom of `aiWorker.js` handles both Windows dev and Linux container paths:

```js
const isMain = import.meta.url === `file://${process.argv[1]}` ||
               import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
```

## Bull-board UI

- Mounted at `/v1/admin/queues` via `plugins/bullBoard.js`
- Gated by `fastify.authenticate` + `request.user.admin` claim
- **Admin flag on `User` model doesn't exist yet** — effectively locked. Hand-crafted dev JWTs can set the claim for local inspection.
- Plugin no-ops when Redis is disabled (clean boot for CI / no-docker dev)

## Graceful shutdown order

`gracefulShutdown` in `server.js` stops queue work before Redis:

1. Persist active rooms
2. Close WebSocket sockets
3. `stopWorkers()` — wait for in-flight jobs to finish or time out
4. `closeAllQueues()` — closes Queue + QueueEvents instances
5. `closeRedis()` — quits both the regular client and the BullMQ connection
6. `fastify.close()` — drain HTTP

Skip step 3 or 4 and BullMQ leaks ioredis sockets, blocking graceful exit.

## Default job options

```js
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 200 },  // 1h / 200 jobs
  removeOnFail: { age: 24 * 3600, count: 500 }, // 24h / 500 jobs
}
```

Retention keeps bull-board history useful without unbounded Redis memory growth. Tune per-job via options passed to `queue.add()` when a handler needs different behavior.

## Related

- [sse-streaming.md](sse-streaming.md) — the `writeSseHead` invariants the routes use on top of this
- [decisions/bullmq-vs-sse-routes.md](../decisions/bullmq-vs-sse-routes.md) — when to use BullMQ + pub/sub vs inline SSE vs poll-only
- [concepts/scene-generation.md](../concepts/scene-generation.md) — the consumer that drives most of this traffic
