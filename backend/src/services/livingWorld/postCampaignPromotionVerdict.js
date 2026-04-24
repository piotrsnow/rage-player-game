// Round E Phase 12b Slice B — LLM verdict for NPC promotion candidates.
//
// Given a ranked candidate from `postCampaignPromotion.js` + a dialog excerpt
// harvested from the campaign's scenes, ask a standard-tier small model to
// judge whether this ephemeral CampaignNPC deserves to surface in the admin
// promotion queue. The verdict gates `status`: `recommend=no` or `uniqueness<5`
// short-circuits to `status='rejected'` with an auto-generated reason, so
// admin only sees the long tail that passed both signals.
//
// Non-throwing. Provider errors, malformed JSON, or Zod misses all return
// `{verdict: null, warning}` — the candidate keeps `status='pending'` and
// admin decides manually.
//
// Default provider/tier is `anthropic`+`standard` (Haiku 4.5). Callers can
// override via orchestrator opts.

import { z } from 'zod';
import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'postCampaignPromotionVerdict' });

const verdictSchema = z.object({
  recommend: z.enum(['yes', 'no', 'unsure']),
  uniqueness: z.number().int().min(0).max(10),
  worldFit: z.number().int().min(0).max(10),
  reasons: z.array(z.string().max(200)).max(5),
});

const MIN_UNIQUENESS_PASS = 5;

/**
 * Pure — does this verdict qualify the candidate for admin review?
 * Returns `{status, autoReason}` where `status ∈ 'pending'|'rejected'`.
 * Null verdict (provider failed) → default `pending` with no auto-reason so
 * admin still sees the candidate and decides manually.
 */
export function classifyVerdict(verdict) {
  if (!verdict) return { status: 'pending', autoReason: null };
  if (verdict.recommend === 'no' || (verdict.uniqueness ?? 0) < MIN_UNIQUENESS_PASS) {
    const reason = verdict.reasons?.[0]
      || (verdict.recommend === 'no' ? 'auto-reject: small model recommend=no' : 'auto-reject: uniqueness below threshold');
    return { status: 'rejected', autoReason: `auto: ${reason}` };
  }
  return { status: 'pending', autoReason: null };
}

/**
 * Pure — Zod-parse the small model's raw JSON reply. Invalid shape → null.
 */
export function parseVerdictOutput(raw) {
  const parsed = verdictSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  log.warn({ issue: parsed.error?.issues?.[0]?.message }, 'verdict schema miss');
  return null;
}

const SYSTEM_PROMPT = `You are a world-building archivist judging whether a CampaignNPC deserves canonical promotion into a shared fantasy RPG world. The NPC was created ephemerally during one player's campaign. If promoted, they become visible to every future campaign.

Emit strict JSON only: {"recommend": "yes"|"no"|"unsure", "uniqueness": 0-10, "worldFit": 0-10, "reasons": [string]}.

Scoring guide:
- uniqueness: 0 = generic archetype (nameless guard, stock merchant). 5 = has a hook (quirky trait, niche profession). 8+ = genuinely distinct personality, memorable voice, or one-of-a-kind backstory.
- worldFit: 0 = contradicts world tone (sci-fi char in dark-fantasy setting). 5 = fits genre loosely. 8+ = slots naturally into the setting's factions / regions / power tiers.
- recommend: "yes" when both scores ≥ 6 AND the NPC has played a meaningful role (quest giver, major ally, named antagonist). "no" when generic OR tonally off OR no distinguishing features. "unsure" when engaged but flat — admin can decide.
- reasons: 1-3 terse strings citing what drove the scores. No prose outside the JSON.`;

function formatStats(stats) {
  if (!stats) return 'none';
  const parts = [];
  if (stats.interactionCount) parts.push(`interactions=${stats.interactionCount}`);
  if (stats.questInvolvementCount) parts.push(`returnVisits=${stats.questInvolvementCount}`);
  if (stats.structuralQuestCount) parts.push(`questsStructural=${stats.structuralQuestCount}`);
  if (stats.score) parts.push(`score=${stats.score}`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

function buildUserPrompt({ npc, stats, dialogSample, worldContext }) {
  const parts = [];
  if (worldContext?.campaignName || worldContext?.genre || worldContext?.tone) {
    parts.push(`Campaign: ${worldContext.campaignName || 'untitled'} (genre=${worldContext.genre || 'n/a'}, tone=${worldContext.tone || 'n/a'})`);
  }
  parts.push(`NPC: ${npc.name}`);
  if (npc.role) parts.push(`Role: ${npc.role}`);
  if (npc.personality) parts.push(`Personality: ${npc.personality}`);
  parts.push(`Stats: ${formatStats(stats)}`);
  if (dialogSample && dialogSample.trim()) {
    parts.push(`Dialog excerpts:\n${dialogSample}`);
  } else {
    parts.push('Dialog excerpts: (none captured)');
  }
  parts.push('Return only the JSON verdict.');
  return parts.join('\n\n');
}

/**
 * Run the verdict LLM call for ONE candidate. Non-throwing —
 * returns `{verdict, warning?}`. Callers (`runVerdictForCandidates`)
 * fan this out with `Promise.allSettled`.
 */
export async function getVerdictForCandidate({
  npc,
  stats,
  dialogSample = null,
  worldContext = null,
  provider = 'anthropic',
  modelTier = 'standard',
  userApiKeys = null,
  maxTokens = 400,
} = {}) {
  if (!npc?.name) return { verdict: null, warning: 'missing_npc' };

  const userPrompt = buildUserPrompt({ npc, stats, dialogSample, worldContext });

  let response;
  try {
    response = await callAIJson({
      provider,
      modelTier,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens,
      temperature: 0,
      userApiKeys,
    });
  } catch (err) {
    log.warn({ err: err?.message, npcName: npc.name }, 'verdict provider call failed');
    return { verdict: null, warning: 'provider_error' };
  }

  const raw = parseJsonOrNull(response?.text);
  if (!raw) {
    log.warn({ npcName: npc.name, sample: (response?.text || '').slice(0, 200) }, 'verdict unparseable JSON');
    return { verdict: null, warning: 'invalid_json' };
  }

  const verdict = parseVerdictOutput(raw);
  if (!verdict) return { verdict: null, warning: 'schema_miss' };
  return { verdict };
}

/**
 * I/O — fan verdicts across candidates in parallel via `Promise.allSettled`.
 * Top-N is small (≤5 by default) so parallel is cheap and failures are
 * isolated per candidate. Returns a `Map<campaignNpcId, {verdict, warning?}>`.
 */
export async function runVerdictForCandidates(candidates, opts = {}) {
  const out = new Map();
  if (!Array.isArray(candidates) || candidates.length === 0) return out;

  const tasks = candidates.map(async ({ npc, stats }) => {
    const res = await getVerdictForCandidate({ npc, stats, ...opts, dialogSample: stats?.dialogSample || null });
    return { campaignNpcId: npc?.id, res };
  });

  const settled = await Promise.allSettled(tasks);
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value?.campaignNpcId) {
      out.set(r.value.campaignNpcId, r.value.res);
    }
  }
  return out;
}
