/**
 * Heuristic detector for "looks like a quick beat" — used to surface a soft
 * hint chip under the action input so players know they CAN send the action
 * via the lightweight quick-beat path. Never auto-submits; just suggests.
 *
 * Mirrors the BE-side `shouldEscalateQuickBeat` blocklist — if any of these
 * patterns match, we deliberately do NOT suggest quick-beat (BE would reject
 * with ESCALATE_TO_SCENE anyway, so the hint would be misleading).
 */

import { detectCombatIntent } from '../../shared/domain/combatIntent.js';
import { parseMovementIntent } from '../../shared/domain/movementIntent.js';

// Minimal subset of the BE heuristics — we only need to *block* hints, not
// classify intents. False negatives are fine (BE will escalate); false
// positives hurt UX (player clicks "mała akcja" only to be bumped to full
// scene, which is fine semantically but visually jarring).
const HARD_MARKER_REGEX = /^\[/;

const TRAVEL_VERB = /\b(id[eę]|wchodz[eę]|wyruszam|jad[eę]|kieruj[eę]\s+si[eę]|udaj[eę]\s+si[eę]|podr[oó]żuj[eę]|travel|going|head|leave|enter)\s+(?:do|to|into|for)\s+/iu;
const TRADE_VERB = /\b(kupuj[eę]?|kupi[eęć]?|sprzedaj[eę]?|sprzeda(?:j|ć)?|handluj[eę]?|targuj[eę]?|buy|sell|haggle|trade)\b/iu;
const REST_VERB = /\b(śpi[eę]|rozbijam ob[oó]z|long rest|d[lł]ugi odpoczynek|sleep)\b/iu;
const SPELL_VERB = /\b(rzucam zaklęcie|rzuc[ę]|cast(ing)?|spell)\b/iu;

/**
 * Returns true when the action is a plausible quick beat — short, no scene-
 * level keywords. Does NOT mean the BE will accept it; final say is BE-side.
 */
export function looksLikeQuickBeat(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 200) return false;

  if (HARD_MARKER_REGEX.test(trimmed)) return false;
  if (detectCombatIntent(trimmed)) return false;
  if (TRAVEL_VERB.test(trimmed)) return false;
  if (parseMovementIntent(trimmed)) return false;
  if (TRADE_VERB.test(trimmed)) return false;
  if (REST_VERB.test(trimmed)) return false;
  if (SPELL_VERB.test(trimmed)) return false;

  return true;
}
