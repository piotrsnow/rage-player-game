// Round E Phase 12 — LLM change resolver + confidence-tiered apply.
//
// Takes Phase 11's extracted world changes (plus Phase 10's shadow diff as a
// corroboration source) and produces tiered recommendations:
//   - HIGH:   both sources agree (LLM change resolves to the same WorldNPC
//             whose shadow diff already flags a compatible change) AND
//             RAG similarity ≥ 0.75. Auto-applied to canonical via a
//             knowledgeBase append.
//   - MEDIUM: LLM change resolves with similarity ≥ 0.6 but has no shadow-diff
//             corroboration, OR the kind has no shadow-diff equivalent
//             (newRumor, locationBurned, factionShift). Queued as `pending`
//             for Phase 13 admin review — no DB write here.
//   - LOW:    similarity < 0.6 or unresolvable → skipped with a log.
//
// Apply scope (HIGH only, narrow by design):
//   - `npcDeath`      → append to `WorldNPC.knowledgeBase` with the reason;
//                        `alive` itself stays Phase 12-lite's job (shadow
//                        diff owns that write, idempotent).
//   - `npcRelocation` → append to `WorldNPC.knowledgeBase`; `currentLocationId`
//                        stays Phase 12-lite's job.
//   - `newRumor`      → resolve to NPC (subject of rumor is usually an NPC);
//                        if resolved, append to that NPC's knowledgeBase.
//   - `locationBurned`, `factionShift` → currently no canonical target
//                        (WorldLocation.knowledgeBase doesn't exist; no
//                        Faction model). Always land in `pending`.
//
// Non-throwing: resolver failures, provider errors, per-write failures all
// log + skip without interrupting the write-back orchestrator.

import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import * as ragService from './ragService.js';

const log = childLogger({ module: 'postCampaignWorldChanges' });

const MIN_SIM_CONSIDER = 0.6;  // below → skipped as LOW
const MIN_SIM_AUTO = 0.75;     // combined with shadow corroboration → HIGH
// FIFO caps for WorldNpcKnowledge / WorldLocationKnowledge are enforced by
// AFTER-INSERT triggers in the F2 migration (50 per parent).

// Kinds whose target is an NPC (used to pick the right RAG entityType).
const NPC_SUBJECT_KINDS = new Set(['npcDeath', 'npcRelocation', 'newRumor']);
const LOCATION_SUBJECT_KINDS = new Set(['locationBurned']);
// factionShift has no entity — always MEDIUM/LOW via null resolver.

/**
 * Pure — determine which RAG entityType a change should resolve against.
 * Returns null for kinds with no canonical target (factionShift).
 */
export function entityTypeForKind(kind) {
  if (NPC_SUBJECT_KINDS.has(kind)) return 'npc';
  if (LOCATION_SUBJECT_KINDS.has(kind)) return 'location';
  return null;
}

/**
 * Resolve each LLM-extracted change to a canonical entityId via ragService.
 * Returns `[{ change, resolved: {entityId, entityType, similarity, text} | null, reason? }]`.
 * Individual resolver errors yield `resolved: null` with a reason — never throws.
 *
 * Injectable ragQuery is used so tests mock retrieval without standing up
 * embeddings; production callers should pass `ragService.query` bound.
 */
export async function resolveWorldChanges(changes, { ragQuery = ragService.query, minSim = MIN_SIM_CONSIDER } = {}) {
  if (!Array.isArray(changes) || changes.length === 0) return [];
  const out = [];
  for (const change of changes) {
    const entityType = entityTypeForKind(change.kind);
    if (!entityType) {
      out.push({ change, resolved: null, reason: 'no_entity_type_for_kind' });
      continue;
    }
    try {
      const hits = await ragQuery(change.targetHint, {
        filters: { entityType },
        topK: 1,
        minSim,
      });
      if (!hits || hits.length === 0) {
        out.push({ change, resolved: null, reason: 'below_min_sim' });
        continue;
      }
      out.push({ change, resolved: hits[0] });
    } catch (err) {
      log.warn({ err: err?.message, kind: change.kind, targetHint: change.targetHint },
        'resolveWorldChanges: rag query failed');
      out.push({ change, resolved: null, reason: 'rag_error' });
    }
  }
  return out;
}

/**
 * Pure — does a shadow-diff entry corroborate an LLM change? Returns the
 * matching diff entry (`{worldNpcId, changes}`) or null. Only meaningful for
 * NPC-kind changes that have a shadow-diff-equivalent field:
 *   - npcDeath      ↔ shadow `alive` transition to false
 *   - npcRelocation ↔ shadow `location` change
 * Other kinds never corroborate (always null).
 */
