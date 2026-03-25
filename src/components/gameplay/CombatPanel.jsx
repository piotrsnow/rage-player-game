import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MANOEUVRES } from '../../data/wfrpCombat';
import {
  resolveManoeuvre,
  advanceTurn,
  getCurrentTurnCombatant,
  isCombatOver,
  resolveEnemyTurns,
  endCombat,
  surrenderCombat,
  endMultiplayerCombat,
  surrenderMultiplayerCombat,
} from '../../services/combatEngine';
import CombatCanvas from './CombatCanvas';

const MANOEUVRE_ICONS = {
  attack: 'swords',
  rangedAttack: 'gps_fixed',
  dodge: 'shield',
  feint: 'swap_horiz',
  charge: 'directions_run',
  flee: 'exit_to_app',
  castSpell: 'auto_awesome',
  defend: 'security',
};

const LOG_COLORS = {
  hit: { border: '#ff6e84', bg: 'rgba(255,110,132,0.06)' },
  critical: { border: '#ffefd5', bg: 'rgba(255,239,213,0.06)' },
  miss: { border: '#48474a', bg: 'rgba(72,71,74,0.06)' },
  fled: { border: '#c59aff', bg: 'rgba(197,154,255,0.06)' },
  defeat: { border: '#ff6e84', bg: 'rgba(255,110,132,0.08)' },
  round: { border: '#48474a', bg: 'transparent' },
};

