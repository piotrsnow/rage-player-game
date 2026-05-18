// Round E Phase 10 + Phase 12-lite — post-campaign world write-back.
//
// Phase 10: `collectCampaignShadowDiff(campaignId)` compares every CampaignNPC
// shadow against its canonical WorldNPC and returns a structured diff. Pure
// read path — never mutates.
//
// Phase 12-lite: `applyShadowDiffToCanonical({diff, autoApplyFields})` walks
// the diff and promotes a NARROW set of fields to canonical:
//   - `alive: true → false` (NPC died — redundant with reputationHook but
//     safe net for cases where the hook bailed: missing worldNpcId link,
//     name resolution failure, livingWorldEnabled=false earlier then flipped).
//   - `location: X → Y` where Y is non-null (NPC relocated — final position
//     becomes canonical so subsequent campaigns spawn them at the new home).
// All other diffs (name/role/personality changes, activeGoal/goalProgress —
// the last two are INDEPENDENT per Round B architecture) are reported but
// NOT applied; they land in Phase 11 LLM extraction + Phase 13 admin review
// when those ship.
//
// `runPostCampaignWorldWriteback(campaignId, opts)` is the single-entry
// orchestrator future callers (admin button, campaign-finalize route) will
// use. Safe to call multiple times — both stages are idempotent. Returns a
// summary object describing what was collected vs applied.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { extractWorldFacts } from './postCampaignFactExtraction.js';
import { runWorldStateChangePipeline } from './postCampaignWorldChanges.js';
import { runNpcPromotionPipeline } from './postCampaignPromotion.js';
import { runLocationPromotionPipeline } from './postCampaignLocationPromotion.js';
import { promoteExperienceLogsToCanonical } from './postCampaignMemoryPromotion.js';

const log = childLogger({ module: 'postCampaignWriteback' });

// Fields we inspect when building a shadow-vs-canonical diff. `location` is
// a synthetic field — `CampaignNPC.lastLocationId` maps to `WorldNPC.currentLocationId`.
// `activeGoal`/`goalProgress` are deliberately EXCLUDED (Round B decision:
// shadow and canonical goals are independent by design, not drift).
const DIFFED_FIELDS = ['alive', 'location', 'name', 'role', 'personality'];

// Fields the narrow auto-applier writes back. Everything else requires
// Phase 11 LLM extraction + Phase 13 admin review.
const DEFAULT_AUTO_APPLY_FIELDS = ['alive', 'location'];

/**
 * Pure field-level diff. Returns [{ field, oldValue, newValue }]. `clone`
 * is the CampaignNPC row; `canonical` is the WorldNPC row. The `location`
 * synthetic field compares `clone.lastLocationId` to `canonical.currentLocationId`.
 * Only emits a change for fields where `clone` holds a NON-NULL newer value
 * (we don't promote "NPC forgot their personality" nulls back to canonical).
 *
 * With the unified Location table, all location IDs are plain UUIDs — no
 * kind dispatch needed. A clone's `currentLocationId` is directly compared
 * to the canonical's `currentLocationId`.
 */
export function diffNpcFields(clone, canonical) {
  if (!clone || !canonical) return [];
  const changes = [];

  for (const field of DIFFED_FIELDS) {
    if (field === 'location') {
      const cloneLoc = clone.currentLocationId ?? null;
      const canonLoc = canonical.currentLocationId ?? null;
      if (cloneLoc !== canonLoc && cloneLoc !== null) {
        changes.push({ field: 'location', oldValue: canonLoc, newValue: cloneLoc });
      }
      continue;
    }
    const cloneValue = clone[field];
    const canonValue = canonical[field];
    if (cloneValue === undefined) continue;

    // Strict inequality for booleans (alive); loose for nullable strings so
    // undefined/null compare equal.
    const equal = typeof cloneValue === 'boolean'
      ? cloneValue === canonValue
      : (cloneValue ?? null) === (canonValue ?? null);
    if (equal) continue;

    // Skip clone→null transitions for string fields (don't erase canonical).
    if (typeof cloneValue !== 'boolean' && (cloneValue === null || cloneValue === '')) continue;

    changes.push({ field, oldValue: canonValue ?? null, newValue: cloneValue });
  }

  return changes;
}

