import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '../../services/gameDataService';
import { useCombatAudio } from '../../hooks/useCombatAudio';
import { useAI } from '../../hooks/useAI';
import { useSettings } from '../../contexts/SettingsContext';
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
  getDistance,
} from '../../services/combatEngine';
import CombatCanvas from './CombatCanvas';
import Tooltip from '../ui/Tooltip';
import { useCombatCommentary } from '../../hooks/useCombatCommentary';
import CombatLogEntry, { buildCombatLogDetails } from './CombatLogEntry';
import CombatantsList from './combat/CombatantsList';
import ManeuverPicker from './combat/ManeuverPicker';
import { useEnemyTurnResolver } from '../../hooks/useEnemyTurnResolver';
import { useCombatResultSync } from '../../hooks/useCombatResultSync';

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
  const [selectedManoeuvre, setSelectedManoeuvre] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [customDescription, setCustomDescription] = useState('');
  const [showSavedAttacks, setShowSavedAttacks] = useState(false);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [showTruceConfirm, setShowTruceConfirm] = useState(false);
  const [combatLog, setCombatLog] = useState([]);
  const [isAwaitingAiTurn, setIsAwaitingAiTurn] = useState(false);
  const [hoveredCombatantId, setHoveredCombatantId] = useState(null);
  const logEndRef = useRef(null);
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

  const isActorFriendly = (actorName) => {
    return friendlies.some((c) => c.name === actorName);
  };

  const addLogEntry = (entry) => {
    setCombatLog((prev) => [...prev.slice(-49), entry]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [combatLog]);

  useEffect(() => {
    if (!isCustomAttackManoeuvre(selectedManoeuvre)) {
      setShowSavedAttacks(false);
    }
  }, [selectedManoeuvre]);

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
  }, [combat.round, t]);

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

  const handleManoeuvreSelect = (key) => {
    setSelectedManoeuvre(key);
    const man = gameData.manoeuvres[key];
    if (man.type !== 'offensive') {
      setCustomDescription('');
    }
    if (man.type === 'defensive' || man.modifiers.flee) {
      setSelectedTarget(null);
    } else if (enemies.filter((e) => !e.isDefeated).length === 1) {
      setSelectedTarget(enemies.find((e) => !e.isDefeated)?.id);
    }
  };

  const persistCustomAttack = (description) => {
    const trimmed = description.trim();
    if (!trimmed) return;

    dispatch({ type: 'SAVE_CUSTOM_ATTACK', payload: trimmed });
    onPersistState?.();
  };

  const removeCustomAttack = (description) => {
    const trimmed = description.trim();
    if (!trimmed) return;

    dispatch({ type: 'DELETE_CUSTOM_ATTACK', payload: trimmed });
    if (customDescription.trim() === trimmed) {
      setCustomDescription('');
    }
    onPersistState?.();
  };

  const addResultToLog = (result) => {
    if (!result) return;
    combatAudio.playForResult(result);
    const friendly = isActorFriendly(result.actor);
    const actorColor = friendly ? '#c59aff' : '#ff6e84';
    const targetColor = friendly ? '#ff6e84' : '#c59aff';
    const uid = Math.random().toString(36).slice(2, 6);

    if (result.outcome === 'hit' && result.damage != null) {
      addLogEntry({
        type: 'hit',
        actor: result.actor,
        action: '→',
        target: result.targetName || '?',
        criticalHit: Boolean(result.criticalHit),
        criticalLabel: t('combat.criticalHit', 'Critical Hit'),
        damage: result.damage,
        location: result.hitLocation || '',
        actorColor,
        targetColor,
        details: buildCombatLogDetails(result, t),
        id: `hit_${uid}`,
      });
      if (result.targetDefeated) {
        addLogEntry({
          type: 'defeat',
          actor: result.targetName || '?',
          action: '☠',
          target: '',
          actorColor: targetColor,
          id: `ko_${uid}`,
        });
      }
    } else if (result.outcome === 'miss') {
      addLogEntry({
        type: 'miss',
        actor: result.actor,
        action: `→ ${t('combat.miss', 'Miss!')}`,
        target: result.targetName || '?',
        highlightText: t('combat.missShort', 'PUDŁO'),
        highlightTone: 'miss',
        actorColor,
        targetColor,
        details: buildCombatLogDetails(result, t),
        id: `miss_${uid}`,
      });
    } else if (result.outcome === 'fled') {
      addLogEntry({
        type: 'fled',
        actor: result.actor,
        action: t('combat.fled', 'Fled!'),
        target: '',
        actorColor,
        details: buildCombatLogDetails(result, t),
        id: `fled_${uid}`,
      });
    } else if (result.outcome === 'failed_flee') {
      addLogEntry({
        type: 'miss',
        actor: result.actor,
        action: t('combat.failedFlee', 'failed to flee'),
        target: '',
        actorColor,
        details: buildCombatLogDetails(result, t),
        id: `failed_flee_${uid}`,
      });
    } else if (result.outcome === 'defensive') {
      addLogEntry({
        type: 'info',
        actor: result.actor,
        action: t(`combat.manoeuvres.${result.manoeuvreKey}`, result.manoeuvre),
        target: '',
        actorColor,
        details: buildCombatLogDetails(result, t),
        id: `defensive_${uid}`,
      });
    }
  };

  const dispatchCombatChatMessage = (result) => {
    if (!result || isMultiplayer) return;
    const ts = Date.now();
    const uid = () => Math.random().toString(36).slice(2, 6);

    if (result.outcome === 'hit' && result.damage != null) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `msg_${ts}_hit_${uid()}`,
          role: 'system',
          subtype: 'combat_hit',
          content: result.criticalHit
            ? t('combat.chatCriticalHit', {
              actor: result.actor,
              target: result.targetName || '?',
              damage: result.damage,
              location: result.hitLocation || '',
            })
            : t('combat.chatHit', {
              actor: result.actor,
              target: result.targetName || '?',
              damage: result.damage,
              location: result.hitLocation || '',
            }),
          combatBadgeText: `-${result.damage}`,
          combatBadgeTone: 'hit',
          timestamp: ts,
        },
      });
      if (result.targetDefeated) {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `msg_${ts}_ko_${uid()}`,
            role: 'system',
            subtype: 'combat_defeat',
            content: t('combat.chatDefeated', { target: result.targetName || '?' }),
            timestamp: ts,
          },
        });
      }
    } else if (result.outcome === 'miss') {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `msg_${ts}_miss_${uid()}`,
          role: 'system',
          subtype: 'combat_miss',
          content: t('combat.chatMiss', {
            actor: result.actor,
            target: result.targetName || '?',
          }),
          combatBadgeText: t('combat.missShort', 'PUDŁO'),
          combatBadgeTone: 'miss',
          timestamp: ts,
        },
      });
    } else if (result.outcome === 'fled') {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `msg_${ts}_fled_${uid()}`,
          role: 'system',
          subtype: 'combat_fled',
          content: t('combat.chatFled', { actor: result.actor }),
          timestamp: ts,
        },
      });
    }
  };

  const handleExecute = () => {
    if (!selectedManoeuvre || !isMyTurn) return;
    const man = gameData.manoeuvres[selectedManoeuvre];
    const needsTarget = man.type === 'offensive' || man.type === 'magic';
    if (needsTarget && !selectedTarget) return;
    const trimmedDescription = customDescription.trim();

    if (isCustomAttackManoeuvre(selectedManoeuvre) && trimmedDescription) {
      persistCustomAttack(trimmedDescription);
    }

    if (isMultiplayer && !isHost) {
      onSendManoeuvre?.(selectedManoeuvre, selectedTarget, trimmedDescription);
      setSelectedManoeuvre(null);
      setSelectedTarget(null);
      setCustomDescription('');
      return;
    }

    const actorId = isMultiplayer ? myPlayerId : 'player';
    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, actorId, selectedManoeuvre, selectedTarget, { customDescription: trimmedDescription }
    );
    setSelectedManoeuvre(null);
    setSelectedTarget(null);
    setCustomDescription('');
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
  };

  const handleHostResolveManoeuvre = (fromPlayerId, manoeuvre, targetId, remoteCustomDescription = '') => {
    if (!isHost || !isMultiplayer) return;

    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, fromPlayerId, manoeuvre, targetId, { customDescription: remoteCustomDescription }
    );
    addResultToLog(result);
    const allResults = result ? [result] : [];

    let finalCombat = advanceTurn(updatedCombat);

    finalCombat.lastResults = allResults;
    finalCombat.lastResultsTs = Date.now();
    onHostResolve?.(finalCombat);
  };

  CombatPanel.resolveRemoteManoeuvre = handleHostResolveManoeuvre;

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

  const handleMoveToPosition = useCallback((targetYard) => {
    if (!isMyTurn || combatOver) return;
    const actorId = isMultiplayer ? myPlayerId : 'player';
    const { combat: updated, moved, distance: dist } = moveCombatant(combat, actorId, targetYard);
    if (!moved) return;

    const actor = updated.combatants.find((c) => c.id === actorId);
    const uid = Math.random().toString(36).slice(2, 6);
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
  }, [combat, isMyTurn, combatOver, isMultiplayer, myPlayerId, dispatch, onHostResolve, t]);

  const selectedTargetOutOfMeleeRange = useMemo(() => {
    if (!selectedManoeuvre || !selectedTarget) return false;
    const man = gameData.manoeuvres[selectedManoeuvre];
    if (man.range !== 'melee') return false;
    const target = combat.combatants.find((c) => c.id === selectedTarget);
    if (!target || !myCombatant) return false;
    return getDistance(myCombatant, target) > gameData.MELEE_RANGE;
  }, [selectedManoeuvre, selectedTarget, combat.combatants, myCombatant]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-error text-lg">swords</span>
          <h3 className="text-sm font-bold text-error uppercase tracking-widest">
            {t('combat.title', 'Combat')}
          </h3>
          <span className="text-[11px] text-on-surface-variant px-2 py-0.5 bg-surface-container rounded-sm">
            {t('combat.round', 'Round')} {combat.round}
          </span>
          {isMultiplayer && (
            <span className="text-[10px] text-tertiary px-2 py-0.5 bg-tertiary/10 rounded-sm uppercase tracking-widest">
              {t('combat.multiplayer', 'MP')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!combatOver && canControl && playerWinning && (
            <button
              onClick={() => setShowTruceConfirm(true)}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-outline/10 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-tertiary/15 hover:text-tertiary hover:border-tertiary/20 transition-colors"
            >
              {t('combat.forceTruce', 'Force Truce')}
            </button>
          )}
          {!combatOver && canControl && (
            <button
              onClick={() => setShowSurrenderConfirm(true)}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-outline/10 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-error/15 hover:text-error hover:border-error/20 transition-colors"
            >
              {t('combat.surrender', 'Surrender')}
            </button>
          )}
          {combatOver && canControl && (
            <button
              onClick={handleEndCombat}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-primary/15 text-primary border border-primary/20 rounded-sm hover:bg-primary/25 transition-colors"
            >
              {t('combat.endCombat', 'End Combat')}
            </button>
          )}
        </div>
      </div>

      {/* Truce Confirmation */}
      {showTruceConfirm && (
        <div className="p-3 bg-tertiary/5 border border-tertiary/30 rounded-sm space-y-2">
          <p className="text-[12px] text-on-surface">
            {t('combat.forceTruceConfirm', 'You have the upper hand. Force a truce? Remaining enemies will back down.')}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowTruceConfirm(false)}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-surface-container/50 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-surface-container transition-colors"
            >
              {t('combat.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleForceTruce}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-tertiary/15 text-tertiary border border-tertiary/30 rounded-sm hover:bg-tertiary/25 transition-colors"
            >
              {t('combat.forceTruce', 'Force Truce')}
            </button>
          </div>
        </div>
      )}

      {/* Surrender Confirmation */}
      {showSurrenderConfirm && (
        <div className="p-3 bg-error-container/10 border border-error/30 rounded-sm space-y-2">
          <p className="text-[12px] text-on-surface">
            {t('combat.surrenderConfirm', 'Are you sure? You will be at the mercy of your enemies.')}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowSurrenderConfirm(false)}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-surface-container/50 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-surface-container transition-colors"
            >
              {t('combat.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSurrender}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-error/15 text-error border border-error/30 rounded-sm hover:bg-error/25 transition-colors"
            >
              {t('combat.surrender', 'Surrender')}
            </button>
          </div>
        </div>
      )}

      {/* Canvas Battlefield */}
      <CombatCanvas
        combat={combat}
        myPlayerId={myPlayerId}
        isMultiplayer={isMultiplayer}
        selectedTarget={selectedTarget}
        onSelectTarget={setSelectedTarget}
        onHoverCombatant={setHoveredCombatantId}
        onMoveToPosition={handleMoveToPosition}
        combatOver={combatOver}
        isMyTurn={isMyTurn}
        myCombatantId={myCombatant?.id}
      />

      {/* Movement indicator */}
      {isMyTurn && !combatOver && myCombatant && (
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-container/30 border border-outline-variant/10 rounded-sm">
            <span className="material-symbols-outlined text-sm text-primary">directions_walk</span>
            <span className="text-on-surface-variant">{t('combat.movement', 'Movement')}:</span>
            <span className="text-primary font-bold tabular-nums">
              {myCombatant.movementAllowance - (myCombatant.movementUsed || 0)}/{myCombatant.movementAllowance}
            </span>
            <span className="text-outline-variant">y</span>
          </div>
          <span className="text-[10px] text-outline-variant">{t('combat.clickToMove', 'Click battlefield to move')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,400px)_240px_minmax(0,1fr)] gap-3 items-start">
        {/* Column 1: Player Actions */}
        <div className="space-y-3">
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1 pb-1">
            {t('combat.yourTurn', 'Your Turn')} — {t('combat.chooseManoeuvre', 'Choose Manoeuvre')}
          </div>
          {isMyTurn && !combatOver && (
            <ManeuverPicker
              availableManoeuvres={availableManoeuvres}
              selectedManoeuvre={selectedManoeuvre}
              selectedTarget={selectedTarget}
              customDescription={customDescription}
              showSavedAttacks={showSavedAttacks}
              savedCustomAttacks={savedCustomAttacks}
              enemies={enemies}
              myCombatant={myCombatant}
              selectedTargetOutOfMeleeRange={selectedTargetOutOfMeleeRange}
              onManoeuvreSelect={handleManoeuvreSelect}
              onSelectTarget={setSelectedTarget}
              onCustomDescriptionChange={setCustomDescription}
              onToggleSavedAttacks={() => setShowSavedAttacks((c) => !c)}
              onSelectSavedAttack={(attack) => { setCustomDescription(attack); setShowSavedAttacks(false); }}
              onRemoveCustomAttack={removeCustomAttack}
              onExecute={handleExecute}
              t={t}
            />
          )}

          {isMultiplayer && !isMyTurn && !combatOver && currentTurn?.type === 'player' && (
            <div className="text-center py-3 text-[12px] text-on-surface-variant rounded-sm border border-outline-variant/10 bg-surface-container/20">
              <span className="material-symbols-outlined text-sm mr-1 animate-pulse">hourglass_top</span>
              {t('combat.waitingFor', 'Waiting for {{name}}...', { name: currentTurn?.name })}
            </div>
          )}

          {!isMyTurn && !combatOver && currentTurn?.type !== 'player' && isAwaitingAiTurn && (
            <div className="text-center py-3 text-[12px] text-on-surface-variant rounded-sm border border-outline-variant/10 bg-surface-container/20">
              <span className="material-symbols-outlined text-sm mr-1 animate-pulse">hourglass_top</span>
              {t('combat.nextTurnSoon', 'Next turn in a moment: {{name}}', { name: currentTurn?.name })}
            </div>
          )}
          {!isMyTurn && !combatOver && currentTurn?.type !== 'player' && !isAwaitingAiTurn && (
            <div className="text-center py-3 text-[12px] text-on-surface-variant rounded-sm border border-outline-variant/10 bg-surface-container/20">
              <span className="material-symbols-outlined text-sm mr-1 animate-spin">sync</span>
              {currentTurn?.name} {t('combat.isActing', 'is acting...')}
            </div>
          )}

          {combatOver && (
            <div className="text-center py-3 rounded-sm border border-outline-variant/10 bg-surface-container/20">
              <div className="text-[11px] text-on-surface-variant">
                {combat.round} {t('combat.roundsPlural', 'rounds')} — {enemies.filter((e) => e.isDefeated).length}/{enemies.length} {t('combat.enemiesDefeated', 'enemies defeated')}
              </div>
              {isMultiplayer && !isHost && (
                <div className="text-[10px] text-outline mt-2">
                  {t('combat.hostWillEnd', 'The host will end combat...')}
                </div>
              )}
            </div>
          )}
        </div>

        <CombatantsList
          combatants={combat.combatants}
          currentTurn={currentTurn}
          onHoverCombatant={setHoveredCombatantId}
          t={t}
        />

        {/* Column 3: Combat Log */}
        <div className="min-w-0 space-y-3">
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1 pb-1">
            {t('combat.battleProgress', 'Battle Progress')}
          </div>
          {combatLog.length > 0 && (
            <div className="space-y-1 max-h-[480px] overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/10 bg-surface-container/20 p-2">
              {combatLog.map((entry) => (
                <CombatLogEntry key={entry.id} entry={entry} t={t} />
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {combatLog.length === 0 && combat.log.length > 0 && (
            <div className="space-y-1 max-h-[480px] overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/10 bg-surface-container/20 p-2">
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
