import { useCallback, useRef, useState } from 'react';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { aiService } from '../../services/ai';
import { parsePartialJson } from '../../services/partialJsonParser';
import { resolveVoiceForCharacter } from '../../services/characterVoiceResolver';
import { devLog } from '../../stores/devEventLogStore';

export function useSceneBackendStream() {
  const { state, dispatch } = useGame();
  const { settings, voicePools, loadBackendUser, resolveTaskModel } = useSettings();

  const earlyDiceRollEmittedRef = useRef(false);
  const streamedDiceRollCountRef = useRef(0);
  const streamedNpcsIntroducedCountRef = useRef(0);
  const dispatchedRollSkillsRef = useRef(new Set());
  const rollMessageCounterRef = useRef(0);

  const [earlyDiceRoll, setEarlyDiceRoll] = useState(null);
  const [streamingNarrative, setStreamingNarrative] = useState(null);
  const [streamingSegments, setStreamingSegments] = useState(null);
  const [streamComplete, setStreamComplete] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const streamingNarrativeRef = useRef(null);

  const resetStreamState = useCallback(() => {
    setEarlyDiceRoll(null);
    earlyDiceRollEmittedRef.current = false;
    streamedDiceRollCountRef.current = 0;
    streamedNpcsIntroducedCountRef.current = 0;
    dispatchedRollSkillsRef.current = new Set();
    rollMessageCounterRef.current = 0;
    setStreamingNarrative(null);
    streamingNarrativeRef.current = null;
    setStreamingSegments(null);
    setStreamComplete(false);
    setStreamError(null);
  }, []);

  const clearStreamingOutput = useCallback(() => {
    setStreamingNarrative(null);
    streamingNarrativeRef.current = null;
    setStreamingSegments(null);
    setStreamComplete(false);
    setStreamError(null);
  }, []);

  const clearEarlyDiceRoll = useCallback(() => setEarlyDiceRoll(null), []);

  const dispatchDiceRollMessage = useCallback((roll) => {
    if (!roll) return;
    const skillKey = roll.skill ? String(roll.skill).toLowerCase().trim() : '';
    if (skillKey && dispatchedRollSkillsRef.current.has(skillKey)) return;
    if (skillKey) dispatchedRollSkillsRef.current.add(skillKey);
    rollMessageCounterRef.current += 1;
    const uid = `${Date.now()}_${rollMessageCounterRef.current}`;
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${uid}_roll_server_${roll.skill || 'unknown'}`,
        role: 'system',
        subtype: 'dice_roll',
        content: `${roll.skill || '?'}: d50=${roll.roll} → ${roll.success ? '✓' : '✗'} (margin ${roll.margin})`,
        diceData: roll,
        timestamp: Date.now(),
      },
    });
  }, [dispatch]);

  const callStream = useCallback(async (backendCampaignId, playerAction, {
    resolved,
    isFirstScene,
    isCustomAction,
    fromAutoPlayer,
    combatResult = null,
    forceRoll = null,
    entityTags = null,
    travelFailureReason = null,
  }) => {
    let rawAccumulated = '';

    const backendResult = await aiService.generateSceneViaBackendStream(backendCampaignId, playerAction, {
      provider: settings.aiProvider,
      model: resolveTaskModel('sceneGeneration'),
      language: settings.language,
      dmSettings: settings.dmSettings,
      resolvedMechanics: resolved,
      needsSystemEnabled: settings.needsSystemEnabled,
      characterNeeds: state.character?.needs || null,
      isFirstScene,
      isCustomAction,
      fromAutoPlayer,
      sceneCount: state.scenes?.length || 0,
      gameState: state,
      combatResult,
      forceRoll,
      entityTags,
      travelFailureReason,
      achievementState: state.achievements || null,
      onEvent: (event) => {
        if (event.type === 'intent') {
          console.log('[useAI] Stream intent:', event.data?.intent);
          devLog.emit({ category: 'ai', type: 'intent_classified', label: `Intent: ${event.data?.intent || 'freeform'}`, data: { intent: event.data?.intent, travelTarget: event.data?.travelTarget } });
        } else if (event.type === 'retry') {
          // Backend caught a suspicious location change and is regenerating
          // the scene silently (no new chunk events will arrive). Drop the
          // partial buffer + UI typewriter so the user doesn't see leftover
          // text from the discarded first attempt; the final scene lands via
          // the 'complete' event below.
          console.log('[useAI] Stream retry:', event.reason);
          devLog.emit({ category: 'ai', type: 'stream_retry', label: `Retry: ${event.reason}`, severity: 'warn', data: { reason: event.reason } });
          rawAccumulated = '';
          streamedDiceRollCountRef.current = 0;
          streamedNpcsIntroducedCountRef.current = 0;
          setStreamingNarrative(null);
          streamingNarrativeRef.current = null;
          setStreamingSegments(null);
          setStreamComplete(false);
        } else if (event.type === 'dice_early' && event.data?.diceRoll) {
          const roll = event.data.diceRoll;
          devLog.emit({ category: 'mechanics', type: 'dice_early', label: `Dice: ${roll.skill || '?'} d50=${roll.roll} → ${roll.success ? 'SUCCESS' : 'FAIL'} (margin ${roll.margin})`, data: roll });
          setEarlyDiceRoll(roll);
          earlyDiceRollEmittedRef.current = true;
          dispatchDiceRollMessage(roll);
        } else if (event.type === 'context_ready') {
          devLog.emit({ category: 'ai', type: 'context_ready', label: 'Context assembly complete' });
        } else if (event.type === 'complete') {
          devLog.emit({ category: 'pipeline', type: 'sse_complete', label: 'SSE complete event received' });
          setStreamComplete(true);
        } else if (event.type === 'chunk' && event.text) {
          rawAccumulated += event.text;
          const parsed = parsePartialJson(rawAccumulated);
          if (!parsed) return;

          if (Array.isArray(parsed.diceRolls)) {
            const newCount = parsed.diceRolls.length;
            if (newCount > streamedDiceRollCountRef.current && !earlyDiceRollEmittedRef.current) {
              const latestRoll = parsed.diceRolls[newCount - 1];
              if (latestRoll?.skill) {
                setEarlyDiceRoll({
                  skill: latestRoll.skill,
                  difficulty: latestRoll.difficulty || 'medium',
                  _streaming: true,
                });
              }
            }
            streamedDiceRollCountRef.current = newCount;
          }

          if (Array.isArray(parsed.npcsIntroduced)) {
            const newNpcCount = parsed.npcsIntroduced.length;
            if (newNpcCount > streamedNpcsIntroducedCountRef.current) {
              for (let i = streamedNpcsIntroducedCountRef.current; i < newNpcCount; i++) {
                const npc = parsed.npcsIntroduced[i];
                if (!npc?.name) continue;
                if (state.characterVoiceMap?.[npc.name]?.voiceId) continue;
                resolveVoiceForCharacter(
                  npc.name,
                  npc.gender === 'male' || npc.gender === 'female' ? npc.gender : null,
                  state.characterVoiceMap || {},
                  {
                    maleVoices: voicePools.maleVoices || [],
                    femaleVoices: voicePools.femaleVoices || [],
                    narratorVoiceId: voicePools.narratorVoiceId || null,
                    ttsProvider: ['elevenlabs', 'xtts'].includes(settings.sceneTtsTier) ? settings.sceneTtsTier : (settings.ttsProvider || 'elevenlabs'),
                  },
                  dispatch
                );
              }
              streamedNpcsIntroducedCountRef.current = newNpcCount;
            }
          }

          if (Array.isArray(parsed.dialogueSegments) && parsed.dialogueSegments.length > 0) {
            setStreamingSegments(parsed.dialogueSegments);
            const derived = parsed.dialogueSegments
              .filter(s => s && typeof s.text === 'string')
              .map(s => s.text)
              .join(' ');
            if (derived.length > 0) {
              setStreamingNarrative(derived);
              streamingNarrativeRef.current = derived;
            }
          } else if (typeof parsed.narrative === 'string' && parsed.narrative.length > 0) {
            setStreamingNarrative(parsed.narrative);
            streamingNarrativeRef.current = parsed.narrative;
          }
        }
      },
    });

    loadBackendUser().catch(() => {});

    return backendResult;
  }, [state, settings, dispatch, dispatchDiceRollMessage, loadBackendUser, resolveTaskModel]);

  const processServerDiceRolls = useCallback((result, resolved) => {
    const serverDiceRolls = Array.isArray(result.diceRolls) ? result.diceRolls
      : result.diceRoll ? [result.diceRoll] : [];
    const effectiveDiceRolls = serverDiceRolls.length > 0 ? serverDiceRolls
      : resolved.diceRoll ? [resolved.diceRoll] : [];
    result.diceRolls = effectiveDiceRolls.length > 0 ? effectiveDiceRolls : undefined;
    result.diceRoll = effectiveDiceRolls[0] || null;

    if (serverDiceRolls.length > 0 && !resolved.diceRoll) {
      if (!earlyDiceRollEmittedRef.current) {
        setEarlyDiceRoll(serverDiceRolls[0]);
      }
      for (const roll of serverDiceRolls) {
        dispatchDiceRollMessage(roll);
      }
    }

    return { serverDiceRolls, effectiveDiceRolls };
  }, [dispatchDiceRollMessage]);

  const hasPartialNarrative = useCallback(() => streamingNarrativeRef.current !== null, []);

  return {
    callStream,
    processServerDiceRolls,
    resetStreamState,
    clearStreamingOutput,
    earlyDiceRoll,
    clearEarlyDiceRoll,
    streamingNarrative,
    streamingSegments,
    streamComplete,
    streamError,
    setStreamError,
    hasPartialNarrative,
  };
}
