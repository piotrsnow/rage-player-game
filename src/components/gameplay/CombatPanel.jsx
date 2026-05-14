import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { gameData } from '../../services/gameDataService';
import { useCombatAudio } from '../../hooks/useCombatAudio';
import { useAI } from '../../hooks/useAI';
import { useSettings } from '../../contexts/SettingsContext';
import { shortId } from '../../utils/ids';
import { aiService } from '../../services/ai/service';
import { rollD50 } from '../../services/gameState';
import {
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
  getRemainingMovementPoints,
  isInMeleeRange,
  getDistance,
  getOccupiedCells,
  findPath,
  pushObstacle,
} from '../../services/combatEngine';
import { getCombatMoveDurationMs } from '../../services/combatAnimationTiming';
import CombatCanvas from './CombatCanvas';
import { PROJECTILE_TOTAL_MS } from './combat/combatCanvasDraw';
import { useCombatCommentary } from '../../hooks/useCombatCommentary';
import CombatLog from './combat/CombatLog';
import CombatantsList from './combat/CombatantsList';
import CombatHeader from './combat/CombatHeader';
import { TruceConfirmDialog, SurrenderConfirmDialog } from './combat/CombatConfirmDialogs';
import CombatTurnStatus from './combat/CombatTurnStatus';
import CombatTelegraph from './combat/CombatTelegraph';
import QuickActionBar from './combat/QuickActionBar';
import InitiativeBar from './combat/InitiativeBar';
import { buildResultLogEntries, buildResultChatMessages, buildRoundEffectLogEntries } from './combat/combatLogBuilders';
import { useEnemyTurnResolver } from '../../hooks/useEnemyTurnResolver';
import { useCombatResultSync } from '../../hooks/useCombatResultSync';
import { useCombatHostResolve } from '../../hooks/useCombatHostResolve';
import { useCombatExecution } from '../../hooks/useCombatExecution';
import { useCombatKeyboard } from '../../hooks/useCombatKeyboard';
import { useCombatSprites } from '../../hooks/useCombatSprites';
import { apiClient } from '../../services/apiClient';
import { addEffect, migrateStatusStrings } from '../../../shared/domain/statusEffects.js';
import BeerDuelPanel from './combat/BeerDuelPanel';
import CardGamePanel from './combat/CardGamePanel';
import DiceGamePanel from './combat/DiceGamePanel';
import CombatDiceThrow from './combat/CombatDiceThrow';

const SKIRMISH_MODE_BEER_DUEL = 'beer_duel';
const SKIRMISH_MODE_CARD_GAME = 'card_game';
const SKIRMISH_MODE_DICE_GAME = 'dice_game';

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

