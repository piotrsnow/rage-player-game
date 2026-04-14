import { apiClient } from './apiClient';

// Poll a backend AI job until it completes, fails, or times out. Used by
// the campaign generation flow (and future long-running non-streaming jobs)
// now that scene/campaign generation runs through BullMQ.
//
// Usage:
//   const result = await pollJob(jobId, { onProgress, timeoutMs });
//
// The poller hits GET /ai/jobs/:id via apiClient.get (so version prefix
// + auth are handled). It uses adaptive intervals — fast at first because
// campaign gen is 20-60s and we want the reveal to feel snappy.

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_INTERVAL_MS = 2_000;
const DEFAULT_MIN_INTERVAL_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollJob(jobId, { onProgress, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!jobId) throw new Error('pollJob: jobId is required');
  const deadline = Date.now() + timeoutMs;
  let interval = DEFAULT_MIN_INTERVAL_MS;

  while (Date.now() < deadline) {
    const status = await apiClient.get(`/ai/jobs/${encodeURIComponent(jobId)}`);
    if (!status) {
      await sleep(interval);
      continue;
    }

    if (onProgress) {
      try {
        onProgress(status);
      } catch (err) {
        console.warn('[pollJob] onProgress threw:', err);
      }
    }

    if (status.state === 'completed') {
      return status.returnvalue;
    }
    if (status.state === 'failed') {
      const err = new Error(status.failedReason || 'Job failed');
      err.code = 'JOB_FAILED';
      err.attemptsMade = status.attemptsMade;
      throw err;
    }

    await sleep(interval);
    interval = Math.min(Math.round(interval * 1.25), DEFAULT_MAX_INTERVAL_MS);
  }

  const timeout = new Error('Job polling timed out');
  timeout.code = 'JOB_TIMEOUT';
  throw timeout;
}
