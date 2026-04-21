// Living World Phase 3 — nano judge for whether an NPC kill was "justified".
//
// Called after scene processing when a WorldNPC goes alive=false, so reputation
// deltas can distinguish self-defense / duel / lawful execution from cold-blooded
// murder. Cheap (~150 tokens in, ~80 out). Never blocks — returns null on failure
// and the caller falls back to a pessimistic default (justified=false for good
// victims, justified=true for evil).

import { callNano } from '../memoryCompressor.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'justifiedKillJudge' });

const SYSTEM_PROMPT = `You are a neutral narrative arbiter. Decide whether an NPC kill was justified under RPG-tavern morality (self-defense, lawful duel, execution of a criminal, stopping an immediate threat). Cold-blooded murder, killing unarmed/helpless/innocent, or disproportionate response = not justified.

Return ONLY valid JSON:
{
  "justified": true | false,
  "reason": "short Polish phrase (<=60 chars)",
  "confidence": 0.0..1.0
}

Heuristics:
- Victim attacking player/party first, or about to → justified.
- Victim is confirmed evil + active threat → justified.
- Victim unarmed / civilian / innocent bystander → NOT justified.
- Player initiated without provocation → NOT justified.
- Player robbed/betrayed then killed to cover tracks → NOT justified.
- Ambiguous cases → confidence < 0.7, prefer justified=true (benefit of doubt).`;

/**
 * Judge a single kill event.
 *
 * @param {object} params
 * @param {string} params.narrative      — scene narrative (will be clipped)
 * @param {string} params.victimName
 * @param {string} [params.victimAlignment]  — "good" | "neutral" | "evil"
 * @param {string} [params.victimRole]
 * @param {string} [params.playerAction]     — player's action that triggered the scene
 * @param {string} [params.provider]         — 'openai' | 'anthropic'
 * @param {number} [params.timeoutMs]        — default 5000
 * @returns {Promise<{justified: boolean, reason: string, confidence: number} | null>}
 */
export async function judgeKill({
  narrative,
  victimName,
  victimAlignment = 'neutral',
  victimRole = null,
  playerAction = '',
  provider = 'openai',
  timeoutMs = 5000,
}) {
  if (!victimName) return null;

  const narrativeClip = (narrative || '').slice(0, 1200);
  const actionClip = (playerAction || '').slice(0, 300);

  const userPrompt = [
    `Victim: ${victimName}`,
    victimRole ? `Role: ${victimRole}` : null,
    `Alignment: ${victimAlignment}`,
    actionClip ? `Player action: ${actionClip}` : null,
    narrativeClip ? `\nScene narrative:\n${narrativeClip}` : null,
  ].filter(Boolean).join('\n');

  try {
    // callNano returns a parsed JSON object (or null on failure / timeout).
    const parsed = await callNano(SYSTEM_PROMPT, userPrompt, provider, {
      timeoutMs,
      maxTokens: 120,
    });
    if (!parsed) return null;

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    const justifiedBool = parsed.justified === true;

    return {
      justified: confidence < 0.7 ? true : justifiedBool,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 80) : '',
      confidence,
    };
  } catch (err) {
    log.warn({ err: err?.message, victimName }, 'Kill judge failed (non-fatal)');
    return null;
  }
}
