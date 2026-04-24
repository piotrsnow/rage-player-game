// Round E Phase 11 — post-campaign LLM fact extraction.
//
// Given a finalized campaign's compressed memory sources, ask a reasoning-nano
// model to emit a structured list of world-level changes that should persist
// into the canonical shared world (NPC deaths, relocations, location damage,
// rumors worth remembering, faction shifts). This is the SECOND data source
// fed into Phase 12's resolver — the first being the shadow diff from
// `collectCampaignShadowDiff`. Phase 11 only extracts; it does NOT resolve
// targetHints to entity IDs and does NOT apply anything.
//
// Error posture: extraction is best-effort. Provider failures, malformed JSON,
// or Zod validation failures never throw — they return `{ changes: [], warning }`
// so the write-back orchestrator can still run the narrow auto-apply.

import { z } from 'zod';
import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'postCampaignFactExtraction' });

const CHANGE_KINDS = ['npcDeath', 'npcRelocation', 'locationBurned', 'newRumor', 'factionShift'];
const MAX_CHANGES = 10;

const worldChangeSchema = z.object({
  kind: z.enum(CHANGE_KINDS),
  targetHint: z.string().min(1).max(150),
  newValue: z.string().max(500),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300),
});

const extractionSchema = z.object({
  worldChanges: z.array(worldChangeSchema).max(MAX_CHANGES),
});

/**
 * Slice the payload we feed the LLM out of a campaign's hydrated coreState.
 * Pure. Only reads bounded-summary sources — never raw scene narratives —
 * because memoryCompressor already capped these upstream (gameStateSummary
 * ≤15 facts, keyPlotFacts from high-importance CampaignKnowledge top-5,
 * journalEntries nano-summarized per scene).
 *
 * `shadowDiffSummary` is the Phase 10 diff summary ({fieldCounts, npcsWithChanges})
 * — passed through so the LLM can see "the code already detected X NPC deaths,
 * don't duplicate unless you want to confirm with context".
 */
export function buildFactExtractionInput(coreState, shadowDiffSummary = null) {
  if (!coreState || typeof coreState !== 'object') {
    return { gameStateSummary: [], journalEntries: [], keyPlotFacts: [], campaign: null, shadowDiffSummary: null };
  }
  const factText = (item) => (typeof item === 'string' ? item : item?.fact || '');
  const summary = Array.isArray(coreState.gameStateSummary) ? coreState.gameStateSummary : [];
  const journal = Array.isArray(coreState.journalEntries) ? coreState.journalEntries : [];
  const plotFacts = Array.isArray(coreState.world?.keyPlotFacts) ? coreState.world.keyPlotFacts : [];
  const campaignMeta = coreState.campaign
    ? { name: coreState.campaign.name, genre: coreState.campaign.genre, tone: coreState.campaign.tone }
    : null;

  return {
    gameStateSummary: summary.map(factText).filter(Boolean),
    journalEntries: journal.filter((e) => typeof e === 'string' && e.length > 0),
    keyPlotFacts: plotFacts.filter((f) => typeof f === 'string' && f.length > 0),
    campaign: campaignMeta,
    shadowDiffSummary: shadowDiffSummary || null,
  };
}

/**
 * Zod-parse the LLM output. Non-throwing — invalid shape returns `{ changes: [] }`.
 * Unknown `kind` values and entries that fail per-field validation are dropped
 * individually with a warn log. Caps at MAX_CHANGES.
 */
export function parseFactExtractionOutput(raw) {
  const parsed = extractionSchema.safeParse(raw);
  if (parsed.success) {
    return { changes: parsed.data.worldChanges.slice(0, MAX_CHANGES) };
  }

  // Fallback: try to salvage valid entries from a malformed array.
  if (raw && Array.isArray(raw.worldChanges)) {
    const salvaged = [];
    for (const entry of raw.worldChanges) {
      const item = worldChangeSchema.safeParse(entry);
      if (item.success) salvaged.push(item.data);
      else log.warn({ issue: item.error?.issues?.[0]?.message }, 'dropped malformed worldChange entry');
      if (salvaged.length >= MAX_CHANGES) break;
    }
    return { changes: salvaged };
  }

  return { changes: [] };
}

