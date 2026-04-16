import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { generateSceneEmbedding, processStateChanges } from './sceneGenerator/processStateChanges.js';
import { compressSceneToSummary, generateLocationSummary } from './memoryCompressor.js';

const log = childLogger({ module: 'postSceneWork' });

/**
 * Handle post-scene async work. Called either by Cloud Tasks (prod) or
 * inline fire-and-forget (dev). Each operation must be idempotent because
 * Cloud Tasks may retry on failure.
 */
export async function handlePostSceneWork({
  sceneId,
  campaignId,
  playerAction,
  provider,
  newLoc,
  prevLoc,
  llmNanoTimeoutMs,
}) {
  const scene = await prisma.campaignScene.findUnique({ where: { id: sceneId } });
  if (!scene) {
    log.warn({ sceneId }, 'Scene not found — skipping post-scene work');
    return;
  }

  const stateChanges = scene.stateChanges ? JSON.parse(scene.stateChanges) : null;
  const narrative = scene.narrative;

  const tasks = [
    generateSceneEmbedding(scene),
  ];
  if (stateChanges) {
    tasks.push(processStateChanges(campaignId, stateChanges));
  }
  tasks.push(
    compressSceneToSummary(campaignId, narrative, playerAction, provider, { timeoutMs: llmNanoTimeoutMs }),
  );
  if (newLoc && prevLoc && newLoc !== prevLoc) {
    tasks.push(
      generateLocationSummary(campaignId, newLoc, prevLoc, provider, { timeoutMs: llmNanoTimeoutMs }),
    );
  }

  const results = await Promise.allSettled(tasks);
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    log.error(
      { failures: failures.map((f) => f.reason?.message), sceneId, campaignId },
      'Post-scene work partial failure',
    );
    throw new Error(`Post-scene work failed: ${failures.length} task(s)`);
  }
}
