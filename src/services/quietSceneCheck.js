const ALLOWED_STATE_CHANGE_KEYS = new Set([
  'timeAdvance', 'needsChanges', 'narrativeState',
]);

/**
 * A "quiet scene" has no dialogue and no meaningful world/character state changes.
 * Used as a gate for distant (non-adjacent) travel requests from the player map.
 */
export function isQuietScene(scene) {
  if (!scene) return false;

  const segments = scene.segments || scene.dialogueSegments || [];
  const hasDialogue = segments.some((s) => s.type === 'dialogue');
  if (hasDialogue) return false;

  const changes = scene.stateChanges;
  if (!changes) return true;

  const keys = Object.keys(changes).filter((k) => {
    const val = changes[k];
    return val !== null && val !== undefined && val !== '' &&
      !(Array.isArray(val) && val.length === 0) &&
      !(typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0);
  });

  return keys.every((k) => ALLOWED_STATE_CHANGE_KEYS.has(k));
}
