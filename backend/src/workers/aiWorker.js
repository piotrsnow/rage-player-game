import { Worker } from 'bullmq';
import { getRedisClient, isRedisEnabled, closeRedis } from '../services/redisClient.js';
import { QUEUE_NAMES } from '../services/queues/aiQueue.js';
import { generateCampaignStream } from '../services/campaignGenerator.js';
import { generateSceneStream } from '../services/sceneGenerator.js';
import { logger } from '../lib/logger.js';

export function sceneJobChannel(jobId) {
  return `scene-job:${jobId}:events`;
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

const WORKER_OPTS = {
  [QUEUE_NAMES.OPENAI]: { concurrency: 4 },
  [QUEUE_NAMES.ANTHROPIC]: { concurrency: 4 },
  [QUEUE_NAMES.GEMINI]: { concurrency: 4 },
  [QUEUE_NAMES.STABILITY]: { concurrency: 2 },
  [QUEUE_NAMES.MESHY]: { concurrency: 2 },
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

  const connection = getRedisClient();
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

// Campaign generation: non-streaming (drop streaming per plan — spinner OK).
// Input: { settings, language, provider, model }
// Output: { result } — fully parsed campaign object
registerHandler('generate-campaign', async (job) => {
  const { settings = {}, language = 'en', provider = 'openai', model = null, userApiKeys = null } = job.data || {};

  let completeData = null;
  let streamError = null;
  let lastChunkAt = Date.now();
  let chunkCount = 0;

  await generateCampaignStream(
    settings,
    { provider, model, language, userApiKeys },
    (event) => {
      if (event.type === 'chunk') {
        chunkCount += 1;
        // Coarse progress reporting every ~10 chunks so polling clients can
        // show a live percentage estimate without us knowing the total.
        if (chunkCount % 10 === 0) {
          const now = Date.now();
          job.updateProgress({ chunks: chunkCount, lastChunkAtMs: now - lastChunkAt }).catch(() => {});
          lastChunkAt = now;
        }
      } else if (event.type === 'complete') {
        completeData = event.data;
      } else if (event.type === 'error') {
        streamError = new Error(event.error || 'Campaign generation failed');
        streamError.code = event.code || 'STREAM_ERROR';
      }
    },
  );

  if (streamError) throw streamError;
  if (!completeData) throw new Error('Campaign generation produced no result');

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
