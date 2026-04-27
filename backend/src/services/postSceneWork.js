import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { generateSceneEmbedding, processStateChanges } from './sceneGenerator/processStateChanges.js';
import { compressSceneToSummary, generateLocationSummary } from './memoryCompressor.js';
import { pauseNpcsAtLocation, resumeNpcsAtLocation } from './livingWorld/npcLifecycle.js';
import { applyCompanionTravel } from './livingWorld/companionService.js';
import { handleNpcKills } from './livingWorld/reputationHook.js';
// `updateDmMemoryFromScene` merged into `compressSceneToSummary` — DM notes,
// hooks + resolvedHookIds now come out of the same nano call that extracts
// facts/journal/codex/knowledge/needs. The standalone updater is kept in
// `livingWorld/dmMemoryUpdater.js` for tests / future ad-hoc uses.
import { markLocationDiscovered, markLocationHeardAbout, markEdgeDiscoveredByUser } from './livingWorld/userDiscoveryService.js';
import { resolveLocationByName } from './livingWorld/worldStateService.js';
import { markEdgeDiscovered } from './livingWorld/travelGraph.js';
import { listLocationsForCampaign } from './livingWorld/locationQueries.js';
import { LOCATION_KIND_WORLD } from './locationRefs.js';

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
  wrapupText = null,
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

  const stateChanges = scene.stateChanges || null;

  // Build the scene transcript from `dialogueSegments` — the sole source of
  // scene prose. Premium stopped emitting a top-level `narrative` long ago;
  // it writes narration + dialogue as typed segments in `dialogueSegments`.
  // (`scene.narrative` is a legacy derived join of narration segments only,
  // so concatenating it here would duplicate every narration line.) Without
  // the dialogue lines, nano was analyzing narration-only input and either
  // returning empty results or flipping `isDominatedScene` (short narration
  // without quote marks → "dominated" → skip).
  const sceneDialogueSegments = Array.isArray(scene.dialogueSegments) ? scene.dialogueSegments : [];
  const sceneTranscript = Array.isArray(sceneDialogueSegments)
    ? sceneDialogueSegments
        .map((seg) => {
          if (!seg || typeof seg.text !== 'string') return '';
          if (seg.type === 'dialogue') {
            const speaker = seg.character || 'NPC';
            return `${speaker}: "${seg.text}"`;
          }
          return seg.text;
        })
        .filter(Boolean)
        .join('\n')
    : '';

  // Hearsay extraction reads NPC speech only — not narration. Build a
  // dialogue-only transcript so nano can mine `mentionedLocations` without
  // ever picking a place name from a narrator description (per
  // hearsay-and-ai-locations.md: only NPC-spoken mentions flip fog-of-war).
  const sceneDialogueOnly = sceneDialogueSegments
    .filter((seg) => seg && seg.type === 'dialogue' && typeof seg.text === 'string')
    .map((seg) => `${seg.character || 'NPC'}: "${seg.text}"`)
    .join('\n');

  // Constraint set for nano's `mentionedLocations` bucket — every location
  // this campaign may reference (canonical world rows shared across users
  // PLUS this campaign's CampaignLocation sandbox). Nano picks names ONLY
  // from this list; anything off-list is silently dropped on its side.
  let allowedLocationNames = [];
  if (campaign?.livingWorldEnabled) {
    try {
      const rows = await listLocationsForCampaign(campaignId);
      allowedLocationNames = rows
        .map((r) => r.displayName || r.canonicalName || r.name || null)
        .filter((n) => typeof n === 'string' && n.trim().length > 0);
    } catch (err) {
      log.warn({ err: err?.message, campaignId }, 'allowedLocationNames lookup failed (non-fatal)');
    }
  }

  // Phase 1: parallel tasks — embedding, premium stateChanges, memory compression, location summary
  const phase1Tasks = [
    generateSceneEmbedding(scene),
  ];
  if (stateChanges) {
    // Post-(round-no-AI-locations): auto-promote new sublocation → currentLocation
    // needs the canonical "where the player is now" ref so it can walk up the
    // parent chain. Travel resolver already wrote `Campaign.currentLocation*`
    // before this call, so the loaded `campaign` row carries the post-travel
    // ref — exactly the ancestor anchor we want.
    const currentRef = campaign?.currentLocationKind && campaign?.currentLocationId
      ? { kind: campaign.currentLocationKind, id: campaign.currentLocationId, name: campaign.currentLocationName || null }
      : null;
    phase1Tasks.push(processStateChanges(campaignId, stateChanges, {
      prevLoc, sceneIndex: scene.sceneIndex, currentRef,
    }));
  }
  phase1Tasks.push(
    compressSceneToSummary(campaignId, sceneTranscript, playerAction, provider, {
      timeoutMs: llmNanoTimeoutMs,
      sceneIndex: scene.sceneIndex,
      wrapupText,
      dialogueText: sceneDialogueOnly,
      allowedLocationNames,
    }),
  );
  if (newLoc && prevLoc && newLoc !== prevLoc) {
    phase1Tasks.push(
      generateLocationSummary(campaignId, newLoc, prevLoc, provider, { timeoutMs: llmNanoTimeoutMs }),
    );
    // Phase 7 — record the travel in UserDiscoveredLocation/Edge (owner) +
    // upsert a CampaignEdgeDiscovery row. Best-effort, never blocks.
    // F5b — both locations may be canonical OR campaign-scoped; resolve
    // polymorphically and pass the right kind to markLocationDiscovered.
    // markEdgeDiscoveredByUser is canonical-only (Roads), so we only call it
    // when both endpoints resolve to canonical WorldLocations.
    if (campaign?.livingWorldEnabled && campaign.userId) {
      phase1Tasks.push(
        (async () => {
          try {
            const [prevRef, newRef] = await Promise.all([
              resolveLocationByName(prevLoc, { campaignId }),
              resolveLocationByName(newLoc, { campaignId }),
            ]);
            if (!prevRef?.row?.id || !newRef?.row?.id) return;
            const tasks = [
              markLocationDiscovered({
                userId: campaign.userId,
                locationKind: newRef.kind,
                locationId: newRef.row.id,
                campaignId,
              }),
              markLocationDiscovered({
                userId: campaign.userId,
                locationKind: prevRef.kind,
                locationId: prevRef.row.id,
                campaignId,
              }),
            ];
            if (prevRef.kind === LOCATION_KIND_WORLD && newRef.kind === LOCATION_KIND_WORLD) {
              tasks.push(markEdgeDiscoveredByUser({
                userId: campaign.userId,
                fromLocationId: prevRef.row.id,
                toLocationId: newRef.row.id,
              }));
              tasks.push(markEdgeDiscovered({
                fromLocationId: prevRef.row.id,
                toLocationId: newRef.row.id,
                campaignId,
              }));
            }
            await Promise.allSettled(tasks);
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
  // `judgeKill` reads scene text to decide whether the kill was justified;
  // we hand it the full transcript (narration + dialogue) since premium no
  // longer emits a top-level `narrative` field.
  if (campaign?.livingWorldEnabled && stateChanges?.npcs?.some((n) => n?.alive === false)) {
    try {
      await handleNpcKills({
        campaign,
        stateChanges,
        narrative: sceneTranscript,
        playerAction,
        provider,
        timeoutMs: llmNanoTimeoutMs,
      });
    } catch (err) {
      log.warn({ err, campaignId }, 'Kill reputation hook failed (non-fatal)');
    }
  }

  // Living World Phase 4 — DM agent memory + hooks are now produced inside
  // compressSceneToSummary (merged extractor). No separate nano call here.

  // Living World — NPC ticks are admin-only now. The per-scene auto-triggers
  // (onLocationEntry / onDeadlinePass / runTickBatch) were removed; activeGoal
  // advancement happens exclusively via the admin panel "Manual Tick" button
  // (POST /v1/admin/livingWorld/npcs/:id/tick) until a redesign lands.

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

    // Hearsay flips. Nano emitted location names spoken inside the dialogue
    // block + already filtered to the campaign's allowed-list. Resolve each
    // to a polymorphic ref and mark heard-about. We bypass `processLocationMentions`
    // (premium-emitted bucket) on purpose: that path enforces NPC knowledge-
    // scope (anchor + 1-hop Roads + WorldNpcKnownLocation), but the campaign-
    // creation seed already authored these locations as legitimately known to
    // the questgiver — re-checking would only block legitimate flips. Keeps
    // the strict premium path intact for mid-play `stateChanges.locationMentioned`.
    const mentions = Array.isArray(nanoState.mentionedLocations) ? nanoState.mentionedLocations : [];
    if (mentions.length > 0 && campaign?.livingWorldEnabled && campaign?.userId) {
      const flipResults = await Promise.allSettled(mentions.map(async (name) => {
        const ref = await resolveLocationByName(name, { campaignId });
        if (!ref?.row?.id) return { name, flipped: false, reason: 'unresolved' };
        await markLocationHeardAbout({
          userId: campaign.userId,
          locationKind: ref.kind,
          locationId: ref.row.id,
          campaignId,
        });
        return { name, flipped: true, kind: ref.kind, id: ref.row.id };
      }));
      const flipped = flipResults
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((v) => v?.flipped);
      const unresolved = flipResults
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((v) => v && !v.flipped);
      log.info(
        { campaignId, sceneIndex: scene.sceneIndex, flipped: flipped.length, unresolved: unresolved.length, mentions: mentions.length },
        'Hearsay heard-about flips',
      );
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
