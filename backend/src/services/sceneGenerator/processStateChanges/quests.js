import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import {
  setCampaignNpcLocation,
  setCampaignNpcIntroHint,
} from '../../livingWorld/campaignSandbox.js';

const log = childLogger({ module: 'sceneGenerator' });

// Resolve a raw quest-id string (as emitted by the premium model) to a real
// CampaignQuest row. Premium sees quest names only (not ids) in the prompt,
// so its `completedQuests`/`questUpdates[].questId` entries may be names,
// hallucinated ids, or anything in between. Strategy:
//   1) exact `questId` match among active quests
//   2) case-insensitive `name` match among active quests
//   3) if exactly one active quest exists, use it (player-facing UI always
//      shows a single current quest, so one-active is the common case)
//   4) otherwise warn and return null — ambiguity is never resolved silently
export async function resolveActiveQuest(campaignId, rawId) {
  const activeQuests = await prisma.campaignQuest.findMany({
    where: { campaignId, status: 'active' },
  });
  if (activeQuests.length === 0) return null;

  const normalized = typeof rawId === 'string' ? rawId.trim().toLowerCase() : '';

  const exact = activeQuests.find((q) => q.questId === rawId);
  if (exact) return exact;

  if (normalized) {
    const byName = activeQuests.find((q) => (q.name || '').trim().toLowerCase() === normalized);
    if (byName) {
      log.info({ campaignId, rawId, resolved: byName.questId }, 'Quest id resolved by name match');
      return byName;
    }
  }

  if (activeQuests.length === 1) {
    log.info({ campaignId, rawId, resolved: activeQuests[0].questId }, 'Quest id resolved via single-active fallback');
    return activeQuests[0];
  }

  log.warn(
    { campaignId, rawId, activeCount: activeQuests.length, activeNames: activeQuests.map((q) => q.name) },
    'Quest id from premium did not match any active quest — ignored',
  );
  return null;
}

/**
 * Resolve an AI-emitted objective ref against a list of CampaignQuestObjective
 * rows (or FE-shape objectives). Premium prompt sees `description` only —
 * the BigInt PK is not exposed — so primary match is description-equality
 * and the fallback is single-pending heuristic.
 */
export function resolveObjective(objectives, rawObjectiveId) {
  if (!Array.isArray(objectives) || objectives.length === 0) return null;
  const normalized = typeof rawObjectiveId === 'string' ? rawObjectiveId.trim().toLowerCase() : '';
  if (normalized) {
    const byDesc = objectives.find((o) => (o.description || '').trim().toLowerCase() === normalized);
    if (byDesc) return byDesc;
  }
  const pending = objectives.filter((o) => !(o.completed || o.status === 'done'));
  if (pending.length === 1) return pending[0];
  return null;
}

/**
 * Fire the `onComplete.moveNpcToPlayer` quest trigger. Relocates the named
 * NPC's CampaignNPC shadow to the player's current location and stores a
 * one-shot pendingIntroHint for next-scene prompt surfacing.
 *
 * `onComplete.moveNpcToPlayer` is an NPC name (or canonicalId) emitted by
 * the AI. We resolve to WorldNPC by exact canonicalId, then fallback to
 * name (case-insensitive). Non-canonical AI-invented NPCs are resolved
 * via CampaignNPC.npcId directly.
 *
 * NEVER mutates WorldNPC — canonical state stays immutable during play.
 */
