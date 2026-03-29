import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MANOEUVRES, MELEE_RANGE } from '../../data/wfrpCombat';
import { useCombatAudio } from '../../hooks/useCombatAudio';
import { useAI } from '../../hooks/useAI';
import { useSettings } from '../../contexts/SettingsContext';
import {
  resolveManoeuvre,
  advanceTurn,
  getCurrentTurnCombatant,
  isCombatOver,
  isPlayerWinning,
  resolveEnemyTurns,
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
        <span className="inline-flex items-center ml-1.5 px-2 py-1 rounded-sm bg-error/20 text-error font-black text-sm uppercase tracking-wider tabular-nums animate-fade-in">
          -{entry.damage}
        </span>
      )}
      {entry.highlightText && textRevealComplete && (
        <span className={`inline-flex items-center ml-1.5 px-2 py-1 rounded-sm font-black text-sm uppercase tracking-wider animate-fade-in ${
          entry.highlightTone === 'miss'
            ? 'bg-surface-container-high text-on-surface'
            : 'bg-primary/15 text-primary'
        }`}>
          {entry.highlightText}
        </span>
      )}
      {entry.location && textRevealComplete && (
        <span className="ml-1.5 text-[10px] text-on-surface-variant px-1.5 py-0.5 bg-surface-container rounded-sm animate-fade-in">
          {entry.location}
        </span>
      )}
      {entry.critName && textRevealComplete && (
        <div className="mt-0.5 text-[11px] text-tertiary font-bold animate-fade-in">
          ⚡ {entry.critName}
        </div>
      )}
    </>
  );
}

function renderDetailWithBoldValues(text, key) {
  const parts = text.split(/([-+]?\d+)/g);
  return parts.map((part, i) =>
    /^[-+]?\d+$/.test(part)
      ? <span key={`${key}_${i}`} className="font-bold text-on-surface">{part}</span>
      : part
  );
}

function buildCombatLogTooltipContent(entry, t) {
  if (!entry) return null;

  const detailLines = [...(entry.details || [])];

  if (entry.critEffect) {
    detailLines.push(`${t('combat.logCriticalEffect', 'Efekt krytyczny')}: ${entry.critEffect}`);
  }

  if (!detailLines.length) return null;

  return (
    <div className="space-y-1.5">
      {detailLines.map((detail, index) => (
        <div
          key={`${entry.id}_tooltip_${index}`}
          className="text-[11px] leading-snug break-words"
        >
          {renderDetailWithBoldValues(detail, `${entry.id}_tooltip_${index}`)}
        </div>
      ))}
    </div>
  );
}

