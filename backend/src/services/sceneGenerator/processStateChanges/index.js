import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { getCampaignCharacterIds } from '../../campaignSync.js';
import { applyDungeonRoomState } from '../../livingWorld/dungeonEntry.js';
import { auditQuestWorldImpact } from '../../livingWorld/questAudit.js';
import { applyFameFromEvent } from '../../livingWorld/fameService.js';
import { appendEvent } from '../../livingWorld/worldEventLog.js';
import { resolveWorldLocation, walkUpAncestors, resolveLocationByName } from '../../livingWorld/worldStateService.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN, lookupLocationByKindId } from '../../locationRefs.js';

import { generateSceneEmbedding } from './sceneEmbedding.js';
import { processNpcChanges, processItemAttributions } from './npcs.js';
import { processNpcMemoryUpdates } from './npcMemoryUpdates.js';
import { processKnowledgeUpdates, processCodexUpdates } from './knowledgeCodex.js';
import { processQuestObjectiveUpdates, processQuestStatusChange } from './quests.js';
import { processLocationChanges } from './locations.js';
import {
  shouldPromoteToGlobal,
  processLocationMentions,
  processWorldImpactEvent,
  processCampaignComplete,
} from './livingWorld.js';

// Re-exported so existing test file processStateChanges.test.js keeps
// working via `import { shouldPromoteToGlobal } from './processStateChanges.js'`.
export { shouldPromoteToGlobal, generateSceneEmbedding };

const log = childLogger({ module: 'sceneGenerator' });

// Match-or-drop resolver for AI-emitted `stateChanges.currentLocation`.
// Returns `{ kind, id, name }` when the target name resolves to an existing
// canonical WorldLocation OR per-campaign CampaignLocation in this campaign's
// fog. Returns null on miss — caller drops the emission, player stays put.
//
// AI never creates locations mid-play (per `knowledge/concepts/scene-generation.md`
// and `hearsay-and-ai-locations.md`). The `findOrCreateCampaignLocation` path
// is reserved for sublocation entries (`stateChanges.newLocations` with
// `parentLocationName` set) and creation-time `initialLocationsResolver`.
async function resolveCurrentLocationTarget(campaignId, targetName) {
  const ref = await resolveLocationByName(targetName, { campaignId }).catch(() => null);
  if (!ref?.row?.id) return null;
  const name = ref.kind === LOCATION_KIND_WORLD
    ? (ref.row.canonicalName || targetName)
    : (ref.row.name || targetName);
  return { kind: ref.kind, id: ref.row.id, name };
}

