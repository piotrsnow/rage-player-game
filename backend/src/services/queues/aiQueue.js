import { Queue, QueueEvents } from 'bullmq';
import { getBullMQConnection, isRedisEnabled } from '../redisClient.js';
import { logger } from '../../lib/logger.js';

// BullMQ-backed AI job queues. One queue per provider so rate-limit failures
// on one provider don't starve the others (OpenAI flake shouldn't block
// Anthropic campaign generation). All queues share a dedicated BullMQ
// connection from redisClient.js (separate from the app connection because
// BullMQ requires maxRetriesPerRequest: null + enableReadyCheck: false).
//
// Optional mode: when REDIS_URL is empty, getQueue() returns null and the
// route handler falls back to the legacy inline path. This keeps dev + CI
// running without Docker.
//
// Producer side only — worker consumption lives in workers/aiWorker.js.

// Note: BullMQ forbids `:` in queue names — it uses `:` internally as the
// Redis key separator. Use `-` here instead.
export const QUEUE_NAMES = {
  OPENAI: 'ai-openai',
  ANTHROPIC: 'ai-anthropic',
  GEMINI: 'ai-gemini',
  STABILITY: 'ai-stability',
  MESHY: 'ai-meshy',
};

const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 200 },
  removeOnFail: { age: 24 * 3600, count: 500 },
};

const queues = new Map();
const queueEvents = new Map();

function resolveQueueName(provider) {
  switch ((provider || '').toLowerCase()) {
    case 'anthropic': return QUEUE_NAMES.ANTHROPIC;
    case 'gemini': return QUEUE_NAMES.GEMINI;
    case 'stability': return QUEUE_NAMES.STABILITY;
    case 'meshy': return QUEUE_NAMES.MESHY;
    case 'openai':
    default: return QUEUE_NAMES.OPENAI;
  }
}

export function getQueue(provider) {
  if (!isRedisEnabled()) return null;
  const name = resolveQueueName(provider);
  if (queues.has(name)) return queues.get(name);

  const connection = getBullMQConnection();
  if (!connection) return null;

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });
  queue.on('error', (err) => {
    logger.warn({ err, queue: name }, '[queue] error');
  });
  queues.set(name, queue);
  return queue;
}

export function getAllQueues() {
  if (!isRedisEnabled()) return [];
  return Object.values(QUEUE_NAMES).map((name) => {
    if (queues.has(name)) return queues.get(name);
    const connection = getBullMQConnection();
    if (!connection) return null;
    const q = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
    q.on('error', (err) => logger.warn({ err, queue: name }, '[queue] error'));
    queues.set(name, q);
    return q;
  }).filter(Boolean);
}

export function getQueueEvents(provider) {
  if (!isRedisEnabled()) return null;
  const name = resolveQueueName(provider);
  if (queueEvents.has(name)) return queueEvents.get(name);

  const connection = getBullMQConnection();
  if (!connection) return null;

  const events = new QueueEvents(name, { connection });
  events.on('error', (err) => {
    logger.warn({ err, queue: name }, '[queue-events] error');
  });
  queueEvents.set(name, events);
  return events;
}

export async function enqueueJob(jobName, data, { provider = 'openai', userId = null, jobId = undefined } = {}) {
  const queue = getQueue(provider);
  if (!queue) {
    throw Object.assign(new Error('Queue unavailable — Redis disabled'), { code: 'QUEUE_DISABLED' });
  }
  // Caller may pre-generate a jobId so it can subscribe to the pub/sub
  // channel (`scene-job:<jobId>:events`) BEFORE the worker starts
  // publishing, eliminating the subscribe-after-enqueue race window.
  const job = await queue.add(jobName, data, jobId ? { jobId } : undefined);
  logger.info({ jobId: job.id, jobName, provider, userId }, '[queue] job enqueued');
  return { id: job.id, queue: queue.name };
}

export async function getJobStatus(jobId, provider) {
  const queue = getQueue(provider);
  if (!queue) return null;
  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    state,
    progress: job.progress ?? 0,
    returnvalue: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
    attemptsMade: job.attemptsMade ?? 0,
    timestamp: job.timestamp ?? null,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
  };
}

export async function findJobAcrossQueues(jobId) {
  if (!isRedisEnabled()) return null;
  for (const name of Object.values(QUEUE_NAMES)) {
    const connection = getBullMQConnection();
    if (!connection) return null;
    let queue = queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
      queue.on('error', (err) => logger.warn({ err, queue: name }, '[queue] error'));
      queues.set(name, queue);
    }
    const job = await queue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      return {
        id: job.id,
        name: job.name,
        queue: name,
        state,
        progress: job.progress ?? 0,
        returnvalue: job.returnvalue ?? null,
        failedReason: job.failedReason ?? null,
        attemptsMade: job.attemptsMade ?? 0,
        timestamp: job.timestamp ?? null,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
      };
    }
  }
  return null;
}

export async function closeAllQueues() {
  const closers = [];
  for (const q of queues.values()) closers.push(q.close().catch((err) => logger.warn({ err }, '[queue] close failed')));
  for (const e of queueEvents.values()) closers.push(e.close().catch((err) => logger.warn({ err }, '[queue-events] close failed')));
  await Promise.allSettled(closers);
  queues.clear();
  queueEvents.clear();
}

export function __resetQueuesForTests() {
  queues.clear();
  queueEvents.clear();
}
