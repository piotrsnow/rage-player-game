import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import {
  setCampaignNpcLocation,
  setCampaignNpcIntroHint,
} from '../../livingWorld/campaignSandbox.js';
import { resolveLocationByName } from '../../livingWorld/worldStateService.js';
import { markQuestOpportunityMaterialized } from '../../livingWorld/worldEventLog.js';
import { LOCATION_KIND_WORLD } from '../../locationRefs.js';
import {
  unlockChildObjectives,
  closeSiblingBranches,
  isQuestComplete,
  markObjectiveDiscovered,
  markBranchGroupDiscovered,
  validateGraphIntegrity,
} from './questGraph.js';

const log = childLogger({ module: 'sceneGenerator' });

// Quest mutationLog cap — questDynamicsService i tutejszy
// `processQuestMutations` truncate FIFO przed appendem.
const MUTATION_LOG_CAP = 10;

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
 * rows (or FE-shape objectives). Premium prompt labels each objective with its
 * original array index, so objectiveId is just `objectives[Number(raw)]`.
 * Description fallback covers verbatim echoes.
 */
export function resolveObjective(objectives, rawObjectiveId) {
  if (!Array.isArray(objectives) || objectives.length === 0) return null;
  const raw = rawObjectiveId == null ? '' : String(rawObjectiveId).trim();
  if (raw && /^\d+$/.test(raw)) {
    const idx = Number(raw);
    if (idx >= 0 && idx < objectives.length) return objectives[idx];
  }
  if (raw) {
    const normalized = raw.toLowerCase();
    const byDesc = objectives.find((o) => (o.description || '').trim().toLowerCase() === normalized);
    if (byDesc) return byDesc;
  }
  return null;
}

/**
 * Resolver po `nodeKey` (oś 1) — preferowane przez nowy contract LLM.
 * Fallback do `resolveObjective` (legacy index/description) gdy nodeKey
 * nie zwrócił nic. Pojedyncza ścieżka dla wszystkich callerów aby uniknąć
 * dryfu między quest update / reveal / mutation.
 */
export function resolveObjectiveByNodeKeyOrLegacy(objectives, { nodeKey, objectiveId } = {}) {
  if (!Array.isArray(objectives) || objectives.length === 0) return null;
  if (typeof nodeKey === 'string' && nodeKey) {
    const byNode = objectives.find((o) => o.nodeKey === nodeKey);
    if (byNode) return byNode;
  }
  return resolveObjective(objectives, objectiveId);
}

// Wewnętrzny helper — zaaplikuj patche {id, status?, metadata?} do DB
// w jednej Promise.all. Caller dostarcza już posortowane patche, każdy
// z Bigint id (CampaignQuestObjective.id).
async function applyObjectivePatches(patches) {
  if (!Array.isArray(patches) || patches.length === 0) return;
  await Promise.all(patches.map((p) => {
    const data = {};
    if (p.status !== undefined) data.status = p.status;
    if (p.metadata !== undefined) data.metadata = p.metadata;
    if (Object.keys(data).length === 0) return null;
    return prisma.campaignQuestObjective.update({
      where: { id: p.id },
      data,
    }).catch((err) => log.warn({ err: err?.message, objectiveId: p.id }, 'objective patch failed'));
  }));
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
    // F5 — currentLocation lifted out of coreState into its own column.
    select: { coreState: true, currentLocationName: true, userId: true },
  });
  if (!campaign) return;

  // F5b — player's currentLocation may be canonical OR a CampaignLocation;
  // resolve polymorphically so the moveNpcToPlayer trigger can pin the NPC
  // shadow to the right kind+id pair.
  let playerLocationKind = null;
  let playerLocationId = null;
  const locName = campaign.currentLocationName || campaign.coreState?.world?.currentLocation;
  if (locName) {
    const resolved = await resolveLocationByName(locName, { campaignId }).catch(() => null);
    if (resolved) {
      playerLocationKind = resolved.kind;
      playerLocationId = resolved.row.id;
    }
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
    await setCampaignNpcLocation(campaignId, worldNpcId, { kind: playerLocationKind, id: playerLocationId });
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
        lastLocationKind: playerLocationKind || LOCATION_KIND_WORLD,
        lastLocationId: playerLocationId,
        pendingIntroHint: message || null,
      },
    }).catch((err) => log.warn({ err: err?.message, campaignNpcId: ephemeral.id }, 'moveNpcToPlayer ephemeral update failed'));
  }
}