function buildAiDiceLogDetails(diceResult, t) {
  if (!diceResult || typeof diceResult !== 'object') return null;
  const roll = Number(diceResult.roll);
  const total = Number(diceResult.total);
  const threshold = Number(diceResult.threshold);
  if (!Number.isFinite(roll) || !Number.isFinite(total) || !Number.isFinite(threshold)) return null;

  const attributeValue = Number(diceResult.attributeValue) || 0;
  const skillLevel = Number(diceResult.skillLevel) || 0;
  const momentumBonus = Number(diceResult.momentumBonus) || 0;
  const creativityBonus = Number(diceResult.creativityBonus) || 0;
  const margin = Number(diceResult.margin) || (total - threshold);

  const modifiers = [
    {
      label: t('gameplay.diceRollAttribute', 'Cecha'),
      value: attributeValue > 0 ? `+${attributeValue}` : `${attributeValue}`,
      color: 'text-purple-300',
    },
    {
      label: t('gameplay.diceRollSkill', 'Umiejętność'),
      value: skillLevel > 0 ? `+${skillLevel}` : `${skillLevel}`,
      color: 'text-emerald-300',
    },
  ];
  if (momentumBonus !== 0) {
    modifiers.push({
      label: t('gameplay.diceRollMomentum', 'Momentum'),
      value: momentumBonus > 0 ? `+${momentumBonus}` : `${momentumBonus}`,
      color: momentumBonus > 0 ? 'text-cyan-300' : 'text-rose-300',
    });
  }
  if (creativityBonus !== 0) {
    modifiers.push({
      label: t('gameplay.diceRollCreativity', 'Kreatywność'),
      value: creativityBonus > 0 ? `+${creativityBonus}` : `${creativityBonus}`,
      color: 'text-amber-300',
    });
  }

  const thresholdBreakdown = diceResult.thresholdBreakdown && typeof diceResult.thresholdBreakdown === 'object'
    ? {
      base: Number(diceResult.thresholdBreakdown.base) || threshold,
      final: Number(diceResult.thresholdBreakdown.final) || threshold,
      modifiers: Array.isArray(diceResult.thresholdBreakdown.modifiers)
        ? diceResult.thresholdBreakdown.modifiers
          .filter((m) => m && typeof m.value === 'number')
          .map((m) => ({ label: m.reason || t('gameplay.modifier', 'Modyfikator'), value: m.value }))
        : [],
    }
    : null;

  const rollItem = {
    kind: 'roll',
    label: t('combat.aiRollLabel', 'Test akcji'),
    roll,
    total,
    threshold,
    margin,
    success: Boolean(diceResult.success),
    criticalSuccess: roll === 1,
    criticalFailure: roll === 50 && !Boolean(diceResult.success),
    modifiers,
    ...(thresholdBreakdown ? { thresholdBreakdown } : {}),
  };

  const details = [rollItem];
  if (typeof diceResult.reasoning === 'string' && diceResult.reasoning.trim()) {
    details.push({ kind: 'effect', text: diceResult.reasoning.trim() });
  }
  return details;
}

const ACTION_ANIM_MS = 500;
const SHOVE_ANIM_MS = 750;

