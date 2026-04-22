import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { generateSceneEmbedding, processStateChanges } from './sceneGenerator/processStateChanges.js';
import { compressSceneToSummary, generateLocationSummary } from './memoryCompressor.js';
import { pauseNpcsAtLocation, resumeNpcsAtLocation } from './livingWorld/npcLifecycle.js';
import { applyCompanionTravel } from './livingWorld/companionService.js';
import { handleNpcKills } from './livingWorld/reputationHook.js';
import { updateDmMemoryFromScene } from './livingWorld/dmMemoryUpdater.js';
import { assignGoalsForCampaign } from './livingWorld/questGoalAssigner.js';
import { runTickBatch } from './livingWorld/npcTickDispatcher.js';
import { onLocationEntry, onDeadlinePass } from './livingWorld/globalNpcTriggers.js';
import { markLocationDiscovered, markEdgeDiscoveredByUser } from './livingWorld/userDiscoveryService.js';
import { findOrCreateWorldLocation } from './livingWorld/worldStateService.js';
import { markEdgeDiscovered } from './livingWorld/travelGraph.js';

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
  log.info({ sceneId, campaignId, newLoc, prevLoc }, 'Post-scene work START');
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
    phase1Tasks.push(processStateChanges(campaignId, stateChanges, { prevLoc }));
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
    // Phase 7 — record the travel in UserWorldKnowledge (owner) + flip the
    // edge's discoveredByCampaigns bit. Best-effort, never blocks.
    if (campaign?.livingWorldEnabled && campaign.userId) {
      phase1Tasks.push(
        (async () => {
          try {
            const [prevRow, newRow] = await Promise.all([
              findOrCreateWorldLocation(prevLoc),
              findOrCreateWorldLocation(newLoc),
            ]);
            if (!prevRow?.id || !newRow?.id) return;
            await Promise.allSettled([
              markLocationDiscovered({ userId: campaign.userId, locationId: newRow.id, campaignId }),
              markLocationDiscovered({ userId: campaign.userId, locationId: prevRow.id, campaignId }),
              markEdgeDiscoveredByUser({
                userId: campaign.userId,
                fromLocationId: prevRow.id,
                toLocationId: newRow.id,
              }),
              markEdgeDiscovered({
                fromLocationId: prevRow.id,
                toLocationId: newRow.id,
                campaignId,
              }),
            ]);
          } catch (err) {
            log.warn({ err: err?.message, prevLoc, newLoc }, 'discovery marking failed (non-fatal)');
          }
        })(),
      );
    }
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

  // Living World Phase 3 — reputation hook. Runs after Phase 1 so CampaignNPC
  // promotion + worldNpcId linkage is in place. Best-effort — never blocks.
  if (campaign?.livingWorldEnabled && stateChanges?.npcs?.some((n) => n?.alive === false)) {
    try {
      await handleNpcKills({
        campaign,
        stateChanges,
        narrative,
        playerAction,
        provider,
        timeoutMs: llmNanoTimeoutMs,
      });
    } catch (err) {
      log.warn({ err, campaignId }, 'Kill reputation hook failed (non-fatal)');
    }
  }

  // Living World Phase 4 — DM agent memory update. Runs in parallel with
  // nano-extraction below (independent data path). Never blocks scene commit.
  if (campaign?.livingWorldEnabled && narrative) {
    // Fire-and-forget — the updater handles its own errors.
    updateDmMemoryFromScene({
      campaignId,
      narrative,
      playerAction,
      provider,
      timeoutMs: llmNanoTimeoutMs,
    }).catch((err) => {
      log.warn({ err: err?.message, campaignId }, 'DM memory update failed (non-fatal)');
    });
  }

  // Living World Phase 5 + D — goal refresh + event-driven NPC triggers.
  // The assigner re-evaluates quest-tied NPCs (wait/seeker/return-home)
  // based on current player location AND fills in sideways background
  // goals for NPCs with no quest role. Then event-driven triggers fire:
  //   - onLocationEntry when the player just entered a WorldLocation —
  //     local NPCs react (first-visit or after cooldown)
  //   - onDeadlinePass — any NPC whose goalDeadlineAt has elapsed gets a
  //     catch-up tick so their plan advances
  //   - legacy runTickBatch stays as a belt-and-suspenders fallback (dropped
  //     to limit=5 now that event triggers do the heavy lifting)
  if (campaign?.livingWorldEnabled) {
    try {
      await assignGoalsForCampaign(campaignId, { currentSceneIndex: scene.sceneIndex });

      if (newLoc && prevLoc && newLoc !== prevLoc) {
        try {
          const newRow = await findOrCreateWorldLocation(newLoc);
          if (newRow?.id) {
            await onLocationEntry({
              campaignId,
              worldLocationId: newRow.id,
              provider,
            });
          }
        } catch (err) {
          log.warn({ err: err?.message, campaignId, newLoc }, 'onLocationEntry failed (non-fatal)');
        }
      }

      try {
        await onDeadlinePass({ provider });
      } catch (err) {
        log.warn({ err: err?.message, campaignId }, 'onDeadlinePass failed (non-fatal)');
      }

      const result = await runTickBatch({
        campaignId,
        currentSceneIndex: scene.sceneIndex,
        limit: 5,
        provider,
        timeoutMs: llmNanoTimeoutMs,
      });
      log.info({ campaignId, sceneIndex: scene.sceneIndex, tickBatch: result }, 'Phase 5 scene-tick batch');
    } catch (err) {
      log.warn({ err: err?.message, campaignId }, 'Phase 5 scene-tick batch failed (non-fatal)');
    }
  }

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
  log.info({ sceneId, campaignId, tasksSettled: results.length }, 'Post-scene work DONE');
}
