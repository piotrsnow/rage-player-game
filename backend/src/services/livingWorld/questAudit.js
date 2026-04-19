// Living World — post-completion nano audit for side quests.
//
// Premium AI emits `worldImpact: 'major'` when it judges a scene gossip-worthy,
// but sometimes forgets — especially for quests that resolve quietly off-screen
// (auto-complete when objectives all check out). This is a cheap backup:
// a single nano call per completed SIDE quest asking "is this worth a world
// plotka?" Nano returns JSON {isMajor, reason}, which the caller uses to
// write a global WorldEvent.
//
// Cost scope: nano fires ONLY when a side quest just completed AND the scene
// did not already flag itself as major. Main quests always promote via the
// gate in shouldPromoteToGlobal — they skip this audit entirely.

import { callNano } from '../memoryCompressor.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'questAudit' });

const AUDIT_SYSTEM_PROMPT = `You judge whether a just-completed RPG side quest produced a world event worth spreading as a tavern rumour across UNRELATED campaigns.

Examples of major (isMajor=true):
- A band of outlaws was permanently broken up
- A named villain was executed
- A village was saved from a supernatural threat
- A lord's coup was foiled

Examples of minor (isMajor=false):
- A letter was delivered
- A lost pet was returned
- A drunkard won a bar bet
- Someone's daughter was rescued from routine trouble

Return ONLY valid JSON: {"isMajor": true|false, "reason": "<=200 chars explanation"}
Default to false when uncertain — global events should be rare.`;

/**
 * Audit a completed side quest. Returns `{ isMajor: bool, reason: string }`
 * or `null` if nano is unavailable / errored. Never throws.
 *
 * @param {{ name: string, description?: string }} quest
 * @param {{ locationName?: string, sceneSummary?: string, provider?: string, timeoutMs?: number }} ctx
 */
export async function auditQuestWorldImpact(quest, ctx = {}) {
  if (!quest || typeof quest !== 'object' || !quest.name) return null;

  const userPrompt = [
    `Quest: "${quest.name}"`,
    quest.description ? `Description: ${String(quest.description).slice(0, 400)}` : null,
    ctx.locationName ? `Location: ${ctx.locationName}` : null,
    ctx.sceneSummary ? `Scene summary: ${String(ctx.sceneSummary).slice(0, 600)}` : null,
    '',
    'Is this event worth spreading across unrelated campaigns as a rumour?',
  ].filter(Boolean).join('\n');

  try {
    // callNano returns already-parsed JSON (object) or null on failure.
    const parsed = await callNano(AUDIT_SYSTEM_PROMPT, userPrompt, ctx.provider || 'openai', {
      timeoutMs: ctx.timeoutMs || 6000,
      maxTokens: 120,
      reasoning: false,
    });
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      isMajor: parsed.isMajor === true,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
    };
  } catch (err) {
    log.warn({ err, questName: quest.name }, 'auditQuestWorldImpact failed — treating as minor');
    return null;
  }
}
