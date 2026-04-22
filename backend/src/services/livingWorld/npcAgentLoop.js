// Living World Phase 5 — NPC background agent loop (scoped).
//
// Scoped Phase 5: a synchronous nano-driven tick. The NPC looks at its
// activeGoal + recent events + current location, picks ONE action (move,
// work_on_goal, wait, finished), and writes a WorldEvent capturing it.
//
// DEFERRED to ideas (living-world-npc-auto-dispatch.md):
//   - Cloud Tasks repeatable auto-dispatch every N minutes
//   - Full ASYNC_TOOL_COMPLETIONS pattern with pending→resolve loop
//   - NPC↔NPC interaction, bus broadcast
//   - Per-tier budget throttling
//
// Public surface: `runNpcTick(npcId, opts)` — safe to call manually from
// admin endpoint or from a future Cloud Tasks dispatcher.

import { prisma } from '../../lib/prisma.js';
import { callNano } from '../memoryCompressor.js';
import { childLogger } from '../../lib/logger.js';
import { appendEvent, forNpc } from './worldEventLog.js';
import { setWorldNpcLocation, findOrCreateWorldLocation } from './worldStateService.js';

const log = childLogger({ module: 'npcAgentLoop' });

// ──────────────────────────────────────────────────────────────────────
// Pure helpers — exported for testability
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide whether an NPC is eligible for a background tick right now.
 * Enumerable reasons so the admin UI / logs can explain skips.
 *
 * Scene-based cadence: NPC ticks every `tickIntervalScenes` (default 2)
 * scene commits, tracked via `lastTickSceneIndex`. Pass `currentSceneIndex`
 * so the eligibility check knows where we are in the campaign. When
 * currentSceneIndex is null we fall back to legacy hour-based check
 * (keeps admin manual tick working with force=true).
 *
 * `force=true` bypasses the cadence guards (paused, too_soon) — admin
 * override only. Integrity guards (missing_npc, dead, companion, locked,
 * no_goal) still fire because bypassing them would corrupt state.
 *
 * @returns {{eligible: boolean, reason?: string}}
 */
export function isEligibleForTick(npc, now = new Date(), { force = false, currentSceneIndex = null } = {}) {
  if (!npc) return { eligible: false, reason: 'missing_npc' };
  if (npc.alive === false) return { eligible: false, reason: 'dead' };
  if (npc.companionOfCampaignId) return { eligible: false, reason: 'companion' };
  if (npc.lockedByCampaignId) return { eligible: false, reason: 'locked' };
  if (!npc.activeGoal) return { eligible: false, reason: 'no_goal' };
  if (force) return { eligible: true };
  if (npc.pausedAt) return { eligible: false, reason: 'paused' };

  // Primary path — scene-based. Requires currentSceneIndex from caller.
  if (typeof currentSceneIndex === 'number') {
    const interval = Number(npc.tickIntervalScenes) || 2;
    if (typeof npc.lastTickSceneIndex === 'number') {
      if (currentSceneIndex - npc.lastTickSceneIndex < interval) {
        return { eligible: false, reason: 'too_soon' };
      }
    }
    return { eligible: true };
  }

  // Legacy fallback — hour-based cooldown. Retained so existing admin
  // manual-tick callers (who don't pass sceneIndex) still work.
  const interval = Number(npc.tickIntervalHours) || 24;
  if (npc.lastTickAt) {
    const elapsed = now.getTime() - new Date(npc.lastTickAt).getTime();
    if (elapsed < interval * 60 * 60 * 1000) {
      return { eligible: false, reason: 'too_soon' };
    }
  }
  return { eligible: true };
}

/**
 * Sanitize a proposed action from the nano model. Invalid / unrecognized
 * actions coerce to `wait` (no-op tick). Exported for testability.
 */
export function normalizeAction(raw) {
  if (!raw || typeof raw !== 'object') return { kind: 'wait', note: 'invalid_payload' };
  const kind = typeof raw.kind === 'string' ? raw.kind.toLowerCase().trim() : '';
  if (kind === 'move') {
    const dest = typeof raw.toLocation === 'string' ? raw.toLocation.trim() : '';
    if (!dest) return { kind: 'wait', note: 'move_without_destination' };
    return { kind: 'move', toLocation: dest, note: raw.note || null };
  }
  if (kind === 'work_on_goal') {
    const progress = typeof raw.progressNote === 'string' ? raw.progressNote.trim() : '';
    if (!progress) return { kind: 'wait', note: 'work_without_note' };
    return { kind: 'work_on_goal', progressNote: progress, narrative: raw.narrative || null };
  }
  if (kind === 'finished') {
    return { kind: 'finished', reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 160) : 'goal_complete' };
  }
  if (kind === 'wait') {
    return { kind: 'wait', note: typeof raw.note === 'string' ? raw.note.slice(0, 160) : null };
  }
  return { kind: 'wait', note: 'unknown_action_kind' };
}

