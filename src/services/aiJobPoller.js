import { apiClient } from './apiClient';

// Poll a backend AI job until it completes, fails, or stalls. Used by
// the campaign generation flow (and future long-running non-streaming jobs)
// now that scene/campaign generation runs through BullMQ.
//
// Usage:
//   const result = await pollJob(jobId, { onProgress, stallTimeoutMs });
//
// Stall-based timeout: we give up only when the job goes silent for
// `stallTimeoutMs` — no fixed wall-clock cap. Campaign gen with large
// models can legitimately run 3-5 minutes; as long as chunks keep coming
// we keep waiting. A stuck/dead job (no progress change) fails after the
// stall window. Default 90s is generous enough to absorb Anthropic's
// first-token latency plus backend queue pickup.

const DEFAULT_STALL_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_INTERVAL_MS = 2_000;
const DEFAULT_MIN_INTERVAL_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function progressSignature(status) {
  // Collapse state + progress into a single comparable string so any
  // meaningful change (state transition, new chunk count, new lastChunkAtMs)
  // slides the stall deadline forward.
  return `${status.state}|${JSON.stringify(status.progress ?? 0)}`;
}

export async function pollJob(jobId, { onProgress, stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS } = {}) {
  if (!jobId) throw new Error('pollJob: jobId is required');
  let interval = DEFAULT_MIN_INTERVAL_MS;
  let lastSignature = null;
  let lastProgressAt = Date.now();

  while (true) {
    const status = await apiClient.get(`/ai/jobs/${encodeURIComponent(jobId)}`);
    if (!status) {
      if (Date.now() - lastProgressAt > stallTimeoutMs) {
        const stall = new Error('Job polling stalled (no status)');
        stall.code = 'JOB_TIMEOUT';
        throw stall;
      }
      await sleep(interval);
      continue;
    }

    const signature = progressSignature(status);
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastProgressAt = Date.now();
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

    if (Date.now() - lastProgressAt > stallTimeoutMs) {
      const stall = new Error(`Job stalled — no progress for ${stallTimeoutMs}ms`);
      stall.code = 'JOB_TIMEOUT';
      throw stall;
    }

    await sleep(interval);
    interval = Math.min(Math.round(interval * 1.25), DEFAULT_MAX_INTERVAL_MS);
  }
}
