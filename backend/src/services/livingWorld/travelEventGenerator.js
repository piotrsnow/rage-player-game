// Living World Phase 7 — travel event generator.
//
// Single nano call that inspects a multi-hop travel path + recent world
// events at each waypoint and returns 3-5 candidate narrative beats the
// premium scene-gen can weave into its travel narration. One call per
// travel scene — NOT one per waypoint — so latency and cost stay flat
// (~500ms / ~$0.0003) regardless of path length.
//
// Falls back silently on failure: sceneGenerator just doesn't inject the
// candidate events block and premium narrates the trip with only the
// waypoint names it already has.

import { callNano } from '../memoryCompressor.js';
import { childLogger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

const log = childLogger({ module: 'travelEventGenerator' });

const SYSTEM_PROMPT = `You are a narrative travel event generator for an RPG game master.

Given a travel path (start → waypoints → end) and recent events at each stop, propose 3-5 candidate narrative beats the main AI can weave into the travel scene. Beats should be VARIED in tone/type — not all combat, not all weather.

Types:
  - encounter       — enemy/danger (bandits, beasts, hostile patrol)
  - discovery       — something notable (abandoned cart, tracks, shrine)
  - weather         — environmental moment (storm, fog, heat)
  - npc_met         — brief interaction with a passerby, traveler, or pilgrim
  - waypoint_echo   — callback to recent event at a waypoint (e.g. "market still buzzing about...")

Return ONLY valid JSON, no prose:
{
  "candidates": [
    { "type": "encounter", "at": "waypoint name OR 'en_route'", "hook": "short Polish sentence, <=120 chars" },
    ...
  ]
}

Rules:
  - 3-5 candidates total.
  - Match danger to difficulty hint (safe → weather/npc_met/discovery; dangerous → encounter likely).
  - Reuse NPC names from provided recent events when fitting.
  - One candidate max at each specific waypoint; others can be "en_route".
  - Hooks are BRIEF SEEDS, not full scenes — premium fleshes them out.`;

/**
 * Generate travel candidate events for a known multi-hop path.
 *
 * @param {object} params
 * @param {Array<{id, canonicalName, locationType}>} params.pathLocations  — full path in order including start + end
 * @param {string} params.totalDifficulty   — 'safe'|'moderate'|'dangerous'|'deadly' (worst edge on path)
 * @param {string} [params.provider]        — 'openai' | 'anthropic'
 * @param {number} [params.timeoutMs]       — default 5000
 * @returns {Promise<Array<{type,at,hook}> | null>}
 */
export async function generateTravelEvents({
  pathLocations,
  totalDifficulty = 'safe',
  provider = 'openai',
  timeoutMs = 5000,
}) {
  if (!Array.isArray(pathLocations) || pathLocations.length < 2) return null;

  // Recent WorldEvents at each path location (last 3 per stop, limit 12 total
  // rows fetched so the prompt stays small). Good reuse target for premium's
  // waypoint_echo beats.
  const pathIds = pathLocations.map((l) => l.id).filter(Boolean);
  let eventRows = [];
  try {
    eventRows = await prisma.worldEvent.findMany({
      where: {
        worldLocationId: { in: pathIds },
        eventType: { in: ['killed', 'quest_complete', 'moved', 'returned_from_journey', 'item_given'] },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(12, pathIds.length * 3),
      select: { worldLocationId: true, eventType: true, payload: true, createdAt: true },
    });
  } catch (err) {
    log.warn({ err: err?.message }, 'fetch WorldEvents for travel failed (non-fatal)');
  }

  const locById = new Map(pathLocations.map((l) => [l.id, l]));
  const eventsByLoc = new Map();
  for (const e of eventRows) {
    const locName = locById.get(e.worldLocationId)?.canonicalName;
    if (!locName) continue;
    const list = eventsByLoc.get(locName) || [];
    if (list.length >= 3) continue;
    const p = e.payload || {};
    const blurb = p.blurb || p.summary || `${e.eventType}`;
    list.push({ type: e.eventType, blurb });
    eventsByLoc.set(locName, list);
  }

  const userPromptLines = [
    `Path (${pathLocations.length} stops, overall difficulty: ${totalDifficulty}):`,
    ...pathLocations.map((l, i) => `  ${i}. ${l.canonicalName} (${l.locationType || 'unknown'})`),
  ];
  if (eventsByLoc.size > 0) {
    userPromptLines.push('\nRecent events at waypoints:');
    for (const [locName, list] of eventsByLoc.entries()) {
      userPromptLines.push(`  ${locName}:`);
      for (const ev of list) userPromptLines.push(`    - ${ev.type}: ${String(ev.blurb).slice(0, 100)}`);
    }
  }
  const userPrompt = userPromptLines.join('\n');

  try {
    const parsed = await callNano(SYSTEM_PROMPT, userPrompt, provider, {
      timeoutMs,
      maxTokens: 450,
    });
    if (!parsed || !Array.isArray(parsed.candidates)) return null;

    return parsed.candidates
      .filter((c) => c && typeof c.hook === 'string' && c.hook.trim())
      .map((c) => ({
        type: typeof c.type === 'string' ? c.type : 'discovery',
        at: typeof c.at === 'string' ? c.at : 'en_route',
        hook: c.hook.slice(0, 140).trim(),
      }))
      .slice(0, 5);
  } catch (err) {
    log.warn({ err: err?.message }, 'generateTravelEvents failed (non-fatal)');
    return null;
  }
}