/**
 * Filter a diff down to the changes the narrow auto-applier is authorized
 * to write. Pure. Also runs guards on specific transitions that are unsafe
 * to auto-apply (e.g. promoting `alive: false → true` resurrects a canon-dead
 * NPC — we never auto-resurrect).
 */
export function filterAutoApplyChanges(changes, autoApplyFields = DEFAULT_AUTO_APPLY_FIELDS) {
  if (!Array.isArray(changes)) return [];
  const allowed = new Set(autoApplyFields);
  const out = [];
  for (const change of changes) {
    if (!allowed.has(change.field)) continue;

    if (change.field === 'alive') {
      // Only promote true→false (death). A canon-dead NPC staying dead in
      // the shadow doesn't need a write, and we never auto-resurrect.
      if (change.oldValue === true && change.newValue === false) out.push(change);
      continue;
    }
    if (change.field === 'location') {
      // Already guarded in diffNpcFields (we skip null newValues), but
      // double-check: relocation must move TO a non-null location.
      if (change.newValue) out.push(change);
      continue;
    }
    out.push(change);
  }
  return out;
}

/**
 * Collect the shadow-vs-canonical diff for every CampaignNPC with a
 * `worldNpcId` link in this campaign. Ephemeral NPCs (`worldNpcId=null`)
 * are skipped — they have no canonical row to diff against; their
 * promotion is Phase 12b's job.
 *
 * Returns:
 *   {
 *     campaignId,
 *     npcDiffs: [{ worldNpcId, campaignNpcId, name, changes: [...] }],
 *     summary: { npcsExamined, npcsWithChanges, fieldCounts: {alive:N, location:N, ...} }
 *   }
 */
export async function collectCampaignShadowDiff(campaignId) {
  if (!campaignId) throw new Error('collectCampaignShadowDiff: campaignId is required');

  const clones = await prisma.npc.findMany({
    where: { campaignId, canonicalNpcId: { not: null } },
    select: {
      id: true,
      name: true,
      canonicalNpcId: true,
      alive: true,
      currentLocationId: true,
      role: true,
      personality: true,
    },
  });

  if (clones.length === 0) {
    return {
      campaignId,
      npcDiffs: [],
      summary: { npcsExamined: 0, npcsWithChanges: 0, fieldCounts: {} },
    };
  }

  const worldIds = clones.map((c) => c.canonicalNpcId);
  const canonicals = await prisma.npc.findMany({
    where: { id: { in: worldIds } },
    select: {
      id: true,
      name: true,
      alive: true,
      currentLocationId: true,
      role: true,
      personality: true,
    },
  });
  const byId = new Map(canonicals.map((c) => [c.id, c]));

  const npcDiffs = [];
  const fieldCounts = {};
  for (const clone of clones) {
    const canonical = byId.get(clone.canonicalNpcId);
    if (!canonical) {
      log.warn({ campaignId, campaignNpcId: clone.id, worldNpcId: clone.canonicalNpcId },
        'Shadow points at missing WorldNPC — skipped');
      continue;
    }
    const changes = diffNpcFields(clone, canonical);
    if (changes.length === 0) continue;
    for (const c of changes) fieldCounts[c.field] = (fieldCounts[c.field] || 0) + 1;
    npcDiffs.push({
      worldNpcId: clone.canonicalNpcId,
      campaignNpcId: clone.id,
      name: clone.name,
      changes,
    });
  }

  return {
    campaignId,
    npcDiffs,
    summary: {
      npcsExamined: clones.length,
      npcsWithChanges: npcDiffs.length,
      fieldCounts,
    },
  };
}

/**
 * Strict World Write Gate — shadow diff changes are NO LONGER auto-applied
 * to canonical WorldNPC. Instead they are routed to PendingWorldStateChange
 * for admin review. Returns the same shape for backward compat of the
 * orchestrator summary.
 */
