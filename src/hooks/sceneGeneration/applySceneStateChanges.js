import { validateStateChanges } from '../../services/stateValidator';
import { generateStateChangeMessages } from '../../services/stateChangeMessages';
import { getGameState } from '../../stores/gameStore';
import { shortId } from '../../utils/ids';
import { devLog } from '../../stores/devEventLogStore';

export function applySceneStateChanges({
  result, state, dispatch,
  authoritativeCharacterSnapshot, authoritativeQuests, ensureMissingInventoryImages, ensureMissingSpellImages, ensureMissingNpcPortraits, t,
  newlyUnlockedAchievements = [], updatedAchievementState = null,
  campaignId = null, sceneIndex = null,
}) {
  if (!result.stateChanges || Object.keys(result.stateChanges).length === 0) return;

  const updatedNpcNames = new Set(
    (Array.isArray(result.stateChanges.npcs) ? result.stateChanges.npcs : [])
      .filter((n) => n?.action === 'update' && typeof n?.name === 'string')
      .map((n) => n.name.toLowerCase()),
  );

  const woundsBefore = state.character?.wounds ?? 0;

  const { validated, warnings, corrections } = validateStateChanges(
    result.stateChanges,
    state,
    {},
    { campaignId, sceneIndex },
  );
  if (warnings.length > 0 || corrections.length > 0) {
    devLog.emit({ category: 'validation', type: 'state_validation', label: `Validation: ${warnings.length} warnings, ${corrections.length} corrections`, severity: warnings.length > 0 ? 'warn' : 'info', data: { warnings, corrections } });
  }
  result.stateChanges = validated;

  dispatch({ type: 'APPLY_STATE_CHANGES', payload: validated });

  if (authoritativeCharacterSnapshot) {
    dispatch({ type: 'RECONCILE_CHARACTER_FROM_BACKEND', payload: authoritativeCharacterSnapshot });
  }

  const woundsAfter = authoritativeCharacterSnapshot?.wounds
    ?? (state.character?.wounds ?? woundsBefore) + (validated.woundsChange ?? 0);
  const actualWoundsDelta = woundsAfter - woundsBefore;
  const stateChangesForMessages = (validated.woundsChange != null && validated.woundsChange !== 0 && actualWoundsDelta !== validated.woundsChange)
    ? { ...validated, woundsChange: actualWoundsDelta !== 0 ? actualWoundsDelta : undefined }
    : validated;
  if (authoritativeQuests) {
    dispatch({ type: 'RECONCILE_QUESTS_FROM_BACKEND', payload: authoritativeQuests });
  }
  if (Array.isArray(validated.newItems) && validated.newItems.length > 0) {
    void ensureMissingInventoryImages(validated.newItems, { emitWarning: false });
  }
  if (validated.learnSpell && typeof ensureMissingSpellImages === 'function') {
    void ensureMissingSpellImages([validated.learnSpell], { emitWarning: false });
  }
  if (updatedNpcNames.size > 0 && typeof ensureMissingNpcPortraits === 'function') {
    setTimeout(() => {
      const fresh = (getGameState()?.world?.npcs || [])
        .filter((n) => n?.name && updatedNpcNames.has(n.name.toLowerCase()) && !n.portraitUrl);
      if (fresh.length > 0) void ensureMissingNpcPortraits(fresh);
    }, 0);
  }

  // World consistency checks are now done server-side (generateSceneStream.js).

  for (const warn of [...warnings, ...corrections]) {
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${Date.now()}_val_${shortId(3)}`,
        role: 'system',
        subtype: 'validation_warning',
        content: `⚠ ${warn}`,
        timestamp: Date.now(),
      },
    });
  }

  const scMessages = generateStateChangeMessages(stateChangesForMessages, state, t);
  for (const msg of scMessages) {
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg });
  }

  // Achievement unlocks are computed server-side and arrive pre-resolved.
  // FE just reconciles the updated state and grants titles locally.
  if (updatedAchievementState) {
    dispatch({ type: 'UPDATE_ACHIEVEMENTS', payload: updatedAchievementState });
  }
  if (newlyUnlockedAchievements.length > 0) {
    devLog.emit({ category: 'state', type: 'achievements_unlocked', label: `Achievements: ${newlyUnlockedAchievements.map((a) => a.name).join(', ')}`, data: newlyUnlockedAchievements });
  }
  for (const ach of newlyUnlockedAchievements) {
    if (ach.grantsTitle && state.character) {
      dispatch({ type: 'ADD_TITLE', payload: { ...ach.grantsTitle, sourceAchievementId: ach.id } });
    }
    const xpPart = ach.xpReward ? ` — +${ach.xpReward} XP` : '';
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${Date.now()}_ach_${shortId(3)}`,
        role: 'system',
        subtype: 'achievement_unlock',
        content: `${ach.name}${xpPart}`,
        achievementIcon: ach.icon || 'emoji_events',
        achievementRarity: ach.rarity || 'common',
        achievementDescription: ach.description || '',
        timestamp: Date.now(),
      },
    });
  }
}
