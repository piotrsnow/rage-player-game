import { useState, useMemo } from 'react';
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

function WoundsBar({ current, max, name, type, isMe }) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  const color = type === 'enemy' ? 'bg-error' : type === 'player' ? 'bg-primary' : 'bg-tertiary';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`text-[10px] truncate w-20 shrink-0 ${isMe ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
        {name}{isMe ? ' ★' : ''}
      </span>
      <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-on-surface-variant tabular-nums w-10 text-right shrink-0">
        {current}/{max}
      </span>
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
  const [lastResult, setLastResult] = useState(null);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);

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

  const handleManoeuvreSelect = (key) => {
    setSelectedManoeuvre(key);
    const man = MANOEUVRES[key];
    if (man.type === 'defensive' || man.modifiers.flee) {
      setSelectedTarget(null);
    } else if (enemies.filter((e) => !e.isDefeated).length === 1) {
      setSelectedTarget(enemies.find((e) => !e.isDefeated)?.id);
    }
  };

  const dispatchCombatChatMessage = (result) => {
    if (!result) return;
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
    setLastResult(result);
    setSelectedManoeuvre(null);
    setSelectedTarget(null);
    dispatchCombatChatMessage(result);

    let finalCombat = advanceTurn(updatedCombat);

    if (!isCombatOver(finalCombat)) {
      const currentAfterAdvance = getCurrentTurnCombatant(finalCombat);
      if (currentAfterAdvance && currentAfterAdvance.type !== 'player') {
        const { combat: afterEnemies, results: enemyResults } = resolveEnemyTurns(finalCombat);
        finalCombat = afterEnemies;
        for (const er of enemyResults) {
          dispatchCombatChatMessage(er);
        }
        if (enemyResults.length > 0) {
          setLastResult(enemyResults[enemyResults.length - 1]);
        }
      }
    }

    if (isMultiplayer) {
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
    setLastResult(result);
    dispatchCombatChatMessage(result);

    let finalCombat = advanceTurn(updatedCombat);

    if (!isCombatOver(finalCombat)) {
      const currentAfterAdvance = getCurrentTurnCombatant(finalCombat);
      if (currentAfterAdvance && currentAfterAdvance.type !== 'player') {
        const { combat: afterEnemies, results: enemyResults } = resolveEnemyTurns(finalCombat);
        finalCombat = afterEnemies;
        for (const er of enemyResults) {
          dispatchCombatChatMessage(er);
        }
        if (enemyResults.length > 0) {
          setLastResult(enemyResults[enemyResults.length - 1]);
        }
      }
    }

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
    <div className="space-y-4 p-3 bg-error-container/5 border border-error/20 rounded-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-error text-lg">swords</span>
          <h3 className="text-sm font-bold text-error uppercase tracking-widest">
            {t('combat.title', 'Combat')}
          </h3>
          <span className="text-[10px] text-on-surface-variant px-2 py-0.5 bg-surface-container rounded-sm">
            {t('combat.round', 'Round')} {combat.round}
          </span>
          {isMultiplayer && (
            <span className="text-[9px] text-tertiary px-2 py-0.5 bg-tertiary/10 rounded-sm uppercase tracking-widest">
              {t('combat.multiplayer', 'MP')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!combatOver && canControl && (
            <button
              onClick={() => setShowSurrenderConfirm(true)}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-outline/10 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-error/15 hover:text-error hover:border-error/20 transition-colors"
            >
              {t('combat.surrender', 'Surrender')}
            </button>
          )}
          {combatOver && canControl && (
            <button
              onClick={handleEndCombat}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-primary/15 text-primary border border-primary/20 rounded-sm hover:bg-primary/25 transition-colors"
            >
              {t('combat.endCombat', 'End Combat')}
            </button>
          )}
        </div>
      </div>

      {/* Surrender Confirmation */}
      {showSurrenderConfirm && (
        <div className="p-3 bg-error-container/10 border border-error/30 rounded-sm space-y-2">
          <p className="text-[11px] text-on-surface">
            {t('combat.surrenderConfirm', 'Are you sure? You will be at the mercy of your enemies.')}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowSurrenderConfirm(false)}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-surface-container/50 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-surface-container transition-colors"
            >
              {t('combat.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSurrender}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-error/15 text-error border border-error/30 rounded-sm hover:bg-error/25 transition-colors"
            >
              {t('combat.surrender', 'Surrender')}
            </button>
          </div>
        </div>
      )}

      {/* Initiative Tracker */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {combat.combatants.map((c, i) => (
          <div
            key={c.id}
            className={`flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] shrink-0 border transition-all ${
              c.isDefeated
                ? 'bg-surface-container/30 text-outline border-outline-variant/10 line-through opacity-40'
                : i === combat.turnIndex
                  ? 'bg-primary/15 text-primary border-primary/30 ring-1 ring-primary/20'
                  : c.type === 'enemy'
                    ? 'bg-error-container/10 text-error border-error/15'
                    : 'bg-surface-container/50 text-on-surface-variant border-outline-variant/10'
            }`}
          >
            <span className="material-symbols-outlined text-xs">
              {c.type === 'enemy' ? 'skull' : c.type === 'player' ? 'person' : 'group'}
            </span>
            <span className="font-bold">
              {c.name}
              {isMultiplayer && c.id === myPlayerId ? ' ★' : ''}
            </span>
            {c.advantage > 0 && (
              <span className="text-primary font-bold">+{c.advantage}</span>
            )}
          </div>
        ))}
      </div>

      {/* Combatant Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="text-[9px] font-label uppercase tracking-widest text-primary">
            {t('combat.allies', 'Allies')}
          </div>
          {friendlies.map((c) => (
            <WoundsBar
              key={c.id}
              current={c.wounds}
              max={c.maxWounds}
              name={c.name}
              type={c.type}
              isMe={isMultiplayer && c.id === myPlayerId}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="text-[9px] font-label uppercase tracking-widest text-error">
            {t('combat.enemies', 'Enemies')}
          </div>
          {enemies.map((c) => (
            <WoundsBar key={c.id} current={c.wounds} max={c.maxWounds} name={c.name} type="enemy" />
          ))}
        </div>
      </div>

      {/* Player Actions — my turn */}
      {isMyTurn && !combatOver && (
        <div className="space-y-3 pt-2 border-t border-outline-variant/10">
          <div className="text-[10px] font-label uppercase tracking-widest text-primary">
            {t('combat.yourTurn', 'Your Turn')} — {t('combat.chooseManoeuvre', 'Choose Manoeuvre')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {availableManoeuvres.map(([key, man]) => (
              <button
                key={key}
                onClick={() => handleManoeuvreSelect(key)}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-sm border text-[10px] transition-all ${
                  selectedManoeuvre === key
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-primary/20'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{MANOEUVRE_ICONS[key] || 'help'}</span>
                <span className="font-bold">{man.name}</span>
              </button>
            ))}
          </div>

          {/* Target Selection */}
          {selectedManoeuvre && (MANOEUVRES[selectedManoeuvre]?.type === 'offensive' || MANOEUVRES[selectedManoeuvre]?.type === 'magic') && (
            <div className="space-y-1.5">
              <div className="text-[10px] text-on-surface-variant">
                {t('combat.selectTarget', 'Select Target')}:
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {enemies.filter((e) => !e.isDefeated).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedTarget(e.id)}
                    className={`px-3 py-1.5 rounded-sm border text-[10px] font-bold transition-all ${
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
            className="w-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-error/15 text-error border border-error/20 rounded-sm hover:bg-error/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t('combat.execute', 'Execute')}
          </button>
        </div>
      )}

      {/* Waiting for another player (MP) */}
      {isMultiplayer && !isMyTurn && !combatOver && currentTurn?.type === 'player' && (
        <div className="text-center py-3 text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined text-sm mr-1 animate-pulse">hourglass_top</span>
          {t('combat.waitingFor', 'Waiting for {{name}}...', { name: currentTurn?.name })}
        </div>
      )}

      {/* Enemy/ally acting indicator */}
      {!isMyTurn && !combatOver && currentTurn?.type !== 'player' && (
        <div className="text-center py-3 text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined text-sm mr-1 animate-spin">sync</span>
          {currentTurn?.name} {t('combat.isActing', 'is acting...')}
        </div>
      )}

      {/* Combat Over */}
      {combatOver && (
        <div className="text-center py-3">
          <div className="text-sm font-bold text-primary">
            {friendlies.some((c) => !c.isDefeated)
              ? t('combat.victory', 'Victory!')
              : t('combat.defeat', 'Defeat!')}
          </div>
          <div className="text-[10px] text-on-surface-variant mt-1">
            {combat.round} {t('combat.roundsPlural', 'rounds')} — {enemies.filter((e) => e.isDefeated).length}/{enemies.length} {t('combat.enemiesDefeated', 'enemies defeated')}
          </div>
          {isMultiplayer && !isHost && (
            <div className="text-[9px] text-outline mt-2">
              {t('combat.hostWillEnd', 'The host will end combat...')}
            </div>
          )}
        </div>
      )}

      {/* Last Result */}
      {lastResult && (
        <div className="text-[10px] text-on-surface-variant bg-surface-container/40 p-2 rounded-sm border border-outline-variant/10">
          <span className="font-bold">{lastResult.actor}</span>: {lastResult.manoeuvre}
          {lastResult.outcome === 'hit' && (
            <span className="text-error"> — {lastResult.damage} {t('combat.dmgTo')} {lastResult.hitLocation}
              {lastResult.criticalWound && (
                <span className="text-tertiary font-bold"> {t('combat.critical')}: {lastResult.criticalWound.name} — {lastResult.criticalWound.effect}</span>
              )}
            </span>
          )}
          {lastResult.outcome === 'miss' && <span className="text-outline"> — {t('combat.miss')}</span>}
          {lastResult.outcome === 'fled' && <span className="text-primary"> — {t('combat.fled')}</span>}
        </div>
      )}

      {/* Combat Log (last 5 entries) */}
      <div className="max-h-24 overflow-y-auto custom-scrollbar">
        <div className="space-y-0.5">
          {combat.log.slice(-5).map((entry, i) => (
            <div key={`log_${combat.log.length - 5 + i}`} className="text-[9px] text-outline leading-tight">{entry}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