/**
 * Build the next goalProgress object given the action + previous state.
 * Pure. Used both by live tick and tests.
 */
export function buildNextGoalProgress(prev, action, now = new Date()) {
  const base = prev && typeof prev === 'object' ? { ...prev } : { step: 0, milestones: [] };
  base.updatedAt = now.toISOString();
  base.lastAction = action.kind;
  if (action.kind === 'move') {
    base.lastLocation = action.toLocation;
  }
  if (action.kind === 'work_on_goal') {
    base.step = (Number(base.step) || 0) + 1;
    base.milestones = Array.isArray(base.milestones) ? base.milestones : [];
    base.milestones.push({ at: now.toISOString(), note: action.progressNote });
    // Keep milestones bounded
    if (base.milestones.length > 20) base.milestones = base.milestones.slice(-20);
  }
  return base;
}

// ──────────────────────────────────────────────────────────────────────
// Nano call
// ──────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are roleplaying as an offscreen NPC between scenes. Given your profile, active goal, recent activity, and current location, pick ONE plausible action to advance your goal. Return JSON only.

Action schema:
{
  "kind": "move" | "work_on_goal" | "finished" | "wait",
  // if move: include "toLocation": "<canonical name>"
  // if work_on_goal: include "progressNote": "short Polish note — what you did this tick", optional "narrative": "one Polish sentence"
  // if finished: include "reason": "short Polish phrase"
  // if wait: optional "note"
  "note": "optional admin/backend hint, not shown to player"
}

Rules:
- Stay in character. Never contradict your personality or alignment.
- DO NOT kill major NPCs. DO NOT complete main quests without DM oversight — those
  require the player to witness. If you're tempted, emit wait with note "waits_for_dm".
