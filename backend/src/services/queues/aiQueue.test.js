import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted runs before any vi.mock factory, so the fake constructors and
// the per-test state are in scope when the factory body runs.
const hoisted = vi.hoisted(() => {
  const fakeJobs = Object.create(null);
  const createdQueues = [];

  const FakeQueueCtor = vi.fn(function FakeQueue(name) {
    this.name = name;
    createdQueues.push(name);
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue();
    this.add = vi.fn(async (jobName, data) => {
      const id = `job_${Math.floor(Math.random() * 1e6)}`;
      fakeJobs[name] = fakeJobs[name] || {};
      fakeJobs[name][id] = {
        id,
        name: jobName,
        data,
        state: 'waiting',
        progress: 0,
        returnvalue: null,
        failedReason: null,
        attemptsMade: 0,
        timestamp: Date.now(),
        processedOn: null,
        finishedOn: null,
      };
      return { id };
    });
    this.getJob = vi.fn(async (id) => {
      const entry = fakeJobs[name]?.[id];
      if (!entry) return null;
      return {
        ...entry,
        getState: async () => entry.state,
      };
    });
  });

  const FakeQueueEventsCtor = vi.fn(function FakeQueueEvents() {
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue();
  });

  const redisEnabled = vi.fn(() => true);
  const redisClient = vi.fn(() => ({ status: 'ready' }));

  return { fakeJobs, createdQueues, FakeQueueCtor, FakeQueueEventsCtor, redisEnabled, redisClient };
});

const { fakeJobs, createdQueues, FakeQueueCtor, redisEnabled, redisClient } = hoisted;

vi.mock('bullmq', () => ({
  Queue: hoisted.FakeQueueCtor,
  QueueEvents: hoisted.FakeQueueEventsCtor,
  Worker: vi.fn(),
}));

vi.mock('../redisClient.js', () => ({
  isRedisEnabled: (...args) => hoisted.redisEnabled(...args),
  getRedisClient: (...args) => hoisted.redisClient(...args),
}));

import {
  enqueueJob,
  getJobStatus,
  findJobAcrossQueues,
  getQueue,
  getAllQueues,
  __resetQueuesForTests,
  QUEUE_NAMES,
} from './aiQueue.js';

beforeEach(() => {
  __resetQueuesForTests();
  for (const k of Object.keys(fakeJobs)) delete fakeJobs[k];
  createdQueues.length = 0;
  FakeQueueCtor.mockClear();
  redisEnabled.mockReturnValue(true);
  redisClient.mockReturnValue({ status: 'ready' });
});

describe('aiQueue', () => {
  it('returns null from getQueue when redis is disabled', () => {
    redisEnabled.mockReturnValue(false);
    expect(getQueue('openai')).toBeNull();
  });

  it('picks the correct queue name per provider', () => {
    const open = getQueue('openai');
    const anth = getQueue('anthropic');
    const gem = getQueue('gemini');
    const stab = getQueue('stability');
    const mesh = getQueue('meshy');
    const unknown = getQueue(undefined);

    expect(open.name).toBe(QUEUE_NAMES.OPENAI);
    expect(anth.name).toBe(QUEUE_NAMES.ANTHROPIC);
    expect(gem.name).toBe(QUEUE_NAMES.GEMINI);
    expect(stab.name).toBe(QUEUE_NAMES.STABILITY);
    expect(mesh.name).toBe(QUEUE_NAMES.MESHY);
    expect(unknown.name).toBe(QUEUE_NAMES.OPENAI);
  });

  it('caches the queue instance per provider', () => {
    const first = getQueue('openai');
    const second = getQueue('openai');
    expect(first).toBe(second);
    expect(FakeQueueCtor).toHaveBeenCalledTimes(1);
  });

  it('enqueueJob throws QUEUE_DISABLED when redis is off', async () => {
    redisEnabled.mockReturnValue(false);
    await expect(enqueueJob('generate-campaign', { foo: 1 })).rejects.toMatchObject({
      code: 'QUEUE_DISABLED',
    });
  });

  it('enqueueJob adds to the provider-specific queue and returns id', async () => {
    const result = await enqueueJob('generate-campaign', { settings: {} }, { provider: 'anthropic' });
    expect(result.queue).toBe(QUEUE_NAMES.ANTHROPIC);
    expect(result.id).toMatch(/^job_/);
  });

  it('getJobStatus returns job shape for the matching provider', async () => {
    const { id } = await enqueueJob('generate-campaign', { a: 1 }, { provider: 'openai' });
    const status = await getJobStatus(id, 'openai');
    expect(status).toMatchObject({
      id,
      name: 'generate-campaign',
      state: 'waiting',
      attemptsMade: 0,
    });
  });

  it('findJobAcrossQueues scans every queue and returns first match', async () => {
    const { id } = await enqueueJob('generate-campaign', { a: 1 }, { provider: 'meshy' });
    const found = await findJobAcrossQueues(id);
    expect(found).toMatchObject({ id, queue: QUEUE_NAMES.MESHY });
  });

  it('findJobAcrossQueues returns null when redis is disabled', async () => {
    redisEnabled.mockReturnValue(false);
    const found = await findJobAcrossQueues('nope');
    expect(found).toBeNull();
  });

  it('getAllQueues returns one queue per provider', () => {
    const all = getAllQueues();
    expect(all.length).toBe(Object.keys(QUEUE_NAMES).length);
  });
});