function CombatLogEntry({ entry, t }) {
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

  const tooltipContent = buildCombatLogTooltipContent(entry, t);

  const content = (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded-sm animate-fade-in transition-colors ${
        tooltipContent ? 'hover:bg-surface-container/30' : ''
      }`}
      style={{ borderLeft: `3px solid ${style.border}`, background: style.bg }}
    >
      <span className="material-symbols-outlined text-sm mt-0.5 shrink-0" style={{ color: style.border }}>
        {entry.type === 'hit' ? 'swords' : entry.type === 'critical' ? 'local_fire_department' : entry.type === 'miss' ? 'close' : entry.type === 'fled' ? 'exit_to_app' : entry.type === 'defeat' ? 'skull' : entry.type === 'info' ? 'shield' : 'info'}
      </span>
      <div className="flex-1 min-w-0 text-[12px] leading-snug">
        <AnimatedCombatLogText entry={entry} />
      </div>
      {tooltipContent && (
        <span className="material-symbols-outlined text-[14px] text-outline-variant/70 mt-0.5 shrink-0">
          info
        </span>
      )}
    </div>
  );

  if (!tooltipContent) {
    return content;
  }

  return (
    <Tooltip content={tooltipContent} className="block w-full">
      {content}
    </Tooltip>
  );
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
  const lastProcessedTsRef = useRef(null);
  const commentaryCombatKeyRef = useRef('');
  const lastCommentaryRoundRef = useRef(null);
  const commentaryInFlightRef = useRef(false);
  const commentaryRequestSeqRef = useRef(0);
  const activeCommentaryRequestIdRef = useRef(0);
  const latestCombatMetaRef = useRef({
    active: combat.active,
    combatOver,
    round: combat.round,
    combatInstanceKey,
  });
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
    return Object.entries(MANOEUVRES).filter(([key]) => {
      if (key === 'castSpell' && !charForSkills?.skills?.['Channelling']) return false;
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

  const invalidateCommentaryRequests = useCallback(() => {
    activeCommentaryRequestIdRef.current = ++commentaryRequestSeqRef.current;
    commentaryInFlightRef.current = false;
  }, []);

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

  useEffect(() => {
    if (commentaryCombatKeyRef.current !== combatInstanceKey) {
      commentaryCombatKeyRef.current = combatInstanceKey;
      lastCommentaryRoundRef.current = null;
      invalidateCommentaryRequests();
    }
  }, [combatInstanceKey, invalidateCommentaryRequests]);

  useEffect(() => {
    latestCombatMetaRef.current = {
      active: combat.active,
      combatOver,
      round: combat.round,
      combatInstanceKey,
    };
    if (!combat.active || combatOver) {
      invalidateCommentaryRequests();
    }
  }, [combat.active, combat.round, combatOver, combatInstanceKey, invalidateCommentaryRequests]);

  useEffect(() => {
    return () => {
      invalidateCommentaryRequests();
    };
  }, [invalidateCommentaryRequests]);

  useEffect(() => {
    if (!combat.active || combatOver) return;
    if (isMultiplayer && !isHost) return;
    if (combatCommentaryFrequency <= 0) return;
    if (combat.round <= 0 || combat.round % combatCommentaryFrequency !== 0) return;
    if (lastCommentaryRoundRef.current === combat.round || commentaryInFlightRef.current) return;

    lastCommentaryRoundRef.current = combat.round;
    commentaryInFlightRef.current = true;
    const requestId = ++commentaryRequestSeqRef.current;
    activeCommentaryRequestIdRef.current = requestId;
    const requestedRound = combat.round;
    const requestedCombatInstanceKey = combatInstanceKey;

    const recentLogEntries = combatLog
      .map(summarizeLogEntry)
      .filter(Boolean)
      .slice(-4);

    generateCombatCommentary(combat, {
      gameState,
      recentResults: combat.lastResults || [],
      recentLogEntries,
    }).then((commentary) => {
      const latestCombatMeta = latestCombatMetaRef.current;
      const isLatestRequest = activeCommentaryRequestIdRef.current === requestId;
      const combatStillActive = latestCombatMeta.active && !latestCombatMeta.combatOver;
      const sameCombatInstance = latestCombatMeta.combatInstanceKey === requestedCombatInstanceKey;
      const sameRound = latestCombatMeta.round === requestedRound;
      if (!isLatestRequest || !combatStillActive || !sameCombatInstance || !sameRound) return;
      if (!commentary?.content) return;

      const ts = Date.now();
      const message = {
        id: `msg_${ts}_combat_commentary_${requestedRound}`,
        role: 'system',
        subtype: 'combat_commentary',
        content: commentary.content,
        dialogueSegments: commentary.dialogueSegments || [],
        round: requestedRound,
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
      if (activeCommentaryRequestIdRef.current === requestId) {
        commentaryInFlightRef.current = false;
      }
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
    const man = MANOEUVRES[selectedManoeuvre];
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
    const man = MANOEUVRES[selectedManoeuvre];
    if (man.range !== 'melee') return false;
    const target = combat.combatants.find((c) => c.id === selectedTarget);
    if (!target || !myCombatant) return false;
    return getDistance(myCombatant, target) > MELEE_RANGE;
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
            <div className="space-y-3">
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

              {selectedManoeuvre && (MANOEUVRES[selectedManoeuvre]?.type === 'offensive' || MANOEUVRES[selectedManoeuvre]?.type === 'magic') && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-on-surface-variant">
                    {t('combat.selectTarget', 'Select Target')}:
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {enemies.filter((e) => !e.isDefeated).map((e) => {
                      const dist = myCombatant ? getDistance(myCombatant, e) : 0;
                      return (
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
                          <span className="ml-1 text-[10px] text-outline-variant font-normal">{dist}y</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedTargetOutOfMeleeRange && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-sm text-[11px] text-amber-400">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  {t('combat.outOfRange', 'Target too far for melee. Move closer or use Charge.')}
                </div>
              )}

              {isCustomAttackManoeuvre(selectedManoeuvre) && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-on-surface-variant">
                    {t('combat.customAttackLabel', 'Describe your attack')}
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSavedAttacks((current) => !current)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-surface-container/40 text-on-surface-variant border border-outline-variant/15 rounded-sm hover:border-primary/25 hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">history</span>
                      {t('combat.savedAttacksButton', 'Twoje ataki')}
                      <span className="material-symbols-outlined text-sm">
                        {showSavedAttacks ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                  </div>
                  {showSavedAttacks && (
                    <div className="rounded-sm border border-outline-variant/15 bg-surface-container/30 overflow-hidden">
                      {savedCustomAttacks.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-outline-variant/10">
                          {savedCustomAttacks.map((attack, index) => (
                            <div
                              key={`${index}_${attack}`}
                              className="flex items-start gap-2 px-2 py-2"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomDescription(attack);
                                  setShowSavedAttacks(false);
                                }}
                                className="flex-1 min-w-0 px-2 py-1.5 text-left text-[12px] text-on-surface hover:bg-primary/10 rounded-sm transition-colors"
                              >
                                {attack}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeCustomAttack(attack)}
                                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-sm text-outline-variant hover:text-error hover:bg-error/10 transition-colors"
                                aria-label={t('combat.deleteSavedAttack', 'Usuń zapisany atak')}
                                title={t('combat.deleteSavedAttack', 'Usuń zapisany atak')}
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-2.5 text-[11px] text-outline-variant">
                          {t('combat.noSavedAttacks', 'Brak zapisanych niestandardowych ataków.')}
                        </div>
                      )}
                    </div>
                  )}
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

              <button
                onClick={handleExecute}
                disabled={!selectedManoeuvre || ((MANOEUVRES[selectedManoeuvre]?.type === 'offensive' || MANOEUVRES[selectedManoeuvre]?.type === 'magic') && !selectedTarget) || selectedTargetOutOfMeleeRange}
                className="w-full px-4 py-2.5 text-[12px] font-bold uppercase tracking-widest bg-error/15 text-error border border-error/20 rounded-sm hover:bg-error/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {selectedTargetOutOfMeleeRange ? t('combat.outOfRangeShort', 'Out of range') : t('combat.execute', 'Execute')}
              </button>
            </div>
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

        {/* Column 2: Combatants List */}
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto custom-scrollbar">
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1 pb-1">
            {t('combat.combatants', 'Combatants')}
          </div>
          {combat.combatants
            .slice()
            .sort((a, b) => {
              if (a.type === 'player' && b.type !== 'player') return -1;
              if (a.type !== 'player' && b.type === 'player') return 1;
              if (a.type === 'ally' && b.type === 'enemy') return -1;
              if (a.type === 'enemy' && b.type === 'ally') return 1;
              return 0;
            })
            .map((c) => {
              const isEnemy = c.type === 'enemy';
              const isCurrent = currentTurn?.id === c.id;
              const healthPct = c.maxWounds > 0 ? c.wounds / c.maxWounds : 0;
              const barColor = healthPct > 0.5
                ? (isEnemy ? 'bg-error' : 'bg-primary')
                : healthPct > 0.25 ? 'bg-amber-500' : 'bg-error';
              const accentColor = isEnemy ? 'text-error' : 'text-primary';

              return (
                <div
                  key={c.id}
                  className={`p-2 rounded-sm border transition-colors cursor-default ${
                    isCurrent
                      ? 'border-primary/40 bg-primary/5'
                      : c.isDefeated
                        ? 'border-outline-variant/5 bg-surface-container/10 opacity-50'
                        : 'border-outline-variant/10 bg-surface-container/20 hover:bg-surface-container/30'
                  }`}
                  onMouseEnter={() => setHoveredCombatantId(c.id)}
                  onMouseLeave={() => setHoveredCombatantId(null)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isCurrent && (
                      <span className="material-symbols-outlined text-[11px] text-primary shrink-0 animate-pulse">
                        arrow_right
                      </span>
                    )}
                    <span className={`material-symbols-outlined text-[13px] shrink-0 ${accentColor}`}>
                      {isEnemy ? 'skull' : c.type === 'ally' ? 'group' : 'shield_person'}
                    </span>
                    <span className={`text-[11px] font-bold truncate ${accentColor} ${c.isDefeated ? 'line-through' : ''}`}>
                      {c.name}
                    </span>
                  </div>

                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-on-surface-variant">{t('combat.wounds', 'Wounds')}</span>
                      <span className="text-on-surface font-bold tabular-nums">
                        {c.wounds}/{c.maxWounds}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-300`}
                        style={{ width: `${Math.max(0, healthPct * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-[9px] text-on-surface-variant">
                    {c.advantage > 0 && (
                      <span>{t('combat.advantage', 'Adv')} <span className="text-primary font-bold">+{c.advantage}</span></span>
                    )}
                    {c.position != null && (
                      <span>{t('combat.position', 'Pos')} <span className="font-bold text-on-surface">{c.position}y</span></span>
                    )}
                    {c.movementAllowance > 0 && !c.isDefeated && (
                      <span>{t('combat.movementShort', 'Mov')} <span className="font-bold text-on-surface">{c.movementAllowance - (c.movementUsed || 0)}/{c.movementAllowance}</span></span>
                    )}
                  </div>

                  {(c.conditions || []).filter((cond) => cond !== 'fled' || c.isDefeated).length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {(c.conditions || []).filter((cond) => cond !== 'fled' || c.isDefeated).map((cond, i) => (
                        <span key={`${c.id}_${cond}_${i}`} className="px-1 py-0.5 rounded-sm bg-surface-container text-[8px] text-on-surface-variant uppercase tracking-wider">
                          {cond}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

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
