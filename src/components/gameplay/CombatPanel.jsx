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
  isInMeleeRange,
  getDistance,
  computeAttackPreview,
} from '../../services/combatEngine';
import CombatCanvas from './CombatCanvas';
import { PROJECTILE_TOTAL_MS } from './combat/combatCanvasDraw';
import { useCombatCommentary } from '../../hooks/useCombatCommentary';
import CombatLog from './combat/CombatLog';
import CombatantsList from './combat/CombatantsList';
import CombatHeader from './combat/CombatHeader';
import { TruceConfirmDialog, SurrenderConfirmDialog } from './combat/CombatConfirmDialogs';
import CombatTurnStatus from './combat/CombatTurnStatus';
import TurnAnnouncer from './combat/TurnAnnouncer';
import CombatTelegraph from './combat/CombatTelegraph';
import QuickActionBar from './combat/QuickActionBar';
import PreRollPreview from './combat/PreRollPreview';
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

const SKIRMISH_MODE_BEER_DUEL = 'beer_duel';

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

const ACTION_ANIM_MS = 1500;
const SHOVE_ANIM_MS = 750;

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
  const [projectileAnim, setProjectileAnim] = useState(null);
  const [pendingManoeuvre, setPendingManoeuvre] = useState(null);
  const [tokenAnimations, setTokenAnimations] = useState({});
  const [scenePortalTarget, setScenePortalTarget] = useState(null);
  const tokenAnimTimers = useRef([]);
  const combatAudio = useCombatAudio(combat);

  const scheduleTokenAnim = useCallback((anims) => {
    setTokenAnimations((prev) => ({ ...prev, ...anims }));
    const maxDuration = Math.max(...Object.values(anims).map((a) => a.durationMs));
    const timer = setTimeout(() => {
      setTokenAnimations((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(anims)) delete next[id];
        return next;
      });
    }, maxDuration + 50);
    tokenAnimTimers.current.push(timer);
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
  const isBeerDuel = combat.mode === SKIRMISH_MODE_BEER_DUEL;
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
    const enrichedCombatants = combat.combatants.map((c) => {
      if (Object.prototype.hasOwnProperty.call(spriteMap, c.id)) {
        return { ...c, spriteUrl: spriteMap[c.id] };
      }
      return {
        ...c,
        spriteUrl: c.spriteUrl ? apiClient.resolveMediaUrl(c.spriteUrl) : null,
      };
    });
    return { ...combat, combatants: enrichedCombatants };
  }, [combat, spriteMap]);

  const availableManoeuvres = useMemo(() => {
    if (isBeerDuel) return [];
    const charForSkills = myCombatant || character;
    return Object.entries(gameData.manoeuvres).filter(([key]) => {
      if (key === 'castSpell' && !charForSkills?.spells?.known?.length) return false;
      return true;
    });
  }, [isBeerDuel, myCombatant, character]);

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
    });
    return new Promise((resolve) => setTimeout(() => {
      setProjectileAnim(null);
      resolve();
    }, PROJECTILE_TOTAL_MS));
  }, [getCombatantCell]);

  const handleEnemyBeforeResolve = useCallback(async (currentCombat) => {
    if (currentCombat?.mode === SKIRMISH_MODE_BEER_DUEL) return;
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
    if (currentCombat?.mode === SKIRMISH_MODE_BEER_DUEL) return;
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
    if (isBeerDuel) return;
    const actorId = isMultiplayer ? myPlayerId : 'player';
    const preview = computeAttackPreview(combat, actorId, manoeuvreKey, targetId, {
      customDescription: customDesc, ...extraOpts,
    });
    if (preview) {
      setPendingManoeuvre({ key: manoeuvreKey, targetId, customDesc, extraOpts, preview });
      return;
    }
    return rawExecuteManoeuvre(manoeuvreKey, targetId, customDesc, extraOpts);
  }, [isBeerDuel, combat, isMultiplayer, myPlayerId, rawExecuteManoeuvre]);

  const confirmManoeuvre = useCallback(() => {
    if (!pendingManoeuvre) return;
    const { key, targetId, customDesc, extraOpts } = pendingManoeuvre;
    setPendingManoeuvre(null);
    rawExecuteManoeuvre(key, targetId, customDesc, extraOpts);
  }, [pendingManoeuvre, rawExecuteManoeuvre]);

  const cancelManoeuvre = useCallback(() => setPendingManoeuvre(null), []);

  const handleMoveToPosition = useCallback((targetCell) => {
    if (!isMyTurn || combatOver) return;
    const actorId = isMultiplayer ? myPlayerId : 'player';
    const { combat: updated, moved, distance: dist } = moveCombatant(combat, actorId, targetCell);
    if (!moved) return;

    scheduleTokenAnim({ [actorId]: { durationMs: dist * 1500 } });

    const actor = updated.combatants.find((c) => c.id === actorId);
    const uid = shortId(4);
    addLogEntry({
      type: 'info',
      actor: actor?.name || '?',
      action: t('combat.movedAction', 'moved {{dist}} cells', { dist }),
      target: '',
      actorColor: '#c59aff',
      id: `move_${uid}`,
    });
    if (updated.mode === SKIRMISH_MODE_BEER_DUEL && updated.skirmish?.scoreByCombatantId) {
      const beersRemaining = Number(updated.skirmish.beersRemaining) || 0;
      const actorScore = Number(updated.skirmish.scoreByCombatantId?.[actorId]) || 0;
      const prevActorScore = Number(combat.skirmish?.scoreByCombatantId?.[actorId]) || 0;
      if (actorScore > prevActorScore) {
        addLogEntry({
          type: 'info',
          actor: actor?.name || '?',
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

    if (isMultiplayer) {
      onHostResolve?.(updated);
    } else {
      dispatch({ type: 'UPDATE_COMBAT', payload: updated });
    }
  }, [combat, isMyTurn, combatOver, isMultiplayer, myPlayerId, dispatch, onHostResolve, t, addLogEntry, scheduleTokenAnim]);

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
    onSkipTurn: handleSkipTurn,
    enabled: !isBeerDuel,
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
  const beerScoreRows = useMemo(() => {
    if (!isBeerDuel) return [];
    const scoreById = combat.skirmish?.scoreByCombatantId || {};
    return combat.combatants.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      score: Number(scoreById[c.id]) || 0,
    })).sort((a, b) => b.score - a.score);
  }, [isBeerDuel, combat.combatants, combat.skirmish]);
  const beerWinnerNames = useMemo(() => {
    if (!isBeerDuel) return [];
    const winnerIds = combat.skirmish?.winnerIds || [];
    if (!winnerIds.length) return [];
    const names = winnerIds
      .map((id) => combat.combatants.find((c) => c.id === id)?.name)
      .filter(Boolean);
    return names;
  }, [isBeerDuel, combat.skirmish, combat.combatants]);

  return (
    <div className="space-y-2" data-testid="combat-panel">
      <TurnAnnouncer
        currentTurn={currentTurn}
        isMyTurn={isMyTurn}
        combatOver={combatOver}
        isMultiplayer={isMultiplayer}
        round={combat.round}
      />
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
        allowNegotiationControls={!isBeerDuel}
      />

      {isBeerDuel && (
        <div className="flex flex-wrap items-center gap-2 px-2 py-1 rounded-sm border border-yellow-500/25 bg-yellow-500/5 text-[11px]">
          <span className="font-semibold text-yellow-300">
            {t('combat.beerDuelMode', 'Beer Duel')}
          </span>
          <span className="text-on-surface-variant">
            {t('combat.beersRemaining', 'Beers left: {{count}}', {
              count: Number(combat.skirmish?.beersRemaining) || 0,
            })}
          </span>
          {beerScoreRows.map((row) => (
            <span key={row.id} className={`px-1.5 py-0.5 rounded-sm border ${row.type === 'enemy' ? 'border-error/30 text-error' : 'border-primary/30 text-primary'}`}>
              {row.name}: {row.score}
            </span>
          ))}
          {combatOver && beerWinnerNames.length > 0 && (
            <span className="text-yellow-200 font-semibold">
              {beerWinnerNames.length > 1
                ? t('combat.beerDuelTie', 'Tie: {{names}}', { names: beerWinnerNames.join(', ') })
                : t('combat.beerDuelWinner', 'Winner: {{name}}', { name: beerWinnerNames[0] })}
            </span>
          )}
        </div>
      )}

      <CombatTelegraph
        combat={combat}
        myCombatantId={myCombatant?.id}
        isMyTurn={isMyTurn}
      />

      {!isBeerDuel && (
        <QuickActionBar
          combat={combat}
          myCombatantId={myCombatant?.id}
          isMyTurn={isMyTurn}
          combatOver={combatOver}
          onExecuteManoeuvre={handleExecuteManoeuvre}
          disabled={!!actionAnim || !!projectileAnim || !!pendingManoeuvre}
        />
      )}

      {pendingManoeuvre && (
        <PreRollPreview
          preview={pendingManoeuvre.preview}
          onConfirm={confirmManoeuvre}
          onCancel={cancelManoeuvre}
        />
      )}

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
          isMyTurn={isMyTurn && !actionAnim && !projectileAnim}
          myCombatantId={myCombatant?.id}
          availableManoeuvres={availableManoeuvres}
          actionAnim={actionAnim}
          projectileAnim={projectileAnim}
          savedCustomAttacks={savedCustomAttacks}
          onExecuteManoeuvre={handleExecuteManoeuvre}
          onPersistCustomAttack={persistCustomAttack}
          onRemoveCustomAttack={removeCustomAttack}
          onRegenerateSprite={regenerateSprite}
          character={character}
          onAiAction={isBeerDuel ? undefined : handleAiAction}
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
              isMyTurn={isMyTurn && !actionAnim && !projectileAnim}
              myCombatantId={myCombatant?.id}
              availableManoeuvres={availableManoeuvres}
              actionAnim={actionAnim}
              projectileAnim={projectileAnim}
              savedCustomAttacks={savedCustomAttacks}
              onExecuteManoeuvre={handleExecuteManoeuvre}
              onPersistCustomAttack={persistCustomAttack}
              onRemoveCustomAttack={removeCustomAttack}
              onRegenerateSprite={regenerateSprite}
              character={character}
              onAiAction={isBeerDuel ? undefined : handleAiAction}
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
