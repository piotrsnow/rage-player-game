import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '../../services/gameDataService';
import { useCombatAudio } from '../../hooks/useCombatAudio';
import { useAI } from '../../hooks/useAI';
import { useSettings } from '../../contexts/SettingsContext';
import { shortId } from '../../utils/ids';
import { aiService } from '../../services/ai/service';
import {
  resolveManoeuvre,
  advanceTurn,
  getCurrentTurnCombatant,
  isCombatOver,
  isPlayerWinning,
  endCombat,
  surrenderCombat,
  forceTruceCombat,
  endMultiplayerCombat,
  surrenderMultiplayerCombat,
  forceTruceMultiplayerCombat,
  moveCombatant,
} from '../../services/combatEngine';
import CombatCanvas from './CombatCanvas';
import { useCombatCommentary } from '../../hooks/useCombatCommentary';
import CombatLog from './combat/CombatLog';
import CombatantsList from './combat/CombatantsList';
import CombatHeader from './combat/CombatHeader';
import { TruceConfirmDialog, SurrenderConfirmDialog } from './combat/CombatConfirmDialogs';
import CombatTurnStatus from './combat/CombatTurnStatus';
import { buildResultLogEntries, buildResultChatMessages } from './combat/combatLogBuilders';
import { useEnemyTurnResolver } from '../../hooks/useEnemyTurnResolver';
import { useCombatResultSync } from '../../hooks/useCombatResultSync';
import { useCombatHostResolve } from '../../hooks/useCombatHostResolve';
import { useCombatSprites } from '../../hooks/useCombatSprites';
import { addEffect, migrateStatusStrings } from '../../../shared/domain/statusEffects.js';

function isCustomAttackManoeuvre(manoeuvreKey) {
  return Boolean(manoeuvreKey && gameData.manoeuvres[manoeuvreKey]?.type === 'offensive');
}

function summarizeLogEntry(entry) {
  if (!entry || entry.type === 'round') return '';
  const core = [entry.actor, entry.action, entry.target].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const extras = [];
  if (entry.damage != null) extras.push(`damage ${entry.damage}`);
  if (entry.location) extras.push(entry.location);
  if (entry.criticalHit) extras.push(entry.criticalLabel || 'critical');
  if (entry.critName) extras.push(entry.critName);
  return [core, extras.join(', ')].filter(Boolean).join(' — ');
}

const ACTION_ANIM_MS = 1500;

