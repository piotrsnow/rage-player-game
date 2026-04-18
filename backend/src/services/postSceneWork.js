import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { generateSceneEmbedding, processStateChanges } from './sceneGenerator/processStateChanges.js';
import { compressSceneToSummary, generateLocationSummary } from './memoryCompressor.js';
import { pauseNpcsAtLocation, resumeNpcsAtLocation } from './livingWorld/npcLifecycle.js';
import { applyCompanionTravel } from './livingWorld/companionService.js';

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
  const [scene, campaign] = await Promise.all([
    prisma.campaignScene.findUnique({ where: { id: sceneId } }),
    prisma.campaign.findUnique({ where: { id: campaignId } }),
  ]);
  if (!scene) {
    log.warn({ sceneId }, 'Scene not found — skipping post-scene work');
    return;
  }

  const stateChanges = scene.stateChanges ? JSON.parse(scene.stateChanges) : null;
  const narrative = scene.narrative;

  // Phase 1: parallel tasks — embedding, premium stateChanges, memory compression, location summary
  const phase1Tasks = [
    generateSceneEmbedding(scene),
  ];
  if (stateChanges) {
    phase1Tasks.push(processStateChanges(campaignId, stateChanges));
  }
  phase1Tasks.push(
    compressSceneToSummary(campaignId, narrative, playerAction, provider, {
      timeoutMs: llmNanoTimeoutMs,
      sceneIndex: scene.sceneIndex,
    }),
  );
  if (newLoc && prevLoc && newLoc !== prevLoc) {
    phase1Tasks.push(
      generateLocationSummary(campaignId, newLoc, prevLoc, provider, { timeoutMs: llmNanoTimeoutMs }),
    );
    // Living World: pause NPCs at previous location, resume NPCs at new location.
    // Runs in parallel with generateLocationSummary — both observe the same transition.
    if (campaign?.livingWorldEnabled) {
      // Phase 2: move companions BEFORE pausing at prevLoc. Companions that
      // travel with the party write a deferred companion_moved event and
      // have their read-model lockedSnapshot.locationName refreshed. They
      // are then skipped by pauseNpcsAtLocation (companionOfCampaignId filter).
      // We chain this sequentially (small cost vs race-safety) so that the
      // pause query sees the post-travel companion state.
      phase1Tasks.push(
        (async () => {
          try {
            await applyCompanionTravel({ campaignId, newLocationName: newLoc, userId: campaign.userId });
          } catch (err) {
            log.warn({ err, campaignId, newLoc }, 'applyCompanionTravel failed (non-fatal)');
          }
          try {
            await pauseNpcsAtLocation(prevLoc);
          } catch (err) {
            log.warn({ err, prevLoc }, 'pauseNpcsAtLocation failed (non-fatal)');
          }
          try {
            await resumeNpcsAtLocation(newLoc, campaign, { provider, timeoutMs: llmNanoTimeoutMs });
          } catch (err) {
            log.warn({ err, newLoc }, 'resumeNpcsAtLocation failed (non-fatal)');
          }
        })(),
      );
    }
  }

  const results = await Promise.allSettled(phase1Tasks);

  // Phase 2: process nano-extracted knowledge/codex from compressSceneToSummary
  // The compress call is at index 1 (if stateChanges) or 1 (if no stateChanges) — find it
  const compressIdx = stateChanges ? 2 : 1;
  const compressResult = results[compressIdx];
  if (compressResult?.status === 'fulfilled' && compressResult.value) {
    const nanoState = compressResult.value;
    const nanoChanges = {};
    if (nanoState.knowledgeUpdates) nanoChanges.knowledgeUpdates = nanoState.knowledgeUpdates;
    if (nanoState.codexUpdates?.length) nanoChanges.codexUpdates = nanoState.codexUpdates;
    if (Object.keys(nanoChanges).length > 0) {
      try {
        await processStateChanges(campaignId, nanoChanges);
      } catch (err) {
        log.warn({ err, campaignId }, 'Nano state extraction processing failed (non-fatal)');
      }
    }
  }
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    log.error(
      { failures: failures.map((f) => f.reason?.message), sceneId, campaignId },
      'Post-scene work partial failure',
    );
    throw new Error(`Post-scene work failed: ${failures.length} task(s)`);
  }
}