export function correlateWithShadowDiff({ change, resolved }, shadowDiff) {
  if (!resolved || resolved.entityType !== 'npc') return null;
  if (!shadowDiff || !Array.isArray(shadowDiff.npcDiffs)) return null;
  const entry = shadowDiff.npcDiffs.find((d) => d.worldNpcId === resolved.entityId);
  if (!entry) return null;

  if (change.kind === 'npcDeath') {
    const hasAliveFalse = entry.changes.some((c) => c.field === 'alive' && c.newValue === false);
    return hasAliveFalse ? entry : null;
  }
  if (change.kind === 'npcRelocation') {
    const hasLocation = entry.changes.some((c) => c.field === 'location' && c.newValue);
    return hasLocation ? entry : null;
  }
  return null;
}

/**
 * Pure — assign a confidence tier to a resolved change. Inputs:
 *   - `resolved` — output of resolveWorldChanges (may be null)
 *   - `correlation` — output of correlateWithShadowDiff (may be null)
 *
 * Tiers:
 *   - HIGH   : resolved AND sim ≥ MIN_SIM_AUTO AND correlation present
 *   - MEDIUM : resolved AND (kind has no correlation pathway OR no correlation OR sim < MIN_SIM_AUTO)
 *   - LOW    : unresolved OR sim below MIN_SIM_CONSIDER (resolver would have returned null)
 */
export function classifyConfidence({ resolved, correlation }) {
  if (!resolved) return { tier: 'low', reason: 'no_resolution' };
  if (resolved.similarity < MIN_SIM_CONSIDER) return { tier: 'low', reason: 'sim_below_consider' };
  if (correlation && resolved.similarity >= MIN_SIM_AUTO) {
    return { tier: 'high', reason: 'shadow_corroborated_high_sim' };
  }
  if (correlation) return { tier: 'medium', reason: 'shadow_corroborated_low_sim' };
  return { tier: 'medium', reason: 'llm_only' };
}

/**
 * Pure — build the knowledgeBase entry we append to a WorldNPC. Shape mirrors
 * Stage 1 hand-authored entries ({content, source}) so the Stage 2b reader
 * doesn't need to discriminate — baseline vs promoted memory use the same
 * field. `source: 'llm_extraction:<campaignId>'` makes the provenance
 * explicit without adding a new column.
 */
export function buildKnowledgeEntry({ change, resolved, campaignId }) {
  const reason = (change.reason || '').trim();
  const suffix = reason ? ` (${reason})` : '';
  const content = `${change.newValue}${suffix}`;
  return {
    content,
    source: `llm_extraction:${campaignId || 'unknown'}`,
    kind: change.kind,
    confidence: Number.isFinite(change.confidence) ? change.confidence : null,
    similarity: Number.isFinite(resolved?.similarity) ? Number(resolved.similarity.toFixed(3)) : null,
    addedAt: new Date().toISOString(),
  };
}

/**
 * Pure — deterministic dedup key for PendingWorldStateChange. Hash of
 * `${kind}|${targetHint}|${newValue}` (SHA-1, 16 hex chars). Intentionally
 * NO normalization — different phrasings of the same fact should produce
 * distinct pending rows so the admin surface can show competing "legends"
 * from a single campaign (a half-remembered rumor vs a firsthand witness).
 */
