import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MANOEUVRES } from '../../data/wfrpCombat';
import { useCombatAudio } from '../../hooks/useCombatAudio';
import { useAI } from '../../hooks/useAI';
import { useSettings } from '../../contexts/SettingsContext';
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
  info: { border: '#74c0fc', bg: 'rgba(116,192,252,0.08)' },
  round: { border: '#48474a', bg: 'transparent' },
};

const AI_TURN_DELAY_MS = 2500;

function formatSignedNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

function isCustomAttackManoeuvre(manoeuvreKey) {
  return Boolean(manoeuvreKey && MANOEUVRES[manoeuvreKey]?.type === 'offensive');
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

function buildCombatLogDetails(result, t) {
  if (!result) return [];

  const details = [];

  if (result.customDescription) {
    details.push(`${t('combat.logDescription', 'Opis')}: ${result.customDescription}`);
  }

  if (result.effectDescription) {
    details.push(`${t('combat.logEffect', 'Efekt')}: ${result.effectDescription}`);
  }

  if (result.attackBreakdown && result.rolls?.[0]) {
    const attackRoll = result.rolls.find((roll) => roll.side === 'attacker') || result.rolls[0];
    details.push(
      `${t('combat.logAttack', 'Atak')}: ${t('combat.logRoll', 'rzut')} ${attackRoll.roll} ${t('common.vs', 'vs')} ${result.attackBreakdown.target}` +
      ` | ${t('combat.logBase', 'bazowe')} ${result.attackBreakdown.baseTarget}` +
      ` | ${t('combat.logAdvantage', 'przewaga')} ${formatSignedNumber(result.attackBreakdown.advantageBonus || 0)}` +
      ` | ${t('combat.logCreativity', 'kreatywność')} ${formatSignedNumber(result.attackBreakdown.creativityBonus || 0)}` +
      ` | ${t('combat.logSL', 'SL')} ${formatSignedNumber(attackRoll.sl || 0)}`
    );
  }

  if (result.defenseBreakdown && result.rolls?.length) {
    const defenseRoll = result.rolls.find((roll) => roll.side === 'defender');
    if (defenseRoll) {
      details.push(
        `${t('combat.logDefense', 'Obrona')}: ${t('combat.logRoll', 'rzut')} ${defenseRoll.roll} ${t('common.vs', 'vs')} ${result.defenseBreakdown.target}` +
        ` | ${t('combat.logBase', 'bazowe')} ${result.defenseBreakdown.baseTarget}` +
        ` | ${t('combat.logDefendBonus', 'obrona')} ${formatSignedNumber(result.defenseBreakdown.defendBonus || 0)}` +
        ` | ${t('combat.logSL', 'SL')} ${formatSignedNumber(defenseRoll.sl || 0)}`
      );
    }
  }

  if (result.castBreakdown && result.rolls?.length) {
    const castRoll = result.rolls.find((roll) => roll.side === 'caster') || result.rolls[0];
    details.push(
      `${t('combat.logCast', 'Magia')}: ${t('combat.logRoll', 'rzut')} ${castRoll.roll} ${t('common.vs', 'vs')} ${result.castBreakdown.target}` +
      ` | ${t('combat.logBase', 'bazowe')} ${result.castBreakdown.baseTarget}` +
      ` | ${t('combat.logSL', 'SL')} ${formatSignedNumber(castRoll.sl || 0)}`
    );
  }

  if (result.checkBreakdown && result.rolls?.length) {
    const checkRoll = result.rolls[0];
    details.push(
      `${t('combat.logFlee', 'Ucieczka')}: ${t('combat.logRoll', 'rzut')} ${checkRoll.roll} ${t('common.vs', 'vs')} ${result.checkBreakdown.target}` +
      ` | ${t('combat.logBase', 'bazowe')} ${result.checkBreakdown.baseTarget}` +
      ` | ${t('combat.logSL', 'SL')} ${formatSignedNumber(checkRoll.sl || 0)}`
    );
  }

  if (result.damageBreakdown?.willpowerBonus != null) {
    details.push(
      `${t('combat.logDamage', 'Obrażenia')}: ${t('combat.logWpBonus', 'WPB')} ${result.damageBreakdown.willpowerBonus}` +
      ` + ${t('combat.logTotalSL', 'suma SL')} ${formatSignedNumber(result.damageBreakdown.totalSL || 0)}` +
      ` - ${t('combat.logTB', 'TB')} ${result.damageBreakdown.toughnessBonus}` +
      ` = ${result.damageBreakdown.totalDamage}`
    );
  } else if (result.damageBreakdown?.formula) {
    const critChunk = result.damageBreakdown.criticalBonusDamage
      ? ` + ${t('combat.logCrit', 'kryt')} ${result.damageBreakdown.criticalBonusDamage}`
      : '';
    const minOneChunk = result.minimumDamageApplied
      ? ` (${t('combat.logMinOne', 'minimum 1')})`
      : '';
    details.push(
      `${t('combat.logDamage', 'Obrażenia')}: ${result.weaponName || t('combat.logWeapon', 'Broń')}` +
      ` (${result.damageBreakdown.formula} => ${result.damageBreakdown.total})` +
      ` + ${t('combat.logNetSL', 'net SL')} ${formatSignedNumber(result.damageBreakdown.netSL || 0)}` +
      `${critChunk}` +
      ` - ${t('combat.logTB', 'TB')} ${result.damageBreakdown.toughnessBonus}` +
      ` - ${t('combat.logAP', 'AP')} ${result.damageBreakdown.armourPoints}` +
      ` = ${result.damageBreakdown.totalDamage}${minOneChunk}`
    );
  }

  return details;
}

function AnimatedTextSegment({
  text,
  startIndex,
  visibleCount,
  className = '',
  style,
}) {
  const revealedChars = Math.max(0, Math.min(text.length, visibleCount - startIndex));
  const visibleText = text.slice(0, revealedChars);

  if (!visibleText) return null;

  return (
    <span className={className} style={style}>
      {visibleText.split('').map((char, index) => (
        <span
          key={`${startIndex}_${index}`}
          className="combat-log-letter"
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}

function AnimatedCombatLogText({ entry }) {
  const textSegments = useMemo(() => {
    const segments = [
      {
        key: 'actor',
        text: entry.actor || '',
        className: 'font-bold',
        style: { color: entry.actorColor || '#fffbfe' },
      },
    ];

    if (entry.action) {
      segments.push({
        key: 'action',
        text: ` ${entry.action} `,
        className: 'text-on-surface-variant',
      });
    }

    if (entry.target) {
      segments.push({
        key: 'target',
        text: entry.target,
        className: 'font-bold',
        style: { color: entry.targetColor || '#fffbfe' },
      });
    }

    let cursor = 0;
    return segments.map((segment) => {
      const mapped = {
        ...segment,
        startIndex: cursor,
      };
      cursor += segment.text.length;
      return mapped;
    });
  }, [entry]);

  const totalChars = textSegments.reduce((sum, segment) => sum + segment.text.length, 0);
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const [visibleCount, setVisibleCount] = useState(prefersReducedMotion ? totalChars : 0);
  const textRevealComplete = visibleCount >= totalChars;

  useEffect(() => {
    if (prefersReducedMotion) {
      setVisibleCount(totalChars);
      return undefined;
    }

    setVisibleCount(0);
    if (!totalChars) return undefined;

    const timer = window.setInterval(() => {
      setVisibleCount((current) => {
        if (current >= totalChars) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 18);

    return () => window.clearInterval(timer);
  }, [entry.id, totalChars, prefersReducedMotion]);

  return (
    <>
      {textSegments.map((segment) => (
        <AnimatedTextSegment
          key={`${entry.id}_${segment.key}`}
          text={segment.text}
          startIndex={segment.startIndex}
          visibleCount={visibleCount}
          className={segment.className}
          style={segment.style}
        />
      ))}
      {entry.criticalHit && textRevealComplete && (
        <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded-sm bg-amber-400/15 text-amber-300 font-bold text-[11px] uppercase tracking-wide animate-fade-in">
          {entry.criticalLabel || 'Critical Hit'}
        </span>
      )}
      {entry.damage != null && textRevealComplete && (
        <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded-sm bg-error/20 text-error font-bold text-[11px] tabular-nums animate-fade-in">
          -{entry.damage}
        </span>
      )}
      {entry.location && textRevealComplete && (
        <span className="ml-1.5 text-[10px] text-on-surface-variant px-1.5 py-0.5 bg-surface-container rounded-sm animate-fade-in">
          {entry.location}
        </span>
      )}
      {entry.critName && textRevealComplete && (
        <div className="mt-0.5 text-[11px] text-tertiary font-bold animate-fade-in">
          ⚡ {entry.critName}{entry.critEffect ? ` - ${entry.critEffect}` : ''}
        </div>
      )}
    </>
  );
}

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
        {entry.type === 'hit' ? 'swords' : entry.type === 'critical' ? 'local_fire_department' : entry.type === 'miss' ? 'close' : entry.type === 'fled' ? 'exit_to_app' : entry.type === 'defeat' ? 'skull' : entry.type === 'info' ? 'shield' : 'info'}
      </span>
      <div className="flex-1 min-w-0 text-[12px] leading-snug">
        <AnimatedCombatLogText entry={entry} />
        {entry.details?.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {entry.details.map((detail, index) => (
              <div key={`${entry.id}_detail_${index}`} className="text-[10px] text-outline-variant leading-snug font-mono break-words">
                {detail}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CombatPanel({
  combat, dispatch, onEndCombat, onSurrender, character,
  isMultiplayer = false, myPlayerId, onSendManoeuvre, onHostResolve, isHost = false, mpCharacters,
  gameState,
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { generateCombatCommentary } = useAI();
  const [selectedManoeuvre, setSelectedManoeuvre] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [customDescription, setCustomDescription] = useState('');
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [combatLog, setCombatLog] = useState([]);
  const [isAwaitingAiTurn, setIsAwaitingAiTurn] = useState(false);
  const logEndRef = useRef(null);
  const lastProcessedTsRef = useRef(null);
  const commentaryCombatKeyRef = useRef('');
  const lastCommentaryRoundRef = useRef(null);
  const commentaryInFlightRef = useRef(false);
  const combatAudio = useCombatAudio(combat);

  const currentTurn = getCurrentTurnCombatant(combat);
  const isMyTurn = isMultiplayer
    ? currentTurn?.id === myPlayerId
    : currentTurn?.type === 'player';
  const combatOver = isCombatOver(combat);
  const canControl = isMultiplayer ? isHost : true;
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

  useEffect(() => {
    if (commentaryCombatKeyRef.current !== combatInstanceKey) {
      commentaryCombatKeyRef.current = combatInstanceKey;
      lastCommentaryRoundRef.current = null;
      commentaryInFlightRef.current = false;
    }
  }, [combatInstanceKey]);

  useEffect(() => {
    if (!combat.active || combatOver) return;
    if (isMultiplayer && !isHost) return;
    if (combatCommentaryFrequency <= 0) return;
    if (combat.round <= 0 || combat.round % combatCommentaryFrequency !== 0) return;
    if (lastCommentaryRoundRef.current === combat.round || commentaryInFlightRef.current) return;

    lastCommentaryRoundRef.current = combat.round;
    commentaryInFlightRef.current = true;

    const recentLogEntries = combatLog
      .map(summarizeLogEntry)
      .filter(Boolean)
      .slice(-4);

    generateCombatCommentary(combat, {
      gameState,
      recentResults: combat.lastResults || [],
      recentLogEntries,
    }).then((commentary) => {
      if (!commentary?.content) return;

      const ts = Date.now();
      const message = {
        id: `msg_${ts}_combat_commentary_${combat.round}`,
        role: 'system',
        subtype: 'combat_commentary',
        content: commentary.content,
        dialogueSegments: commentary.dialogueSegments || [],
        round: combat.round,
        timestamp: ts,
      };

      if (isMultiplayer) {
        onHostResolve?.(combat, { chatMessages: [message] });
      } else {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: message,
        });
      }
    }).catch((err) => {
      console.warn('[CombatPanel] Combat commentary failed:', err.message);
    }).finally(() => {
      commentaryInFlightRef.current = false;
    });
  }, [
    combat,
    combat.active,
    combat.lastResults,
    combat.round,
    combatCommentaryFrequency,
    combatLog,
    combatOver,
    dispatch,
    generateCombatCommentary,
    isHost,
    isMultiplayer,
    onHostResolve,
  ]);

  // Auto-resolve enemy turns when the current combatant is not a player.
  // Fixes deadlock when enemies win initiative or are first in a new round.
  useEffect(() => {
    if (combatOver) return;
    if (isMultiplayer && !isHost) return;
    const current = getCurrentTurnCombatant(combat);
    if (!current || current.type === 'player') {
      setIsAwaitingAiTurn(false);
      return;
    }

    setIsAwaitingAiTurn(true);

    // Give the player a short beat before AI takes over.
    const timer = setTimeout(() => {
      setIsAwaitingAiTurn(false);
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
    }, AI_TURN_DELAY_MS);
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
    if (man.type !== 'offensive') {
      setCustomDescription('');
    }
    if (man.type === 'defensive' || man.modifiers.flee) {
      setSelectedTarget(null);
    } else if (enemies.filter((e) => !e.isDefeated).length === 1) {
      setSelectedTarget(enemies.find((e) => !e.isDefeated)?.id);
    }
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
      onSendManoeuvre?.(selectedManoeuvre, selectedTarget, customDescription.trim());
      setSelectedManoeuvre(null);
      setSelectedTarget(null);
      setCustomDescription('');
      return;
    }

    const actorId = isMultiplayer ? myPlayerId : 'player';
    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, actorId, selectedManoeuvre, selectedTarget, { customDescription }
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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] gap-3 items-start">
        <div className="space-y-3 pt-1">
          {/* Player Actions — my turn */}
          {isMyTurn && !combatOver && (
            <div className="space-y-3">
              <div className="text-[11px] font-label uppercase tracking-widest text-primary">
                {t('combat.yourTurn', 'Your Turn')} — {t('combat.chooseManoeuvre', 'Choose Manoeuvre')}
              </div>
              <div className="grid grid-cols-2 gap-2">
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
                    <span className="font-bold">{t(`combat.manoeuvres.${key}`, man.name)}</span>
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

              {isCustomAttackManoeuvre(selectedManoeuvre) && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-on-surface-variant">
                    {t('combat.customAttackLabel', 'Describe your attack')}
                  </label>
                  <textarea
                    value={customDescription}
                    onChange={(event) => setCustomDescription(event.target.value)}
                    rows={3}
                    placeholder={t('combat.customAttackPlaceholder', 'Describe how you strike to earn creativity bonus to the attack roll.')}
                    className="w-full px-3 py-2 rounded-sm border border-outline-variant/15 bg-surface-container/40 text-[12px] text-on-surface placeholder:text-outline-variant/70 focus:outline-none focus:border-primary/30 resize-y min-h-[88px]"
                  />
                  <div className="text-[10px] text-outline-variant">
                    {t('combat.customAttackHint', 'A richer, more tactical description can grant extra creativity to the attack roll.')}
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
            <div className="text-center py-3 text-[12px] text-on-surface-variant rounded-sm border border-outline-variant/10 bg-surface-container/20">
              <span className="material-symbols-outlined text-sm mr-1 animate-pulse">hourglass_top</span>
              {t('combat.waitingFor', 'Waiting for {{name}}...', { name: currentTurn?.name })}
            </div>
          )}

          {/* Enemy/ally acting indicator */}
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

          {/* Combat Over */}
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

        <div className="min-w-0">
          {/* Combat Log */}
          {combatLog.length > 0 && (
            <div className="space-y-1 max-h-[420px] overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/10 bg-surface-container/20 p-2">
              {combatLog.slice(-10).map((entry) => (
                <CombatLogEntry key={entry.id} entry={entry} />
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {/* Old combat.log fallback (first round before any actions) */}
          {combatLog.length === 0 && combat.log.length > 0 && (
            <div className="space-y-1 max-h-[420px] overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/10 bg-surface-container/20 p-2">
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
