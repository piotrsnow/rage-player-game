// Living World Phase 3 — reputation service.
//
// Tracks per-character reputation across three scopes (global / region /
// settlement). Each WorldNpcAttribution writes an append-only ledger entry;
// WorldReputation rows cache the running score + computed label + bounty state
// per (characterId, scope, scopeKey) so the scene-gen context fetch is a single
// find query.
//
// Deltas follow the table in the plan (plans/.../lucky-flask.md). Cross-user
// visibility (`visibility: "global"` on attributions) and atonement quest loop
// are deferred — see knowledge/ideas/living-world-cross-user-visibility.md and
// knowledge/ideas/living-world-atonement-loop.md.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'reputationService' });

// ──────────────────────────────────────────────────────────────────────
// Pure functions (exported for testability)
// ──────────────────────────────────────────────────────────────────────

/**
 * Per-action reputation deltas. Returns a `{global, region}` object
 * (settlement delta mirrors region by default). Caller applies the deltas to
 * whichever scopes are relevant to the action.
 *
 * `actionType` — killed | robbed | saved | helped
 * `victimAlignment` — good | neutral | evil
 * `justified` — true if nano-judged justified (irrelevant for non-kill actions)
 */
export function computeReputationDeltas({ actionType, victimAlignment = 'neutral', justified = false }) {
  const align = victimAlignment === 'good' || victimAlignment === 'evil' ? victimAlignment : 'neutral';

  if (actionType === 'killed') {
    if (align === 'good') {
      return justified
        ? { global: 0, region: 0 } // questioned but not condemned
        : { global: -10, region: -20 };
    }
    if (align === 'evil') {
      return justified
        ? { global: 5, region: 20 }
        : { global: -5, region: 10 }; // overkill, still senseless
    }
    // neutral alignment — smaller penalties either way
    return justified
      ? { global: 0, region: 5 }
      : { global: -5, region: -10 };
  }

  if (actionType === 'robbed') {
    return { global: 0, region: -15 };
  }
  if (actionType === 'helped' || actionType === 'saved') {
    const mult = align === 'good' ? 1 : align === 'evil' ? -1 : 0.5;
    // `| 0` coerces -0 → 0 so test equality (and JSON output) stays clean.
    return {
      global: (Math.round(0 * mult)) | 0,
      region: (Math.round(5 * mult)) | 0,
    };
  }
  if (actionType === 'betrayed') {
    return { global: -5, region: -10 };
  }

  return { global: 0, region: 0 };
}

/**
 * Score → label bucket. Labels drive encounter escalation + suffix injection.
 */
export function computeReputationLabel(score) {
  if (!Number.isFinite(score)) return 'neutral';
  if (score <= -200) return 'wanted_criminal';
  if (score <= -100) return 'outlaw';
  if (score <= -50) return 'suspicious';
  if (score >= 200) return 'hero';
  if (score >= 50) return 'respected';
  return 'neutral';
}

/**
 * Bounty amount in SK (srebrne korony). Triggers when score drops below -300
 * AND there was an incident in the past 7 game-days. Scales linearly with
 * abs(score), capped at 100 ZK (= 2000 SK).
 */
export function computeBountyAmount(score, lastIncidentAt, now = new Date()) {
  if (!Number.isFinite(score) || score > -300) return 0;
  if (!lastIncidentAt) return 0;
  const ageMs = now.getTime() - new Date(lastIncidentAt).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (ageMs > sevenDaysMs) return 0;
  const amount = Math.abs(score) * 5;
  return Math.min(2000, amount);
}

/**
 * Vendetta activates at global score ≤ -500 and clears after 2 game-weeks
 * without further incidents (or via atonement quest — deferred).
 */
export function shouldActivateVendetta(score, currentlyActive) {
  if (currentlyActive) return true;
  return Number.isFinite(score) && score <= -500;
}

export function shouldClearVendetta(lastIncidentAt, now = new Date()) {
  if (!lastIncidentAt) return false;
  const ageMs = now.getTime() - new Date(lastIncidentAt).getTime();
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  return ageMs > twoWeeksMs;
}

/**
 * Diminishing returns + daily gain cap. Prevents grinding rep by farming
 * weak NPCs. Caller passes the raw delta + current-day accumulated positive
 * gain for this (character, scope, scopeKey).
 */
export function applyDiminishingReturns({ rawDelta, sameDayGain = 0, sameDayCount = 0 }) {
  if (rawDelta <= 0) return rawDelta; // penalties are never diminished
  // Each repeated same-day gain on same scope loses 30% per prior hit.
  const factor = Math.max(0.1, Math.pow(0.7, sameDayCount));
  const scaled = Math.round(rawDelta * factor);
  // Cap total positive gain per day at +20 per scope.
  const remaining = Math.max(0, 20 - sameDayGain);
  return Math.min(scaled, remaining);
}

// ──────────────────────────────────────────────────────────────────────
// DB-touching
// ──────────────────────────────────────────────────────────────────────

/**
 * Upsert a single (characterId, scope, scopeKey) row by applying a delta.
 * Atomic via Prisma's upsert semantics — safe to call from multiple parallel
 * attributions. Recomputes label/bounty/vendetta on every update.
 */
