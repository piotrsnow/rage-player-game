/**
 * Tier-based character XP rewards for combat victories.
 *
 * Char XP is only awarded on `outcome === 'victory'`. Other outcomes
 * (surrender, truce, defeat) grant only the per-attack skill XP that was
 * already accumulated during combat — no bonus character XP.
 *
 * Rationale: the "learn by doing" loop (skill XP → skill level-up → character
 * XP cascade) already rewards every attack. The bonus below represents the
 * meta-reward for taking on and defeating a threat.
 */

export const COMBAT_CHAR_XP_BY_TIER = {
  weak: 5,
  easy: 5,
  medium: 10,
  hard: 25,
  boss: 75,
  extreme: 75,
};

/**
 * Compute bonus character XP for a resolved combat.
 * @param {Object} combatResult - { outcome, combatStats: { killsByTier } }
 * @returns {number} bonus char XP, or 0 when outcome is not a victory
 */
export function computeCombatCharXp(combatResult) {
  if (!combatResult || combatResult.outcome !== 'victory') return 0;
  const killsByTier = combatResult.combatStats?.killsByTier || {};
  let total = 0;
  for (const [tier, count] of Object.entries(killsByTier)) {
    const perKill = COMBAT_CHAR_XP_BY_TIER[tier] ?? COMBAT_CHAR_XP_BY_TIER.medium;
    total += perKill * (count || 0);
  }
  return total;
}