export async function processQuestObjectiveUpdates(campaignId, questUpdates, alreadyCompletedQuestIds = []) {
  const touchedQuestIds = new Set();
  let questXpDelta = 0;
  for (const update of questUpdates) {
    try {
      const quest = await resolveActiveQuest(campaignId, update.questId);
      if (!quest) continue;

      const objectives = await prisma.campaignQuestObjective.findMany({
        where: { questId: quest.id },
        orderBy: { displayOrder: 'asc' },
      });
      const targetObj = resolveObjectiveByNodeKeyOrLegacy(objectives, {
        nodeKey: update.nodeKey,
        objectiveId: update.objectiveId,
      });
      if (!targetObj) {
        log.warn(
          { campaignId, questId: quest.questId, nodeKey: update.nodeKey, objectiveId: update.objectiveId },
          'Objective ref from premium did not match — ignored',
        );
        continue;
      }

      const updateData = {};
      if (update.completed) updateData.status = 'done';
      if (typeof update.addProgress === 'number') {
        updateData.progress = (targetObj.progress || 0) + update.addProgress;
      }

      // Partial XP reward: floor(quest.reward.xp / (2 * objectiveCount))
      // Awarded once per objective (xpAwarded prevents double-award on replay).
      let objXpAwarded = 0;
      if (update.completed && targetObj.xpAwarded === 0) {
        const rewardXp = quest.reward?.xp || 0;
        const objectiveCount = objectives.length;
        if (rewardXp > 0 && objectiveCount > 0) {
          objXpAwarded = Math.floor(rewardXp / (2 * objectiveCount));
          if (objXpAwarded > 0) {
            updateData.xpAwarded = objXpAwarded;
            questXpDelta += objXpAwarded;
          }
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.campaignQuestObjective.update({
          where: { id: targetObj.id },
          data: updateData,
        });
        if (updateData.status) targetObj.status = updateData.status;
        if (updateData.progress !== undefined) targetObj.progress = updateData.progress;
        if (updateData.xpAwarded !== undefined) targetObj.xpAwarded = updateData.xpAwarded;
      }
      if (update.completed) touchedQuestIds.add(quest.questId);

      // ── Oś 1 — graph propagation after `done` ───────────────────────
      // Po ukończeniu node-a sprawdź czy odblokowuje to dzieci (parents
      // satisfied lub explicit `metadata.unlocks`). Patche aplikujemy w
      // tej samej iteracji aby kolejne `questUpdates[]` z tego samego LLM
      // batcha widziały już zaktualizowane statusy.
      if (update.completed && targetObj.nodeKey) {
        const unlockPatches = unlockChildObjectives(objectives, targetObj.nodeKey);
        if (unlockPatches.length > 0) {
          await applyObjectivePatches(unlockPatches);
          for (const p of unlockPatches) {
            const obj = objectives.find((o) => o.id === p.id);
            if (obj && p.status) obj.status = p.status;
          }
          log.info(
            { campaignId, questId: quest.questId, completed: targetObj.nodeKey, unlocked: unlockPatches.map((p) => p.nodeKey) },
            'Quest graph: child nodes unlocked',
          );
        }
      }

      // ── Oś 1 — branchChoice XOR lock-in ─────────────────────────────
      // `branchChoice: { group, chosen }` zamyka rodzeństwo w tej grupie
      // (status=skipped). Idempotentne — caller może bezpiecznie emitować
      // wielokrotnie z tym samym chosen.
      if (update.branchChoice && update.branchChoice.group && update.branchChoice.chosen) {
        const skipPatches = closeSiblingBranches(
          objectives,
          update.branchChoice.group,
          update.branchChoice.chosen,
        );
        if (skipPatches.length > 0) {
          await applyObjectivePatches(skipPatches);
          for (const p of skipPatches) {
            const obj = objectives.find((o) => o.id === p.id);
            if (obj && p.status) obj.status = p.status;
          }
          log.info(
            { campaignId, questId: quest.questId, group: update.branchChoice.group, chosen: update.branchChoice.chosen, skipped: skipPatches.map((p) => p.nodeKey) },
            'Quest graph: branch chosen, siblings skipped',
          );
          touchedQuestIds.add(quest.questId);  // skipped tail może zakończyć quest
        }
      }

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
      log.error({ err, campaignId, questId: update.questId, objectiveId: update.objectiveId, nodeKey: update.nodeKey }, 'Failed to update quest objective');
    }
  }

  // Auto-complete quests where the active path is fully resolved (all
  // remaining objectives are done/skipped/failed — graph-aware via
  // isQuestComplete). Returns list of auto-completed questIds so the caller
  // can merge them into stateChanges.completedQuests (audit + world-impact
  // gate depend on that).
  const autoCompleted = [];
  const skip = new Set(alreadyCompletedQuestIds);
  for (const questId of touchedQuestIds) {
    if (skip.has(questId)) continue;
    try {
      const quest = await prisma.campaignQuest.findFirst({
        where: { campaignId, questId },
        include: { objectives: true },
      });
      if (!quest || quest.status === 'completed' || quest.status === 'failed') continue;
      const objectives = quest.objectives || [];
      if (isQuestComplete(objectives)) {
        await prisma.campaignQuest.update({
          where: { id: quest.id },
          data: { status: 'completed', completedAt: new Date() },
        });
        autoCompleted.push(questId);
        log.info({ campaignId, questId }, 'Quest auto-completed — graph fully resolved');
      }
    } catch (err) {
      log.error({ err, campaignId, questId }, 'Failed to auto-complete quest');
    }
  }
  return { autoCompleted, questXpDelta };
}

// ── Oś 5 — diegetic discovery ──────────────────────────────────────────
//
// `objectiveReveals: [{ questId, nodeKey, revealSource? }]` — explicit
// emit przez LLM kiedy NPC / item / scene event ujawnia istnienie kolejnego
// kroku questa. Reveal jest sticky (raz odkryte = zawsze odkryte) i może
// wyprzedzić unlock — locked node z discovered=true jest visible w UI z
// markerem "🔒 wymaga: <parents>".
export async function processObjectiveReveals(campaignId, reveals) {
  if (!Array.isArray(reveals) || reveals.length === 0) return 0;
  let applied = 0;
  for (const reveal of reveals) {
    try {
      const quest = await resolveActiveQuest(campaignId, reveal.questId);
      if (!quest) continue;
      const objectives = await prisma.campaignQuestObjective.findMany({
        where: { questId: quest.id },
        orderBy: { displayOrder: 'asc' },
      });
      const patch = markObjectiveDiscovered(objectives, reveal.nodeKey);
      if (!patch) continue;
      await applyObjectivePatches([patch]);
      applied += 1;
      log.info(
        { campaignId, questId: quest.questId, nodeKey: reveal.nodeKey, source: reveal.revealSource || null },
        'Quest objective revealed (diegetic)',
      );
    } catch (err) {
      log.error({ err, campaignId, reveal }, 'Failed to apply objective reveal');
    }
  }
  return applied;
}

// `branchGroupReveals: [{ questId, branchGroup, revealedNodeKeys[], revealSource? }]`
// Ujawnia listę opcji w jednej grupie XOR. Używane gdy NPC proponuje
// alternatywę dla domyślnej ścieżki ("możesz ją oszczędzić" → reveal
// `spare_witch` w `witch_resolution`).
export async function processBranchGroupReveals(campaignId, reveals) {
  if (!Array.isArray(reveals) || reveals.length === 0) return 0;
  let applied = 0;
  for (const reveal of reveals) {
    try {
      const quest = await resolveActiveQuest(campaignId, reveal.questId);
      if (!quest) continue;
      const objectives = await prisma.campaignQuestObjective.findMany({
        where: { questId: quest.id },
        orderBy: { displayOrder: 'asc' },
      });
      const patches = markBranchGroupDiscovered(
        objectives,
        reveal.branchGroup,
        reveal.revealedNodeKeys,
      );
      if (patches.length === 0) continue;
      await applyObjectivePatches(patches);
      applied += patches.length;
      log.info(
        { campaignId, questId: quest.questId, branchGroup: reveal.branchGroup, revealed: patches.map((p) => p.nodeKey), source: reveal.revealSource || null },
        'Quest branch group revealed (diegetic)',
      );
    } catch (err) {
      log.error({ err, campaignId, reveal }, 'Failed to apply branch group reveal');
    }
  }
  return applied;
}

// ── Oś 3 — emergence: materialize questOffer w CampaignQuest + objectives
//
// `questOffers: [{id, name, description, type, questGiverId, turnInNpcId,
//   relatedHookId?, relatedNpcRefs?, completionCondition, objectives}]`
// gdzie objectives to graf node-ów ({ nodeKey, description, parents,
// branchType, branchGroup, choiceLabel, failsOn, placeholderHint }).
//
// Strategy:
//   1. Walidacja grafu (validateGraphIntegrity) — odrzucamy quest jeśli graf
//      ma cycle, missing parent, duplicate nodeKey.
//   2. CampaignQuest.create + nested CampaignQuestObjective.createMany.
//   3. Każdy objective dostaje `metadata.discovered=false` poza root nodes
//      (parents=[]) — root jest discovered=false też, ale LLM po wprowadzeniu
//      questa zazwyczaj emituje objectiveReveals dla root w tej samej scenie.
//   4. Status root = 'pending', non-root = 'locked'.
//   5. Mark hook materialized (jeśli relatedHookId podany) — payload.materializedAs.
export async function processQuestOffers(campaignId, offers) {
  if (!Array.isArray(offers) || offers.length === 0) return { created: 0, rejected: 0 };
  let created = 0;
  let rejected = 0;
  for (const offer of offers) {
    try {
      // Sanity: graf integrity
      const graphErrors = validateGraphIntegrity(
        (offer.objectives || []).map((o) => ({
          nodeKey: o.nodeKey,
          status: o.parents && o.parents.length > 0 ? 'locked' : 'pending',
          metadata: {
            parents: o.parents || [],
            unlocks: o.unlocks || [],
            branchType: o.branchType,
            branchGroup: o.branchGroup,
          },
        })),
      );
      if (graphErrors.length > 0) {
        log.warn({ campaignId, offerId: offer.id, errors: graphErrors.slice(0, 3) }, 'questOffer graph integrity failed — rejected');
        rejected += 1;
        continue;
      }

      // Stable questId: użyj offer.id jeśli wygląda OK, inaczej slug name-a.
      const rawId = String(offer.id || '').trim();
      const questId = /^[a-z0-9_-]{1,80}$/i.test(rawId)
        ? rawId
        : (offer.name || 'quest').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '').slice(0, 80) || `quest_${Date.now()}`;

      // Idempotency — jeśli quest z tym questId już istnieje, skip (nie
      // duplikujemy, nie aktualizujemy z LLM-a — to robi questUpdates).
      const existing = await prisma.campaignQuest.findUnique({
        where: { campaignId_questId: { campaignId, questId } },
      }).catch(() => null);
      if (existing) {
        log.info({ campaignId, questId }, 'questOffer skipped — quest already exists (idempotent)');
        continue;
      }

      const quest = await prisma.campaignQuest.create({
        data: {
          campaignId,
          questId,
          name: offer.name || 'Unnamed Quest',
          type: offer.type || 'side',
          description: offer.description || '',
          completionCondition: offer.completionCondition || null,
          questGiverId: offer.questGiverId || null,
          turnInNpcId: offer.turnInNpcId || null,
          reward: offer.reward || null,
          status: 'active',
          mutationLog: [],
        },
      });

      // Build objectives — graf w metadata. discovered=false dla wszystkich
      // (LLM emituje objectiveReveals w tej samej scenie dla root nodes).
      const objectives = (offer.objectives || []).map((o, idx) => {
        const isRoot = !Array.isArray(o.parents) || o.parents.length === 0;
        const metadata = {
          discovered: false,
        };
        if (Array.isArray(o.parents) && o.parents.length > 0) metadata.parents = o.parents;
        if (Array.isArray(o.unlocks) && o.unlocks.length > 0) metadata.unlocks = o.unlocks;
        if (o.branchType) metadata.branchType = o.branchType;
        if (o.branchGroup) metadata.branchGroup = o.branchGroup;
        if (o.choiceLabel) metadata.choiceLabel = o.choiceLabel;
        if (o.placeholderHint) metadata.placeholderHint = o.placeholderHint;
        if (o.failsOn && typeof o.failsOn === 'object') metadata.failsOn = o.failsOn;
        return {
          questId: quest.id,
          displayOrder: idx,
          description: o.description || '',
          objectiveType: o.objectiveType || null,
          progress: 0,
          targetAmount: 1,
          status: isRoot ? 'pending' : 'locked',
          metadata,
          nodeKey: o.nodeKey,
        };
      });
      if (objectives.length > 0) {
        await prisma.campaignQuestObjective.createMany({ data: objectives });
      }

      // Mark hook materialized — pendingHooks już go nie pokażą.
      if (offer.relatedHookId) {
        await markQuestOpportunityMaterialized(offer.relatedHookId, questId).catch(() => null);
      }

      created += 1;
      log.info(
        { campaignId, questId, type: offer.type, objectives: objectives.length, hookId: offer.relatedHookId || null },
        'questOffer materialized',
      );
    } catch (err) {
      log.error({ err: err?.message, campaignId, offerId: offer.id }, 'Failed to materialize questOffer');
      rejected += 1;
    }
  }
  return { created, rejected };
}