- One action per tick. Don't narrate multiple events.
- Prefer incremental progress (work_on_goal) over jumps. Move only if goal requires it.
- Match action scope to tick interval: 24h tick = "brought back 3 herbs", not "founded a guild".`;

async function proposeAction({ npc, recentEvents = [], provider = 'openai', timeoutMs = 5000 }) {
  const eventsDigest = recentEvents.slice(0, 6).map((e) => {
    const payload = e.payload ? (typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload)) : '';
    return `[${e.eventType}] ${payload.slice(0, 160)}`;
  }).join('\n');

  const currentLocName = npc._currentLocationName || null;
  const homeLocName = npc._homeLocationName || null;
  const userPrompt = [
    `NPC: ${npc.name}`,
    npc.role ? `Role: ${npc.role}` : null,
    npc.personality ? `Personality: ${npc.personality}` : null,
    npc.alignment ? `Alignment: ${npc.alignment}` : null,
    npc.activeGoal ? `Active goal: ${npc.activeGoal}` : null,
    npc.goalProgress ? `Goal progress: ${typeof npc.goalProgress === 'string' ? npc.goalProgress : JSON.stringify(npc.goalProgress)}` : null,
    currentLocName ? `Current location: ${currentLocName}` : (npc.currentLocationId ? `Current location id: ${npc.currentLocationId}` : null),
    homeLocName && homeLocName !== currentLocName ? `Home location: ${homeLocName}. Return here when your current goal is done.` : null,
    eventsDigest ? `\nRecent activity:\n${eventsDigest}` : null,
  ].filter(Boolean).join('\n');

  try {
    // callNano returns a parsed JSON object (or null on failure / timeout).
    const parsed = await callNano(SYSTEM_PROMPT, userPrompt, provider, {
      timeoutMs,
      maxTokens: 220,
    });
    return parsed || null;
  } catch (err) {
    log.warn({ err: err?.message, npcId: npc.id }, 'proposeAction call failed');
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Public entrypoint
// ──────────────────────────────────────────────────────────────────────

/**
 * Run a single tick for a single NPC. Idempotent-ish — multiple concurrent
 * ticks on the same NPC would write duplicate WorldEvents, so the caller
 * (dispatcher / admin endpoint) must serialize per-npc.
 *
 * @returns {Promise<{status:'ok'|'skipped'|'failed', reason?:string, action?:object}>}
 */
export async function runNpcTick(npcId, { provider = 'openai', timeoutMs = 5000, now = new Date(), force = false, currentSceneIndex = null } = {}) {
  if (!npcId) return { status: 'failed', reason: 'missing_id' };

  const npc = await prisma.worldNPC.findUnique({ where: { id: npcId } });
  const eligibility = isEligibleForTick(npc, now, { force, currentSceneIndex });
  if (!eligibility.eligible) {
    return { status: 'skipped', reason: eligibility.reason };
  }

  // Resolve current NPC location name + home location name (for return-home
  // goals). WorldNPC tick is world-level — no knowledge of which campaign's
  // player is where (that was a hack from the pre-shadow era; shadow
  // architecture makes per-campaign goals live on CampaignNPC instead).
  const [currentLocName, homeLocName] = await Promise.all([
    resolveLocationName(npc.currentLocationId).catch(() => null),
    resolveLocationName(npc.homeLocationId).catch(() => null),
  ]);
  const recentEvents = await forNpc({ worldNpcId: npc.id, limit: 6 }).catch(() => []);
  const proposed = await proposeAction({
    npc: { ...npc, _currentLocationName: currentLocName, _homeLocationName: homeLocName },
    recentEvents,
    provider,
    timeoutMs,
  });
  if (!proposed) {
    // Log empty tick so we can see the NPC was considered
    await appendEvent({
      worldNpcId: npc.id,
      worldLocationId: npc.currentLocationId || null,
      eventType: 'tick_skip',
      payload: { reason: 'nano_empty' },
      gameTime: now,
    });
    await prisma.worldNPC.update({ where: { id: npc.id }, data: { lastTickAt: now } });
    return { status: 'failed', reason: 'nano_empty' };
  }

  const action = normalizeAction(proposed);

  // Apply side effects per action kind
  const updateData = { lastTickAt: now };
  if (typeof currentSceneIndex === 'number') {
    updateData.lastTickSceneIndex = currentSceneIndex;
  }
  let locationIdForEvent = npc.currentLocationId || null;

  if (action.kind === 'move') {
    // Resolve destination to WorldLocation id — create-or-find via findOrCreate.
    const loc = await findOrCreateWorldLocation(action.toLocation);
    if (loc) {
      updateData.currentLocationId = loc.id;
      locationIdForEvent = loc.id;
      log.info({ npcId: npc.id, to: action.toLocation, worldLocationId: loc.id }, 'NPC move resolved');
    } else {
      log.warn({ npcId: npc.id, to: action.toLocation }, 'NPC move: findOrCreateWorldLocation returned null');
    }
    updateData.goalProgress = JSON.stringify(
      buildNextGoalProgress(parseProgress(npc.goalProgress), action, now),
    );
  } else if (action.kind === 'work_on_goal') {
    updateData.goalProgress = JSON.stringify(
      buildNextGoalProgress(parseProgress(npc.goalProgress), action, now),
    );
  } else if (action.kind === 'finished') {
    updateData.activeGoal = null;
    updateData.goalProgress = JSON.stringify({ ...parseProgress(npc.goalProgress) || {}, finishedAt: now.toISOString(), reason: action.reason });
  }

  await prisma.worldNPC.update({ where: { id: npc.id }, data: updateData });

  await appendEvent({
    worldNpcId: npc.id,
    worldLocationId: locationIdForEvent,
    eventType: action.kind === 'move' ? 'moved'
      : action.kind === 'finished' ? 'goal_finished'
      : action.kind === 'work_on_goal' ? 'goal_progress'
      : 'tick_wait',
    payload: {
      kind: action.kind,
      note: action.note || null,
      toLocation: action.toLocation || null,
      progressNote: action.progressNote || null,
      narrative: action.narrative || null,
      reason: action.reason || null,
    },
    gameTime: now,
  });

  return { status: 'ok', action };
}

function parseProgress(gp) {
  if (!gp) return null;
  if (typeof gp === 'object') return gp;
  try { return JSON.parse(gp); } catch { return null; }
}

async function resolveLocationName(locationId) {
  if (!locationId) return null;
  const loc = await prisma.worldLocation.findUnique({
    where: { id: locationId },
    select: { canonicalName: true },
  });
  return loc?.canonicalName || null;
}
