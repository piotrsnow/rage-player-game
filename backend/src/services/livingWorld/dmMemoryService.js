// Living World Phase 4 — DM agent memory store.
//
// Each living-world campaign has one CampaignDmAgent row with two rolling
// lists:
//   - dmMemory       — short log of what the DM planned / introduced / is
//                      waiting to resolve. Injected into system prompt so
//                      premium stays coherent across scenes.
//   - pendingHooks   — quest ideas / intrigue seeds the DM wants to weave
//                      in when timing is right (not yet delivered to player).
//
// Entries are capped — oldest dropped to keep prompt size bounded.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'dmMemoryService' });

export const DM_MEMORY_CAP = 20;
export const PENDING_HOOKS_CAP = 12;

/**
 * Pure helper — clamp a rolling list to the cap, keeping newest entries.
 * Exported for testability.
 */
export function clampList(list, cap) {
  if (!Array.isArray(list)) return [];
  if (list.length <= cap) return list;
  return list.slice(list.length - cap);
}

/**
 * Pure helper — merge newly-emitted memory entries into existing dmMemory.
 * Dedupes by `summary` text (case-insensitive) so the same plan isn't
 * re-logged every scene. Exported for testability.
 */
export function mergeMemoryEntries(existing, additions) {
  const base = Array.isArray(existing) ? existing : [];
  const add = Array.isArray(additions) ? additions : [];
  const seen = new Set(base.map((e) => (e.summary || '').toLowerCase().trim()).filter(Boolean));
  const merged = [...base];
  for (const entry of add) {
    const key = (entry?.summary || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({
      at: entry.at || new Date().toISOString(),
      status: entry.status || 'planned',
      summary: entry.summary,
      plannedFor: entry.plannedFor || null,
    });
  }
  return clampList(merged, DM_MEMORY_CAP);
}

/**
 * Pure helper — reconcile pendingHooks: add new, update status on existing
 * (matched by id), drop "delivered" older than 5 entries back.
 */
export function mergePendingHooks(existing, additions, resolvedIds = []) {
  const base = Array.isArray(existing) ? existing : [];
  const add = Array.isArray(additions) ? additions : [];
  const resolved = new Set(resolvedIds);

  // Drop resolved hooks entirely
  let next = base.filter((h) => !resolved.has(h.id));

  // Upsert new hooks by id
  const byId = new Map(next.map((h) => [h.id, h]));
  for (const hook of add) {
    if (!hook?.id || !hook?.summary) continue;
    byId.set(hook.id, {
      id: hook.id,
      kind: hook.kind || 'generic',
      summary: hook.summary,
      idealTiming: hook.idealTiming || null,
      priority: hook.priority || 'normal',
      createdAt: byId.has(hook.id) ? byId.get(hook.id).createdAt : new Date().toISOString(),
    });
  }
  next = Array.from(byId.values());
  return clampList(next, PENDING_HOOKS_CAP);
}

// ──────────────────────────────────────────────────────────────────────
// DB-touching
// ──────────────────────────────────────────────────────────────────────

/**
 * Fetch the DM agent row for a campaign, creating an empty one if absent.
 */
export async function getOrCreateDmAgent(campaignId) {
  if (!campaignId) return null;
  try {
    const existing = await prisma.campaignDmAgent.findUnique({ where: { campaignId } });
    if (existing) return existing;
    return await prisma.campaignDmAgent.create({
      data: { campaignId, dmMemory: '[]', pendingHooks: '[]' },
    });
  } catch (err) {
    log.warn({ err, campaignId }, 'getOrCreateDmAgent failed');
    return null;
  }
}

/**
 * Apply a DM summary update — merges new memory entries + pendingHooks
 * + drops resolved hooks. Idempotent via dedupe in mergeMemoryEntries.
 *
 * @returns updated CampaignDmAgent row or null on failure
 */
export async function updateDmAgent(
  campaignId,
  { memoryEntries = [], hookAdditions = [], resolvedHookIds = [] } = {},
) {
  if (!campaignId) return null;
  try {
    const row = await getOrCreateDmAgent(campaignId);
    if (!row) return null;

    const dmMemory = JSON.parse(row.dmMemory || '[]');
    const pendingHooks = JSON.parse(row.pendingHooks || '[]');

    const nextMemory = mergeMemoryEntries(dmMemory, memoryEntries);
    const nextHooks = mergePendingHooks(pendingHooks, hookAdditions, resolvedHookIds);

    return await prisma.campaignDmAgent.update({
      where: { id: row.id },
      data: {
        dmMemory: JSON.stringify(nextMemory),
        pendingHooks: JSON.stringify(nextHooks),
        lastUpdatedAt: new Date(),
      },
    });
  } catch (err) {
    log.warn({ err, campaignId }, 'updateDmAgent failed');
    return null;
  }
}

/**
 * Read DM agent row + parse JSON fields for consumption by system prompt.
 * Returns `{ dmMemory: [], pendingHooks: [] }` when there is no row yet.
 */
export async function readDmAgentState(campaignId) {
  if (!campaignId) return { dmMemory: [], pendingHooks: [] };
  try {
    const row = await prisma.campaignDmAgent.findUnique({ where: { campaignId } });
    if (!row) return { dmMemory: [], pendingHooks: [] };
    return {
      dmMemory: safeParseArray(row.dmMemory),
      pendingHooks: safeParseArray(row.pendingHooks),
    };
  } catch (err) {
    log.warn({ err, campaignId }, 'readDmAgentState failed');
    return { dmMemory: [], pendingHooks: [] };
  }
}

function safeParseArray(s) {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