function CombatLogEntry({ entry }) {
  if (!entry) return null;
  const style = LOG_COLORS[entry.type] || LOG_COLORS.miss;

  if (entry.type === 'round') {
    return (
      <div className="flex items-center gap-3 py-1.5">
        <div className="flex-1 h-px bg-outline-variant/20" />
        <span className="text-[11px] text-outline-variant font-label uppercase tracking-widest shrink-0">
          {entry.text}
        </span>
        <div className="flex-1 h-px bg-outline-variant/20" />
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-sm animate-fade-in"
      style={{ borderLeft: `3px solid ${style.border}`, background: style.bg }}
    >
      <span className="material-symbols-outlined text-sm mt-0.5 shrink-0" style={{ color: style.border }}>
        {entry.type === 'hit' ? 'swords' : entry.type === 'critical' ? 'local_fire_department' : entry.type === 'miss' ? 'close' : entry.type === 'fled' ? 'exit_to_app' : entry.type === 'defeat' ? 'skull' : 'info'}
      </span>
      <div className="flex-1 min-w-0 text-[12px] leading-snug">
        <span className="font-bold" style={{ color: entry.actorColor || '#fffbfe' }}>
          {entry.actor}
        </span>
        {entry.action && (
          <span className="text-on-surface-variant"> {entry.action} </span>
        )}
        {entry.target && (
          <span className="font-bold" style={{ color: entry.targetColor || '#fffbfe' }}>
            {entry.target}
          </span>
        )}
        {entry.damage != null && (
          <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded-sm bg-error/20 text-error font-bold text-[11px] tabular-nums">
            -{entry.damage}
          </span>
        )}
        {entry.location && (
          <span className="ml-1.5 text-[10px] text-on-surface-variant px-1.5 py-0.5 bg-surface-container rounded-sm">
            {entry.location}
          </span>
        )}
        {entry.critName && (
          <div className="mt-0.5 text-[11px] text-tertiary font-bold">
            ⚡ {entry.critName}{entry.critEffect ? ` — ${entry.critEffect}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CombatPanel({
  combat, dispatch, onEndCombat, onSurrender, character,
  isMultiplayer = false, myPlayerId, onSendManoeuvre, onHostResolve, isHost = false, mpCharacters,
}) {
  const { t } = useTranslation();
  const [selectedManoeuvre, setSelectedManoeuvre] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [combatLog, setCombatLog] = useState([]);
  const logEndRef = useRef(null);
  const lastProcessedTsRef = useRef(null);

  const currentTurn = getCurrentTurnCombatant(combat);
  const isMyTurn = isMultiplayer
    ? currentTurn?.id === myPlayerId
    : currentTurn?.type === 'player';
  const combatOver = isCombatOver(combat);
  const canControl = isMultiplayer ? isHost : true;

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
    return Object.entries(MANOEUVRES).filter(([key]) => {
      if (key === 'castSpell' && !charForSkills?.skills?.['Channelling']) return false;
      return true;
    });
  }, [myCombatant, character]);

  const isActorFriendly = (actorName) => {
    return friendlies.some((c) => c.name === actorName);
  };

  const addLogEntry = (entry) => {
    setCombatLog((prev) => [...prev.slice(-19), entry]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
  }, [combat.round, t]);

  // Auto-resolve enemy turns when the current combatant is not a player.
  // Fixes deadlock when enemies win initiative or are first in a new round.
  useEffect(() => {
    if (combatOver) return;
    if (isMultiplayer && !isHost) return;
    const current = getCurrentTurnCombatant(combat);
    if (!current || current.type === 'player') return;

    const timer = setTimeout(() => {
      const { combat: afterEnemies, results: enemyResults } = resolveEnemyTurns(combat);
      for (const er of enemyResults) {
        if (!isMultiplayer) dispatchCombatChatMessage(er);
        addResultToLog(er);
      }
      if (isMultiplayer) {
        afterEnemies.lastResults = enemyResults;
        afterEnemies.lastResultsTs = Date.now();
        onHostResolve?.(afterEnemies);
      } else {
        dispatch({ type: 'UPDATE_COMBAT', payload: afterEnemies });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [combat.turnIndex, combat.round, combatOver, isMultiplayer, isHost]);

  // Non-host players: consume synced combat results from COMBAT_SYNC
  useEffect(() => {
    if (!combat.lastResults?.length || !combat.lastResultsTs) return;
    if (combat.lastResultsTs === lastProcessedTsRef.current) return;
    if (!isMultiplayer || isHost) return;
    lastProcessedTsRef.current = combat.lastResultsTs;
    for (const r of combat.lastResults) {
      addResultToLog(r);
    }
  }, [combat.lastResultsTs, isMultiplayer, isHost]);

  const handleManoeuvreSelect = (key) => {
    setSelectedManoeuvre(key);
    const man = MANOEUVRES[key];
    if (man.type === 'defensive' || man.modifiers.flee) {
      setSelectedTarget(null);
    } else if (enemies.filter((e) => !e.isDefeated).length === 1) {
      setSelectedTarget(enemies.find((e) => !e.isDefeated)?.id);
    }
  };

  const addResultToLog = (result) => {
    if (!result) return;
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
        damage: result.damage,
        location: result.hitLocation || '',
        actorColor,
        targetColor,
        id: `hit_${uid}`,
      });
      if (result.criticalWound) {
        addLogEntry({
          type: 'critical',
          actor: result.targetName || '?',
          action: '',
          target: '',
          critName: result.criticalWound.name || '',
          critEffect: result.criticalWound.effect || '',
          actorColor: targetColor,
          id: `crit_${uid}`,
        });
      }
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
        actorColor,
        targetColor,
        id: `miss_${uid}`,
      });
    } else if (result.outcome === 'fled') {
      addLogEntry({
        type: 'fled',
        actor: result.actor,
        action: t('combat.fled', 'Fled!'),
        target: '',
        actorColor,
        id: `fled_${uid}`,
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
          content: t('combat.chatHit', {
            actor: result.actor,
            target: result.targetName || '?',
            damage: result.damage,
            location: result.hitLocation || '',
          }),
          timestamp: ts,
        },
      });
      if (result.criticalWound) {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `msg_${ts}_crit_${uid()}`,
            role: 'system',
            subtype: 'combat_critical',
            content: t('combat.chatCritical', {
              target: result.targetName || '?',
              wound: result.criticalWound.name || '',
            }),
            timestamp: ts,
          },
        });
      }
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
    const man = MANOEUVRES[selectedManoeuvre];
    const needsTarget = man.type === 'offensive' || man.type === 'magic';
    if (needsTarget && !selectedTarget) return;

    if (isMultiplayer && !isHost) {
      onSendManoeuvre?.(selectedManoeuvre, selectedTarget);
      setSelectedManoeuvre(null);
      setSelectedTarget(null);
      return;
    }

    const actorId = isMultiplayer ? myPlayerId : 'player';
    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, actorId, selectedManoeuvre, selectedTarget
    );
    setSelectedManoeuvre(null);
    setSelectedTarget(null);
    dispatchCombatChatMessage(result);
    addResultToLog(result);
    const allResults = result ? [result] : [];

    let finalCombat = advanceTurn(updatedCombat);

    if (!isCombatOver(finalCombat)) {
      const currentAfterAdvance = getCurrentTurnCombatant(finalCombat);
      if (currentAfterAdvance && currentAfterAdvance.type !== 'player') {
        const { combat: afterEnemies, results: enemyResults } = resolveEnemyTurns(finalCombat);
        finalCombat = afterEnemies;
        for (const er of enemyResults) {
          dispatchCombatChatMessage(er);
          addResultToLog(er);
          allResults.push(er);
        }
      }
    }

    if (isMultiplayer) {
      finalCombat.lastResults = allResults;
      finalCombat.lastResultsTs = Date.now();
      onHostResolve?.(finalCombat);
    } else {
      dispatch({ type: 'UPDATE_COMBAT', payload: finalCombat });
    }
  };

  const handleHostResolveManoeuvre = (fromPlayerId, manoeuvre, targetId) => {
    if (!isHost || !isMultiplayer) return;

    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, fromPlayerId, manoeuvre, targetId
    );
    addResultToLog(result);
    const allResults = result ? [result] : [];

    let finalCombat = advanceTurn(updatedCombat);

    if (!isCombatOver(finalCombat)) {
      const currentAfterAdvance = getCurrentTurnCombatant(finalCombat);
      if (currentAfterAdvance && currentAfterAdvance.type !== 'player') {
        const { combat: afterEnemies, results: enemyResults } = resolveEnemyTurns(finalCombat);
        finalCombat = afterEnemies;
        for (const er of enemyResults) {
          addResultToLog(er);
          allResults.push(er);
        }
      }
    }

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
        combatOver={combatOver}
      />

      {/* Player Actions — my turn */}
      {isMyTurn && !combatOver && (
        <div className="space-y-3 pt-1">
          <div className="text-[11px] font-label uppercase tracking-widest text-primary">
            {t('combat.yourTurn', 'Your Turn')} — {t('combat.chooseManoeuvre', 'Choose Manoeuvre')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {availableManoeuvres.map(([key, man]) => (
              <button
                key={key}
                onClick={() => handleManoeuvreSelect(key)}
                className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-sm border text-[11px] transition-all ${
                  selectedManoeuvre === key
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container/60'
                }`}
              >
                <span className="material-symbols-outlined text-base">{MANOEUVRE_ICONS[key] || 'help'}</span>
                <span className="font-bold">{man.name}</span>
              </button>
            ))}
          </div>

          {/* Target Selection (fallback) */}
          {selectedManoeuvre && (MANOEUVRES[selectedManoeuvre]?.type === 'offensive' || MANOEUVRES[selectedManoeuvre]?.type === 'magic') && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-on-surface-variant">
                {t('combat.selectTarget', 'Select Target')}:
              </div>
              <div className="flex gap-2 flex-wrap">
                {enemies.filter((e) => !e.isDefeated).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedTarget(e.id)}
                    className={`px-3 py-1.5 rounded-sm border text-[11px] font-bold transition-all ${
                      selectedTarget === e.id
                        ? 'bg-error/15 text-error border-error/30'
                        : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-error/20'
                    }`}
                  >
                    {e.name} ({e.wounds}/{e.maxWounds})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Execute Button */}
          <button
            onClick={handleExecute}
            disabled={!selectedManoeuvre || ((MANOEUVRES[selectedManoeuvre]?.type === 'offensive' || MANOEUVRES[selectedManoeuvre]?.type === 'magic') && !selectedTarget)}
            className="w-full px-4 py-2.5 text-[12px] font-bold uppercase tracking-widest bg-error/15 text-error border border-error/20 rounded-sm hover:bg-error/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t('combat.execute', 'Execute')}
          </button>
        </div>
      )}

      {/* Waiting for another player (MP) */}
      {isMultiplayer && !isMyTurn && !combatOver && currentTurn?.type === 'player' && (
        <div className="text-center py-3 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-sm mr-1 animate-pulse">hourglass_top</span>
          {t('combat.waitingFor', 'Waiting for {{name}}...', { name: currentTurn?.name })}
        </div>
      )}

      {/* Enemy/ally acting indicator */}
      {!isMyTurn && !combatOver && currentTurn?.type !== 'player' && (
        <div className="text-center py-3 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-sm mr-1 animate-spin">sync</span>
          {currentTurn?.name} {t('combat.isActing', 'is acting...')}
        </div>
      )}

      {/* Combat Over */}
      {combatOver && (
        <div className="text-center py-2">
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

      {/* Combat Log */}
      {combatLog.length > 0 && (
        <div className="space-y-1 max-h-[220px] overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/10 bg-surface-container/20 p-2">
          {combatLog.slice(-10).map((entry) => (
            <CombatLogEntry key={entry.id} entry={entry} />
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* Old combat.log fallback (first round before any actions) */}
      {combatLog.length === 0 && combat.log.length > 0 && (
        <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/10 bg-surface-container/20 p-2">
          {combat.log.slice(-5).map((entry, i) => (
            <div key={`legacy_${i}`} className="text-[11px] text-outline-variant leading-snug px-2 py-1">
              {entry}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
