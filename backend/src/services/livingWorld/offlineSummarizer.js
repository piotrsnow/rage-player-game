// Living World — per-NPC offline summary.
//
// When a player returns to a location after an offline gap, we run a single
// nano call per WorldNPC at that location: "Given your goal, last activity,
// and N game-days elapsed — what happened? Are you still here?"
//
// Output feeds both:
//   - WorldNPC state update (location change, death, etc.)
//   - Scene context narrative blurb ("Bjorn wyjechał na wschód trzy dni temu")

import { callNano } from '../memoryCompressor.js';
import { childLogger } from '../../lib/logger.js';
import { formatGameDuration } from './worldTimeService.js';

const log = childLogger({ module: 'offlineSummarizer' });

const SYSTEM_PROMPT = `You are a narrative assistant extrapolating what an offscreen NPC did while the player was away. Given the NPC's profile, their last known state, and the game-time elapsed, produce a plausible, concise update.

Rules:
- Stay in character. Personality and role should drive what they'd plausibly do.
- For short gaps (< 1 day): mostly stays put, minor activity.
- For longer gaps (1-7 days): small actions aligned with goal. NPC may move short distances. Do not invent major plot events.
- Never fabricate: no deaths, no quest completions, no permanent world state changes.
- If NPC lacks an explicit goal, default to routine behaviour for their role.
- Keep narrativeBlurb to ONE Polish sentence suitable for injection into a scene ("Bjorn wciąż tu jest, ale wygląda na zmęczonego po długiej wyprawie w góry.").

Return ONLY valid JSON:
{
  "stillHere": true | false,
  "narrativeBlurb": "one-sentence Polish blurb describing what happened / current state",
  "moodShift": "tired|restless|confident|worried|neutral" | null,
  "notes": "optional 1-line backend note (not shown to player)" | null
}`;

/**
 * Run a single offline summary call for an NPC.
 *
 * @param {object} params
 * @param {object} params.npc           — WorldNPC row
 * @param {string} params.locationName  — canonical location name (for prompt clarity)
 * @param {number} params.gameTimeMs    — game ms elapsed since pausedAt
 * @param {Array}  params.recentEvents  — WorldEvent rows sorted newest-first (filtered to this NPC)
 * @param {string} [params.provider]    — 'openai' | 'anthropic'
 * @param {number} [params.timeoutMs]   — abort after N ms, default 8000
 * @returns {Promise<{stillHere: boolean, narrativeBlurb: string, moodShift: string|null, notes: string|null} | null>}
 */
export async function summarizeOfflineActivity({
  npc,
  locationName,
  gameTimeMs,
  recentEvents = [],
  provider = 'openai',
  timeoutMs = 8000,
}) {
  if (!npc) return null;

  const duration = formatGameDuration(gameTimeMs);
  const eventsDigest = recentEvents.slice(0, 8).map((e) => {
    const payload = e.payload ? (typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload)) : '';
    return `[${e.eventType}] ${payload.slice(0, 180)}`;
  }).join('\n');

  const userPrompt = [
    `NPC: ${npc.name}`,
    npc.role ? `Role: ${npc.role}` : null,
    npc.personality ? `Personality: ${npc.personality}` : null,
    npc.factionId ? `Faction: ${npc.factionId}` : null,
    `Last known location: ${locationName}`,
    `Elapsed game time: ${duration.label} (${Math.round(duration.totalHours)}h)`,
    eventsDigest ? `\nRecent events (newest first):\n${eventsDigest}` : null,
  ].filter(Boolean).join('\n');

  try {
    const raw = await callNano(SYSTEM_PROMPT, userPrompt, provider, {
      timeoutMs,
      maxTokens: 400,
      reasoning: true,
    });
    if (!raw) return null;
    const parsed = safeParseJson(raw);
    if (!parsed) return null;
    return {
      stillHere: parsed.stillHere !== false, // default true if missing
      narrativeBlurb: typeof parsed.narrativeBlurb === 'string' ? parsed.narrativeBlurb.trim() : '',
      moodShift: typeof parsed.moodShift === 'string' ? parsed.moodShift : null,
      notes: typeof parsed.notes === 'string' ? parsed.notes : null,
    };
  } catch (err) {
    log.warn({ err, npcId: npc.id }, 'Offline summary failed (non-fatal)');
    return null;
  }
}

function safeParseJson(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
