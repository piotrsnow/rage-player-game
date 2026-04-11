import { useMemo } from 'react';

function pickStateChanges(summary) {
  const stateChanges = {};
  if (summary.woundsChange) stateChanges.woundsChange = summary.woundsChange;
  if (summary.xp) stateChanges.xp = summary.xp;
  return stateChanges;
}

function soloPerCharForServer(perChar) {
  const out = {};
  for (const [name, data] of Object.entries(perChar || {})) {
    out[name] = {
      wounds: data.wounds || 0,
      xp: data.xp || 0,
      manaChange: data.manaChange || 0,
    };
  }
  return out;
}

function formatRemainingEnemies(remaining) {
  return (remaining || [])
    .map((e) => `${e.name} (${e.wounds}/${e.maxWounds} HP)`)
    .join(', ');
}

/**
 * Resolves combat-ending handlers for solo and multiplayer modes.
 * Returns `{ onEndCombat, onSurrender, onForceTruce }` — the caller picks
 * between solo and MP variants via `isMultiplayer`.
 */
export function useCombatResolution({
  isMultiplayer,
  dispatch,
  autoSave,
  narrator,
  generateScene,
  mp,
  settings,
  t,
}) {
  return useMemo(() => {
    // --- Solo handlers --------------------------------------------------
    const handleEndCombat = (summary) => {
      dispatch({ type: 'END_COMBAT' });

      const combatJournal = summary.playerSurvived
        ? `Combat: Victory — ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated in ${summary.rounds} rounds.${summary.woundsChange ? ` Took ${Math.abs(summary.woundsChange)} wounds.` : ''}`
        : `Combat: Defeat — fell after ${summary.rounds} rounds against ${summary.totalEnemies} enemies.`;

      const stateChanges = pickStateChanges(summary);
      stateChanges.journalEntries = [combatJournal];
      if (!summary.playerSurvived) stateChanges.forceStatus = 'dead';

      dispatch({ type: 'APPLY_STATE_CHANGES', payload: stateChanges });

      const isDead = stateChanges.forceStatus === 'dead';
      const xpRewardText = summary.xp ? ` +${summary.xp} ${t('common.xp')}` : '';

      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `msg_${Date.now()}_combat_end`,
          role: 'system',
          subtype: isDead ? 'combat_death' : 'combat_end',
          content: isDead
            ? t('combat.playerDied', 'Your character has fallen in combat. Death is final.')
            : `${t('combat.endedAfterRounds', 'Combat ended after {{rounds}} rounds.', { rounds: summary.rounds })} ${summary.enemiesDefeated}/${summary.totalEnemies} ${t('combat.enemiesDefeated', 'enemies defeated')}. ${summary.playerSurvived ? t('combat.youSurvived', 'You survived!') : t('combat.youWereDefeated', 'You were defeated!')}${xpRewardText}`,
          timestamp: Date.now(),
        },
      });
      setTimeout(() => autoSave(), 300);

      if (isDead) {
        narrator.stop?.();
        return;
      }

      const combatActionText = summary.playerSurvived
        ? `[Combat resolved: defeated ${summary.enemiesDefeated}/${summary.totalEnemies} enemies in ${summary.rounds} rounds.${summary.woundsChange ? ` Took ${Math.abs(summary.woundsChange)} wounds.` : ' Unscathed.'}]`
        : `[Combat resolved: the player LOST the fight after ${summary.rounds} rounds against ${summary.totalEnemies} enemies. They were reduced to 0 wounds and did NOT win. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies were defeated before the loss.${summary.woundsChange ? ` The player took ${Math.abs(summary.woundsChange)} wounds.` : ''} Narrate ONLY the defeat aftermath: capture, rescue, being left for dead, waking up wounded, losing gear, or enemies taking control. NEVER describe this as a victory, clean escape, or total enemy defeat.]`;

      generateScene(combatActionText, false, false).catch(() => {});
    };

    const handleSurrender = (summary) => {
      dispatch({ type: 'END_COMBAT' });

      const remainingList = formatRemainingEnemies(summary.remainingEnemies);
      const combatJournal = `Combat: Surrender — yielded after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}.${summary.woundsChange ? ` Took ${Math.abs(summary.woundsChange)} wounds.` : ''}`;

      const stateChanges = pickStateChanges(summary);
      stateChanges.journalEntries = [combatJournal];
      dispatch({ type: 'APPLY_STATE_CHANGES', payload: stateChanges });

      const xpRewardText = summary.xp ? ` +${summary.xp} ${t('common.xp')}` : '';
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `msg_${Date.now()}_combat_surrender`,
          role: 'system',
          subtype: 'combat_end',
          content: `${t('combat.youSurrenderedAfterRounds', 'You surrendered after {{rounds}} rounds.', { rounds: summary.rounds })} ${summary.enemiesDefeated}/${summary.totalEnemies} ${t('combat.enemiesDefeated', 'enemies defeated')}.${xpRewardText}`,
          timestamp: Date.now(),
        },
      });
      setTimeout(() => autoSave(), 300);

      const combatActionText = `[Combat resolved: player surrendered after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}. Reason for combat: ${summary.reason || 'unknown'}.${summary.woundsChange ? ` Player took ${Math.abs(summary.woundsChange)} wounds.` : ' Player unscathed.'}]`;
      generateScene(combatActionText, false, false).catch(() => {});
    };

    const handleForceTruce = (summary) => {
      dispatch({ type: 'END_COMBAT' });

      const remainingList = formatRemainingEnemies(summary.remainingEnemies);
      const combatJournal = `Combat: Truce — forced a truce after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}.${summary.woundsChange ? ` Took ${Math.abs(summary.woundsChange)} wounds.` : ''}`;

      const stateChanges = pickStateChanges(summary);
      stateChanges.journalEntries = [combatJournal];
      dispatch({ type: 'APPLY_STATE_CHANGES', payload: stateChanges });

      const xpRewardText = summary.xp ? ` +${summary.xp} ${t('common.xp')}` : '';
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `msg_${Date.now()}_combat_truce`,
          role: 'system',
          subtype: 'combat_end',
          content: `${t('combat.youForcedTruceAfterRounds', 'You forced a truce after {{rounds}} rounds.', { rounds: summary.rounds })} ${summary.enemiesDefeated}/${summary.totalEnemies} ${t('combat.enemiesDefeated', 'enemies defeated')}.${xpRewardText}`,
          timestamp: Date.now(),
        },
      });
      setTimeout(() => autoSave(), 300);

      const combatActionText = `[Combat resolved: player forced a truce after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}. The player had the upper hand and demanded the enemies stand down. Reason for combat: ${summary.reason || 'unknown'}.${summary.woundsChange ? ` Player took ${Math.abs(summary.woundsChange)} wounds.` : ' Player unscathed.'}]`;
      generateScene(combatActionText, false, false).catch(() => {});
    };

    // --- Multiplayer handlers (host-only) --------------------------------
    const handleMpEndCombat = (summary) => {
      const perCharForServer = soloPerCharForServer(summary.perCharacter);
      const allSurvived = Object.values(summary.perCharacter || {}).every((p) => p.survived);

      const combatJournal = allSurvived
        ? `Combat: Victory — ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated in ${summary.rounds} rounds.`
        : `Combat: Defeat — party fell after ${summary.rounds} rounds against ${summary.totalEnemies} enemies.`;

      mp.endMultiplayerCombat({
        perCharacter: perCharForServer,
        enemiesDefeated: summary.enemiesDefeated,
        totalEnemies: summary.totalEnemies,
        rounds: summary.rounds,
        outcome: allSurvived ? 'victory' : 'defeat',
        journalEntry: combatJournal,
      });

      const combatActionText = allSurvived
        ? `[Combat resolved: party defeated ${summary.enemiesDefeated}/${summary.totalEnemies} enemies in ${summary.rounds} rounds.]`
        : `[Combat resolved: the party LOST the fight after ${summary.rounds} rounds against ${summary.totalEnemies} enemies. They did NOT win. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies were defeated before the loss. Narrate ONLY the defeat aftermath: capture, forced retreat, rescue, imprisonment, losing equipment, or waking later under enemy control. NEVER describe this as a victory or as if all enemies were defeated.]`;

      mp.soloAction(combatActionText, false, settings.language, settings.dmSettings);
    };

    const handleMpSurrender = (summary) => {
      const perCharForServer = soloPerCharForServer(summary.perCharacter);
      const remainingList = formatRemainingEnemies(summary.remainingEnemies);
      const combatJournal = `Combat: Surrender — party yielded after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining: ${remainingList}.`;

      mp.endMultiplayerCombat({
        perCharacter: perCharForServer,
        enemiesDefeated: summary.enemiesDefeated,
        totalEnemies: summary.totalEnemies,
        rounds: summary.rounds,
        outcome: 'surrender',
        journalEntry: combatJournal,
      });

      const combatActionText = `[Combat resolved: party surrendered after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}. Reason: ${summary.reason || 'unknown'}.]`;
      mp.soloAction(combatActionText, false, settings.language, settings.dmSettings);
    };

    const handleMpForceTruce = (summary) => {
      const perCharForServer = soloPerCharForServer(summary.perCharacter);
      const remainingList = formatRemainingEnemies(summary.remainingEnemies);
      const combatJournal = `Combat: Truce — party forced a truce after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining: ${remainingList}.`;

      mp.endMultiplayerCombat({
        perCharacter: perCharForServer,
        enemiesDefeated: summary.enemiesDefeated,
        totalEnemies: summary.totalEnemies,
        rounds: summary.rounds,
        outcome: 'truce',
        journalEntry: combatJournal,
      });

      const combatActionText = `[Combat resolved: party forced a truce after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}. The party had the upper hand and demanded the enemies stand down. Reason: ${summary.reason || 'unknown'}.]`;
      mp.soloAction(combatActionText, false, settings.language, settings.dmSettings);
    };

    return {
      onEndCombat: isMultiplayer ? handleMpEndCombat : handleEndCombat,
      onSurrender: isMultiplayer ? handleMpSurrender : handleSurrender,
      onForceTruce: isMultiplayer ? handleMpForceTruce : handleForceTruce,
    };
  }, [isMultiplayer, dispatch, autoSave, narrator, generateScene, mp, settings.language, settings.dmSettings, t]);
}