async function applyScopeDelta({
  characterId,
  scope,
  scopeKey,
  delta,
  lastIncidentAt,
}) {
  if (!characterId || !scope || delta === 0) return null;
  const key = scopeKey || '';

  const existing = await prisma.worldReputation.findUnique({
    where: { characterId_scope_scopeKey: { characterId, scope, scopeKey: key } },
  });

  const prevScore = existing?.score ?? 0;
  const nextScore = Math.max(-1000, Math.min(1000, prevScore + delta));
  const label = computeReputationLabel(nextScore);
  const bounty = computeBountyAmount(nextScore, lastIncidentAt);
  const vendetta = scope === 'global'
    ? shouldActivateVendetta(nextScore, existing?.vendettaActive === true)
    : existing?.vendettaActive ?? false;

  if (existing) {
    return prisma.worldReputation.update({
      where: { id: existing.id },
      data: {
        score: nextScore,
        reputationLabel: label,
        bountyAmount: bounty,
        vendettaActive: vendetta,
        lastIncidentAt: lastIncidentAt ?? existing.lastIncidentAt,
      },
    });
  }

  return prisma.worldReputation.create({
    data: {
      characterId,
      scope,
      scopeKey: key,
      score: nextScore,
      reputationLabel: label,
      bountyAmount: bounty,
      vendettaActive: vendetta,
      lastIncidentAt: lastIncidentAt ?? null,
    },
  });
}

/**
 * Apply a single NPC attribution: writes the ledger row + updates reputation
 * scores across all relevant scopes. Idempotent by (actor, npc, gameTime,
 * actionType) — duplicate calls create duplicate ledger rows (cheap) but
 * deltas are only applied once because the caller guards via `alreadyApplied`.
 *
 * Input:
 *   actorCharacterId, actorCampaignId  — required
 *   worldNpcId                          — required
 *   actionType                          — killed | robbed | helped | saved | betrayed
 *   victimAlignment                     — from WorldNPC
 *   scopeContext = { region?, settlementKey? }
 *   justified, judgeConfidence, judgeReason   — from justifiedKillJudge (kill only)
 *   gameTime                            — Date
 *
 * Returns: { attribution, updated: WorldReputation[] }
 */
export async function applyAttribution({
  actorCharacterId,
  actorCampaignId,
  worldNpcId,
  actionType,
  victimAlignment = 'neutral',
  scopeContext = {},
  justified = false,
  judgeConfidence = 0,
  judgeReason = null,
  gameTime,
}) {
  if (!actorCharacterId || !actorCampaignId || !worldNpcId || !actionType) return null;
  const now = gameTime ? new Date(gameTime) : new Date();

  // Ledger row
  const attribution = await prisma.worldNpcAttribution.create({
    data: {
      actorCharacterId,
      actorCampaignId,
      worldNpcId,
      actionType,
      justified,
      judgeConfidence,
      judgeReason,
      alignmentImpact: victimAlignment,
      visibility: 'campaign', // Phase 3 cross-user ships later — see ideas file
      gameTime: now,
    },
  });

  // Deltas
  const deltas = computeReputationDeltas({ actionType, victimAlignment, justified });
  const updated = [];

  // Global scope — always applied
  if (deltas.global !== 0) {
    const row = await applyScopeDelta({
      characterId: actorCharacterId,
      scope: 'global',
      scopeKey: '',
      delta: deltas.global,
      lastIncidentAt: now,
    });
    if (row) updated.push(row);
  }

  // Region scope — if caller supplied
  if (scopeContext.region && deltas.region !== 0) {
    const row = await applyScopeDelta({
      characterId: actorCharacterId,
      scope: 'region',
      scopeKey: scopeContext.region,
      delta: deltas.region,
      lastIncidentAt: now,
    });
    if (row) updated.push(row);
  }

  // Settlement scope — mirror region delta (locals react harder than region average)
  if (scopeContext.settlementKey && deltas.region !== 0) {
    const row = await applyScopeDelta({
      characterId: actorCharacterId,
      scope: 'settlement',
      scopeKey: scopeContext.settlementKey,
      delta: Math.round(deltas.region * 1.2),
      lastIncidentAt: now,
    });
    if (row) updated.push(row);
  }

  log.info(
    {
      actorCharacterId,
      worldNpcId,
      actionType,
      justified,
      deltas,
      updatedScopes: updated.map((r) => `${r.scope}:${r.scopeKey || '-'}=${r.score}`),
    },
    'Attribution applied',
  );

  return { attribution, updated };
}

/**
 * Fetch all reputation rows for a character, narrowed to the scopes needed
 * for current scene context (global + current region + current settlement).
 * Returns the rows so the caller / contextSection can pick the
 * highest-severity label for injection.
 */
export async function getReputationProfile({
  characterId,
  region = null,
  settlementKey = null,
}) {
  if (!characterId) return { rows: [], labels: {} };

  const orConditions = [{ scope: 'global', scopeKey: '' }];
  if (region) orConditions.push({ scope: 'region', scopeKey: region });
  if (settlementKey) orConditions.push({ scope: 'settlement', scopeKey: settlementKey });

  const rows = await prisma.worldReputation.findMany({
    where: {
      characterId,
      OR: orConditions,
    },
  });

  const labels = {};
  for (const r of rows) labels[`${r.scope}:${r.scopeKey || '-'}`] = r.reputationLabel;

  return { rows, labels };
}

/**
 * Sweep: clear expired vendettas (no incident for 2 game-weeks). Called on
 * context-assembly path to lazy-clean, not on a schedule.
 */
export async function maybeClearVendetta(characterId, now = new Date()) {
  if (!characterId) return null;
  const row = await prisma.worldReputation.findUnique({
    where: { characterId_scope_scopeKey: { characterId, scope: 'global', scopeKey: '' } },
  });
  if (!row || !row.vendettaActive) return null;
  if (!shouldClearVendetta(row.lastIncidentAt, now)) return null;
  return prisma.worldReputation.update({
    where: { id: row.id },
    data: { vendettaActive: false },
  });
}
