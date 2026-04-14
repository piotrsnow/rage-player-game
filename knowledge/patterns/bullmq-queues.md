# BullMQ queues — per-provider split, pub/sub bridge, dual-mode workers

Backend AI jobs run through BullMQ on a Valkey/Redis instance. Canonical files:
- [backend/src/services/queues/aiQueue.js](../../backend/src/services/queues/aiQueue.js) — queue factory
- [backend/src/workers/aiWorker.js](../../backend/src/workers/aiWorker.js) — worker + handler registry
- [backend/src/plugins/bullBoard.js](../../backend/src/plugins/bullBoard.js) — admin UI at `/v1/admin/queues`

## Per-provider queues (not per-job-type)

Five queues split by provider, not by job kind:

```
ai-openai     — concurrency 4
ai-anthropic  — concurrency 4
ai-gemini     — concurrency 4
ai-stability  — concurrency 2
ai-meshy      — concurrency 2
```

Reason: provider rate-limit / outage on OpenAI must not starve Anthropic-backed jobs. One flaky provider only affects its own queue. Job kind is differentiated by `job.name` (`generate-campaign`, `generate-scene`, etc.) via a handler registry inside one worker process per queue.

**Queue naming constraint:** BullMQ forbids `:` in queue names — it's the internal Redis key separator. Use `-` (`ai-openai`, not `ai:openai`). Enforced by `QUEUE_NAMES` in `aiQueue.js`.

## Separate Redis connection for BullMQ

BullMQ **requires** its own ioredis connection with specific options that conflict with the regular app connection:

```js
new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,   // workers use BLPOP-style blocking reads
  enableReadyCheck: false,      // disables a feature that times out BLPOP
  ...
})
```

Regular consumers (embedding cache, rate limiter, idempotency plugin) use `getRedisClient()` which has `maxRetriesPerRequest: 3` and `enableReadyCheck: true` for fail-fast semantics. You cannot share one connection between both worlds — BullMQ workers hanging on BLPOP would trip the retry cap and terminate.

`redisClient.js` exposes both: `getRedisClient()` for regular consumers, `getBullMQConnection()` for queues/workers/QueueEvents.

## Pre-generated jobId pattern (subscribe-before-enqueue)

For streaming via pub/sub bridge, the caller MUST subscribe to the pub/sub channel BEFORE the worker starts publishing, otherwise early events are lost. Achieved by pre-generating the jobId on the producer side:

```js
const jobId = crypto.randomUUID();
const channel = sceneJobChannel(jobId);
const subscriber = getRedisClient().duplicate();

await subscriber.subscribe(channel);                       // subscribe first
await enqueueJob('generate-scene', data, { jobId });       // THEN enqueue
```

`enqueueJob(name, data, { provider, userId, jobId? })` forwards `jobId` to `queue.add(name, data, { jobId })` when provided. Pattern validated by [backend/src/routes/ai.js](../../backend/src/routes/ai.js) `/generate-scene-stream`. Any new streaming queue consumer should copy this shape — don't invent another sequencing scheme.

## Pub/sub bridge for streaming jobs

When a worker wants to stream progress back to the HTTP handler that enqueued the job:

```js
// Worker side (aiWorker.js handler for generate-scene)
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

```js
// Route side (ai.js generate-scene-stream)
subscriber.on('message', (ch, msg) => {
  reply.raw.write(`data: ${msg}\n\n`);
  const event = JSON.parse(msg);
  if (event.type === 'complete' || event.type === 'error') cleanup();
});
```

Fire-and-forget publish is acceptable because:
1. ioredis buffers on disconnect, most drops are transient.
2. The `complete` event is authoritative — the subscriber closes on receipt.
3. A 5-minute safety timeout catches dead jobs that never emit `complete`.

**Channel naming helper must be shared:** `sceneJobChannel(jobId)` is exported from `aiWorker.js` and imported by `ai.js`. Both sides must agree on the key format or messages never route.

## Dual-mode workers: in-process vs standalone

Two launch modes, controlled by `WORKER_MODE` env:

- **In-process** (default): `server.js` calls `startWorkers()` after boot when `!config.workerMode && isRedisEnabled()`. Workers and HTTP server share one Node process. Fine for single-VM Prod-A.
- **Standalone**: `WORKER_MODE=1 node src/workers/aiWorker.js` (script alias `npm run worker`). No HTTP server, pure worker process. Used by the `backend-worker` service in [docker-compose.yml](../../docker-compose.yml) under `profiles: ["workers"]` — dormant by default, activated via `docker compose --profile workers up` when you want worker isolation or horizontal scale.

The ESM main check at the bottom of `aiWorker.js` handles both path conventions:
```js
const isMain = import.meta.url === `file://${process.argv[1]}` ||
               import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
```
(Windows dev path vs Linux container path.)

## Bull-board UI

- Mounted at `/v1/admin/queues` via [backend/src/plugins/bullBoard.js](../../backend/src/plugins/bullBoard.js).
- Gated by `fastify.authenticate` + `request.user.admin` claim.
- **Admin flag on `User` model doesn't exist yet** — effectively locked. Hand-crafted dev JWTs can set the claim for local inspection.
- Plugin no-ops when Redis is disabled (clean boot for CI / no-docker dev).

## Graceful shutdown order

Server shutdown ([server.js](../../backend/src/server.js) `gracefulShutdown`) explicitly stops queue work before Redis:
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

The retention keeps bull-board history useful without unbounded Redis memory growth. Tune per-job via the options passed to `queue.add()` when a specific handler needs different behavior.