export async function processStateChanges(campaignId, stateChanges, { prevLoc = null, sceneIndex = null, currentRef = null } = {}) {
  // Fetch campaign once to check living-world flag + userId for Phase 4
  // WorldEvent attribution (cheap — same record is already loaded by
  // postSceneWork for the same campaignId).
  let livingWorldEnabled = false;
  let ownerUserId = null;
  let campaignCharacterIds = [];
  try {
    const [campaign, charIds] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { livingWorldEnabled: true, userId: true },
      }),
      getCampaignCharacterIds(campaignId),
    ]);
    livingWorldEnabled = campaign?.livingWorldEnabled === true;
    ownerUserId = campaign?.userId || null;
    campaignCharacterIds = charIds;
  } catch {
    // non-fatal — fall back to legacy behaviour
  }

  // Phase 7 — single timestamp per scene so intra-scene WorldEvents are
  // internally consistent (instead of each appendEvent minting its own
  // `new Date()` drifting by milliseconds). Cross-user time reconstruction
  // later depends on this being stable per scene.
  const sceneGameTime = new Date();

  if (stateChanges.npcs?.length) {
    await processNpcChanges(campaignId, stateChanges.npcs, { livingWorldEnabled, sceneIndex });
  }

  // Stage 2 — NPC memory accumulation (shadow only). Runs AFTER processNpcChanges
  // so any NPC introduced in the same scene already has a CampaignNPC row
  // the memory can attach to. Not gated on livingWorldEnabled: cross-scene
  // NPC consistency benefits classic campaigns too. Canonical WorldNPC is
  // never touched here — post-campaign write-back (Stage 2b) will extract
  // important entries to WorldNPC.knowledgeBase.
  if (Array.isArray(stateChanges.npcMemoryUpdates) && stateChanges.npcMemoryUpdates.length > 0) {
    await processNpcMemoryUpdates(campaignId, stateChanges.npcMemoryUpdates);
  }

  // Campaign completion → global WorldEvent (user's explicit requirement:
  // "zakończenie kampanii musi być zapisane globalnie").
  if (livingWorldEnabled && stateChanges.campaignComplete) {
    await processCampaignComplete({
      campaignId,
      data: stateChanges.campaignComplete,
      ownerUserId,
      sceneGameTime,
      currentLocationName: currentRef?.name || null,
    });
    await applyFameFromEvent(campaignCharacterIds, {
      eventType: 'campaign_complete',
      visibility: 'global',
      payload: {},
    });
  }

  if (livingWorldEnabled && stateChanges.newItems?.length) {
    await processItemAttributions(campaignId, stateChanges.newItems, ownerUserId, sceneGameTime);
  }

  // AI emits `stateChanges.currentLocation` (string) and/or `currentX/currentY`
  // (numbers) after a travel montage, sublocation walk-in, or free-vector
  // movement. F5d Phase 2 — three modes:
  //
  //   1. Name resolves to fog-visible POI → anchored: write FK trio + sync
  //      currentX/Y from the POI's regionX/regionY.
  //   2. Name doesn't resolve, but currentX/Y given → wandering: store the
  //      flavor name (no FK), set continuous coords. The flavor name does NOT
  //      create a CampaignLocation row — it's a one-shot label for the patch
  //      of biome the player is standing on.
  //   3. Bare currentX/Y, no name → wandering with no flavor (clear name).
  //
  // Unresolved name with no coords falls through with a warning (legacy
  // match-or-drop behaviour preserved).
  const aiName = typeof stateChanges.currentLocation === 'string' && stateChanges.currentLocation.trim()
    ? stateChanges.currentLocation.trim()
    : null;
  const aiX = typeof stateChanges.currentX === 'number' && Number.isFinite(stateChanges.currentX)
    ? stateChanges.currentX
    : null;
  const aiY = typeof stateChanges.currentY === 'number' && Number.isFinite(stateChanges.currentY)
    ? stateChanges.currentY
    : null;
  const hasCoords = aiX !== null && aiY !== null;

  if (aiName || hasCoords) {
    try {
      let updates = null;
      if (aiName) {
        const resolved = await resolveCurrentLocationTarget(campaignId, aiName);
        if (resolved) {
          const coords = await lookupLocationByKindId({
            prisma,
            kind: resolved.kind,
            id: resolved.id,
            select: { regionX: true, regionY: true },
          }).catch(() => null);
          updates = {
            currentLocationName: resolved.name,
            currentLocationKind: resolved.kind,
            currentLocationId: resolved.id,
            currentX: coords?.regionX ?? null,
            currentY: coords?.regionY ?? null,
          };
          log.info({ campaignId, name: resolved.name, kind: resolved.kind, x: updates.currentX, y: updates.currentY }, 'currentLocation updated (anchored at POI)');
        } else if (hasCoords) {
          updates = {
            currentLocationName: aiName,
            currentLocationKind: null,
            currentLocationId: null,
            currentX: aiX,
            currentY: aiY,
          };
          log.info({ campaignId, flavorName: aiName, x: aiX, y: aiY }, 'currentLocation updated (wandering — flavor name + coords, no DB POI row)');
        } else {
          log.warn(
            { campaignId, ignored: aiName },
            'AI emitted stateChanges.currentLocation but name did not resolve and no currentX/Y given — dropped',
          );
        }
      } else {
        updates = {
          currentLocationName: null,
          currentLocationKind: null,
          currentLocationId: null,
          currentX: aiX,
          currentY: aiY,
        };
        log.info({ campaignId, x: aiX, y: aiY }, 'currentLocation cleared (wandering — bare coords)');
      }
      if (updates) {
        await prisma.campaign.update({ where: { id: campaignId }, data: updates });
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, aiName, aiX, aiY }, 'currentLocation resolve/update failed');
    }
  }

  let locResult = { createdSublocs: [] };
  if (livingWorldEnabled && stateChanges.newLocations?.length) {
    locResult = await processLocationChanges(campaignId, stateChanges.newLocations, { prevLoc }) || { createdSublocs: [] };
  }

  // Auto-promote: AI emitted exactly one new sublocation whose parent is in
  // the player's walk-up ancestor chain → set it as currentLocation. Covers
  // intra-settlement (gracz wchodzi do nowej tawerny), inter-subloc within
  // canonical settlement (Komnata Tronowa → Skarbiec, both subs of Yeralden),
  // and child-of-canonical-subloc (Wieża Maga → Pracownia). Multi-subloc
  // emission (AI mentions kilka budynków) does NOT auto-promote — only one
  // is the player's actual destination, and we'd guess wrong.
  if (livingWorldEnabled && locResult.createdSublocs.length === 1 && currentRef) {
    try {
      const created = locResult.createdSublocs[0];
      const parentKey = `${created.row.parentLocationKind}:${created.row.parentLocationId}`;
      const ancestors = await walkUpAncestors(currentRef);
      if (ancestors.has(parentKey)) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            currentLocationName: created.row.name,
            currentLocationKind: created.kind,
            currentLocationId: created.row.id,
          },
        });
        log.info(
          { campaignId, sublocId: created.row.id, sublocName: created.row.name },
          'Auto-promoted new sublocation to currentLocation (parent in walk-up chain)',
        );
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId }, 'auto-promote sublocation → currentLocation failed (non-fatal)');
    }
  }

  // Round B (Phase 4b) — hearsay. `locationMentioned` is an array of
  // `{ locationId, byNpcId }` emitted when a key NPC reveals a location in
  // dialog. Promotes the location to "heard-about" for the player + enforces
  // policy: the NPC must have the location in their knownLocations set, else
  // we reject the mention and log a warning (prevents LLM from leaking
  // hearsay past intent). Zod-validated + array capped at 20 inside the handler.
  if (livingWorldEnabled && Array.isArray(stateChanges.locationMentioned) && stateChanges.locationMentioned.length > 0) {
    await processLocationMentions(campaignId, stateChanges.locationMentioned);
  }

  // Phase 7 — dungeon room state flags. `prevLoc` is the room the player
  // was IN when premium wrote the flags; currentLocation may already point
  // to the next room (movement). Flags apply to prevLoc.
  if (livingWorldEnabled && stateChanges.dungeonRoom && prevLoc) {
    await applyDungeonRoomState({
      campaignId,
      prevLoc,
      flags: stateChanges.dungeonRoom,
    });
  }

  if (stateChanges.knowledgeUpdates) {
    await processKnowledgeUpdates(campaignId, stateChanges.knowledgeUpdates);
  }

  if (stateChanges.codexUpdates?.length) {
    await processCodexUpdates(campaignId, stateChanges.codexUpdates);
  }

  // Premium sees quest *names* in its prompt (not ids), so completedQuests
  // and questUpdates[].questId may carry names or hallucinated ids. Route
  // everything through resolveActiveQuest so downstream (audit, world-impact
  // gate, goal reassigner) works against real CampaignQuest.questId values.
  //
  // Ordering matters: resolve completedQuests BEFORE questUpdates. Otherwise
  // an auto-completion during questUpdates leaves only one active quest,
  // and the single-active fallback in completedQuests could wrongly close
  // the wrong quest.
  if (stateChanges.completedQuests?.length) {
    stateChanges.completedQuests = await processQuestStatusChange(
      campaignId, stateChanges.completedQuests, 'completed',
    );
  }

  if (stateChanges.failedQuests?.length) {
    stateChanges.failedQuests = await processQuestStatusChange(
      campaignId, stateChanges.failedQuests, 'failed',
    );
  }

  if (stateChanges.questUpdates?.length) {
    const autoCompleted = await processQuestObjectiveUpdates(
      campaignId, stateChanges.questUpdates, stateChanges.completedQuests || [],
    );
    if (autoCompleted.length > 0) {
      if (!Array.isArray(stateChanges.completedQuests)) stateChanges.completedQuests = [];
      for (const id of autoCompleted) {
        if (!stateChanges.completedQuests.includes(id)) stateChanges.completedQuests.push(id);
      }
    }
  }

  // Major-event gate (Zakres C). Two paths fire a global WorldEvent:
  //   1) AI flagged worldImpact='major' / deadly / dungeon AND the gate
  //      (named kill / main quest / liberation) confirms with evidence.
  //   2) Side quest auto-completed without any worldImpact flag — nano
  //      audit asks "is this a tavern rumour?" as a cheap backup.
  if (livingWorldEnabled && stateChanges.completedQuests?.length) {
    // Resolve main vs side for completed quests in this scene (one query).
    let completedMeta = [];
    try {
      completedMeta = await prisma.campaignQuest.findMany({
        where: { campaignId, questId: { in: stateChanges.completedQuests } },
        select: { questId: true, name: true, description: true, type: true },
      });
    } catch (err) {
      log.warn({ err, campaignId }, 'completedQuests metadata fetch failed');
    }
    const mainQuestCompleted = completedMeta.some((q) => q.type === 'main');

    const hasExplicitImpact = stateChanges.worldImpact === 'major'
      || stateChanges.defeatedDeadlyEncounter === true
      || !!stateChanges.dungeonComplete
      || stateChanges.locationLiberated === true;

    if (hasExplicitImpact || mainQuestCompleted) {
      await processWorldImpactEvent({
        campaignId,
        stateChanges,
        ownerUserId,
        sceneGameTime,
        mainQuestCompleted,
        characterIds: campaignCharacterIds,
      });
    }

    // Backup audit for side quests when nothing else promoted the scene.
    // Skip main quests (they promote via gate) and skip when an explicit
    // impact already wrote a global event — no duplication.
    if (!hasExplicitImpact) {
      const sideQuests = completedMeta.filter((q) => q.type !== 'main');
      const auditLocationName = currentRef?.name || null;
      for (const quest of sideQuests) {
        const verdict = await auditQuestWorldImpact(quest, {
          locationName: auditLocationName,
          sceneSummary: stateChanges.campaignComplete?.summary || null,
        });
        if (verdict?.isMajor) {
          let worldLocationId = null;
          if (auditLocationName && currentRef?.kind === 'world') {
            // Skip the resolveWorldLocation hop when we already know the
            // canonical id from currentRef. Wilderness/campaign rows leave
            // `worldLocationId=null` (event still records via campaignId).
            worldLocationId = currentRef.id;
          } else if (auditLocationName) {
            try {
              const loc = await resolveWorldLocation(auditLocationName);
              worldLocationId = loc?.id || null;
            } catch { /* non-fatal */ }
          }
          await appendEvent({
            worldLocationId,
            campaignId,
            userId: ownerUserId,
            eventType: 'major_deed',
            payload: {
              gate: 'nano_audit',
              reason: verdict.reason,
              questName: quest.name,
              locationName: auditLocationName,
            },
            visibility: 'global',
            gameTime: sceneGameTime,
          });
          log.info({ campaignId, questId: quest.questId, reason: verdict.reason }, 'nano audit promoted side quest to global');
          await applyFameFromEvent(campaignCharacterIds, {
            eventType: 'major_deed',
            visibility: 'global',
            payload: { gate: 'nano_audit' },
          });
        }
      }
    }
  } else if (livingWorldEnabled && (
    stateChanges.worldImpact === 'major'
    || stateChanges.defeatedDeadlyEncounter === true
    || stateChanges.dungeonComplete
    || stateChanges.locationLiberated === true
  )) {
    // No completed quests this scene — still honour explicit impact flags.
    await processWorldImpactEvent({
      campaignId,
      stateChanges,
      ownerUserId,
      sceneGameTime,
      mainQuestCompleted: false,
      characterIds: campaignCharacterIds,
    });
  }

}
