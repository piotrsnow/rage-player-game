import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { getCampaignCharacterIds } from '../../campaignSync.js';
import { assignGoalsForCampaign } from '../../livingWorld/questGoalAssigner.js';
import { applyDungeonRoomState } from '../../livingWorld/dungeonEntry.js';
import { auditQuestWorldImpact } from '../../livingWorld/questAudit.js';
import { applyFameFromEvent } from '../../livingWorld/fameService.js';
import { appendEvent } from '../../livingWorld/worldEventLog.js';
import { resolveWorldLocation, resolveLocationByName } from '../../livingWorld/worldStateService.js';

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

export async function processStateChanges(campaignId, stateChanges, { prevLoc = null, sceneIndex = null } = {}) {
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
      currentLocationName: stateChanges.currentLocation,
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

  // Auto-promote: if premium set `currentLocation` to a name that doesn't
  // resolve anywhere (canonical OR campaign sandbox) AND it isn't already in
  // newLocations, prepend a synthesized entry so `processLocationChanges` can
  // create a CampaignLocation with smart position. Without this, the location
  // is referenced but never materialized — invisible on the map. We never
  // create a canonical WorldLocation here (resolveWorldLocation removed that
  // path); the synthesized entry always lands in the per-campaign sandbox.
  if (livingWorldEnabled && stateChanges.currentLocation) {
    const name = String(stateChanges.currentLocation).trim();
    if (name) {
      const existing = await resolveLocationByName(name, { campaignId }).catch(() => null);
      if (!existing) {
        const inNewLocations = Array.isArray(stateChanges.newLocations)
          && stateChanges.newLocations.some((e) => String(e?.name || '').trim() === name);
        if (!inNewLocations) {
          if (!Array.isArray(stateChanges.newLocations)) stateChanges.newLocations = [];
          stateChanges.newLocations.unshift({ name, locationType: 'generic' });
          log.info({ campaignId, name }, 'currentLocation references unknown place — auto-promoted to newLocations');
        }
      }
    }
  }

  if (livingWorldEnabled && stateChanges.newLocations?.length) {
    await processLocationChanges(campaignId, stateChanges.newLocations, { prevLoc });
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
      for (const quest of sideQuests) {
        const verdict = await auditQuestWorldImpact(quest, {
          locationName: stateChanges.currentLocation,
          sceneSummary: stateChanges.campaignComplete?.summary || null,
        });
        if (verdict?.isMajor) {
          let worldLocationId = null;
          if (stateChanges.currentLocation) {
            try {
              const loc = await resolveWorldLocation(stateChanges.currentLocation);
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
              locationName: stateChanges.currentLocation || null,
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

  // Phase 5 — any quest status change (complete/fail) or objective update
  // potentially advances the "next quest" pointer → re-run goal assigner.
  // Also fires on pure NPC changes so freshly-introduced CampaignNPCs that
  // hold a quest role get their first goal without waiting for the next
  // scene's postSceneWork pass.
  if (livingWorldEnabled && (
    stateChanges.completedQuests?.length
    || stateChanges.failedQuests?.length
    || stateChanges.questUpdates?.length
    || stateChanges.npcs?.length
  )) {
    try {
      await assignGoalsForCampaign(campaignId);
    } catch (err) {
      log.warn({ err, campaignId }, 'assignGoalsForCampaign failed (non-fatal)');
    }
  }
}
