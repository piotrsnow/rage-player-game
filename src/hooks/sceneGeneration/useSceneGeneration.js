import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { imageService } from '../../services/imageGen';
import { apiClient } from '../../services/apiClient';
import { createSceneId } from '../../services/gameState';
import { storage } from '../../services/storage';
import { calculateCost } from '../../services/costTracker';
import { buildSpeculativeImageDescription } from '../../services/imagePrompts';
import { ensureEnglish } from '../../services/translateImagePrompt';
import { resolveMechanics } from '../../services/mechanics/index';
import { calculateNextMomentum } from '../../services/mechanics/momentumTracker';
import { loadSceneGenDurationHistory, appendSceneGenDuration, historyToSceneGenEstimateMs, persistSceneGenDurationHistory } from '../../services/performanceTracker';
import { useEvent } from '../useEvent';
import { useSceneBackendStream } from './useSceneBackendStream';
import { processSceneDialogue } from './processSceneDialogue';
import { injectCombatFallback, fillBestiaryStats, applyNeedsAndRest, applySceneStateChanges } from './applySceneStateChanges';

// Master kill-switch for the speculative "early image" path below. When false,
// we skip guessing the image from previous-scene + player-action and instead
// wait for the AI's own narrative + imagePrompt to drive image generation
// (deferred path). Flip to true to re-enable the overlapped path if we ever
// want the latency win back.
const SPECULATIVE_EARLY_IMAGE_ENABLED = false;

