// Living World — fame / infamy aggregation per Character.
//
// Characters stay "grey" (no RENOWN suffix in systemPrompt) until fame or
// infamy crosses a threshold. Global WorldEvents (campaign_complete,
// major_deed, dungeon_cleared, deadly_victory) feed fame. Hostile acts
// (killing named civilians, rob/betray attributions) feed infamy. The
// scene systemPrompt reads `computeFameLabel(fame, infamy)` and injects
// a RENOWN line only when a label is returned.
//
// This is a lightweight service — pure helpers for thresholds + a DB
// updater. Cross-character campaigns (MP) apply deltas to every member.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'fameService' });

/**
 * Pure helper — classify a character's renown based on fame/infamy scores.
 * Returns `{ label, tone, threshold }` or `null` if the character is still
 * below the 20-point line. Export for systemPrompt + tests.
 *
 * Infamy labels outrank fame labels when both cross thresholds — a hero who
 * also murders civilians is read as a notorious figure by strangers first.
 */
export function computeFameLabel(fame = 0, infamy = 0) {
  if (infamy >= 50) return { label: 'poszukiwany łotr', tone: 'disapprove', threshold: 50 };
  if (infamy >= 20) return { label: 'podejrzany', tone: 'disapprove', threshold: 20 };
  if (fame >= 100) return { label: 'legendarny', tone: 'approve', threshold: 100 };
  if (fame >= 50) return { label: 'sławny', tone: 'approve', threshold: 50 };
  if (fame >= 20) return { label: 'znany w okolicy', tone: 'approve', threshold: 20 };
  return null;
}

/**
 * Pure helper — how much fame/infamy does this event deliver?
 * Returns `{ fameDelta, infamyDelta }` (either may be 0).
 *
 * - campaign_complete (global)    → +50 fame
 * - dungeon_cleared (global)      → +15 fame
 * - deadly_victory (global)       → +15 fame
 * - major_deed (global)           → +10 fame (or +25 for 'liberation' gate)
 * - civilian_kill / named_kill    → +15 infamy (flagged by caller)
 * - rob / betray attributions     → +5 infamy
 */
export function computeFameDelta({ eventType, visibility, payload = {} } = {}) {
  if (visibility !== 'global') {
    // Infamy-raising attribution events can come through other visibility
    // tiers; they are flagged explicitly via eventType.
    if (eventType === 'civilian_kill') return { fameDelta: 0, infamyDelta: 15 };
    if (eventType === 'rob' || eventType === 'betray') return { fameDelta: 0, infamyDelta: 5 };
    return { fameDelta: 0, infamyDelta: 0 };
  }
  switch (eventType) {
    case 'campaign_complete':
      return { fameDelta: 50, infamyDelta: 0 };
    case 'dungeon_cleared':
      return { fameDelta: 15, infamyDelta: 0 };
    case 'deadly_victory':
      return { fameDelta: 15, infamyDelta: 0 };
    case 'major_deed':
      return {
        fameDelta: payload?.gate === 'liberation' ? 25 : 10,
        infamyDelta: 0,
      };
    default:
      return { fameDelta: 0, infamyDelta: 0 };
  }
}

/**
 * Apply fame/infamy changes from a WorldEvent to one or more characters.
 * Idempotent on the event itself — caller is responsible for not double-
 * applying (e.g. only call once per successful appendEvent).
 */
export async function applyFameFromEvent(characterIds, event) {
  if (!Array.isArray(characterIds) || characterIds.length === 0) return;
  const { fameDelta, infamyDelta } = computeFameDelta(event);
  if (fameDelta === 0 && infamyDelta === 0) return;
  try {
    await Promise.all(characterIds.map((id) =>
      prisma.character.update({
        where: { id },
        data: {
          ...(fameDelta !== 0 ? { fame: { increment: fameDelta } } : {}),
          ...(infamyDelta !== 0 ? { infamy: { increment: infamyDelta } } : {}),
        },
      }),
    ));
    log.info({ characterIds, fameDelta, infamyDelta, eventType: event.eventType }, 'fame delta applied');
  } catch (err) {
    log.warn({ err, characterIds, event }, 'applyFameFromEvent failed');
  }
}
