import { useCallback, useRef, useState } from 'react';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { aiService } from '../../services/ai';
import { parsePartialJson } from '../../services/partialJsonParser';
import { resolveVoiceForCharacter } from '../../services/characterVoiceResolver';

export function useSceneBackendStream() {
  const { state, dispatch } = useGame();
  const { settings } = useSettings();

  const earlyDiceRollEmittedRef = useRef(false);
  const streamedDiceRollCountRef = useRef(0);
  const streamedNpcsIntroducedCountRef = useRef(0);
  const dispatchedRollSkillsRef = useRef(new Set());
  const rollMessageCounterRef = useRef(0);

  const [earlyDiceRoll, setEarlyDiceRoll] = useState(null);
  const [streamingNarrative, setStreamingNarrative] = useState(null);
  const [streamingSegments, setStreamingSegments] = useState(null);

  const resetStreamState = useCallback(() => {
    setEarlyDiceRoll(null);
    earlyDiceRollEmittedRef.current = false;
    streamedDiceRollCountRef.current = 0;
    streamedNpcsIntroducedCountRef.current = 0;
    dispatchedRollSkillsRef.current = new Set();
    rollMessageCounterRef.current = 0;
    setStreamingSegments(null);
  }, []);

  const clearStreamingOutput = useCallback(() => {
    setStreamingNarrative(null);
    setStreamingSegments(null);
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
  }) => {
    let rawAccumulated = '';

    const backendResult = await aiService.generateSceneViaBackendStream(backendCampaignId, playerAction, {
      provider: settings.aiProvider,
      model: settings.aiModel || null,
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
      achievementState: state.achievements || null,
      onEvent: (event) => {
        if (event.type === 'intent') {
          console.log('[useAI] Stream intent:', event.data?.intent);
        } else if (event.type === 'retry') {
          // Backend caught a suspicious location change and is regenerating
          // the scene silently (no new chunk events will arrive). Drop the
          // partial buffer + UI typewriter so the user doesn't see leftover
          // text from the discarded first attempt; the final scene lands via
          // the 'complete' event below.
          console.log('[useAI] Stream retry:', event.reason);
          rawAccumulated = '';
          streamedDiceRollCountRef.current = 0;
          streamedNpcsIntroducedCountRef.current = 0;
          setStreamingNarrative(null);
          setStreamingSegments(null);
        } else if (event.type === 'dice_early' && event.data?.diceRoll) {
          const roll = event.data.diceRoll;
          setEarlyDiceRoll(roll);
          earlyDiceRollEmittedRef.current = true;
          dispatchDiceRollMessage(roll);
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
                    maleVoices: settings.maleVoices || [],
                    femaleVoices: settings.femaleVoices || [],
                    narratorVoiceId: settings.narratorVoiceId || null,
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
            }
          } else if (typeof parsed.narrative === 'string' && parsed.narrative.length > 0) {
            setStreamingNarrative(parsed.narrative);
          }
        }
      },
    });

    return backendResult;
  }, [state, settings, dispatch, dispatchDiceRollMessage]);

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

  return {
    callStream,
    processServerDiceRolls,
    resetStreamState,
    clearStreamingOutput,
    earlyDiceRoll,
    clearEarlyDiceRoll,
    streamingNarrative,
    streamingSegments,
  };
}