export async function applyShadowDiffToCanonical({
  diff,
  autoApplyFields = DEFAULT_AUTO_APPLY_FIELDS,
  dryRun = false,
  campaignId = null,
}) {
  if (!diff?.npcDiffs) return { applied: [], skipped: [], pending: [], dryRun };

  const pending = [];
  const skipped = [];

  for (const npcDiff of diff.npcDiffs) {
    const authorized = filterAutoApplyChanges(npcDiff.changes, autoApplyFields);
    const reviewNeeded = npcDiff.changes.filter((c) => !authorized.includes(c));

    if (reviewNeeded.length > 0) {
      skipped.push({
        worldNpcId: npcDiff.worldNpcId,
        name: npcDiff.name,
        reason: 'needs_review',
        changes: reviewNeeded,
      });
    }

    if (authorized.length === 0) continue;

    for (const change of authorized) {
      const kind = change.field === 'alive' ? 'npcDeath' : 'npcRelocation';
      if (!dryRun) {
        try {
          const { upsertPendingChange } = await import('./postCampaignWorldChanges.js');
          await upsertPendingChange({
            change: {
              kind,
              targetHint: npcDiff.name,
              newValue: String(change.newValue),
              confidence: 1.0,
              reason: 'shadow_diff',
            },
            resolved: {
              entityId: npcDiff.worldNpcId,
              entityType: 'npc',
              similarity: 1.0,
            },
            campaignId: campaignId || diff.campaignId,
          });
        } catch (err) {
          log.warn({ err: err?.message, worldNpcId: npcDiff.worldNpcId },
            'applyShadowDiffToCanonical pending upsert failed');
          skipped.push({
            worldNpcId: npcDiff.worldNpcId,
            name: npcDiff.name,
            reason: 'pending_write_failed',
            error: err?.message,
            changes: [change],
          });
          continue;
        }
      }
      pending.push({
        worldNpcId: npcDiff.worldNpcId,
        name: npcDiff.name,
        changes: [change],
      });
    }
  }

  return { applied: [], pending, skipped, dryRun };
}

/**
 * Orchestrator — single entry point for the post-campaign write-back. Five
 * phases wrapped into one call:
 *   1. `collectCampaignShadowDiff`     — Phase 10 — shadow-vs-canonical NPC diff
 *   2. `extractWorldFacts`             — Phase 11 — LLM extracts world changes from compressed memory
 *   3. `runWorldStateChangePipeline`   — Phase 12 — resolve LLM changes via RAG,
 *                                         classify confidence (high/medium/low),
 *                                         auto-apply HIGH to WorldNPC.knowledgeBase;
 *                                         MEDIUM → pending (Phase 13 review surface)
 *   4. `applyShadowDiffToCanonical`    — Phase 12-lite — narrow shadow-diff fields
 *                                         (`alive`, `location`) promoted to WorldNPC
 *   5. `runNpcPromotionPipeline`       — Phase 12b Slice A — score ephemeral NPCs,
 *                                         upsert top-N into NPCPromotionCandidate
 *                                         for admin review (Phase 13 UI surface)
 *
 * Phase 11 output feeds Phase 12 (LLM changes + shadow diff = two sources for
 * the classifier). Phase 12 and 12-lite don't conflict: 12-lite owns `alive`
 * and `currentLocationId` writes; Phase 12 owns `knowledgeBase` appends.
 * Phase 12b operates on a disjoint scope (ephemeral NPCs, `worldNpcId=null`)
 * so it never contends with 12 or 12-lite.
 *
 * Opts:
 *   - dryRun: boolean — collect diffs but don't mutate canonical (all phases)
 *   - autoApplyFields: string[] — override default narrow field list (Phase 12-lite)
 *   - skipExtraction: boolean — bypass Phase 11 LLM call (tests, hot-path dryRun)
 *   - skipWorldChangePipeline: boolean — bypass Phase 12
 *   - skipPromotion: boolean — bypass Phase 12b (Slice A selection + Slice B verdict)
 *   - promotionTopN: number — override default top-N for promotion pipeline
 *   - skipPromotionVerdict: boolean — keep Slice A selection, skip Slice B LLM verdict
 *   - promotionProvider / promotionModelTier / promotionUserApiKeys — forwarded
 *     to the Slice B verdict LLM (defaults to anthropic/standard = Haiku 4.5)
 *   - extractionProvider / extractionModelTier / extractionUserApiKeys — forwarded
 *     to `extractWorldFacts`
 *   - skipMemoryPromotion: boolean — bypass Stage 2b (experienceLog → canonical
 *     WorldNPC.knowledgeBase cross-campaign promotion)
 *   - memoryImportanceFilter: string[] — override default ['major'] importance
 *     filter for Stage 2b promotion
 */
