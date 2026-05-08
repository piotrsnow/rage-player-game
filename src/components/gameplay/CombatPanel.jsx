import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '../../services/gameDataService';
import { useCombatAudio } from '../../hooks/useCombatAudio';
import { useAI } from '../../hooks/useAI';
import { useSettings } from '../../contexts/SettingsContext';
import { shortId } from '../../utils/ids';
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
import CombatLogEntry from './CombatLogEntry';
import CombatantsList from './combat/CombatantsList';
import CombatHeader from './combat/CombatHeader';
import { TruceConfirmDialog, SurrenderConfirmDialog } from './combat/CombatConfirmDialogs';
import CombatTurnStatus from './combat/CombatTurnStatus';
import { buildResultLogEntries, buildResultChatMessages } from './combat/combatLogBuilders';
import { useEnemyTurnResolver } from '../../hooks/useEnemyTurnResolver';
import { useCombatResultSync } from '../../hooks/useCombatResultSync';
import { useCombatHostResolve } from '../../hooks/useCombatHostResolve';
import { useCombatSprites } from '../../hooks/useCombatSprites';

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

export default function CombatPanel({
  combat, dispatch, onEndCombat, onSurrender, onForceTruce, character,
  isMultiplayer = false, myPlayerId, onSendManoeuvre, onHostResolve, isHost = false, mpCharacters,
  gameState,
  onPersistState,
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { generateCombatCommentary } = useAI();
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [showTruceConfirm, setShowTruceConfirm] = useState(false);
  const [combatLog, setCombatLog] = useState([]);
  const [isAwaitingAiTurn, setIsAwaitingAiTurn] = useState(false);
  const logEndRef = useRef(null);
  const logScrollRef = useRef(null);
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

  const spriteMap = useCombatSprites(combat.combatants);

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

  useEffect(() => {
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [combatLog]);

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

  const handleExecuteManoeuvre = useCallback((manoeuvreKey, targetId, customDesc) => {
    if (!manoeuvreKey || !isMyTurn) return;

    if (isCustomAttackManoeuvre(manoeuvreKey) && customDesc) {
      persistCustomAttack(customDesc);
    }

    if (isMultiplayer && !isHost) {
      onSendManoeuvre?.(manoeuvreKey, targetId, customDesc);
      return;
    }

    const actorId = isMultiplayer ? myPlayerId : 'player';
    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, actorId, manoeuvreKey, targetId, { customDescription: customDesc }
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
  }, [isMyTurn, isMultiplayer, isHost, myPlayerId, combat, dispatch, onHostResolve, onSendManoeuvre, dispatchCombatChatMessage, addResultToLog, persistCustomAttack]);

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
        isMyTurn={isMyTurn}
        myCombatantId={myCombatant?.id}
        availableManoeuvres={availableManoeuvres}
        savedCustomAttacks={savedCustomAttacks}
        onExecuteManoeuvre={handleExecuteManoeuvre}
        onPersistCustomAttack={persistCustomAttack}
        onRemoveCustomAttack={removeCustomAttack}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)] gap-3 items-start">
        <div className="space-y-3">
          <CombatantsList
            combatants={combat.combatants}
            currentTurn={currentTurn}
            onHoverCombatant={() => {}}
            t={t}
          />

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

        <div className="min-w-0 space-y-3">
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1 pb-1">
            {t('combat.battleProgress', 'Battle Progress')}
          </div>
          {combatLog.length > 0 && (
            <div
              ref={logScrollRef}
              className="space-y-1 max-h-[480px] overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/10 bg-surface-container/20 p-2"
            >
              {combatLog.map((entry) => (
                <CombatLogEntry key={entry.id} entry={entry} t={t} />
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {combatLog.length === 0 && combat.log.length > 0 && (
            <div
              ref={logScrollRef}
              className="space-y-1 max-h-[480px] overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/10 bg-surface-container/20 p-2"
            >
              {combat.log.slice(-5).map((entry, i) => (
                <div key={`legacy_${i}`} className="text-[11px] text-outline-variant leading-snug px-2 py-1">
                  {entry}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
