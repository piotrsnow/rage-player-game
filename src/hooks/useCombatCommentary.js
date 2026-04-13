import { useCallback, useEffect, useRef } from 'react';
import { useEvent } from './useEvent';

/**
 * Generates flavourful combat commentary via AI every N rounds and pushes
 * it into the chat log as a system message. Handles three non-obvious
 * concerns:
 *
 *  1) **Request invalidation on combat change.** If a combat ends or a new
 *     one begins while a commentary request is in flight, the response must
 *     not land in the chat of the *next* combat.
 *  2) **Round dedup.** Only one commentary per round, even if effect deps
 *     fire multiple times.
 *  3) **Multiplayer host gating.** Only the host requests commentary; other
 *     clients receive it via the normal chat sync path.
 *
 * Caller provides an `onEmitMessage` callback which is responsible for
 * actually delivering the message (local dispatch vs. multiplayer host
 * broadcast) — the hook deliberately does not know about either channel.
 */
export function useCombatCommentary({
  combat,
  combatOver,
  combatInstanceKey,
  combatLog,
  frequency,
  isMultiplayer,
  isHost,
  gameState,
  generateCombatCommentary,
  summarizeLogEntry,
  onEmitMessage,
}) {
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

  const invalidateCommentaryRequests = useCallback(() => {
    activeCommentaryRequestIdRef.current = ++commentaryRequestSeqRef.current;
    commentaryInFlightRef.current = false;
  }, []);

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

  const requestCommentary = useEvent(() => {
    if (!combat.active || combatOver) return;
    if (isMultiplayer && !isHost) return;
    if (frequency <= 0) return;
    if (combat.round <= 0 || combat.round % frequency !== 0) return;
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

      onEmitMessage(message);
    }).catch((err) => {
      console.warn('[useCombatCommentary] failed:', err.message);
    }).finally(() => {
      if (activeCommentaryRequestIdRef.current === requestId) {
        commentaryInFlightRef.current = false;
      }
    });
  });

  useEffect(() => {
    requestCommentary();
  }, [combat.round, combat.active, combatOver, frequency, isMultiplayer, isHost, combatInstanceKey, requestCommentary]);
}
