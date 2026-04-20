import { config } from '../config.js';
import { handlePostSceneWork } from '../services/postSceneWork.js';
import { verifyOidcToken } from '../services/oidcVerify.js';
import { releaseStaleCampaignLocks } from '../services/livingWorld/staleLockCleaner.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'internal' });

/**
 * Internal routes called by Cloud Tasks (OIDC-authenticated, not user-facing).
 * Registered under /v1/internal/* with no rate limiting — Cloud Tasks handles
 * dispatch rate via queue config (max-concurrent-dispatches).
 */
export async function internalRoutes(fastify) {
  fastify.post('/post-scene-work', async (request, reply) => {
    // In dev mode (Cloud Tasks disabled), this route won't be hit — the
    // enqueue helper falls back to inline. But guard anyway.
    if (!config.cloudTasksEnabled) {
      return reply.code(403).send({ error: 'Cloud Tasks not enabled' });
    }

    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return reply.code(401).send({ error: 'Missing OIDC token' });
    }

    try {
      await verifyOidcToken(token, {
        audience: config.selfUrl,
        expectedServiceAccount: config.runtimeServiceAccount,
      });
    } catch (err) {
      log.warn({ err }, 'OIDC verification failed');
      return reply.code(401).send({ error: 'Invalid OIDC token' });
    }

    try {
      await handlePostSceneWork(request.body);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      log.error({ err, payload: request.body }, 'Post-scene work handler failed');
      // 500 triggers Cloud Tasks retry (exponential backoff, up to max-attempts)
      return reply.code(500).send({ error: 'Post-scene work failed' });
    }
  });

  // Living World (Phase 2) — stale companion lock reaper.
  // Scheduled via Cloud Scheduler (daily), OIDC-auth like post-scene-work.
  // Signature matches the Scheduler HTTP target: POST with empty/JSON body.
  fastify.post('/release-stale-campaign-locks', async (request, reply) => {
    if (!config.cloudTasksEnabled) {
      return reply.code(403).send({ error: 'Cloud Tasks not enabled' });
    }

    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return reply.code(401).send({ error: 'Missing OIDC token' });
    }

    try {
      await verifyOidcToken(token, {
        audience: config.selfUrl,
        expectedServiceAccount: config.runtimeServiceAccount,
      });
    } catch (err) {
      log.warn({ err }, 'OIDC verification failed');
      return reply.code(401).send({ error: 'Invalid OIDC token' });
    }

    try {
      const result = await releaseStaleCampaignLocks();
      return reply.code(200).send({ ok: true, ...result });
    } catch (err) {
      log.error({ err }, 'Stale lock reaper failed');
      return reply.code(500).send({ error: 'Stale lock reaper failed' });
    }
  });
}