// ── Oś 4 — explicit quest mutations from narration ─────────────────────
//
// `questMutations: [{ questId, mutation: 'stall'|'fail'|'reroute', reason }]`
// — rzadkie. Większość mutacji robi automatycznie questDynamicsService
// (oś 4 reactive checker). LLM emituje tylko gdy narracja wprost przerywa
// quest (questgiver upadł martwy on-screen, lokacja zniszczona).
export async function processQuestMutations(campaignId, mutations, sceneIndex = null) {
  if (!Array.isArray(mutations) || mutations.length === 0) return 0;
  let applied = 0;
  for (const m of mutations) {
    try {
      const quest = await resolveActiveQuest(campaignId, m.questId);
      if (!quest) continue;
      const newStatus = m.mutation === 'stall' ? 'stalled'
        : m.mutation === 'fail' ? 'failed'
        : 'active';  // reroute keeps active
      const existingLog = Array.isArray(quest.mutationLog) ? quest.mutationLog : [];
      const entry = {
        ts: new Date().toISOString(),
        mutation: m.mutation,
        reason: m.reason,
        sceneIndex,
        source: 'llm',
      };
      const newLog = [...existingLog, entry].slice(-MUTATION_LOG_CAP);
      const data = { mutationLog: newLog };
      if (newStatus !== 'active' && quest.status !== newStatus) {
        data.status = newStatus;
      }
      await prisma.campaignQuest.update({
        where: { id: quest.id },
        data,
      });
      applied += 1;
      log.info(
        { campaignId, questId: quest.questId, mutation: m.mutation, reason: m.reason, newStatus: data.status || quest.status },
        'Quest mutation applied (explicit)',
      );
    } catch (err) {
      log.error({ err, campaignId, mutation: m }, 'Failed to apply quest mutation');
    }
  }
  return applied;
}