export async function fireMoveNpcToPlayerTrigger(campaignId, onComplete) {
  const npcIdent = String(onComplete.moveNpcToPlayer || '').trim();
  const message = String(onComplete.message || '').trim();
  if (!npcIdent) return;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true, userId: true },
  });
  if (!campaign) return;

  let playerLocationId = null;
  const locName = campaign.coreState?.world?.currentLocation;
  if (locName) {
    const row = await prisma.worldLocation.findFirst({
      where: { canonicalName: locName },
      select: { id: true },
    }).catch(() => null);
    playerLocationId = row?.id || null;
  }
  if (!playerLocationId) return;

  // Resolve NPC: canonicalId → name → CampaignNPC.npcId
  let worldNpcId = null;
  const byCanonical = await prisma.worldNPC.findFirst({
    where: { canonicalId: npcIdent },
    select: { id: true },
  }).catch(() => null);
  if (byCanonical) {
    worldNpcId = byCanonical.id;
  } else {
    const byName = await prisma.worldNPC.findFirst({
      where: { name: { equals: npcIdent, mode: 'insensitive' } },
      select: { id: true },
    }).catch(() => null);
    if (byName) worldNpcId = byName.id;
  }

  if (worldNpcId) {
    await setCampaignNpcLocation(campaignId, worldNpcId, playerLocationId);
    await setCampaignNpcIntroHint(campaignId, worldNpcId, message || null);
    return;
  }

  // Fallback: ephemeral CampaignNPC (no WorldNPC link). Name-match inside
  // the campaign and update in-place.
  const ephemeral = await prisma.campaignNPC.findFirst({
    where: {
      campaignId,
      OR: [
        { npcId: npcIdent },
        { name: { equals: npcIdent, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  }).catch(() => null);
  if (ephemeral) {
    await prisma.campaignNPC.update({
      where: { id: ephemeral.id },
      data: {
        lastLocationId: playerLocationId,
        pendingIntroHint: message || null,
      },
    }).catch((err) => log.warn({ err: err?.message, campaignNpcId: ephemeral.id }, 'moveNpcToPlayer ephemeral update failed'));
  }
}

export async function processQuestObjectiveUpdates(campaignId, questUpdates, alreadyCompletedQuestIds = []) {
  const touchedQuestIds = new Set();
  for (const update of questUpdates) {
    try {
      const quest = await resolveActiveQuest(campaignId, update.questId);
      if (!quest) continue;

      const objectives = await prisma.campaignQuestObjective.findMany({
        where: { questId: quest.id },
        orderBy: { displayOrder: 'asc' },
      });
      const targetObj = resolveObjective(objectives, update.objectiveId);
      if (!targetObj) {
        log.warn({ campaignId, questId: quest.questId, objectiveId: update.objectiveId }, 'Objective id from premium did not match — ignored');
        continue;
      }

      const updateData = {};
      if (update.completed) updateData.status = 'done';
      if (typeof update.addProgress === 'number') {
        updateData.progress = (targetObj.progress || 0) + update.addProgress;
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.campaignQuestObjective.update({
          where: { id: targetObj.id },
          data: updateData,
        });
      }
      if (update.completed) touchedQuestIds.add(quest.questId);

      // Round B (Phase 4) — `onComplete.moveNpcToPlayer` trigger. When the
      // objective that was just completed carries `onComplete: { moveNpcToPlayer,
      // message }`, we (a) relocate the CampaignNPC shadow to the player's
      // current location, (b) stash the message on `pendingIntroHint` so the
      // next scene prompt surfaces "NPC just arrived with news". The trigger
      // fires once per objective completion — no further bookkeeping.
      const onComplete = targetObj.metadata?.onComplete;
      if (update.completed && onComplete?.moveNpcToPlayer) {
        try {
          await fireMoveNpcToPlayerTrigger(campaignId, onComplete);
        } catch (err) {
          log.warn({ err: err?.message, campaignId, questId: quest.questId }, 'moveNpcToPlayer trigger failed');
        }
      }
    } catch (err) {
      log.error({ err, campaignId, questId: update.questId, objectiveId: update.objectiveId }, 'Failed to update quest objective');
    }
  }

  // Auto-complete quests where all objectives are now done. Returns list of
  // auto-completed questIds so the caller can merge them into
  // stateChanges.completedQuests (audit + world-impact gate depend on that).
  const autoCompleted = [];
  const skip = new Set(alreadyCompletedQuestIds);
  for (const questId of touchedQuestIds) {
    if (skip.has(questId)) continue;
    try {
      const quest = await prisma.campaignQuest.findFirst({
        where: { campaignId, questId },
        include: { objectives: true },
      });
      if (!quest || quest.status === 'completed') continue;
      const objectives = quest.objectives || [];
      if (objectives.length > 0 && objectives.every((o) => o.status === 'done')) {
        await prisma.campaignQuest.update({
          where: { id: quest.id },
          data: { status: 'completed', completedAt: new Date() },
        });
        autoCompleted.push(questId);
        log.info({ campaignId, questId }, 'Quest auto-completed — all objectives done');
      }
    } catch (err) {
      log.error({ err, campaignId, questId }, 'Failed to auto-complete quest');
    }
  }
  return autoCompleted;
}

// Returns the list of ACTUALLY-resolved questIds so callers (e.g. world
// impact audit, goal reassignment) can use real ids instead of whatever
// premium emitted. Unresolved entries are dropped with a warn already logged
// by resolveActiveQuest.
export async function processQuestStatusChange(campaignId, questIds, status) {
  const resolvedIds = [];
  for (const rawId of questIds) {
    try {
      const quest = await resolveActiveQuest(campaignId, rawId);
      if (quest) {
        await prisma.campaignQuest.update({
          where: { id: quest.id },
          data: { status, completedAt: new Date() },
        });
        resolvedIds.push(quest.questId);
      }
    } catch (err) {
      log.error({ err, campaignId, questId: rawId, status }, 'Failed to update quest status');
    }
  }
  return resolvedIds;
}
