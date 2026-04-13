/**
 * Combat intent detection — shared helper used by both frontend hooks and
 * backend scene generation / intent classification.
 *
 * Returns true when a player's free-text action reads as an attempt to start
 * or escalate combat. System tags ([INITIATE COMBAT], [ATTACK:<npc>]) are
 * treated as explicit combat intent; [Combat resolved: ...] is the post-combat
 * reflection tag and must NOT re-trigger combat detection.
 */

export const COMBAT_INTENT_REGEX = /\b(atak|atakuj[eę]?|walcz[eęy]?|walk[eęiąa]|rozpoczynam|rzucam\s+si[eę]|wyzywam|bij[eę]|uderz(?:am|e)|zabij|zaatakuj|dobywam|wyci[aą]gam\s+(?:miecz|bro[nń]|topor|n[oó][zż]|sztylet)|attack|fight|strike|hit|punch|stab|slash|shoot|kill|combat|draw\s*(?:my\s+)?(?:sword|weapon|blade|axe|knife|dagger))\b/i;

export function detectCombatIntent(playerAction) {
  if (!playerAction) return false;
  if (playerAction.startsWith('[Combat resolved:')) return false;
  if (playerAction.startsWith('[INITIATE COMBAT]') || playerAction.startsWith('[ATTACK:')) return true;
  return COMBAT_INTENT_REGEX.test(playerAction);
}