const SYSTEM_PROMPT = `You are a world-state archivist for a shared fantasy RPG world. A campaign just finished. You receive the campaign's COMPRESSED MEMORY (bounded summary facts, not raw scenes) plus whatever the code's own shadow diff already detected.

Your job: extract ONLY facts that an outside observer — a traveler, a bard, another NPC in a distant town — would plausibly remember and recount. These changes will promote from the campaign's local sandbox into the CANONICAL world, visible to every future campaign.

Emit entries with:
- kind: one of npcDeath | npcRelocation | locationBurned | newRumor | factionShift
  - npcDeath: a named NPC is permanently dead. Not "unconscious" or "captured".
  - npcRelocation: a named NPC permanently moved to a different settlement/region.
  - locationBurned: a location was structurally damaged, destroyed, or transformed.
  - newRumor: a rumor/reputation fact worth attaching to an NPC's knowledgeBase in the canonical world.
  - factionShift: a structural change in a faction's standing, alliance, or leadership.
- targetHint: a short human-readable identifier (name or short description). The code will resolve this to an entity ID via embedding similarity later.
- newValue: what changed, in one sentence.
- confidence: 0.0–1.0. High (>0.8) only when the memory clearly and unambiguously supports the change.
- reason: one-sentence justification citing the memory source.

STRICT RULES:
- Skip player micro-actions, temporary emotional states, combat blow-by-blow, in-flight quest objectives, loot transfers.
- Skip flavor/atmosphere (weather, time of day, minor NPC moods).
- If the shadow diff already detected a change, you may CONFIRM it with narrative context (same kind, same targetHint, elevated confidence) OR skip it. Do NOT invent duplicates with slight name variations.
- If you are unsure something happened, LOWER confidence rather than skipping entirely — admin review catches low-confidence items.
- At most 10 changes. If nothing qualifies, return {"worldChanges": []}.

Output JSON only: {"worldChanges": [...]}. No prose.`;

function buildUserPrompt(input) {
  const parts = [];
  if (input.campaign) {
    parts.push(`Campaign: ${input.campaign.name || 'untitled'} (genre=${input.campaign.genre || 'n/a'}, tone=${input.campaign.tone || 'n/a'})`);
  }
  if (input.shadowDiffSummary) {
    const { npcsWithChanges, fieldCounts } = input.shadowDiffSummary;
    const fc = fieldCounts && Object.keys(fieldCounts).length > 0
      ? Object.entries(fieldCounts).map(([f, n]) => `${f}=${n}`).join(', ')
      : 'none';
    parts.push(`Shadow diff already detected: npcsWithChanges=${npcsWithChanges ?? 0}, fieldCounts={${fc}}. Confirm with context or skip — do not duplicate.`);
  }
  if (input.gameStateSummary.length > 0) {
    parts.push(`Compressed memory facts (${input.gameStateSummary.length}):\n${input.gameStateSummary.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
  }
  if (input.keyPlotFacts.length > 0) {
    parts.push(`Key plot knowledge (${input.keyPlotFacts.length}):\n${input.keyPlotFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
  }
  if (input.journalEntries.length > 0) {
    parts.push(`Journal entries (${input.journalEntries.length}):\n${input.journalEntries.map((e, i) => `${i + 1}. ${e}`).join('\n')}`);
  }
  if (parts.length === 0) {
    return 'No compressed memory available for this campaign. Return {"worldChanges": []}.';
  }
  return parts.join('\n\n');
}

/**
 * Run the LLM extraction. Non-throwing — returns `{ changes, warning? }`.
 *
 * Opts:
 *   - modelTier: override default 'nanoReasoning' (use 'standard' or 'premium' if needed)
 *   - provider: 'openai' | 'anthropic'
 *   - maxTokens: default 1500 (headroom for reasoning + JSON)
 *   - userApiKeys: forwarded to callAIJson
 */
export async function extractWorldFacts({
  campaignId,
  coreState,
  shadowDiffSummary = null,
  modelTier = 'nanoReasoning',
  provider = 'openai',
  maxTokens = 1500,
  userApiKeys = null,
} = {}) {
  const input = buildFactExtractionInput(coreState, shadowDiffSummary);
  const hasContent = input.gameStateSummary.length > 0
    || input.keyPlotFacts.length > 0
    || input.journalEntries.length > 0;
  if (!hasContent) {
    log.info({ campaignId }, 'extractWorldFacts SKIP — no compressed memory to process');
    return { changes: [], warning: 'no_memory' };
  }

  const userPrompt = buildUserPrompt(input);

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
    log.warn({ campaignId, err: err?.message }, 'extractWorldFacts: provider call failed');
    return { changes: [], warning: 'provider_error' };
  }

  const raw = parseJsonOrNull(response?.text);
  if (!raw) {
    log.warn({ campaignId, sample: (response?.text || '').slice(0, 200) },
      'extractWorldFacts: unparseable JSON');
    return { changes: [], warning: 'invalid_json' };
  }

  const { changes } = parseFactExtractionOutput(raw);
  log.info({
    campaignId,
    changeCount: changes.length,
    kinds: changes.map((c) => c.kind),
  }, 'extractWorldFacts complete');
  return { changes };
}
