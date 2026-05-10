import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'cloudTasks' });

let client = null;
async function getClient() {
  if (!client) {
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    client = new CloudTasksClient();
  }
  return client;
}

/**
 * Enqueue post-scene work via Cloud Tasks (prod) or run inline (dev).
 *
 * In local dev (CLOUD_TASKS_ENABLED=false), falls back to inline fire-and-forget
 * matching pre-migration behavior. In prod, dispatches an HTTP task to
 * POST /v1/internal/post-scene-work with OIDC auth.
 */
export async function enqueuePostSceneWork(payload) {
  if (!config.cloudTasksEnabled) {
    const { handlePostSceneWork } = await import('./postSceneWork.js');
    handlePostSceneWork(payload).catch((err) =>
      log.error({ err }, 'Inline post-scene-work failed'),
    );
    return;
  }

  const tasksClient = await getClient();
  const parent = tasksClient.queuePath(
    config.gcpProjectId,
    config.gcpRegion,
    'post-scene-work',
  );

  const headers = { 'Content-Type': 'application/json' };
  if (payload.requestId) {
    headers['X-Request-Id'] = payload.requestId;
  }

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url: `${config.selfUrl}/v1/internal/post-scene-work`,
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      headers,
      oidcToken: {
        serviceAccountEmail: config.runtimeServiceAccount,
        audience: config.selfUrl,
      },
    },
    dispatchDeadline: { seconds: 1800 },
  };

  await tasksClient.createTask({ parent, task });
  log.debug({ sceneId: payload.sceneId, requestId: payload.requestId }, 'Enqueued post-scene-work task');
}
