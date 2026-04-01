const HEAL_RATE_PER_HOUR = 0.10;
const NEEDS_KEYS = ['hunger', 'thirst', 'bladder', 'hygiene', 'rest'];

/**
 * Check if the player action is a rest/sleep command.
 * @param {string} playerAction
 * @param {Function} t - i18next translation function
 * @returns {boolean}
 */
export function isRestAction(playerAction, t) {
  const normalized = typeof playerAction === 'string' ? playerAction.trim().toLowerCase() : '';
  if (!normalized) return false;

  if (typeof t === 'function') {
    const localizedRestAction = (t('gameplay.restAction') || '').trim().toLowerCase();
    if (localizedRestAction && normalized === localizedRestAction) return true;
  }

  return normalized.includes('rest') || normalized.includes('odpoc');
}

/**
 * Calculate rest recovery: 10% max HP per hour slept + needs satisfaction.
 * @param {Object} character - player character state
 * @param {number} hoursSlept - from timeAdvance.hoursElapsed (default 0.5)
 * @returns {{ woundsChange: number|undefined, needsChanges: Object } | null}
 */
export function calculateRestRecovery(character, hoursSlept = 0.5) {
  if (!character) return null;

  const maxWounds = character.maxWounds ?? character.wounds ?? 0;
  const currentWounds = character.wounds ?? maxWounds;
  const missingHp = Math.max(0, maxWounds - currentWounds);

  const hours = typeof hoursSlept === 'number' && Number.isFinite(hoursSlept) && hoursSlept > 0 ? hoursSlept : 0.5;
  const healed = Math.min(missingHp, Math.floor(maxWounds * HEAL_RATE_PER_HOUR * hours));

  const needs = character.needs || {};
  const needsChanges = {};
  for (const key of NEEDS_KEYS) {
    if (typeof needs[key] !== 'number') continue;
    needsChanges[key] = 100;
  }

  return {
    woundsChange: healed > 0 ? healed : undefined,
    needsChanges,
  };
}
