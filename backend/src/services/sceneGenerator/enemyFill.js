import {
  findClosestBestiaryEntry,
  selectBestiaryEncounter,
  applyAttributeVariance,
  DIFFICULTY_VARIANCE,
  rollEnemyRarity,
} from '../../data/equipment/index.js';

/**
 * Fill enemy stats from the bestiary when the large model emits combatUpdate.
 * Two paths:
 *   - enemyHints → engine selects a balanced encounter from the bestiary pool
 *   - enemies[] with names → name matching + stat fill per entry
 */
export function fillEnemiesFromBestiary(stateChanges) {
  if (!stateChanges) return;
  const cu = stateChanges.combatUpdate;
  if (!cu) return;

  if (cu.enemyHints && (!cu.enemies || cu.enemies.length === 0)) {
    cu.enemies = selectBestiaryEncounter(cu.enemyHints);
  }

  if (cu.enemies?.length) {
    cu.enemies = cu.enemies.map((enemy) => {
      if (enemy.attributes && enemy.maxWounds) return enemy;
      const match = findClosestBestiaryEntry(enemy.name);
      if (!match) return enemy;
      const variance = match.variance ?? DIFFICULTY_VARIANCE[match.difficulty] ?? 1;
      const attrs = applyAttributeVariance(match.attributes, variance);
      return {
        name: enemy.name,
        attributes: attrs,
        wounds: match.maxWounds,
        maxWounds: match.maxWounds,
        skills: match.skills,
        traits: match.traits,
        armourDR: match.armourDR,
        weapons: match.weapons,
        weaponRarity: rollEnemyRarity(match.difficulty),
        armourRarity: rollEnemyRarity(match.difficulty),
      };
    });
  }
}