export default function CombatPanel({
  combat, dispatch, onEndCombat, onSurrender, onForceTruce, character,
  isMultiplayer = false, myPlayerId, onSendManoeuvre, onHostResolve, isHost = false, mpCharacters,
  gameState,
  onPersistState,
  expandedLayout = false,
  onLayoutChange,
}) {
  if (combat.mode === SKIRMISH_MODE_BEER_DUEL) {
    return (
      <BeerDuelPanel
        combat={combat}
        character={character}
        dispatch={dispatch}
        onEndCombat={onEndCombat}
        isMultiplayer={isMultiplayer}
        mpCharacters={mpCharacters}
      />
    );
  }

  if (combat.mode === SKIRMISH_MODE_CARD_GAME) {
    return (
      <CardGamePanel
        combat={combat}
        character={character}
        dispatch={dispatch}
        onEndCombat={onEndCombat}
        isMultiplayer={isMultiplayer}
        mpCharacters={mpCharacters}
      />
    );
  }

  if (combat.mode === SKIRMISH_MODE_DICE_GAME) {
    return (
      <DiceGamePanel
        combat={combat}
        character={character}
        dispatch={dispatch}
        onEndCombat={onEndCombat}
        isMultiplayer={isMultiplayer}
        mpCharacters={mpCharacters}
      />
    );
  }

  const { t } = useTranslation();
  const { settings } = useSettings();
  const { generateCombatCommentary } = useAI();
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [showTruceConfirm, setShowTruceConfirm] = useState(false);
  const [combatLog, setCombatLog] = useState([]);
  const [isAwaitingAiTurn, setIsAwaitingAiTurn] = useState(false);
  const [actionAnim, setActionAnim] = useState(null);
  const [projectileAnim, setProjectileAnim] = useState(null);
  const [tokenAnimations, setTokenAnimations] = useState({});
  const [isWalking, setIsWalking] = useState(false);
  const [scenePortalTarget, setScenePortalTarget] = useState(null);
  const [diceThrowPending, setDiceThrowPending] = useState(null);
  const diceThrowPendingRef = useRef(null);
  const tokenAnimTimers = useRef(new Map());
  const walkingRef = useRef(false);
  const combatRef = useRef(combat);
  combatRef.current = combat;
  const combatAudio = useCombatAudio(combat);

  const scheduleTokenAnim = useCallback((anims) => {
    const entries = Object.entries(anims);
    if (!entries.length) return;

    setTokenAnimations((prev) => ({ ...prev, ...anims }));

    for (const [id, anim] of entries) {
      const previousTimer = tokenAnimTimers.current.get(id);
      if (previousTimer) clearTimeout(previousTimer);

      const timer = setTimeout(() => {
        tokenAnimTimers.current.delete(id);
        setTokenAnimations((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, (anim.durationMs || 0) + 50);
      tokenAnimTimers.current.set(id, timer);
    }
  }, []);

  useEffect(() => {
    return () => tokenAnimTimers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (expandedLayout) { setScenePortalTarget(null); return; }
    const el = document.getElementById('scene-panel-container');
    setScenePortalTarget(el);
  }, [expandedLayout]);

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

  const { sprites: spriteMap, spriteSheets: sheetMap, regenerateSprite } = useCombatSprites(combat.combatants);

  const enrichedCombat = useMemo(() => {
    const enrichedCombatants = combat.combatants.map((c) => {
      const sheetUrl = sheetMap[c.id]
        || (c.spriteSheetUrl ? apiClient.resolveMediaUrl(c.spriteSheetUrl) : null);
      const legacyUrl = Object.prototype.hasOwnProperty.call(spriteMap, c.id)
        ? spriteMap[c.id]
        : (c.spriteUrl ? apiClient.resolveMediaUrl(c.spriteUrl) : null);
      return {
        ...c,
        spriteUrl: legacyUrl,
        spriteSheetUrl: sheetUrl,
      };
    });
    return { ...combat, combatants: enrichedCombatants };
  }, [combat, spriteMap, sheetMap]);

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

  const updateLogEntry = useCallback((id, patch) => {
    if (!id) return;
    setCombatLog((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }, []);

  const prevInstanceKeyRef = useRef(null);
  const prevRoundRef = useRef(combat.round);
  useEffect(() => {
    if (combatInstanceKey !== prevInstanceKeyRef.current) {
      prevInstanceKeyRef.current = combatInstanceKey;
      prevRoundRef.current = combat.round;
      setCombatLog([{
        type: 'round',
        text: `${t('combat.round', 'Round')} ${combat.round}`,
        id: `round_${combat.round}_${Date.now()}`,
      }]);
      return;
    }
    if (combat.round !== prevRoundRef.current) {
      addLogEntry({
        type: 'round',
        text: `${t('combat.round', 'Round')} ${combat.round}`,
        id: `round_${combat.round}_${Date.now()}`,
      });
      prevRoundRef.current = combat.round;
    }
  }, [combat.round, combatInstanceKey, t, addLogEntry]);

  const addResultToLog = useCallback((result) => {
    if (!result) return;
    combatAudio.playForResult(result);
    const entries = buildResultLogEntries(result, { isActorFriendly, t });
    for (const entry of entries) addLogEntry(entry);
  }, [combatAudio, isActorFriendly, t, addLogEntry]);

  const flushRoundEffectEvents = useCallback((combatState) => {
    if (!combatState?.roundEffectEvents?.length) return;
    const entries = buildRoundEffectLogEntries(combatState.roundEffectEvents, { t });
    for (const entry of entries) addLogEntry(entry);
    combatState.roundEffectEvents = [];
  }, [t, addLogEntry]);

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

  const triggerActionAnim = useCallback((actorId, targetId, type) => {
    setActionAnim({ actorId, targetId, type });
    const duration = type === 'shove' ? SHOVE_ANIM_MS : ACTION_ANIM_MS;
    return new Promise((resolve) => setTimeout(resolve, duration));
  }, []);

  const getCombatantCell = useCallback((id) => {
    const c = combat.combatants.find((cb) => cb.id === id);
    if (!c) return { x: 0, y: 0 };
    const p = c.position;
    if (p && typeof p === 'object' && 'x' in p) return p;
    if (typeof p === 'number') return { x: p, y: 4 };
    return { x: 0, y: 0 };
  }, [combat.combatants]);

  const triggerProjectileAnim = useCallback((actorId, targetId, hit = true, opts = {}) => {
    const fromCell = getCombatantCell(actorId);
    const toCell = getCombatantCell(targetId);
    const angle = Math.random() * Math.PI * 2;
    setProjectileAnim({
      fromCell,
      toCell,
      startTime: performance.now(),
      hit,
      missOffsetX: Math.cos(angle),
      missOffsetY: Math.sin(angle),
      ...(opts.spellVfxVariant != null ? { spellVfxVariant: opts.spellVfxVariant } : {}),
      ...(opts.spellName ? { spellName: opts.spellName } : {}),
    });
    return new Promise((resolve) => setTimeout(() => {
      setProjectileAnim(null);
      resolve();
    }, PROJECTILE_TOTAL_MS));
  }, [getCombatantCell]);

  const handleEnemyBeforeResolve = useCallback(async (currentCombat) => {
    if (currentCombat?.mode === SKIRMISH_MODE_BEER_DUEL || currentCombat?.mode === SKIRMISH_MODE_CARD_GAME || currentCombat?.mode === SKIRMISH_MODE_DICE_GAME) return;
    const current = getCurrentTurnCombatant(currentCombat);
    if (!current || current.type === 'player') return;
    const playerTargets = currentCombat.combatants.filter(
      (c) => (c.type === 'player' || c.type === 'ally') && !c.isDefeated
    );
    if (!playerTargets.length) return;
    const closest = playerTargets.reduce((best, t) => {
      const d = getDistance(current, t);
      return !best || d < best.dist ? { target: t, dist: d } : best;
    }, null);
    const targetId = closest?.target?.id || null;
    if (targetId && closest?.target && !isInMeleeRange(current, closest.target)) {
      await triggerProjectileAnim(current.id, targetId, true);
    } else {
      await triggerActionAnim(current.id, targetId);
      setActionAnim(null);
    }
  }, [triggerActionAnim, triggerProjectileAnim]);

  const handleEnemyAfterSlide = useCallback(async (currentCombat) => {
    if (currentCombat?.mode === SKIRMISH_MODE_BEER_DUEL || currentCombat?.mode === SKIRMISH_MODE_CARD_GAME || currentCombat?.mode === SKIRMISH_MODE_DICE_GAME) return;
    const current = getCurrentTurnCombatant(currentCombat);
    if (!current || current.type === 'player') return;
    const playerTargets = currentCombat.combatants.filter(
      (c) => (c.type === 'player' || c.type === 'ally') && !c.isDefeated
    );
    if (!playerTargets.length) return;
    const closest = playerTargets.reduce((best, t) => {
      const d = getDistance(current, t);
      return !best || d < best.dist ? { target: t, dist: d } : best;
    }, null);
    const targetId = closest?.target?.id || null;
    if (targetId && closest?.target && !isInMeleeRange(current, closest.target)) {
      await triggerProjectileAnim(current.id, targetId, true);
    } else {
      await triggerActionAnim(current.id, targetId);
      setActionAnim(null);
    }
  }, [triggerActionAnim, triggerProjectileAnim]);

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
    onAfterSlide: handleEnemyAfterSlide,
    scheduleTokenAnim,
    flushRoundEffectEvents,
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

  const { handleExecuteManoeuvre: rawExecuteManoeuvre } = useCombatExecution({
    combat, isMyTurn, actionAnim, projectileAnim,
    isMultiplayer, isHost, myPlayerId,
    dispatch, onHostResolve, onSendManoeuvre,
    dispatchCombatChatMessage, addResultToLog,
    persistCustomAttack, triggerActionAnim, triggerProjectileAnim,
    scheduleTokenAnim, flushRoundEffectEvents,
    setActionAnim,
  });

  const handleExecuteManoeuvre = useCallback((manoeuvreKey, targetId, customDesc, extraOpts = {}) => {
    if (manoeuvreKey === 'pushObstacle') {
      if (!isMyTurn || combatOver) return;
      const actorId = isMultiplayer ? myPlayerId : 'player';
      const { pushTarget, pushTo } = extraOpts;
      if (!pushTarget || !pushTo) return;
      const { combat: updated, result } = pushObstacle(combat, actorId, pushTarget.x, pushTarget.y, pushTo.x, pushTo.y);
      if (!result || result.outcome !== 'pushed') return;
      addLogEntry({
        type: 'info',
        actor: result.actor || '?',
        action: t('combat.pushedLog', 'pushed {{tile}}', { tile: result.tileName }),
        target: `(${pushTo.x},${pushTo.y})`,
        actorColor: '#fbbf24',
        id: `push_${shortId(4)}`,
      });
      dispatch({ type: 'UPDATE_COMBAT', payload: updated });
      return;
    }

    return rawExecuteManoeuvre(manoeuvreKey, targetId, customDesc, extraOpts);
  }, [combat, isMultiplayer, myPlayerId, rawExecuteManoeuvre, isMyTurn, combatOver, dispatch, addLogEntry, t]);

  const handleDiceThrowExecute = useCallback((manoeuvreKey, targetId, customDesc, extraOpts = {}) => {
    if (diceThrowPendingRef.current) return;
    const pending = { manoeuvreKey, targetId, customDesc, extraOpts };
    diceThrowPendingRef.current = pending;
    setDiceThrowPending(pending);
  }, []);

  const handleDiceThrowDone = useCallback(() => {
    const pending = diceThrowPendingRef.current;
    diceThrowPendingRef.current = null;
    setDiceThrowPending(null);
    if (pending) {
      handleExecuteManoeuvre(pending.manoeuvreKey, pending.targetId, pending.customDesc, pending.extraOpts);
    }
  }, [handleExecuteManoeuvre]);

  const diceThrowAnchorRect = useMemo(() => {
    const el = document.querySelector('[data-combat-log]');
    if (!el) return null;
    return el.getBoundingClientRect();
  }, [diceThrowPending]);

  const handleMoveToPosition = useCallback(async (targetCell) => {
    if (!isMyTurn || combatOver || walkingRef.current) return;
    const actorId = isMultiplayer ? myPlayerId : 'player';

    const currentCombat = combatRef.current ?? combat;
    const actor = currentCombat.combatants.find((c) => c.id === actorId);
    if (!actor || actor.isDefeated) return;

    const pos = actor.position && typeof actor.position === 'object' ? actor.position : { x: 0, y: 0 };
    const occupied = getOccupiedCells(currentCombat.combatants, actorId);
    const fullPath = findPath(currentCombat.battlefield, currentCombat.destructibleHp, pos, targetCell, occupied);
    if (!fullPath || fullPath.length < 2) return;

    const path = fullPath.slice(1);
    const remaining = getRemainingMovementPoints(actor);
    if (path.length > remaining) return;

    walkingRef.current = true;
    setIsWalking(true);

    const stepMs = getCombatMoveDurationMs(1);
    let latestCombat = currentCombat;

    for (let i = 0; i < path.length; i++) {
      const { combat: updated, moved } = moveCombatant(latestCombat, actorId, path[i]);
      if (!moved) break;
      latestCombat = updated;

      scheduleTokenAnim({ [actorId]: { durationMs: stepMs } });

      if (isMultiplayer) {
        onHostResolve?.(updated);
      } else {
        dispatch({ type: 'UPDATE_COMBAT', payload: updated });
      }

      if (i < path.length - 1) {
        await new Promise((r) => setTimeout(r, stepMs));
        latestCombat = combatRef.current ?? latestCombat;
      }
    }

    const totalDist = path.length;
    const finalActor = latestCombat.combatants.find((c) => c.id === actorId);
    const uid = shortId(4);
    addLogEntry({
      type: 'info',
      actor: finalActor?.name || '?',
      action: t('combat.movedAction', 'moved {{dist}} cells', { dist: totalDist }),
      target: '',
      actorColor: '#c59aff',
      id: `move_${uid}`,
    });

    if (latestCombat.mode === SKIRMISH_MODE_BEER_DUEL && latestCombat.skirmish?.scoreByCombatantId) {
      const beersRemaining = Number(latestCombat.skirmish.beersRemaining) || 0;
      const actorScore = Number(latestCombat.skirmish.scoreByCombatantId?.[actorId]) || 0;
      const prevActorScore = Number(currentCombat.skirmish?.scoreByCombatantId?.[actorId]) || 0;
      if (actorScore > prevActorScore) {
        addLogEntry({
          type: 'info',
          actor: finalActor?.name || '?',
          action: t('combat.beerCollectedLog', 'collected a beer ({{score}} total, {{remaining}} left)', {
            score: actorScore,
            remaining: beersRemaining,
          }),
          target: '',
          actorColor: '#fbbf24',
          id: `beer_${uid}`,
        });
      }
    }

    if (
      latestCombat.mode === SKIRMISH_MODE_BEER_DUEL
      && !isCombatOver(latestCombat)
      && finalActor
      && !finalActor.bonusTurn
      && getRemainingMovementPoints(finalActor) <= 0
    ) {
      const advancedPayload = advanceTurn(latestCombat);
      flushRoundEffectEvents(advancedPayload);
      addLogEntry({
        type: 'info',
        actor: finalActor?.name || '?',
        action: t('combat.turnEndedNoMovement', 'ends turn (out of movement)'),
        target: '',
        actorColor: '#94a3b8',
        id: `turn_end_move_${uid}`,
      });
      if (isMultiplayer) {
        onHostResolve?.(advancedPayload);
      } else {
        dispatch({ type: 'UPDATE_COMBAT', payload: advancedPayload });
      }
    }

    walkingRef.current = false;
    setIsWalking(false);
  }, [combat, isMyTurn, combatOver, isMultiplayer, myPlayerId, dispatch, onHostResolve, t, addLogEntry, scheduleTokenAnim, flushRoundEffectEvents]);

  const handleSkipTurn = useCallback(() => {
    if (!isMyTurn || combatOver) return;
    const actorId = isMultiplayer ? myPlayerId : 'player';
    const actor = combat.combatants.find((c) => c.id === actorId);
    addLogEntry({
      type: 'info',
      actor: actor?.name || '?',
      action: t('combat.skippedTurn', 'skipped turn'),
      target: '',
      actorColor: '#c59aff',
      id: `skip_${shortId(4)}`,
    });
    const finalCombat = advanceTurn(combat);
    flushRoundEffectEvents(finalCombat);
    if (isMultiplayer) {
      onHostResolve?.(finalCombat);
    } else {
      dispatch({ type: 'UPDATE_COMBAT', payload: finalCombat });
    }
  }, [isMyTurn, combatOver, isMultiplayer, myPlayerId, combat, dispatch, onHostResolve, addLogEntry, t, flushRoundEffectEvents]);

  useCombatKeyboard({
    combat,
    isMyTurn,
    combatOver,
    actionAnim,
    projectileAnim,
    myCombatantId: myCombatant?.id,
    onExecuteManoeuvre: handleExecuteManoeuvre,
    onMoveToPosition: handleMoveToPosition,
    isWalking,
    onSkipTurn: handleSkipTurn,
    enabled: !diceThrowPending,
  });

  const handleAiAction = useCallback(async (actionText) => {
    if (!isMyTurn || combatOver || actionAnim || projectileAnim) return;
    setIsAwaitingAiTurn(true);
    const pendingLogId = `ai_turn_${Date.now()}_${shortId(4)}`;
    addLogEntry({
      type: 'ai_pending',
      text: t('combat.awaitingAiAction', 'Oczekiwanie...'),
      id: pendingLogId,
    });

    const actorId = isMultiplayer ? myPlayerId : 'player';
    const actor = combat.combatants.find(c => c.id === actorId);
    const closestEnemy = combat.combatants
      .filter((c) => c.type === 'enemy' && !c.isDefeated)
      .reduce((best, e) => {
        const d = actor ? getDistance(actor, e) : 999;
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
        ...(c.type === 'player' ? {
          attributes: c.attributes || {},
          skills: c.skills || {},
          momentumBonus: c.momentumBonus || 0,
        } : {}),
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
    const aiRoll = rollD50();

    const provider = settings.dmSettings?.aiProvider || 'openai';
    const language = settings.language || 'pl';

    try {
      const { result } = await aiService.resolveCombatTurn(
        combatSnapshot,
        actionText,
        provider,
        language,
        'standard',
        { diceRoll: aiRoll },
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
      flushRoundEffectEvents(updatedCombat);

      if (result.statusEffects?.length) {
        for (const eff of result.statusEffects) {
          const effectName = eff.effect?.name || (typeof eff.effect === 'string' ? eff.effect : '?');
          const category = eff.effect?.category || 'debuff';
          const isDebuff = category === 'dot' || category === 'control' || category === 'debuff';
          if (eff.action === 'remove') {
            addLogEntry({
              type: 'effect',
              actor: eff.target,
              action: t('combat.effectRemoved', '{{effect}} usunięty', { effect: effectName }),
              target: '',
              actorColor: '#8b8b8f',
              id: `fx_ai_rem_${shortId()}`,
            });
          } else {
            addLogEntry({
              type: 'effect',
              actor: eff.target,
              action: isDebuff
                ? t('combat.effectDebuffApplied', '{{effect}}', { effect: effectName })
                : t('combat.effectBuffApplied', '{{effect}}', { effect: effectName }),
              target: '',
              actorColor: isDebuff ? '#ff6e84' : '#74c0fc',
              highlightText: isDebuff ? t('combat.debuff', 'DEBUFF') : t('combat.buff', 'BUFF'),
              highlightTone: isDebuff ? 'debuff' : 'buff',
              id: `fx_ai_${shortId()}`,
            });
          }
        }
      }

      if (result.narration) {
        const details = buildAiDiceLogDetails(result.diceResult, t);
        updateLogEntry(pendingLogId, {
          type: 'ai_action',
          text: result.narration,
          ...(details ? { details } : {}),
        });
      } else {
        updateLogEntry(pendingLogId, {
          type: 'info',
          text: t('combat.aiTurnNoNarration', 'AI resolved the action, but no narration was returned.'),
        });
      }

      if (result.narration) {
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
      updateLogEntry(pendingLogId, {
        type: 'info',
        text: t('combat.aiTurnFailed', 'AI turn resolution failed — try again.'),
      });
    } finally {
      setIsAwaitingAiTurn(false);
    }
  }, [combat, isMyTurn, combatOver, actionAnim, projectileAnim, isMultiplayer, myPlayerId, settings, dispatch, onHostResolve, addLogEntry, updateLogEntry, t, triggerActionAnim, flushRoundEffectEvents]);

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

  const collapsedMovementInfo = (!expandedLayout && isMyTurn && !combatOver && myCombatant) ? {
    remaining: myCombatant.movementAllowance - (myCombatant.movementUsed || 0),
    total: myCombatant.movementAllowance,
  } : null;

  return (
    <div className="space-y-2" data-testid="combat-panel">
      <CombatHeader
        round={combat.round}
        combatOver={combatOver}
        canControl={canControl}
        playerWinning={playerWinning}
        isMultiplayer={isMultiplayer}
        isMyTurn={isMyTurn}
        onRequestTruce={() => setShowTruceConfirm(true)}
        onRequestSurrender={() => setShowSurrenderConfirm(true)}
        onEndCombat={handleEndCombat}
        onSkipTurn={handleSkipTurn}
        expandedLayout={expandedLayout}
        onToggleLayout={() => onLayoutChange?.(!expandedLayout)}
        movementInfo={collapsedMovementInfo}
        allowNegotiationControls
      />

      <CombatTelegraph
        combat={combat}
        myCombatantId={myCombatant?.id}
        isMyTurn={isMyTurn}
      />

      <QuickActionBar
        combat={combat}
        myCombatantId={myCombatant?.id}
        isMyTurn={isMyTurn}
        combatOver={combatOver}
        onExecuteManoeuvre={handleExecuteManoeuvre}
        disabled={!!actionAnim || !!projectileAnim || !!diceThrowPending}
      />

      {!expandedLayout && (
        <CombatantsList
          combatants={combat.combatants}
          currentTurn={currentTurn}
          onHoverCombatant={() => {}}
          t={t}
          horizontal
        />
      )}

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

      {diceThrowPending && (
        <CombatDiceThrow
          onDone={handleDiceThrowDone}
          anchorRect={diceThrowAnchorRect}
          spellName={diceThrowPending.manoeuvreKey === 'castSpell' ? diceThrowPending.extraOpts?.spellName : undefined}
        />
      )}

      {(expandedLayout || !scenePortalTarget) && (
        <CombatCanvas
          combat={enrichedCombat}
          myPlayerId={myPlayerId}
          isMultiplayer={isMultiplayer}
          selectedTarget={selectedTarget}
          onSelectTarget={setSelectedTarget}
          onHoverCombatant={() => {}}
          onMoveToPosition={handleMoveToPosition}
          combatOver={combatOver}
          isMyTurn={isMyTurn && !actionAnim && !projectileAnim && !isWalking && !diceThrowPending}
          isPlayerTurn={isMyTurn}
          currentTurn={currentTurn}
          myCombatantId={myCombatant?.id}
          availableManoeuvres={availableManoeuvres}
          actionAnim={actionAnim}
          projectileAnim={projectileAnim}
          savedCustomAttacks={savedCustomAttacks}
          onExecuteManoeuvre={handleExecuteManoeuvre}
          onDiceThrowExecute={handleDiceThrowExecute}
          onPersistCustomAttack={persistCustomAttack}
          onRemoveCustomAttack={removeCustomAttack}
          onRegenerateSprite={regenerateSprite}
          character={character}
          onAiAction={handleAiAction}
          expanded={expandedLayout}
          hideInitiativeBar={expandedLayout}
          tokenAnimations={tokenAnimations}
          onEndCombat={handleEndCombat}
          canControl={canControl}
        />
      )}

      {expandedLayout && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_5fr] gap-2 items-stretch">
          <CombatantsList
            combatants={combat.combatants}
            currentTurn={currentTurn}
            onHoverCombatant={() => {}}
            t={t}
          />
          <div className="flex flex-col gap-1 min-h-0">
            <InitiativeBar
              combatants={combat.combatants}
              turnIndex={combat.turnIndex}
              myCombatantId={myCombatant?.id}
              t={t}
            />
            <CombatLog combatLog={combatLog} legacyLog={combat.log} expanded={expandedLayout} />
          </div>
        </div>
      )}

      {!expandedLayout && scenePortalTarget && createPortal(
        <div className="absolute inset-2 z-[10] pointer-events-auto flex gap-2">
          <div className="w-[32rem] shrink-0 flex flex-col gap-1.5" style={{ maxHeight: '100%' }}>
            <InitiativeBar
              combatants={combat.combatants}
              turnIndex={combat.turnIndex}
              myCombatantId={myCombatant?.id}
              t={t}
            />
            <div className="bg-black/60 backdrop-blur-sm overflow-hidden rounded-lg border border-outline-variant/20 flex-1 min-h-0">
              <CombatLog combatLog={combatLog} legacyLog={combat.log} expanded={false} />
            </div>
          </div>
          <div className="flex-1 min-w-0 relative">
            <CombatCanvas
              combat={enrichedCombat}
              myPlayerId={myPlayerId}
              isMultiplayer={isMultiplayer}
              selectedTarget={selectedTarget}
              onSelectTarget={setSelectedTarget}
              onHoverCombatant={() => {}}
              onMoveToPosition={handleMoveToPosition}
              combatOver={combatOver}
              isMyTurn={isMyTurn && !actionAnim && !projectileAnim && !isWalking && !diceThrowPending}
              isPlayerTurn={isMyTurn}
              currentTurn={currentTurn}
              myCombatantId={myCombatant?.id}
              availableManoeuvres={availableManoeuvres}
              actionAnim={actionAnim}
              projectileAnim={projectileAnim}
              savedCustomAttacks={savedCustomAttacks}
              onExecuteManoeuvre={handleExecuteManoeuvre}
              onDiceThrowExecute={handleDiceThrowExecute}
              onPersistCustomAttack={persistCustomAttack}
              onRemoveCustomAttack={removeCustomAttack}
              onRegenerateSprite={regenerateSprite}
              character={character}
              onAiAction={handleAiAction}
              expanded={false}
              fillHeight
              hideMovementHint
              hideInitiativeBar
              tokenAnimations={tokenAnimations}
              onEndCombat={handleEndCombat}
              canControl={canControl}
            />
          </div>
        </div>,
        scenePortalTarget,
      )}

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