export async function runPostCampaignWorldWriteback(campaignId, {
  dryRun = false,
  autoApplyFields = DEFAULT_AUTO_APPLY_FIELDS,
  skipExtraction = false,
  skipWorldChangePipeline = false,
  skipPromotion = false,
  promotionTopN = 5,
  skipPromotionVerdict = false,
  promotionProvider = 'anthropic',
  promotionModelTier = 'standard',
  promotionUserApiKeys = null,
  extractionProvider = 'openai',
  extractionModelTier = 'nanoReasoning',
  extractionUserApiKeys = null,
  skipMemoryPromotion = true,
  memoryImportanceFilter = ['major'],
  skipLocationPromotion = false,
  locationPromotionTopN = 5,
} = {}) {
  const diff = await collectCampaignShadowDiff(campaignId);

  let factExtraction = { changes: [], skipped: true };
  if (!skipExtraction) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      // F5 — re-merge currentLocationName so coreState.world.currentLocation is
      // present for downstream prompt builders that may inspect it.
      select: { coreState: true, currentLocationName: true },
    });
    const coreState = campaign?.coreState;
    if (coreState && typeof coreState === 'object') {
      if (campaign.currentLocationName) {
        if (!coreState.world) coreState.world = {};
        if (!coreState.world.currentLocation) coreState.world.currentLocation = campaign.currentLocationName;
      }
      factExtraction = (await extractWorldFacts({
        campaignId,
        coreState,
        shadowDiffSummary: diff.summary,
        provider: extractionProvider,
        modelTier: extractionModelTier,
        userApiKeys: extractionUserApiKeys,
      })) || factExtraction;
    } else if (coreState) {
      log.warn({ campaignId }, 'coreState is not an object — skipping extraction');
    }
  }

  let worldStateChanges = {
    classifications: [], appliedKnowledge: [], pending: [], skipped: [],
  };
  if (!skipWorldChangePipeline && Array.isArray(factExtraction.changes) && factExtraction.changes.length > 0) {
    worldStateChanges = await runWorldStateChangePipeline({
      changes: factExtraction.changes,
      shadowDiff: diff,
      campaignId,
      dryRun,
    });
  }

  const result = await applyShadowDiffToCanonical({ diff, autoApplyFields, dryRun, campaignId });

  let promotion = { collected: [], persisted: [], skipped: [] };
  if (!skipPromotion) {
    promotion = await runNpcPromotionPipeline({
      campaignId,
      dryRun,
      topN: promotionTopN,
      skipVerdict: skipPromotionVerdict,
      verdictProvider: promotionProvider,
      verdictModelTier: promotionModelTier,
      verdictUserApiKeys: promotionUserApiKeys,
    });
  }

  // Stage 2b — strict world-write gate: memory promotion to canonical
  // WorldNpcKnowledge is now skipped by default. Admin can opt-in by
  // passing skipMemoryPromotion=false after reviewing candidates.
  let memoryPromotion = { promoted: [], skipped: [] };
  if (!skipMemoryPromotion) {
    memoryPromotion = await promoteExperienceLogsToCanonical(campaignId, {
      dryRun,
      importanceFilter: memoryImportanceFilter,
    });
  }

  let locationPromotion = { collected: [], persisted: [], skipped: [] };
  if (!skipLocationPromotion) {
    locationPromotion = await runLocationPromotionPipeline({
      campaignId,
      dryRun,
      topN: locationPromotionTopN,
    });
  }

  log.info({
    campaignId,
    dryRun,
    npcsExamined: diff.summary.npcsExamined,
    npcsWithChanges: diff.summary.npcsWithChanges,
    fieldCounts: diff.summary.fieldCounts,
    extractedChanges: factExtraction.changes.length,
    extractionWarning: factExtraction.warning || null,
    worldChangesApplied: worldStateChanges.appliedKnowledge.length,
    worldChangesPending: worldStateChanges.pending.length,
    worldChangesSkipped: worldStateChanges.skipped.length,
    applied: result.applied.length,
    skipped: result.skipped.length,
    promotionCollected: promotion.collected.length,
    promotionPersisted: promotion.persisted.length,
    memoryPromoted: memoryPromotion.promoted.length,
    locationPromotionCollected: locationPromotion.collected.length,
    locationPromotionPersisted: locationPromotion.persisted.length,
  }, 'Post-campaign world writeback complete');

  return {
    campaignId,
    dryRun,
    diff,
    factExtraction,
    worldStateChanges,
    apply: result,
    promotion,
    memoryPromotion,
    locationPromotion,
  };
}
