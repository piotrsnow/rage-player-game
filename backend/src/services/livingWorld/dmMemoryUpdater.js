// Living World Phase 4 — nano summary that extracts DM memory updates.
//
// Called from postSceneWork after a scene renders. Reads the scene narrative
// and existing DM state, asks a nano model for:
//   - memoryEntries: things the DM just planned/introduced/resolved
//   - hookAdditions: new intrigue seeds to keep for later
//   - resolvedHookIds: seeds the scene just delivered on
//
// The output feeds dmMemoryService.updateDmAgent which handles clamping.

import { callNano } from '../memoryCompressor.js';
import { childLogger } from '../../lib/logger.js';
import { readDmAgentState, updateDmAgent } from './dmMemoryService.js';

const log = childLogger({ module: 'dmMemoryUpdater' });

const SYSTEM_PROMPT = `You are the DM's memory. Given a scene narrative + the DM's existing plan state, emit a concise update. Only record things the DM intentionally PLANNED, INTRODUCED, or RESOLVED — not raw scene events (those are captured elsewhere).

Return ONLY valid JSON:
{
  "memoryEntries": [
    { "summary": "one-line Polish note about what DM did/plans", "status": "planned" | "introduced" | "waiting" | "resolved", "plannedFor": "when/where it matters" | null }
  ],
  "hookAdditions": [
    { "id": "kebab-case-slug-unique-enough", "kind": "quest" | "intrigue" | "reveal" | "encounter", "summary": "one-line Polish seed", "idealTiming": "when to spring it" | null, "priority": "low" | "normal" | "high" }
  ],
  "resolvedHookIds": ["id1", "id2"]
}

Rules:
- memoryEntries: at most 3. Empty array if the scene was routine.
- hookAdditions: at most 2. Only if the scene genuinely opened a new narrative thread.
- resolvedHookIds: reference existing hook ids from the state provided. Leave empty if nothing was delivered.
- Stay short: each summary ≤ 120 chars. Polish language.
- Do not fabricate. If no change, return { "memoryEntries": [], "hookAdditions": [], "resolvedHookIds": [] }.`;

/**
 * Run a single nano summary call and persist the result.
 *
 * @param {object} params
 * @param {string} params.campaignId
 * @param {string} params.narrative   — scene narrative
 * @param {string} [params.playerAction]
 * @param {string} [params.provider]
 * @param {number} [params.timeoutMs] — default 6000
 * @returns {Promise<{memoryEntries, hookAdditions, resolvedHookIds} | null>}
 */
export async function updateDmMemoryFromScene({
  campaignId,
  narrative,
  playerAction = '',
  provider = 'openai',
  timeoutMs = 6000,
}) {
  if (!campaignId || !narrative) return null;

  const state = await readDmAgentState(campaignId);
  const hookDigest = state.pendingHooks.slice(0, 8)
    .map((h) => `- [${h.id}] (${h.kind || 'generic'}) ${h.summary}`)
    .join('\n');
  const memoryDigest = state.dmMemory.slice(-8)
    .map((m) => `- (${m.status || 'planned'}) ${m.summary}`)
    .join('\n');

  const userPrompt = [
    playerAction ? `Player action: ${playerAction.slice(0, 300)}` : null,
    `Scene narrative:\n${narrative.slice(0, 2500)}`,
    memoryDigest ? `\nExisting DM memory (most recent):\n${memoryDigest}` : null,
    hookDigest ? `\nPending hooks:\n${hookDigest}` : null,
  ].filter(Boolean).join('\n');

  try {
    // callNano returns a parsed JSON object (or null on failure / timeout).
    const parsed = await callNano(SYSTEM_PROMPT, userPrompt, provider, {
      timeoutMs,
      maxTokens: 400,
      reasoning: true,
    });
    if (!parsed) return null;

    const memoryEntries = Array.isArray(parsed.memoryEntries) ? parsed.memoryEntries : [];
    const hookAdditions = Array.isArray(parsed.hookAdditions) ? parsed.hookAdditions : [];
    const resolvedHookIds = Array.isArray(parsed.resolvedHookIds) ? parsed.resolvedHookIds : [];

    if (memoryEntries.length === 0 && hookAdditions.length === 0 && resolvedHookIds.length === 0) {
      log.info({ campaignId }, 'DM memory update: nano returned nothing');
      return { memoryEntries, hookAdditions, resolvedHookIds };
    }

    await updateDmAgent(campaignId, { memoryEntries, hookAdditions, resolvedHookIds });
    log.info({
      campaignId,
      memoryEntries: memoryEntries.length,
      hookAdditions: hookAdditions.length,
      resolvedHookIds: resolvedHookIds.length,
    }, 'DM memory update DONE');
    return { memoryEntries, hookAdditions, resolvedHookIds };
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'DM memory update failed (non-fatal)');
    return null;
  }
}
