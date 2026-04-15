import { Worker } from 'bullmq';
import { getRedisClient, getBullMQConnection, isRedisEnabled, closeRedis } from '../services/redisClient.js';
import { QUEUE_NAMES } from '../services/queues/aiQueue.js';
import { generateSceneStream } from '../services/sceneGenerator.js';
import { generateCampaignStream } from '../services/campaignGenerator.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export function sceneJobChannel(jobId) {
  return `scene-job:${jobId}:events`;
}

export function campaignJobChannel(jobId) {
  return `campaign-job:${jobId}:events`;
}

// BullMQ workers. Each worker binds to one queue and runs jobs on the
// shared redis connection. The processor dispatches by job name so we can
// add new job types (scene-gen, image-gen, etc.) without spawning more
// workers than necessary.
//
// Entrypoint modes:
//   - standalone (WORKER_MODE=1): process runs workers only, no HTTP server.
//     `node src/workers/aiWorker.js` or `npm run worker`.
//   - in-process: server.js calls `startWorkers()` when NOT in worker mode
//     and REDIS_URL is set. This is fine on single-VM Prod-A because
//     everything runs in one process space already. When the deployment
//     outgrows that, flip to standalone via docker-compose.
//
// Handlers must be registered here — the registry is a plain map keyed by
// job name. Queue-specific concurrency caps live in WORKER_OPTS below.

// Concurrency is env-configurable via config.aiQueueConcurrency. Text
// providers default to 100 (I/O-bound streaming jobs; upstream rate limit
// is the real ceiling, not local CPU/memory). Image providers default to
// 10 because per-job memory and upstream limits are tighter. See
// config.js for the rationale.
const WORKER_OPTS = {
  [QUEUE_NAMES.OPENAI]: { concurrency: config.aiQueueConcurrency.openai },
  [QUEUE_NAMES.ANTHROPIC]: { concurrency: config.aiQueueConcurrency.anthropic },
  [QUEUE_NAMES.GEMINI]: { concurrency: config.aiQueueConcurrency.gemini },
  [QUEUE_NAMES.STABILITY]: { concurrency: config.aiQueueConcurrency.stability },
  [QUEUE_NAMES.MESHY]: { concurrency: config.aiQueueConcurrency.meshy },
};

const handlers = new Map();
const workers = new Map();

export function registerHandler(jobName, fn) {
  handlers.set(jobName, fn);
}

async function processJob(job) {
  const handler = handlers.get(job.name);
  if (!handler) {
    throw new Error(`No handler registered for job "${job.name}"`);
  }
  return handler(job);
}

export function startWorkers() {
  if (!isRedisEnabled()) {
    logger.info('[worker] Redis disabled — not starting workers');
    return;
  }
  if (workers.size > 0) return;

  const connection = getBullMQConnection();
  if (!connection) {
    logger.warn('[worker] no redis connection — workers not started');
    return;
  }

  for (const [name, opts] of Object.entries(WORKER_OPTS)) {
    const worker = new Worker(name, processJob, { connection, ...opts });
    worker.on('completed', (job) => {
      logger.info({ jobId: job.id, name: job.name, queue: name }, '[worker] job completed');
    });
    worker.on('failed', (job, err) => {
      logger.warn({ jobId: job?.id, name: job?.name, queue: name, err }, '[worker] job failed');
    });
    worker.on('error', (err) => {
      logger.warn({ err, queue: name }, '[worker] error');
    });
    workers.set(name, worker);
  }
  logger.info({ queues: Object.keys(WORKER_OPTS) }, '[worker] started');
}

export async function stopWorkers() {
  const closers = [];
  for (const w of workers.values()) {
    closers.push(w.close().catch((err) => logger.warn({ err }, '[worker] close failed')));
  }
  await Promise.allSettled(closers);
  workers.clear();
}

// ── Handler registration ──────────────────────────────────────────

// Scene generation: streaming preserved via Redis pub/sub bridge.
// Input: { campaignId, playerAction, opts }
// Flow: the callback passed into generateSceneStream publishes every event
// to `scene-job:<jobId>:events`. The HTTP handler that enqueued the job is
// subscribed to the same channel and forwards events to the SSE client.
// Output: job.returnvalue stores the final scene result for bull-board
// history; clients get the data via the `complete` SSE event, not the
// job API.
registerHandler('generate-scene', async (job) => {
  const { campaignId, playerAction, opts = {} } = job.data || {};
  const redis = getRedisClient();
  const channel = sceneJobChannel(job.id);

  let completeData = null;
  let streamError = null;

  await generateSceneStream(campaignId, playerAction, opts, (event) => {
    // Fire-and-forget publish. ioredis buffers on disconnect; an occasional
    // dropped message is acceptable — the HTTP subscriber uses the `complete`
    // event to detect end-of-stream and will also time out on silence.
    if (redis) {
      redis.publish(channel, JSON.stringify(event)).catch((err) => {
        logger.warn({ err, jobId: job.id }, '[worker] scene event publish failed');
      });
    }
    if (event.type === 'complete') completeData = event.data;
    if (event.type === 'error') {
      streamError = Object.assign(new Error(event.error || 'Scene generation failed'), {
        code: event.code || 'STREAM_ERROR',
      });
    }
  });

  if (streamError) throw streamError;
  return { result: completeData };
});

// Campaign generation: structurally identical to the scene handler. The
// route opens `campaign-job:<jobId>:events`, subscribes before enqueue,
// forwards every message verbatim as SSE `data:` lines. Originally this
// handler was reverted along with the queue migration in 281a826; it's
// back now because concurrency + backpressure + FIFO queueing are the
// real value of the BullMQ layer, not just retry/observability. See
// knowledge/decisions/bullmq-vs-sse-routes.md for the full rationale.
registerHandler('generate-campaign', async (job) => {
  const { settings, opts = {} } = job.data || {};
  const redis = getRedisClient();
  const channel = campaignJobChannel(job.id);

  let completeData = null;
  let streamError = null;

  await generateCampaignStream(settings, opts, (event) => {
    if (redis) {
      redis.publish(channel, JSON.stringify(event)).catch((err) => {
        logger.warn({ err, jobId: job.id }, '[worker] campaign event publish failed');
      });
    }
    if (event.type === 'complete') completeData = event.data;
    if (event.type === 'error') {
      streamError = Object.assign(new Error(event.error || 'Campaign generation failed'), {
        code: event.code || 'STREAM_ERROR',
      });
    }
  });

  if (streamError) throw streamError;
  return { result: completeData };
});

// ── Standalone entrypoint ─────────────────────────────────────────

const isMain = import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMain) {
  logger.info('[worker] standalone mode — starting workers');
  startWorkers();

  const shutdown = async (signal) => {
    logger.info(`[worker] received ${signal} — shutting down`);
    await stopWorkers();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
