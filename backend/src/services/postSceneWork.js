import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { generateSceneEmbedding, processStateChanges } from './sceneGenerator/processStateChanges.js';
import { getCampaignCharacterIds } from './campaignSync.js';
import { compressSceneToSummary, generateLocationSummary, appendSceneDigest } from './memoryCompressor.js';
// `updateDmMemoryFromScene` merged into `compressSceneToSummary` — DM notes,
// hooks + resolvedHookIds now come out of the same nano call that extracts
// facts/journal/codex/knowledge/needs. The standalone updater is kept in
// `livingWorld/dmMemoryUpdater.js` for tests / future ad-hoc uses.
import { markLocationDiscovered, markLocationHeardAbout, markEdgeDiscoveredByUser } from './livingWorld/userDiscoveryService.js';
import { resolveLocationByName } from './livingWorld/worldStateService.js';
import { markEdgeDiscovered } from './livingWorld/travelGraph.js';
import { listLocationsForCampaign } from './livingWorld/locationQueries.js';
import { LOCATION_KIND_WORLD } from './locationRefs.js';
import { extractGraphUpdate, validateGraphUpdate, applyGraphUpdate } from './locationGraph/index.js';
import { setLlmCallUserId } from './llmCallLogger.js';
import { checkQuestProgress } from './questProgressChecker.js';

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
  requestId,
}) {
  log.info({ sceneId, campaignId, newLoc, prevLoc, requestId }, 'Post-scene work START');
  const [scene, campaign] = await Promise.all([
    prisma.campaignScene.findUnique({ where: { id: sceneId } }),
    prisma.campaign.findUnique({ where: { id: campaignId } }),
  ]);
  if (!scene) {
    log.warn({ sceneId }, 'Scene not found — skipping post-scene work');
    return;
  }
  if (campaign?.userId) setLlmCallUserId(campaign.userId);

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
    // Oś 3 — questOffers żyją na top-level scene-a (zgodnie z response
    // template), ale processStateChanges materializuje quest grafy z
    // jednego miejsca. Squash do stateChanges.questOffers przed wywołaniem.
    if (Array.isArray(scene.questOffers) && scene.questOffers.length > 0 && !stateChanges.questOffers) {
      stateChanges.questOffers = scene.questOffers;
    }
    phase1Tasks.push(processStateChanges(campaignId, stateChanges, {
      prevLoc, sceneIndex: scene.sceneIndex, currentRef,
    }));
  }
  const compressPromise = compressSceneToSummary(campaignId, sceneTranscript, playerAction, provider, {
    timeoutMs: llmNanoTimeoutMs,
    sceneIndex: scene.sceneIndex,
    wrapupText,
    dialogueText: sceneDialogueOnly,
    allowedLocationNames,
  });
  phase1Tasks.push(compressPromise);
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
  }

  const results = await Promise.allSettled(phase1Tasks);

  // Quest XP: processStateChanges attaches `stateChanges.questXpDelta` when
  // quest objectives are completed or quests finish. Apply it to the active
  // character(s) now — after phase 1 settled and the delta is known.
  if (stateChanges?.questXpDelta > 0) {
    try {
      const charIds = await getCampaignCharacterIds(campaignId);
      for (const charId of charIds) {
        await applyQuestXpToCharacter(charId, stateChanges.questXpDelta);
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, xp: stateChanges.questXpDelta }, 'Quest XP application failed (non-fatal)');
    }
  }

  // Quest money: same pattern — auto-completed quests' reward money is applied
  // here because the character snapshot was already sent to FE inline.
  // (Explicitly-completed quests' money is merged into moneyChange inline in
  // generateSceneStream before the snapshot is built.)
  const qm = stateChanges?.questMoneyDelta;
  if (qm && (qm.gold || qm.silver || qm.copper)) {
    try {
      const charIds = await getCampaignCharacterIds(campaignId);
      for (const charId of charIds) {
        await applyQuestMoneyToCharacter(charId, qm);
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, money: qm }, 'Quest money application failed (non-fatal)');
    }
  }

  // Snapshot the post-Phase-1 location into the scene's stateChanges. Phase 1
  // ran `processStateChanges` (if any) so `Campaign.currentLocation*` now
  // reflects where the scene actually settled. Persist a `_locationSnapshot`
  // marker (underscore = backend-only, not consumed by LLM) so each scene
  // remembers its own location even after the Campaign row mutates onward.
  // Idempotent: re-running on the same sceneId writes the same value.
  try {
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentLocationName: true, currentLocationKind: true, currentLocationId: true },
    });
    const snapName = updatedCampaign?.currentLocationName ?? null;
    const snapshot = {
      name: snapName,
      kind: updatedCampaign?.currentLocationKind ?? (snapName ? 'wandering' : null),
      id: updatedCampaign?.currentLocationId ?? null,
      sceneIndex: scene.sceneIndex,
    };
    const merged = { ...(scene.stateChanges || {}), _locationSnapshot: snapshot };
    await prisma.campaignScene.update({
      where: { id: sceneId },
      data: { stateChanges: merged },
    });
  } catch (err) {
    log.warn({ err: err?.message, sceneId }, '_locationSnapshot write failed (non-fatal)');
  }

  // Location Graph — extract spatial/structural updates from the scene
  // narrative and apply them to the graph. Async + best-effort; never blocks
  // the main post-scene pipeline. Runs after Phase 1 so currentLocation FK
  // is already set on the campaign row.
  if (campaign?.livingWorldEnabled && sceneTranscript) {
    try {
      const locKind = campaign.currentLocationKind || null;
      const locId = campaign.currentLocationId || null;
      if (locKind && locId) {
        const graphUpdate = await extractGraphUpdate({
          sceneText: sceneTranscript,
          playerAction,
          stateChanges,
          campaignId,
          locationId: locId,
          locationKind: locKind,
          provider,
          timeoutMs: llmNanoTimeoutMs,
        });
        if (graphUpdate) {
          const { valid, warnings } = validateGraphUpdate(graphUpdate);
          if (warnings.length > 0) {
            log.debug({ warnings, campaignId }, 'Graph update validation warnings');
          }
          if (valid) {
            await applyGraphUpdate(graphUpdate, { campaignId });
          }
        }
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId }, 'Graph extraction/apply failed (non-fatal)');
    }
  }


  // Living World Phase 4 — DM agent memory + hooks are now produced inside
  // compressSceneToSummary (merged extractor). No separate nano call here.

  // Living World — NPC ticks are admin-only now. The per-scene auto-triggers
  // (onLocationEntry / onDeadlinePass / runTickBatch) were removed; activeGoal
  // advancement happens exclusively via the admin panel "Manual Tick" button
  // (POST /v1/admin/livingWorld/npcs/:id/tick) until a redesign lands.

  // Phase 2: process nano-extracted knowledge/codex from compressSceneToSummary.
  // compressPromise already settled inside Promise.allSettled above — re-await
  // is free and avoids fragile array-index math.
  let nanoState = null;
  try {
    nanoState = await compressPromise;
  } catch {
    // already logged via Promise.allSettled failure path below
  }
  if (nanoState) {
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
  // Quest Progress Log — every 2 scenes, nano checks for player actions
  // that relate to active quest objectives and writes matches to
  // CampaignQuestObjective.metadata.progressLog[]. Best-effort.
  if (scene.sceneIndex % 2 === 0) {
    await checkQuestProgress({
      campaignId,
      sceneTranscript,
      playerAction,
      sceneIndex: scene.sceneIndex,
      provider,
      timeoutMs: llmNanoTimeoutMs,
    }).catch((err) =>
      log.warn({ err: err?.message, campaignId }, 'Quest progress check failed (non-fatal)'),
    );
  }

  // Location History Digest — append a one-line digest to the current
  // location's ring buffer so return-to-location scenes get grounded context.
  // Uses the first major memory entry from the compress result as the digest
  // text; falls back to the player action if compress was skipped/failed.
  const digestLocationName = newLoc || prevLoc;
  if (digestLocationName) {
    let digestText = playerAction || '';
    if (nanoState) {
      const majorFact = nanoState._majorMemoryText;
      if (majorFact) digestText = majorFact;
    }
    if (digestText) {
      try {
        await appendSceneDigest(campaignId, digestLocationName, scene.sceneIndex, digestText);
      } catch (err) {
        log.warn({ err: err?.message, campaignId }, 'Scene digest append failed (non-fatal)');
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

function charLevelCost(targetLevel) {
  return 5 * targetLevel * targetLevel;
}

function cumulativeCharXpThreshold(targetLevel) {
  if (targetLevel <= 1) return 0;
  let sum = 0;
  for (let k = 2; k <= targetLevel; k++) sum += charLevelCost(k);
  return sum;
}

async function applyQuestMoneyToCharacter(characterId, moneyDelta) {
  const char = await prisma.character.findUnique({
    where: { id: characterId },
    select: { money: true },
  });
  if (!char) return;
  const cur = char.money || { gold: 0, silver: 0, copper: 0 };
  const gold = (cur.gold || 0) + (moneyDelta.gold || 0);
  const silver = (cur.silver || 0) + (moneyDelta.silver || 0);
  const copper = (cur.copper || 0) + (moneyDelta.copper || 0);
  await prisma.character.update({
    where: { id: characterId },
    data: { money: { gold, silver, copper } },
  });
}

async function applyQuestXpToCharacter(characterId, xpDelta) {
  const char = await prisma.character.findUnique({
    where: { id: characterId },
    select: { characterXp: true, characterLevel: true, attributePoints: true },
  });
  if (!char) return;
  let charXp = (char.characterXp || 0) + xpDelta;
  let charLevel = char.characterLevel || 1;
  let attrPoints = char.attributePoints || 0;
  while (charXp >= cumulativeCharXpThreshold(charLevel + 1)) {
    charLevel++;
    attrPoints++;
  }
  await prisma.character.update({
    where: { id: characterId },
    data: { characterXp: charXp, characterLevel: charLevel, attributePoints: attrPoints },
  });
  if (charLevel > (char.characterLevel || 1)) {
    log.info({ characterId, charXp, charLevel, xpDelta }, 'Quest XP caused level-up');
  }
}