// Returns the list of ACTUALLY-resolved questIds + accumulated quest XP
// (completion bonus). Unresolved entries are dropped with a warn already
// logged by resolveActiveQuest.
export async function processQuestStatusChange(campaignId, questIds, status) {
  const resolvedIds = [];
  let questXpDelta = 0;
  for (const rawId of questIds) {
    try {
      const quest = await resolveActiveQuest(campaignId, rawId);
      if (quest) {
        await prisma.campaignQuest.update({
          where: { id: quest.id },
          data: { status, completedAt: new Date() },
        });
        resolvedIds.push(quest.questId);

        // Completion bonus XP: total reward minus already-awarded per-objective XP.
        if (status === 'completed') {
          const rewardXp = quest.reward?.xp || 0;
          if (rewardXp > 0) {
            const objectives = await prisma.campaignQuestObjective.findMany({
              where: { questId: quest.id },
              select: { xpAwarded: true },
            });
            const sumAwarded = objectives.reduce((sum, o) => sum + (o.xpAwarded || 0), 0);
            const bonus = Math.max(0, rewardXp - sumAwarded);
            if (bonus > 0) questXpDelta += bonus;
          }
        }
      }
    } catch (err) {
      log.error({ err, campaignId, questId: rawId, status }, 'Failed to update quest status');
    }
  }
  return { resolvedIds, questXpDelta };
}
