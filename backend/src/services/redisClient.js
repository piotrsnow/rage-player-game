import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// Redis is OPTIONAL in Stage 1 of the post-merge infra plan. Features that
// want to use it (room state, rate limiting, embed cache, etc.) must check
// `isRedisEnabled()` first and keep a fallback path. Once every consumer has
// migrated we can flip this to required and drop the fallbacks.
//
// Connection is lazy — the client is only created on first `getRedisClient()`
// call, so importing this module during tests or in environments without
// REDIS_URL is a no-op.

let client = null;
let connecting = false;
let connected = false;
let lastConnectError = null;

function buildClient() {
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      // Exponential backoff capped at 10s. ioredis retries forever by default;
      // we want that for transient blips but with a ceiling so logs don't spam.
      return Math.min(times * 200, 10_000);
    },
    reconnectOnError(err) {
      // READONLY errors happen on failover — reconnect to pick up new master.
      return err.message.includes('READONLY');
    },
  });

  redis.on('connect', () => {
    connected = true;
    lastConnectError = null;
    logger.info('[redis] connected');
  });

  redis.on('ready', () => {
    logger.debug('[redis] ready');
  });

  redis.on('error', (err) => {
    lastConnectError = err;
    if (connected) {
      logger.warn({ err }, '[redis] connection error');
    }
  });

  redis.on('close', () => {
    if (connected) {
      connected = false;
      logger.warn('[redis] connection closed');
    }
  });

  redis.on('end', () => {
    connected = false;
    logger.debug('[redis] connection ended');
  });

  return redis;
}

export function isRedisEnabled() {
  return Boolean(config.redisUrl);
}

export function getRedisClient() {
  if (!isRedisEnabled()) return null;
  if (client) return client;

  client = buildClient();
  if (!connecting) {
    connecting = true;
    client.connect().catch((err) => {
      lastConnectError = err;
      logger.warn({ err }, '[redis] initial connect failed — features will fall back');
    });
  }
  return client;
}

export async function pingRedis() {
  if (!isRedisEnabled()) return { enabled: false, ok: false };
  const redis = getRedisClient();
  if (!redis) return { enabled: true, ok: false, error: 'client unavailable' };
  try {
    const reply = await redis.ping();
    return { enabled: true, ok: reply === 'PONG' };
  } catch (err) {
    return { enabled: true, ok: false, error: err.message };
  }
}

export async function closeRedis() {
  if (!client) return;
  try {
    await client.quit();
    logger.info('[redis] client quit cleanly');
  } catch (err) {
    logger.warn({ err }, '[redis] quit failed — forcing disconnect');
    client.disconnect();
  } finally {
    client = null;
    connected = false;
    connecting = false;
  }
}

export function getRedisStatus() {
  return {
    enabled: isRedisEnabled(),
    connected,
    lastError: lastConnectError?.message || null,
  };
}
