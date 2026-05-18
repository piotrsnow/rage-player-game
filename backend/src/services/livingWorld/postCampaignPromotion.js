// Post-campaign NPC promotion — unified table version.
//
// With the unified Npc table, promotion is trivial:
//   UPDATE npc SET campaignId = NULL, canonicalId = slug WHERE id = ?
//
// No more cross-table copy. No more relink of polymorphic refs.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { index as indexEntity } from './ragService.js';

const log = childLogger({ module: 'postCampaignPromotion' });

export function slugifyNpcId(raw) {
  return String(raw || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60);
}

export function buildNpcCanonicalId({ name, role }) {
  const base = slugifyNpcId(name);
  const suffix = role ? `-${slugifyNpcId(role).slice(0, 20)}` : '';
  return `${base}${suffix}`;
}

/**
 * Promote a campaign-scoped NPC to canonical.
 *
 * Steps:
 *   1. Validate: must be campaign-scoped, must have a name
 *   2. Dedupe: if a canonical NPC with same name+role exists, just link
 *   3. Promote: flip campaignId → null, assign canonicalId
 *   4. Index in RAG
 */
export async function promoteCampaignNpcToWorld(npcId, { reviewedBy = null } = {}) {
  try {
    const npc = await prisma.npc.findUnique({ where: { id: npcId } });
    if (!npc) return { ok: false, reason: 'not_found' };
    if (!npc.campaignId) return { ok: false, reason: 'already_canonical' };
    if (!npc.name?.trim()) return { ok: false, reason: 'no_name' };

    const canonicalId = buildNpcCanonicalId({ name: npc.name, role: npc.role });

    // Dedupe: check if a canonical NPC with same name+role already exists
    const existing = await prisma.npc.findFirst({
      where: {
        campaignId: null,
        alive: true,
        name: { equals: npc.name, mode: 'insensitive' },
        ...(npc.role ? { role: { equals: npc.role, mode: 'insensitive' } } : {}),
      },
    });

    if (existing) {
      // Just link the shadow to the existing canonical, don't promote
      await prisma.npc.update({
        where: { id: npcId },
        data: { canonicalNpcId: existing.id },
      });
      return { ok: true, deduped: true, canonicalNpc: existing, reviewedBy };
    }

    // Promote: flip campaignId to null
    const promoted = await prisma.npc.update({
      where: { id: npcId },
      data: {
        campaignId: null,
        canonicalId,
        canonicalNpcId: null,
        globallyActive: true,
        // Location: only keep if it's a canonical location
        currentLocationId: npc.currentLocationId || null,
        homeLocationId: npc.currentLocationId || null,
      },
    });

    // Update any remaining shadows in other campaigns that pointed to this NPC
    // via the old worldNpcId pattern — not needed since canonicalNpcId already points here

    // RAG index
    try {
      const text = [npc.name, npc.role, npc.personality].filter(Boolean).join(' — ');
      await indexEntity('npc', promoted.id, text);
    } catch (ragErr) {
      log.warn({ err: ragErr?.message, npcId: promoted.id }, 'RAG index after NPC promote failed');
    }

    return { ok: true, canonicalNpc: promoted, reviewedBy };
  } catch (err) {
    log.error({ err: err?.message, npcId }, 'promoteCampaignNpcToWorld failed');
    return { ok: false, reason: 'error', error: err?.message };
  }
}

// ─── Pipeline helpers (scoring, collecting candidates) ───────────────

export function scoreCandidate({ interactionCount = 0, questInvolvementCount = 0, structuralQuestCount = 0 }) {
  return interactionCount * 2 + questInvolvementCount * 5 + structuralQuestCount * 3;
}

export function selectTopNCandidates(ephemeralNpcs, structuralByNpcId, topN = 5) {
  const scored = ephemeralNpcs.map((npc) => ({
    npc,
    score: scoreCandidate({
      interactionCount: npc.interactionCount || 0,
      questInvolvementCount: npc.questInvolvementCount || 0,
      structuralQuestCount: structuralByNpcId.get(npc.npcId) || 0,
    }),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => s.npc);
}

export async function collectPromotionCandidates(campaignId, { topN = 5 } = {}) {
  // Ephemeral NPCs = campaign-scoped without a canonical link
  const ephemeralNpcs = await prisma.npc.findMany({
    where: { campaignId, canonicalNpcId: null },
  });
  if (!ephemeralNpcs.length) return [];

  const quests = await prisma.campaignQuest.findMany({
    where: { campaignId },
    select: { questGiverId: true, turnInNpcId: true },
  });
  const structuralByNpcId = new Map();
  for (const q of quests) {
    if (q.questGiverId) structuralByNpcId.set(q.questGiverId, (structuralByNpcId.get(q.questGiverId) || 0) + 1);
    if (q.turnInNpcId) structuralByNpcId.set(q.turnInNpcId, (structuralByNpcId.get(q.turnInNpcId) || 0) + 1);
  }

  return selectTopNCandidates(ephemeralNpcs, structuralByNpcId, topN);
}

export async function runNpcPromotionPipeline({ campaignId, dryRun = false, topN = 5 } = {}) {
  const candidates = await collectPromotionCandidates(campaignId, { topN });
  if (!candidates.length) return { collected: 0, persisted: 0, skipped: 0 };

  let persisted = 0;
  let skipped = 0;

  for (const npc of candidates) {
    if (dryRun) { persisted++; continue; }
    try {
      await prisma.nPCPromotionCandidate.upsert({
        where: { campaignId_npcId: { campaignId, npcId: npc.id } },
        create: {
          campaignId,
          npcId: npc.id,
          name: npc.name,
          role: npc.role,
          personality: npc.personality,
          stats: npc.stats || {},
        },
        update: {
          name: npc.name,
          role: npc.role,
          personality: npc.personality,
          stats: npc.stats || {},
        },
      });
      persisted++;
    } catch (err) {
      log.warn({ err: err?.message, npcId: npc.id }, 'Candidate upsert failed');
      skipped++;
    }
  }

  return { collected: candidates.length, persisted, skipped };
}