export default function CombatPanel({
  combat, dispatch, onEndCombat, onSurrender, onForceTruce, character,
  isMultiplayer = false, myPlayerId, onSendManoeuvre, onHostResolve, isHost = false, mpCharacters,
  gameState,
  onPersistState,
  expandedLayout = false,
  onLayoutChange,
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { generateCombatCommentary } = useAI();
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [showTruceConfirm, setShowTruceConfirm] = useState(false);
  const [combatLog, setCombatLog] = useState([]);
  const [isAwaitingAiTurn, setIsAwaitingAiTurn] = useState(false);
  const [actionAnim, setActionAnim] = useState(null);
  const combatAudio = useCombatAudio(combat);

  const currentTurn = getCurrentTurnCombatant(combat);
  const isMyTurn = isMultiplayer
    ? currentTurn?.id === myPlayerId
    : currentTurn?.type === 'player';
  const combatOver = isCombatOver(combat);
  const canControl = isMultiplayer ? isHost : true;
  const playerWinning = isPlayerWinning(combat);
  const combatCommentaryFrequency = settings.dmSettings?.combatCommentaryFrequency ?? 3;
  const combatInstanceKey = `${combat.reason || ''}::${combat.combatants.map((combatant) => combatant.id).join('|')}`;

  const enemies = useMemo(
    () => combat.combatants.filter((c) => c.type === 'enemy'),
    [combat.combatants]
  );
  const friendlies = useMemo(
    () => combat.combatants.filter((c) => c.type === 'player' || c.type === 'ally'),
    [combat.combatants]
  );

  const myCombatant = useMemo(() => {
    if (isMultiplayer && myPlayerId) {
      return combat.combatants.find((c) => c.id === myPlayerId);
    }
    return combat.combatants.find((c) => c.type === 'player');
  }, [combat.combatants, isMultiplayer, myPlayerId]);

  const { sprites: spriteMap, regenerateSprite } = useCombatSprites(combat.combatants);

  const enrichedCombat = useMemo(() => {
    if (!Object.keys(spriteMap).length) return combat;
    const enrichedCombatants = combat.combatants.map(c => {
      const url = spriteMap[c.id];
      if (url && !c.spriteUrl) return { ...c, spriteUrl: url };
      return c;
    });
    return { ...combat, combatants: enrichedCombatants };
  }, [combat, spriteMap]);

  const availableManoeuvres = useMemo(() => {
    const charForSkills = myCombatant || character;
    return Object.entries(gameData.manoeuvres).filter(([key]) => {
      if (key === 'castSpell' && !charForSkills?.spells?.known?.length) return false;
      return true;
    });
  }, [myCombatant, character]);

  const savedCustomAttacks = useMemo(
    () => (Array.isArray(character?.customAttackPresets) ? character.customAttackPresets : []),
    [character?.customAttackPresets]
  );

  const isActorFriendly = useCallback(
    (actorName) => friendlies.some((c) => c.name === actorName),
    [friendlies],
  );

  const addLogEntry = useCallback((entry) => {
    setCombatLog((prev) => [...prev.slice(-49), entry]);
  }, []);

  const prevRoundRef = useRef(combat.round);
  useEffect(() => {
    if (combat.round !== prevRoundRef.current) {
      addLogEntry({
        type: 'round',
        text: `${t('combat.round', 'Round')} ${combat.round}`,
        id: `round_${combat.round}_${Date.now()}`,
      });
      prevRoundRef.current = combat.round;
    }
  }, [combat.round, t, addLogEntry]);

  const addResultToLog = useCallback((result) => {
    if (!result) return;
    combatAudio.playForResult(result);
    const entries = buildResultLogEntries(result, { isActorFriendly, t });
    for (const entry of entries) addLogEntry(entry);
  }, [combatAudio, isActorFriendly, t, addLogEntry]);

  const dispatchCombatChatMessage = useCallback((result) => {
    if (!result || isMultiplayer) return;
    const messages = buildResultChatMessages(result, { t });
    for (const message of messages) {
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message });
    }
  }, [isMultiplayer, dispatch, t]);

  const handleCommentaryMessage = useCallback((message) => {
    if (isMultiplayer) {
      onHostResolve?.(combat, { chatMessages: [message] });
    } else {
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message });
    }
  }, [isMultiplayer, onHostResolve, combat, dispatch]);

  useCombatCommentary({
    combat,
    combatOver,
    combatInstanceKey,
    combatLog,
    frequency: combatCommentaryFrequency,
    isMultiplayer,
    isHost,
    gameState,
    generateCombatCommentary,
    summarizeLogEntry,
    onEmitMessage: handleCommentaryMessage,
  });

  const triggerActionAnim = useCallback((actorId, targetId) => {
    setActionAnim({ actorId, targetId });
    return new Promise((resolve) => setTimeout(resolve, ACTION_ANIM_MS));
  }, []);

  const handleEnemyBeforeResolve = useCallback(async (currentCombat) => {
    const current = getCurrentTurnCombatant(currentCombat);
    if (!current || current.type === 'player') return;
    const playerTargets = currentCombat.combatants.filter(
      (c) => (c.type === 'player' || c.type === 'ally') && !c.isDefeated
    );
    if (!playerTargets.length) return;
    const closest = playerTargets.reduce((best, t) => {
      const d = Math.abs((current.position ?? 0) - (t.position ?? 0));
      return !best || d < best.dist ? { target: t, dist: d } : best;
    }, null);
    await triggerActionAnim(current.id, closest?.target?.id || null);
    setActionAnim(null);
  }, [triggerActionAnim]);

  useEnemyTurnResolver({
    combat,
    combatOver,
    isMultiplayer,
    isHost,
    dispatch,
    onHostResolve,
    addResultToLog: (r) => addResultToLog(r),
    dispatchCombatChatMessage: (r) => dispatchCombatChatMessage(r),
    setIsAwaitingAiTurn,
    onBeforeResolve: handleEnemyBeforeResolve,
  });

  useCombatResultSync({
    combat,
    isMultiplayer,
    isHost,
    addResultToLog: (r) => addResultToLog(r),
  });

  useCombatHostResolve({
    combat,
    isMultiplayer,
    isHost,
    onHostResolve,
    addResultToLog,
  });

  const persistCustomAttack = useCallback((description) => {
    const trimmed = description.trim();
    if (!trimmed) return;
    dispatch({ type: 'SAVE_CUSTOM_ATTACK', payload: trimmed });
    onPersistState?.();
  }, [dispatch, onPersistState]);

  const removeCustomAttack = useCallback((description) => {
    const trimmed = description.trim();
    if (!trimmed) return;
    dispatch({ type: 'DELETE_CUSTOM_ATTACK', payload: trimmed });
    onPersistState?.();
  }, [dispatch, onPersistState]);

  const handleExecuteManoeuvre = useCallback(async (manoeuvreKey, targetId, customDesc, extraOpts = {}) => {
    if (!manoeuvreKey || !isMyTurn || actionAnim) return;

    if (isCustomAttackManoeuvre(manoeuvreKey) && customDesc) {
      persistCustomAttack(customDesc);
    }

    if (isMultiplayer && !isHost) {
      onSendManoeuvre?.(manoeuvreKey, targetId, customDesc);
      return;
    }

    const actorId = isMultiplayer ? myPlayerId : 'player';
    await triggerActionAnim(actorId, targetId || null);
    setActionAnim(null);

    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, actorId, manoeuvreKey, targetId, { customDescription: customDesc, ...extraOpts }
    );
    dispatchCombatChatMessage(result);
    addResultToLog(result);
    const allResults = result ? [result] : [];

    let finalCombat = advanceTurn(updatedCombat);

    if (isMultiplayer) {
      finalCombat.lastResults = allResults;
      finalCombat.lastResultsTs = Date.now();
      onHostResolve?.(finalCombat);
    } else {
      dispatch({ type: 'UPDATE_COMBAT', payload: finalCombat });
    }
  }, [isMyTurn, actionAnim, isMultiplayer, isHost, myPlayerId, combat, dispatch, onHostResolve, onSendManoeuvre, dispatchCombatChatMessage, addResultToLog, persistCustomAttack, triggerActionAnim]);

  const handleMoveToPosition = useCallback((targetYard) => {
    if (!isMyTurn || combatOver) return;
    const actorId = isMultiplayer ? myPlayerId : 'player';
    const { combat: updated, moved, distance: dist } = moveCombatant(combat, actorId, targetYard);
    if (!moved) return;

    const actor = updated.combatants.find((c) => c.id === actorId);
    const uid = shortId(4);
    addLogEntry({
      type: 'info',
      actor: actor?.name || '?',
      action: t('combat.movedAction', 'moved {{dist}}y', { dist }),
      target: '',
      actorColor: '#c59aff',
      id: `move_${uid}`,
    });

    if (isMultiplayer) {
      onHostResolve?.(updated);
    } else {
      dispatch({ type: 'UPDATE_COMBAT', payload: updated });
    }
  }, [combat, isMyTurn, combatOver, isMultiplayer, myPlayerId, dispatch, onHostResolve, t, addLogEntry]);

  const handleAiAction = useCallback(async (actionText) => {
    if (!isMyTurn || combatOver || actionAnim) return;
    setIsAwaitingAiTurn(true);

    const actorId = isMultiplayer ? myPlayerId : 'player';
    const closestEnemy = combat.combatants
      .filter((c) => c.type === 'enemy' && !c.isDefeated)
      .reduce((best, e) => {
        const actor = combat.combatants.find(c => c.id === actorId);
        const d = Math.abs((actor?.position ?? 0) - (e.position ?? 0));
        return !best || d < best.dist ? { target: e, dist: d } : best;
      }, null);
    await triggerActionAnim(actorId, closestEnemy?.target?.id || null);
    setActionAnim(null);

    const activeCombatants = combat.combatants
      .filter((c) => !c.isDefeated)
      .map((c) => ({
        name: c.name,
        type: c.type,
        wounds: c.wounds ?? 0,
        maxWounds: c.maxWounds ?? c.wounds ?? 0,
        conditions: c.conditions || [],
        activeEffects: (c.activeEffects || []).map(fx => ({
          name: fx.name,
          category: fx.category,
          remaining: fx.duration?.remaining,
          restrictions: fx.mechanics?.restrictions || [],
        })),
      }));
    const defeatedCombatants = combat.combatants
      .filter((c) => c.isDefeated)
      .map((c) => ({ name: c.name, type: c.type, wounds: 0, maxWounds: c.maxWounds ?? 0 }));

    const combatSnapshot = {
      round: combat.round ?? 1,
      reason: combat.reason || '',
      activeCombatants,
      defeatedCombatants,
    };

    const provider = settings.dmSettings?.aiProvider || 'openai';
    const language = settings.language || 'pl';

    try {
      const { result } = await aiService.resolveCombatTurn(
        combatSnapshot, actionText, provider, language, 'standard'
      );

      const updatedCombatants = combat.combatants.map((c) => {
        let updated = { ...c, conditions: [...(c.conditions || [])] };

        if (c.type === 'enemy' && !c.isDefeated && result.enemyDamage?.length) {
          const dmgEntry = result.enemyDamage.find((d) => d.name === c.name);
          if (dmgEntry && dmgEntry.damage > 0) {
            updated.wounds = Math.max(0, (updated.wounds ?? 0) - dmgEntry.damage);
            if (updated.wounds <= 0) updated.isDefeated = true;
          }
        }

        if (c.type === 'player') {
          if (result.playerDamage > 0) {
            updated.wounds = Math.max(0, (updated.wounds ?? 0) - result.playerDamage);
            if (updated.wounds <= 0) updated.isDefeated = true;
          }
          if (result.playerHealing > 0) {
            updated.wounds = Math.min(updated.maxWounds ?? updated.wounds, (updated.wounds ?? 0) + result.playerHealing);
          }
          if (result.manaChange && updated.mana) {
            updated.mana = { ...updated.mana, current: Math.max(0, updated.mana.current + result.manaChange) };
          }
        }

        if (result.statusEffects?.length) {
          if (!updated.activeEffects) updated.activeEffects = [];
          for (const eff of result.statusEffects) {
            if (eff.target !== c.name) continue;
            if (eff.action === 'remove') {
              updated.activeEffects = updated.activeEffects.filter(fx => fx.name !== eff.effect?.name);
              continue;
            }
            if (eff.effect && typeof eff.effect === 'object' && eff.effect.name) {
              const fx = { id: `ai_${shortId(6)}`, source: 'ai', stackable: false, description: '', ...eff.effect };
              updated.activeEffects = addEffect(updated.activeEffects, fx);
            } else if (typeof eff.effect === 'string') {
              const migrated = migrateStatusStrings([eff.effect]);
              for (const mfx of migrated) updated.activeEffects = addEffect(updated.activeEffects, mfx);
            }
          }
        }

        return updated;
      });

      let updatedCombat = { ...combat, combatants: updatedCombatants };
      updatedCombat = advanceTurn(updatedCombat);

      if (result.narration) {
        addLogEntry({
          type: 'ai_action',
          text: result.narration,
          id: `ai_turn_${shortId(4)}`,
        });
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `msg_${Date.now()}_combat_ai_turn_${shortId(4)}`,
            role: 'narrator',
            content: result.narration,
            subtype: 'combat_ai_turn',
            timestamp: Date.now(),
          },
        });
      }

      if (isMultiplayer) {
        onHostResolve?.(updatedCombat);
      } else {
        dispatch({ type: 'UPDATE_COMBAT', payload: updatedCombat });
      }
    } catch (err) {
      console.error('[CombatPanel] AI combat turn failed:', err);
      addLogEntry({
        type: 'info',
        text: t('combat.aiTurnFailed', 'AI turn resolution failed — try again.'),
        id: `ai_fail_${shortId(4)}`,
      });
    } finally {
      setIsAwaitingAiTurn(false);
    }
  }, [combat, isMyTurn, combatOver, actionAnim, isMultiplayer, myPlayerId, settings, dispatch, onHostResolve, addLogEntry, t, triggerActionAnim]);

  const handleEndCombat = () => {
    if (isMultiplayer) {
      if (!isHost || !mpCharacters) return;
      const summary = endMultiplayerCombat(combat, mpCharacters);
      onEndCombat(summary);
    } else {
      if (!character) return;
      const summary = endCombat(combat, character);
      onEndCombat(summary);
    }
  };

  const handleSurrender = () => {
    if (isMultiplayer) {
      if (!isHost || !mpCharacters) return;
      const summary = surrenderMultiplayerCombat(combat, mpCharacters);
      setShowSurrenderConfirm(false);
      onSurrender(summary);
    } else {
      if (!character) return;
      const summary = surrenderCombat(combat, character);
      setShowSurrenderConfirm(false);
      onSurrender(summary);
    }
  };

  const handleForceTruce = () => {
    if (isMultiplayer) {
      if (!isHost || !mpCharacters) return;
      const summary = forceTruceMultiplayerCombat(combat, mpCharacters);
      setShowTruceConfirm(false);
      onForceTruce(summary);
    } else {
      if (!character) return;
      const summary = forceTruceCombat(combat, character);
      setShowTruceConfirm(false);
      onForceTruce(summary);
    }
  };

  return (
    <div className="space-y-3" data-testid="combat-panel">
      <CombatHeader
        round={combat.round}
        combatOver={combatOver}
        canControl={canControl}
        playerWinning={playerWinning}
        isMultiplayer={isMultiplayer}
        onRequestTruce={() => setShowTruceConfirm(true)}
        onRequestSurrender={() => setShowSurrenderConfirm(true)}
        onEndCombat={handleEndCombat}
        expandedLayout={expandedLayout}
        onToggleLayout={() => onLayoutChange?.(!expandedLayout)}
      />

      {showTruceConfirm && (
        <TruceConfirmDialog
          onCancel={() => setShowTruceConfirm(false)}
          onConfirm={handleForceTruce}
        />
      )}

      {showSurrenderConfirm && (
        <SurrenderConfirmDialog
          onCancel={() => setShowSurrenderConfirm(false)}
          onConfirm={handleSurrender}
        />
      )}

      <CombatCanvas
        combat={enrichedCombat}
        myPlayerId={myPlayerId}
        isMultiplayer={isMultiplayer}
        selectedTarget={selectedTarget}
        onSelectTarget={setSelectedTarget}
        onHoverCombatant={() => {}}
        onMoveToPosition={handleMoveToPosition}
        combatOver={combatOver}
        isMyTurn={isMyTurn && !actionAnim}
        myCombatantId={myCombatant?.id}
        availableManoeuvres={availableManoeuvres}
        actionAnim={actionAnim}
        savedCustomAttacks={savedCustomAttacks}
        onExecuteManoeuvre={handleExecuteManoeuvre}
        onPersistCustomAttack={persistCustomAttack}
        onRemoveCustomAttack={removeCustomAttack}
        onRegenerateSprite={regenerateSprite}
        character={character}
        onAiAction={handleAiAction}
        expanded={expandedLayout}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_5fr] gap-3 items-stretch">
        <CombatantsList
          combatants={combat.combatants}
          currentTurn={currentTurn}
          onHoverCombatant={() => {}}
          t={t}
        />

        <CombatLog combatLog={combatLog} legacyLog={combat.log} expanded={expandedLayout} />
      </div>

      <CombatTurnStatus
        isMyTurn={isMyTurn}
        combatOver={combatOver}
        isMultiplayer={isMultiplayer}
        isHost={isHost}
        currentTurn={currentTurn}
        isAwaitingAiTurn={isAwaitingAiTurn}
        combat={combat}
        enemies={enemies}
      />
    </div>
  );
}
