// Living World Phase 4 — DM agent memory store.
//
// Each living-world campaign has one CampaignDmAgent row plus two child
// tables holding rolling lists:
//   - CampaignDmMemoryEntry — short log of what the DM planned/introduced/
//                             is waiting to resolve. Cap 20 via FIFO trigger.
//   - CampaignDmPendingHook — quest ideas/intrigue seeds the DM keeps in
//                             reserve. Cap 12 via FIFO trigger.
//
// Caps are enforced in Postgres (AFTER INSERT triggers in the F2 migration);
// app code only handles dedup-by-summary and upsert-by-id semantics.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'dmMemoryService' });

export const DM_MEMORY_CAP = 20;
export const PENDING_HOOKS_CAP = 12;

/**
 * Pure — given the set of summaries already persisted, return the subset of
 * `additions` that would be net-new INSERTs (case-insensitive dedup, drops
 * blanks). Order preserved. Exported for testability.
 */
export function planMemoryInserts(existingSummaries, additions) {
  const seen = new Set(
    (Array.isArray(existingSummaries) ? existingSummaries : [])
      .map((s) => (s || '').toLowerCase().trim())
      .filter(Boolean),
  );
  const out = [];
  for (const entry of Array.isArray(additions) ? additions : []) {
    const key = (entry?.summary || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      summary: entry.summary,
      status: entry.status || 'planned',
      plannedFor: entry.plannedFor || null,
    });
  }
  return out;
}

/**
 * Pure — split incoming hook additions into create/update against the set of
 * already-persisted hook ids. Returns `{ toCreate, toUpdate, toDelete }`
 * shaped for prisma calls. Hooks without id/summary are dropped silently.
 */
export function planHookMutations(existingHookIds, additions, resolvedHookIds = []) {
  const existing = new Set(Array.isArray(existingHookIds) ? existingHookIds : []);
  const resolved = new Set(Array.isArray(resolvedHookIds) ? resolvedHookIds : []);
  const toCreate = [];
  const toUpdate = [];

  for (const hook of Array.isArray(additions) ? additions : []) {
    if (!hook?.id || !hook?.summary) continue;
    const data = {
      kind: hook.kind || 'generic',
      summary: hook.summary,
      idealTiming: hook.idealTiming || null,
      priority: hook.priority || 'normal',
    };
    if (existing.has(hook.id)) {
      toUpdate.push({ id: hook.id, ...data });
    } else {
      toCreate.push({ id: hook.id, ...data });
    }
  }
  return {
    toCreate,
    toUpdate,
    toDelete: [...resolved].filter((id) => existing.has(id)),
  };
}

// ──────────────────────────────────────────────────────────────────────
// DB-touching
// ──────────────────────────────────────────────────────────────────────

/**
 * Ensure a CampaignDmAgent row exists for the campaign (FK target for the
 * memory + hook child tables). Returns the row, or null on failure.
 */
export async function getOrCreateDmAgent(campaignId) {
  if (!campaignId) return null;
  try {
    return await prisma.campaignDmAgent.upsert({
      where: { campaignId },
      create: { campaignId },
      update: {},
    });
  } catch (err) {
    log.warn({ err, campaignId }, 'getOrCreateDmAgent failed');
    return null;
  }
}

/**
 * Apply a DM summary update — INSERTs deduped memory entries, upserts new
 * hooks by id, deletes resolved hooks. Caps are enforced by FIFO triggers
 * (no JS clamping needed). Returns the touched agent row, or null on failure.
 */
export async function updateDmAgent(
  campaignId,
  { memoryEntries = [], hookAdditions = [], resolvedHookIds = [] } = {},
) {
  if (!campaignId) return null;
  try {
    const agent = await getOrCreateDmAgent(campaignId);
    if (!agent) return null;

    if (memoryEntries.length > 0) {
      const existing = await prisma.campaignDmMemoryEntry.findMany({
        where: { campaignId },
        select: { summary: true },
      });
      const toInsert = planMemoryInserts(existing.map((r) => r.summary), memoryEntries);
      if (toInsert.length > 0) {
        await prisma.campaignDmMemoryEntry.createMany({
          data: toInsert.map((e) => ({ campaignId, ...e })),
        });
      }
    }

    if (hookAdditions.length > 0 || resolvedHookIds.length > 0) {
      const existingHooks = await prisma.campaignDmPendingHook.findMany({
        where: { campaignId },
        select: { id: true },
      });
      const plan = planHookMutations(
        existingHooks.map((h) => h.id),
        hookAdditions,
        resolvedHookIds,
      );

      if (plan.toDelete.length > 0) {
        await prisma.campaignDmPendingHook.deleteMany({
          where: { campaignId, id: { in: plan.toDelete } },
        });
      }
      if (plan.toCreate.length > 0) {
        await prisma.campaignDmPendingHook.createMany({
          data: plan.toCreate.map((h) => ({ campaignId, ...h })),
        });
      }
      for (const h of plan.toUpdate) {
        await prisma.campaignDmPendingHook.update({
          where: { id: h.id },
          data: { kind: h.kind, summary: h.summary, idealTiming: h.idealTiming, priority: h.priority },
        });
      }
    }

    return await prisma.campaignDmAgent.update({
      where: { campaignId },
      data: { lastUpdatedAt: new Date() },
    });
  } catch (err) {
    log.warn({ err, campaignId }, 'updateDmAgent failed');
    return null;
  }
}

/**
 * Read DM agent rolling state for prompt injection. Returns
 * `{ dmMemory: [], pendingHooks: [] }` (chronological asc) — empty arrays
 * when no agent or DB error.
 */
export async function readDmAgentState(campaignId) {
  if (!campaignId) return { dmMemory: [], pendingHooks: [] };
  try {
    const [memoryRows, hookRows] = await Promise.all([
      prisma.campaignDmMemoryEntry.findMany({
        where: { campaignId },
        orderBy: { at: 'asc' },
        take: DM_MEMORY_CAP,
        select: { summary: true, status: true, plannedFor: true, at: true },
      }),
      prisma.campaignDmPendingHook.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'asc' },
        take: PENDING_HOOKS_CAP,
        select: { id: true, kind: true, summary: true, idealTiming: true, priority: true, createdAt: true },
      }),
    ]);
    return {
      dmMemory: memoryRows.map((r) => ({
        summary: r.summary,
        status: r.status || 'planned',
        plannedFor: r.plannedFor,
        at: r.at?.toISOString?.() || null,
      })),
      pendingHooks: hookRows.map((r) => ({
        id: r.id,
        kind: r.kind,
        summary: r.summary,
        idealTiming: r.idealTiming,
        priority: r.priority,
        createdAt: r.createdAt?.toISOString?.() || null,
      })),
    };
  } catch (err) {
    log.warn({ err, campaignId }, 'readDmAgentState failed');
    return { dmMemory: [], pendingHooks: [] };
  }
}