export function computeIdempotencyKey({ kind, targetHint, newValue }) {
  const basis = `${kind || ''}|${targetHint || ''}|${newValue || ''}`;
  return createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

/**
 * I/O — upsert one pending world state change into `PendingWorldStateChange`,
 * keyed by `(campaignId, idempotencyKey)`. Stickiness contract: on UPDATE we
 * refresh resolver signals (`targetEntityId`/`targetEntityType`/`confidence`/
 * `similarity`/`reason`) but NEVER overwrite `status`/`reviewedBy`/`reviewedAt`/
 * `reviewNotes` — admin decisions survive re-runs. Returns the written (or
 * would-write) record shape, or null on DB failure.
 */
async function upsertPendingChange({ change, resolved, reason, campaignId, dryRun }) {
  const idempotencyKey = computeIdempotencyKey({
    kind: change.kind,
    targetHint: change.targetHint,
    newValue: change.newValue,
  });
  const row = {
    campaignId,
    idempotencyKey,
    kind: change.kind,
    targetHint: change.targetHint || '',
    targetEntityId: resolved?.entityId || null,
    targetEntityType: resolved?.entityType || null,
    newValue: change.newValue || '',
    confidence: Number.isFinite(change.confidence) ? change.confidence : 0,
    similarity: Number.isFinite(resolved?.similarity) ? Number(resolved.similarity.toFixed(3)) : null,
    reason,
  };

  if (dryRun) return { ...row, dryRun: true };

  try {
    await prisma.pendingWorldStateChange.upsert({
      where: { campaignId_idempotencyKey: { campaignId, idempotencyKey } },
      create: row,
      update: {
        // Refresh resolver signals on re-run; preserve admin decision.
        targetEntityId: row.targetEntityId,
        targetEntityType: row.targetEntityType,
        confidence: row.confidence,
        similarity: row.similarity,
        reason: row.reason,
      },
    });
    return row;
  } catch (err) {
    log.warn({ err: err?.message, idempotencyKey, kind: change.kind },
      'upsertPendingChange write failed');
    return null;
  }
}

/**
 * Apply HIGH-tier classifications to canonical WorldNPC rows. Returns
 * `{ appliedKnowledge, pending, skipped }`.
 *   - appliedKnowledge: entries actually written (or would-write when dryRun).
 *   - pending:          MEDIUM tier + unsupported HIGH tier + all location
 *                       kinds — persisted to `PendingWorldStateChange` for
 *                       Phase 13 admin review. Upserted by idempotencyKey so
 *                       re-runs don't accumulate duplicates.
 *   - skipped:          LOW tier — silently dropped with reason.
 *
 * Policy: location changes (`locationBurned`) always land in pending even at
 * HIGH similarity. There's no shadow-diff pathway for locations so the "two
 * sources agreed" safety invariant we enforce for NPCs isn't available —
 * admin review is the safety net. Apply handler for WorldLocation is wired
 * so the Phase 13 approval route can call it.
 *
 * `dryRun=true` collects the lists without issuing writes.
 */
export async function applyWorldStateChanges({ classifications, campaignId, dryRun = false }) {
  const appliedKnowledge = [];
  const pending = [];
  const skipped = [];

  if (!Array.isArray(classifications)) return { appliedKnowledge, pending, skipped, dryRun };

  for (const item of classifications) {
    const { change, resolved, tier, reason } = item;

    if (tier === 'low') {
      skipped.push({ change, reason });
      continue;
    }

    // MEDIUM: queue for admin review.
    if (tier === 'medium') {
      const persisted = await upsertPendingChange({ change, resolved, reason, campaignId, dryRun });
      if (persisted) pending.push(persisted);
      continue;
    }

    // HIGH + location → always pending (admin sign-off). The apply branch is
    // still reachable from Phase 13's approval route via `applyLocationKnowledgeChange`.
    if (resolved?.entityType === 'location') {
      const persisted = await upsertPendingChange({
        change, resolved, reason: 'location_requires_review', campaignId, dryRun,
      });
      if (persisted) pending.push(persisted);
      continue;
    }

    // HIGH + non-NPC entity without a handler (factionShift etc.) → pending.
    if (!resolved || resolved.entityType !== 'npc') {
      const persisted = await upsertPendingChange({
        change, resolved, reason: 'high_but_no_handler', campaignId, dryRun,
      });
      if (persisted) pending.push(persisted);
      continue;
    }
    if (change.kind !== 'npcDeath' && change.kind !== 'npcRelocation' && change.kind !== 'newRumor') {
      const persisted = await upsertPendingChange({
        change, resolved, reason: 'high_but_unsupported_kind', campaignId, dryRun,
      });
      if (persisted) pending.push(persisted);
      continue;
    }

    const entry = buildKnowledgeEntry({ change, resolved, campaignId });

    if (dryRun) {
      appliedKnowledge.push({ worldNpcId: resolved.entityId, entry, dryRun: true });
      continue;
    }

    try {
      const row = await prisma.worldNPC.findUnique({
        where: { id: resolved.entityId },
        select: { id: true },
      });
      if (!row) {
        skipped.push({ change, reason: 'world_npc_not_found' });
        continue;
      }
      await prisma.worldNpcKnowledge.create({
        data: knowledgeEntryToInsertData(entry, row.id, 'npc'),
      });
      appliedKnowledge.push({ worldNpcId: resolved.entityId, entry });
    } catch (err) {
      log.warn({ err: err?.message, worldNpcId: resolved.entityId, kind: change.kind },
        'applyWorldStateChanges: write failed');
      skipped.push({ change, reason: 'write_failed', error: err?.message });
    }
  }

  return { appliedKnowledge, pending, skipped, dryRun };
}

/**
 * Pure — map a `buildKnowledgeEntry` result + parent FK to a WorldNpcKnowledge
 * or WorldLocationKnowledge `data` payload. The two child tables share most
 * columns; the FK column name differs (`npcId` vs `locationId`).
 */
function knowledgeEntryToInsertData(entry, parentId, kind) {
  const fk = kind === 'location' ? { locationId: parentId } : { npcId: parentId };
  return {
    ...fk,
    content: entry.content,
    source: entry.source,
    kind: entry.kind,
    confidence: Number.isFinite(entry.confidence) ? entry.confidence : null,
    similarity: Number.isFinite(entry.similarity) ? entry.similarity : null,
    addedAt: entry.addedAt ? new Date(entry.addedAt) : new Date(),
  };
}

/**
 * I/O — apply a knowledgeBase append to a canonical WorldLocation. Exposed
 * for the Phase 13 admin-approval route: admin approves a pending
 * `locationBurned` (or similar) change, and this is what writes the knowledge.
 * FIFO-capped at LOCATION_KNOWLEDGE_CAP per location. Non-throwing — returns
 * `{ ok: true, entry }` on success, `{ ok: false, reason }` otherwise.
 */
export async function applyLocationKnowledgeChange({ change, resolved, campaignId }) {
  if (resolved?.entityType !== 'location' || !resolved.entityId) {
    return { ok: false, reason: 'not_a_location_change' };
  }
  const entry = buildKnowledgeEntry({ change, resolved, campaignId });
  try {
    const row = await prisma.worldLocation.findUnique({
      where: { id: resolved.entityId },
      select: { id: true },
    });
    if (!row) return { ok: false, reason: 'world_location_not_found' };
    await prisma.worldLocationKnowledge.create({
      data: knowledgeEntryToInsertData(entry, row.id, 'location'),
    });
    return { ok: true, entry };
  } catch (err) {
    log.warn({ err: err?.message, worldLocationId: resolved.entityId, kind: change.kind },
      'applyLocationKnowledgeChange: write failed');
    return { ok: false, reason: 'write_failed', error: err?.message };
  }
}

/**
 * I/O — mirror of applyLocationKnowledgeChange for NPC targets. Factored out
 * of `applyWorldStateChanges` so the Phase 13 admin-approval route can reach
 * the same write path when approving a pending NPC-kind change. FIFO-capped at
 * NPC_KNOWLEDGE_CAP. Non-throwing.
 */
export async function applyNpcKnowledgeChange({ change, resolved, campaignId }) {
  if (resolved?.entityType !== 'npc' || !resolved.entityId) {
    return { ok: false, reason: 'not_an_npc_change' };
  }
  const entry = buildKnowledgeEntry({ change, resolved, campaignId });
  try {
    const row = await prisma.worldNPC.findUnique({
      where: { id: resolved.entityId },
      select: { id: true },
    });
    if (!row) return { ok: false, reason: 'world_npc_not_found' };
    await prisma.worldNpcKnowledge.create({
      data: knowledgeEntryToInsertData(entry, row.id, 'npc'),
    });
    return { ok: true, entry };
  } catch (err) {
    log.warn({ err: err?.message, worldNpcId: resolved.entityId, kind: change.kind },
      'applyNpcKnowledgeChange: write failed');
    return { ok: false, reason: 'write_failed', error: err?.message };
  }
}

/**
 * I/O — apply an admin-approved `PendingWorldStateChange` row. Reconstructs
 * the `change`/`resolved` shape from the persisted fields and dispatches to
 * the per-entity apply helper. Callers own the `status='approved'` update.
 * Non-throwing — returns `{ok, reason?, entry?}`.
 */
export async function applyApprovedPendingChange(pending) {
  if (!pending) return { ok: false, reason: 'missing_pending' };
  const change = {
    kind: pending.kind,
    targetHint: pending.targetHint,
    newValue: pending.newValue,
    confidence: pending.confidence,
    reason: pending.reason,
  };
  const resolved = pending.targetEntityId && pending.targetEntityType
    ? {
        entityId: pending.targetEntityId,
        entityType: pending.targetEntityType,
        similarity: pending.similarity ?? null,
      }
    : null;
  if (!resolved) return { ok: false, reason: 'unresolved_target' };

  if (resolved.entityType === 'location') {
    return applyLocationKnowledgeChange({ change, resolved, campaignId: pending.campaignId });
  }
  if (resolved.entityType === 'npc') {
    return applyNpcKnowledgeChange({ change, resolved, campaignId: pending.campaignId });
  }
  return { ok: false, reason: 'unsupported_entity_type' };
}

/**
 * End-to-end Phase 12 pipeline for a set of Phase 11 changes. Combines
 * resolve → correlate → classify → apply into a single async call.
 *
 * Orchestrator-friendly: returns `{ classifications, appliedKnowledge, pending, skipped }`
 * with the full classifier trace for observability.
 */
export async function runWorldStateChangePipeline({ changes, shadowDiff, campaignId, dryRun = false, ragQuery }) {
  const resolved = await resolveWorldChanges(changes, ragQuery ? { ragQuery } : undefined);
  const classifications = resolved.map((r) => {
    const correlation = correlateWithShadowDiff(r, shadowDiff);
    const { tier, reason } = classifyConfidence({ resolved: r.resolved, correlation });
    return { ...r, correlation, tier, reason };
  });
  const { appliedKnowledge, pending, skipped } = await applyWorldStateChanges({
    classifications, campaignId, dryRun,
  });
  return { classifications, appliedKnowledge, pending, skipped };
}