export function useSceneGeneration({ ensureMissingInventoryImages, ensureMissingNpcPortraits, imageGenEnabled, imageApiKey, imageProvider, imageStyle, darkPalette, imageSeriousness, imgKeyProvider }) {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings, hasApiKey } = useSettings();

  const degradeStatsRef = useRef({ total: 0, truncated: 0, schema: 0, lastWarnAt: 0 });
  const sceneGenStartRef = useRef(null);
  const sceneGenDurationHistoryRef = useRef(null);

  const [lastSceneGenMs, setLastSceneGenMs] = useState(() => {
    const history = loadSceneGenDurationHistory();
    sceneGenDurationHistoryRef.current = history;
    return historyToSceneGenEstimateMs(history);
  });
  const [sceneGenStartTime, setSceneGenStartTime] = useState(null);

  const { aiProvider, language, needsSystemEnabled, aiModelTier = 'premium', sdWebuiModel = '', sdWebuiSeed = null } = settings;

  const stream = useSceneBackendStream();

  const recordCompletedSceneGenTiming = useCallback(() => {
    if (!sceneGenStartRef.current) return;
    const elapsed = Date.now() - sceneGenStartRef.current;
    const prev = sceneGenDurationHistoryRef.current || [];
    const next = appendSceneGenDuration(prev, elapsed);
    sceneGenDurationHistoryRef.current = next;
    persistSceneGenDurationHistory(next);
    setLastSceneGenMs(historyToSceneGenEstimateMs(next));
    sceneGenStartRef.current = null;
    setSceneGenStartTime(null);
  }, []);

  const generateScene = useEvent(
    async (playerAction, isFirstScene = false, isCustomAction = false, fromAutoPlayer = false, sceneOptions = {}) => {
      const { combatResult = null, forceRoll = null } = sceneOptions || {};
      dispatch({ type: 'SET_GENERATING_SCENE', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      stream.resetStreamState();
      sceneGenStartRef.current = Date.now();
      setSceneGenStartTime(Date.now());

      let earlyImagePromise = null;

      try {
        const isIdleWorldEvent = playerAction && playerAction.startsWith('[IDLE_WORLD_EVENT');
        const isPassiveSceneAction = Boolean(isIdleWorldEvent || playerAction === '[WAIT]');

        const resolved = await resolveMechanics({
          state, playerAction, settings, isFirstScene, t,
          skipDiceRoll: true,
        });

        // Early image generation (speculative, before AI call).
        // `previousScene.narrative` and `playerAction` are in the campaign
        // language (PL when language='pl') — translate both before feeding
        // them into the English template. The two translations run in
        // parallel and overlap with the premium scene call, so this path
        // stays off the critical latency budget.
        const hasImageKey = imageApiKey || hasApiKey(imgKeyProvider);
        if (SPECULATIVE_EARLY_IMAGE_ENABLED && imageGenEnabled && hasImageKey && !isFirstScene) {
          const previousScene = state.scenes?.[state.scenes.length - 1];
          if (previousScene?.narrative) {
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
            earlyImagePromise = Promise.all([
              ensureEnglish(previousScene.narrative.substring(0, 200)),
              ensureEnglish(playerAction),
            ]).then(([enPrevNarrative, enPlayerAction]) => {
              const speculativeDesc = buildSpeculativeImageDescription(enPrevNarrative, enPlayerAction, resolved.diceRoll, imageProvider);
              return imageService.generateSceneImage(
                '', state.campaign?.genre, state.campaign?.tone, imageApiKey, imageProvider,
                speculativeDesc, state.campaign?.backendId, imageStyle, darkPalette,
                state.character?.age, state.character?.gender, { sdModel: sdWebuiModel, sdSeed: Number.isInteger(sdWebuiSeed) ? sdWebuiSeed : null }, imageSeriousness,
                state.character?.portraitUrl || null
              );
            }).then((result) => result?.url || null)
              .catch((imgErr) => {
                console.warn('Early image generation failed:', imgErr.message);
                return null;
              });
          }
        }

        // Backend sync
        let backendCampaignId = state.campaign?.backendId;
        const canUseBackend = apiClient.isConnected();

        if (canUseBackend && !backendCampaignId) {
          try {
            let characterBackendId = state.character?.backendId;
            if (!characterBackendId && state.character) {
              const savedChar = await storage.saveCharacter(state.character);
              characterBackendId = savedChar?.backendId || null;
              if (characterBackendId) state.character.backendId = characterBackendId;
            }
            const { scenes: _s, isLoading: _l, isGeneratingScene: _g, isGeneratingImage: _i, error: _e, ...rest } = state;
            const coreState = { ...rest };
            if (coreState.chatHistory?.length > 10) coreState.chatHistory = coreState.chatHistory.slice(-10);
            delete coreState.character;
            delete coreState.characters;
            const created = await apiClient.post('/campaigns', {
              name: state.campaign?.name || '', genre: state.campaign?.genre || '',
              tone: state.campaign?.tone || '', coreState,
              characterIds: characterBackendId ? [characterBackendId] : [],
            }, { idempotencyKey: `campaign-create:${state.campaign?.id}` });
            backendCampaignId = created.id;
            // Push backendId through the store — direct mutation of
            // state.campaign is a no-op on Immer-frozen state and used to
            // leak duplicate POSTs on every subsequent scene.
            dispatch({
              type: 'SET_CAMPAIGN_BACKEND_ID',
              payload: {
                backendId: created.id,
                characterIds: Array.isArray(created.characterIds) ? created.characterIds : undefined,
              },
            });
            console.log('[useAI] Auto-synced campaign to backend:', created.id);
          } catch (syncErr) {
            console.warn('[useAI] Failed to auto-sync campaign:', syncErr.message);
          }
        }

        if (!canUseBackend || !backendCampaignId) {
          throw new Error('Backend connection required for scene generation');
        }

        // Stream scene from backend
        const backendResult = await stream.callStream(backendCampaignId, playerAction, {
          resolved, isFirstScene, isCustomAction, fromAutoPlayer, combatResult, forceRoll,
        });
        const result = backendResult.result;
        const usage = backendResult.usage;
        if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
        const authoritativeCharacterSnapshot = backendResult.character || null;
        const newlyUnlockedAchievements = Array.isArray(backendResult.newlyUnlockedAchievements)
          ? backendResult.newlyUnlockedAchievements
          : [];
        const updatedAchievementState = backendResult.updatedAchievementState || null;

        const serverSceneId = backendResult.sceneId || null;
        const serverSceneIndex = Number.isInteger(backendResult.sceneIndex) ? backendResult.sceneIndex : null;
        if (serverSceneId && backendCampaignId && serverSceneIndex !== null) {
          storage.markSceneSavedRemotely(backendCampaignId, serverSceneIndex);
        }

        // Trade shortcut
        if (result?._tradeShortcut && result.stateChanges?.startTrade) {
          dispatch({ type: 'APPLY_STATE_CHANGES', payload: { startTrade: result.stateChanges.startTrade } });
          stream.clearStreamingOutput();
          recordCompletedSceneGenTiming();
          dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
          return;
        }

        // Degraded mode warnings
        if (result?.meta?.degraded) {
          degradeStatsRef.current.total += 1;
          if (result?.meta?.degradeType === 'context_truncate' || String(result?.meta?.reason || '').includes('context_truncate')) {
            degradeStatsRef.current.truncated += 1;
          } else {
            degradeStatsRef.current.schema += 1;
          }
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_ai_degraded`, role: 'system', subtype: 'ai_degraded_mode', content: t('system.aiDegradedMode', 'AI response validation failed, so a safe fallback scene was generated.'), timestamp: Date.now() } });
        }
        if (result?.meta?.promptTruncated) {
          degradeStatsRef.current.truncated += 1;
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_prompt_truncated`, role: 'system', subtype: 'validation_warning', content: t('system.promptTruncatedWarning', 'Prompt context was trimmed to fit model limits. Story continuity may be reduced this turn.'), timestamp: Date.now() } });
        }
        if (degradeStatsRef.current.total >= 3 && Date.now() - degradeStatsRef.current.lastWarnAt > 120000) {
          degradeStatsRef.current.lastWarnAt = Date.now();
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_degrade_summary`, role: 'system', subtype: 'validation_warning', content: t('system.aiQualityWarning', `AI quality warning: ${degradeStatsRef.current.total} degraded scenes in this session (${degradeStatsRef.current.truncated} from prompt truncation). Consider increasing prompt profile/model tier.`), timestamp: Date.now() } });
        }

        // Combat fallback + bestiary stats
        injectCombatFallback(result, state, playerAction, isFirstScene, isPassiveSceneAction, t);
        fillBestiaryStats(result, state);

        // Dice rolls
        const rawAiSpeech = {
          narrative: typeof result.narrative === 'string' ? result.narrative : '',
          dialogueSegments: Array.isArray(result.dialogueSegments)
            ? result.dialogueSegments.map(s => s && typeof s === 'object' ? { ...s } : s) : [],
          scenePacing: result.scenePacing || 'exploration',
        };

        const { effectiveDiceRolls } = stream.processServerDiceRolls(result, resolved);

        if (effectiveDiceRolls.length > 0) {
          const lastRoll = effectiveDiceRolls[effectiveDiceRolls.length - 1];
          dispatch({ type: 'SET_MOMENTUM', payload: calculateNextMomentum(state.momentumBonus || 0, lastRoll.margin || lastRoll.sl || 0) });
        }

        // Dialogue repair
        const { finalSegments, stateChanges: mergedStateChanges } = processSceneDialogue(
          result, state, settings, dispatch,
          { isFirstScene, playerAction, isPassiveSceneAction }
        );
        result.stateChanges = mergedStateChanges;

        // Build and dispatch scene
        const sceneId = serverSceneId || createSceneId();
        const questOffers = (result.questOffers || []).map((offer) => ({
          ...offer, objectives: (offer.objectives || []).map((obj) => ({ ...obj, completed: false })), status: 'pending',
        }));
        const scene = {
          id: sceneId, narrative: result.narrative, scenePacing: result.scenePacing || 'exploration',
          dialogueSegments: finalSegments, soundEffect: result.soundEffect || null,
          musicPrompt: result.musicPrompt || null, imagePrompt: result.imagePrompt || null,
          fullImagePrompt: null,
          sceneGrid: result.sceneGrid || null, musicUrl: null, image: null,
          actions: result.suggestedActions || [], questOffers, chosenAction: playerAction,
          diceRoll: result.diceRoll || null, diceRolls: result.diceRolls || undefined, timestamp: Date.now(),
        };
        dispatch({ type: 'ADD_SCENE', payload: scene });
        stream.clearStreamingOutput();

        // Early image resolve
        if (earlyImagePromise) {
          const capturedSceneId = sceneId;
          earlyImagePromise.then((imageUrl) => {
            if (imageUrl) {
              dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
              dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId: capturedSceneId, image: imageUrl } });
              autoSave();
            }
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
          });
        }

        // Chat messages
        const earlyPlayerMsgSent = Boolean(resolved.diceRoll);
        if (!earlyPlayerMsgSent && !isFirstScene && playerAction && !isPassiveSceneAction) {
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_player`, role: 'player', content: playerAction === '[CONTINUE]' ? t('gameplay.continueChatMessage') : playerAction, timestamp: Date.now() } });
        }
        if (isIdleWorldEvent) {
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_world_event`, role: 'system', subtype: 'world_event', content: t('idle.worldEvent', 'Something stirs in the world...'), timestamp: Date.now() } });
        }
        if (playerAction === '[WAIT]') {
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_wait`, role: 'system', subtype: 'wait', content: t('gameplay.waitSystemMessage'), timestamp: Date.now() } });
        }
        dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_dm`, role: 'dm', sceneId, content: result.narrative, scenePacing: result.scenePacing || 'exploration', dialogueSegments: finalSegments, rawAiSpeech, soundEffect: result.soundEffect || null, dialogueIfQuestTargetCompleted: result.dialogueIfQuestTargetCompleted || null, timestamp: Date.now() } });

        // State changes
        applyNeedsAndRest(result, resolved, needsSystemEnabled);
        applySceneStateChanges({
          result, state, dispatch,
          authoritativeCharacterSnapshot, ensureMissingInventoryImages, ensureMissingNpcPortraits, t,
          newlyUnlockedAchievements, updatedAchievementState,
        });

        recordCompletedSceneGenTiming();
        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
        autoSave();

        // FE-side scene compression removed with no-BYOK cleanup. Backend
        // scene pipeline runs its own memoryCompressor.js post-scene, so the
        // client no longer needs to summarize old scenes itself.

        // Deferred image
        if (!earlyImagePromise && imageGenEnabled && hasImageKey) {
          dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
          try {
            const { url: imageUrl, prompt: fullImagePrompt } = await imageService.generateSceneImage(
              result.narrative, state.campaign?.genre, state.campaign?.tone, imageApiKey, imageProvider,
              result.imagePrompt, state.campaign?.backendId, imageStyle, darkPalette,
              state.character?.age, state.character?.gender, { sdModel: sdWebuiModel, sdSeed: Number.isInteger(sdWebuiSeed) ? sdWebuiSeed : null }, imageSeriousness,
              state.character?.portraitUrl || null
            );
            dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
            dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId, image: imageUrl, fullImagePrompt } });
            autoSave();
          } catch (imgErr) {
            console.warn('Image generation failed:', imgErr.message);
          } finally {
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
          }
        }

        return result;
      } catch (err) {
        if (earlyImagePromise) {
          earlyImagePromise.finally(() => dispatch({ type: 'SET_GENERATING_IMAGE', payload: false }));
        }
        recordCompletedSceneGenTiming();
        dispatch({ type: 'SET_ERROR', payload: err.message });
        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
        stream.clearStreamingOutput();
        throw err;
      }
    }
  );

  const acceptQuestOffer = useCallback(
    (sceneId, questOffer) => {
      const quest = {
        id: questOffer.id, name: questOffer.name, description: questOffer.description,
        completionCondition: questOffer.completionCondition,
        objectives: (questOffer.objectives || []).map((obj) => ({ ...obj, completed: false })),
        locationId: questOffer.locationId || state.world?.currentLocation || null,
      };
      dispatch({ type: 'ADD_QUEST', payload: quest });
      dispatch({ type: 'UPDATE_SCENE_QUEST_OFFER', payload: { sceneId, offerId: questOffer.id, status: 'accepted' } });
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_quest_accept`, role: 'system', subtype: 'quest_new', content: t('system.questNew', { quest: questOffer.name }), timestamp: Date.now() } });
      autoSave();
    },
    [state.world?.currentLocation, dispatch, autoSave, t]
  );

  const declineQuestOffer = useCallback(
    (sceneId, offerId) => {
      dispatch({ type: 'UPDATE_SCENE_QUEST_OFFER', payload: { sceneId, offerId, status: 'declined' } });
    },
    [dispatch]
  );

  return {
    generateScene,
    acceptQuestOffer,
    declineQuestOffer,
    sceneGenStartTime,
    lastSceneGenMs,
    earlyDiceRoll: stream.earlyDiceRoll,
    clearEarlyDiceRoll: stream.clearEarlyDiceRoll,
    streamingNarrative: stream.streamingNarrative,
    streamingSegments: stream.streamingSegments,
  };
}
