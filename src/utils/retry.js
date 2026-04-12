const RETRY_DELAYS = [1000, 3000];

export async function withRetry(fn, { retries = 2, onRetry } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 3000;
        if (onRetry) onRetry(attempt, err, delay);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
