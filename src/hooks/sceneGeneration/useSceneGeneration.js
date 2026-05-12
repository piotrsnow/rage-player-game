import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { imageService } from '../../services/imageGen';
import { aiService } from '../../services/ai';
import { apiClient } from '../../services/apiClient';
import { createSceneId } from '../../services/gameState';
import { storage } from '../../services/storage';
import { calculateCost, calculateSceneCost } from '../../services/costTracker';
import { buildSpeculativeImageDescription } from '../../services/imagePrompts';
import { ensureEnglish } from '../../services/translateImagePrompt';
import { resolveMechanics } from '../../services/mechanics/index';
import { calculateNextMomentum } from '../../services/mechanics/momentumTracker';
import { loadSceneGenDurationHistory, appendSceneGenDuration, historyToSceneGenEstimateMs, persistSceneGenDurationHistory } from '../../services/performanceTracker';
import { useEvent } from '../useEvent';
import { useSceneBackendStream } from './useSceneBackendStream';
import { processSceneDialogue } from './processSceneDialogue';
import { injectCombatFallback, fillBestiaryStats, applyNeedsAndRest, applySceneStateChanges } from './applySceneStateChanges';
import { devLog } from '../../stores/devEventLogStore';
import { stopAllDialogAudio } from '../../utils/readAloudExclusive';

const RETRYABLE_CODES = new Set(['LLM_TIMEOUT', 'LLM_ERROR', 'OVERLOADED']);

// Master kill-switch for the speculative "early image" path below. When false,
// we skip guessing the image from previous-scene + player-action and instead
// wait for the AI's own narrative + imagePrompt to drive image generation
// (deferred path). Flip to true to re-enable the overlapped path if we ever
// want the latency win back.
const SPECULATIVE_EARLY_IMAGE_ENABLED = false;

function humanizePlayerAction(action, t) {
  if (!action || !action.startsWith('[')) return action;

  if (action === '[CONTINUE]') return t('gameplay.continueChatMessage');

  if (action === '[PROVIDENCE_AFTER_INCIDENT]') return null;
  if (action.startsWith('[Combat resolved:')) return null;
  if (action.startsWith('[BEER_DUEL_RESOLVED:')) return null;
  if (action.startsWith('[CREATURE_FLEE_FAILED:')) return null;

  if (action === '[INITIATE COMBAT]')
    return t('gameplay.initiateCombatChat', 'Rzucam się do walki!');

  const beerMatch = action.match(/^\[INITIATE BEER DUEL(?::\s*(.+?))?\]$/);
  if (beerMatch)
    return beerMatch[1]
      ? t('gameplay.beerDuelVsChat', { name: beerMatch[1], defaultValue: 'Proponuję pojedynek piwny z {{name}}!' })
      : t('gameplay.beerDuelChat', 'Proponuję pojedynek piwny!');

  const attackMatch = action.match(/^\[ATTACK:\s*(.+?)\]$/);
  if (attackMatch)
    return t('gameplay.attackNpcChat', { name: attackMatch[1], defaultValue: 'Atakuję {{name}}!' });

  const creatureMatch = action.match(/^\[CREATURE_ENCOUNTER:\s*.+?\]\s*(.+)/s);
  if (creatureMatch) return creatureMatch[1];

  return null;
}

export function useSceneGeneration({ ensureMissingInventoryImages, ensureMissingSpellImages, ensureMissingNpcPortraits, imageGenEnabled, imageApiKey, imageProvider, imageStyle, darkPalette, imageSeriousness, imgKeyProvider }) {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings, hasApiKey, voicePools, sceneModelConfig } = useSettings();

  const degradeStatsRef = useRef({ total: 0, truncated: 0, schema: 0, lastWarnAt: 0 });
  const sceneGenStartRef = useRef(null);
  const sceneGenDurationHistoryRef = useRef(null);
  const lastFailedActionRef = useRef(null);

  const [lastSceneGenMs, setLastSceneGenMs] = useState(() => {
    const history = loadSceneGenDurationHistory();
    sceneGenDurationHistoryRef.current = history;
    return historyToSceneGenEstimateMs(history);
  });
  const [sceneGenStartTime, setSceneGenStartTime] = useState(null);
  const [avgSceneSizeBytes, setAvgSceneSizeBytes] = useState(() => {
    try {
      const v = Number(localStorage.getItem('rpgon_avg_scene_size_bytes'));
      return v > 0 ? v : null;
    } catch { return null; }
  });

  const { aiProvider, language, needsSystemEnabled, aiModelTier = 'premium', sdWebuiModel = '', sdWebuiSeed = null } = settings;
  const sdWebuiQualityPreset = settings.sdWebuiQualityPreset || 'balanced';
  const sdWebuiIpaEnabled = settings.sdWebuiIpaEnabled ?? (settings.sdWebuiIpaMode !== 'off');
  const sdWebuiIpaMode = sdWebuiIpaEnabled ? sdWebuiQualityPreset : 'off';
  const RESOLUTION_MAP = { low: 0.5, base: 1.0, high: 1.5 };
  const imageResolutionMultiplier = RESOLUTION_MAP[settings.imageResolutionPreset] ?? settings.imageResolutionMultiplier ?? 1;
  const QUALITY_STEPS = { speed: 6, balanced: 20, quality: 35 };
  const QUALITY_CFG = { speed: 2, balanced: 5, quality: 7 };
  const qualitySteps = QUALITY_STEPS[sdWebuiQualityPreset];
  const qualityCfg = QUALITY_CFG[sdWebuiQualityPreset];

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
      const { combatResult = null, forceRoll = null, entityTags = null, travelFailureReason = null } = sceneOptions || {};
      dispatch({ type: 'SET_GENERATING_SCENE', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      stream.resetStreamState();
      sceneGenStartRef.current = Date.now();
      setSceneGenStartTime(Date.now());

      devLog.emit({ category: 'pipeline', type: 'scene_gen_start', label: `Scene generation: ${isFirstScene ? 'FIRST' : playerAction?.slice(0, 60) || 'continue'}`, data: { playerAction, isFirstScene, isCustomAction, fromAutoPlayer, combatResult: !!combatResult, forceRoll } });

      let earlyImagePromise = null;

      try {
        const isIdleWorldEvent = playerAction && playerAction.startsWith('[IDLE_WORLD_EVENT');
        const isPassiveSceneAction = Boolean(isIdleWorldEvent || playerAction === '[WAIT]');

        const resolved = await resolveMechanics({
          state, playerAction, settings, isFirstScene, t,
          skipDiceRoll: true,
        });
        devLog.emit({ category: 'mechanics', type: 'resolve_mechanics', label: `Mechanics resolved${resolved.diceRoll ? ' (with dice)' : ''}${resolved.isRest ? ' (rest)' : ''}`, data: { diceRoll: resolved.diceRoll || null, isRest: resolved.isRest, restRecovery: resolved.restRecovery } });

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
                state.character?.age, state.character?.gender, { sdModel: sdWebuiModel, sdSeed: Number.isInteger(sdWebuiSeed) ? sdWebuiSeed : null, resolutionMultiplier: imageResolutionMultiplier, ipaMode: sdWebuiIpaMode, qualitySteps, qualityCfg }, imageSeriousness,
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
        devLog.emit({ category: 'pipeline', type: 'backend_stream_start', label: 'Backend SSE stream started', data: { campaignId: backendCampaignId, provider: settings.aiProvider } });
        const backendResult = await stream.callStream(backendCampaignId, playerAction, {
          resolved, isFirstScene, isCustomAction, fromAutoPlayer, combatResult, forceRoll, entityTags, travelFailureReason,
        });
        const result = backendResult.result;
        devLog.emit({ category: 'pipeline', type: 'backend_stream_complete', label: `Stream complete (${Date.now() - sceneGenStartRef.current}ms)`, data: { durationMs: Date.now() - sceneGenStartRef.current, hasCharacter: !!backendResult.character, sceneIndex: backendResult.sceneIndex } });
        dispatch({ type: 'ADD_AI_COST', payload: calculateSceneCost(settings, sceneModelConfig) });
        const authoritativeCharacterSnapshot = backendResult.character || null;
        const authoritativeQuests = backendResult.quests || null;
        const newlyUnlockedAchievements = Array.isArray(backendResult.newlyUnlockedAchievements)
          ? backendResult.newlyUnlockedAchievements
          : [];
        const updatedAchievementState = backendResult.updatedAchievementState || null;
        const sceneGenerationDurationMs = backendResult.generationDurationMs || null;
        const sceneResponseSizeBytes = backendResult.responseSizeBytes || null;
        if (backendResult.avgResponseSizeBytes > 0) {
          setAvgSceneSizeBytes(backendResult.avgResponseSizeBytes);
          try { localStorage.setItem('rpgon_avg_scene_size_bytes', String(backendResult.avgResponseSizeBytes)); } catch {}
        }

        const serverSceneId = backendResult.sceneId || null;
        const serverSceneIndex = Number.isInteger(backendResult.sceneIndex) ? backendResult.sceneIndex : null;
        if (serverSceneId && backendCampaignId && serverSceneIndex !== null) {
          storage.markSceneSavedRemotely(backendCampaignId, serverSceneIndex);
        }

        // Trade shortcut
        if (result?._tradeShortcut && result.stateChanges?.startTrade) {
          devLog.emit({ category: 'pipeline', type: 'trade_shortcut', label: 'Trade shortcut activated', severity: 'info' });
          dispatch({ type: 'APPLY_STATE_CHANGES', payload: { startTrade: result.stateChanges.startTrade } });
          stream.clearStreamingOutput();
          recordCompletedSceneGenTiming();
          dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
          return;
        }

        // Degraded mode warnings
        if (result?.meta?.degraded) {
          devLog.emit({ category: 'ai', type: 'degraded_mode', label: `Degraded: ${result.meta.degradeType || result.meta.reason || 'unknown'}`, severity: 'warn', data: { degradeType: result.meta.degradeType, reason: result.meta.reason, promptTruncated: result.meta.promptTruncated } });
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
        const hadCombatBefore = !!result.stateChanges?.combatUpdate?.active;
        injectCombatFallback(result, state, playerAction, isFirstScene, isPassiveSceneAction, t);
        const combatInjected = !hadCombatBefore && !!result.stateChanges?.combatUpdate?.active;
        if (combatInjected) devLog.emit({ category: 'combat', type: 'combat_fallback_injected', label: 'Combat fallback injected (AI missed combatUpdate)', severity: 'warn' });
        fillBestiaryStats(result, state);

        // Dice rolls
        const rawAiSpeech = {
          narrative: typeof result.narrative === 'string' ? result.narrative : '',
          dialogueSegments: Array.isArray(result.dialogueSegments)
            ? result.dialogueSegments.map(s => s && typeof s === 'object' ? { ...s } : s) : [],
          scenePacing: result.scenePacing || 'exploration',
        };

        if (result.creativityBonus > 0) {
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_creativity`, role: 'system', subtype: 'creativity_score', content: t('gameplay.creativityScoreChat', { bonus: result.creativityBonus }), creativityBonus: result.creativityBonus, timestamp: Date.now() } });
        }

        const { effectiveDiceRolls } = stream.processServerDiceRolls(result, resolved);

        if (effectiveDiceRolls.length > 0) {
          const lastRoll = effectiveDiceRolls[effectiveDiceRolls.length - 1];
          dispatch({ type: 'SET_MOMENTUM', payload: calculateNextMomentum(state.momentumBonus || 0, lastRoll.margin || lastRoll.sl || 0) });
        }

        // Dialogue repair
        const { finalSegments, stateChanges: mergedStateChanges } = processSceneDialogue(
          result, state, settings, dispatch,
          { isFirstScene, playerAction, isPassiveSceneAction, voicePools }
        );
        result.stateChanges = mergedStateChanges;

        // Build and dispatch scene
        const sceneId = serverSceneId || createSceneId();
        stopAllDialogAudio();
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
          const capturedSceneIndex = serverSceneIndex ?? state.scenes.length - 1;
          earlyImagePromise.then((imageUrl) => {
            if (imageUrl) {
              dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId: capturedSceneId, image: imageUrl } });
              autoSave();
              if (capturedSceneIndex >= 0) storage.saveSceneImageUpdate(state.campaign?.backendId, capturedSceneIndex, { imageUrl });
            }
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
          });
        }

        // Chat messages
        const earlyPlayerMsgSent = Boolean(resolved.diceRoll);
        if (!earlyPlayerMsgSent && !isFirstScene && playerAction && !isPassiveSceneAction) {
          const displayText = humanizePlayerAction(playerAction, t);
          if (displayText) {
            dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_player`, role: 'player', content: displayText, timestamp: Date.now() } });
          }
        }
        if (isIdleWorldEvent) {
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_world_event`, role: 'system', subtype: 'world_event', content: t('idle.worldEvent', 'Something stirs in the world...'), timestamp: Date.now() } });
        }
        if (playerAction === '[WAIT]') {
          dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_wait`, role: 'system', subtype: 'wait', content: t('gameplay.waitSystemMessage'), timestamp: Date.now() } });
        }
        dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: `msg_${Date.now()}_dm`, role: 'dm', sceneId, content: result.narrative, scenePacing: result.scenePacing || 'exploration', dialogueSegments: finalSegments, rawAiSpeech, soundEffect: result.soundEffect || null, dialogueIfQuestTargetCompleted: result.dialogueIfQuestTargetCompleted || null, generationDurationMs: sceneGenerationDurationMs, responseSizeBytes: sceneResponseSizeBytes, timestamp: Date.now() } });

        // State changes
        applyNeedsAndRest(result, resolved, needsSystemEnabled);
        const scBuckets = result.stateChanges ? Object.keys(result.stateChanges).filter((k) => result.stateChanges[k] != null) : [];
        devLog.emit({ category: 'state', type: 'apply_state_changes', label: `State changes: ${scBuckets.join(', ') || 'none'}`, data: { buckets: scBuckets, hasCharacterSnapshot: !!authoritativeCharacterSnapshot } });
        applySceneStateChanges({
          result, state, dispatch,
          authoritativeCharacterSnapshot, authoritativeQuests, ensureMissingInventoryImages, ensureMissingSpellImages, ensureMissingNpcPortraits, t,
          newlyUnlockedAchievements, updatedAchievementState,
          campaignId: backendCampaignId || null,
          sceneIndex: serverSceneIndex,
        });

        recordCompletedSceneGenTiming();
        devLog.emit({ category: 'pipeline', type: 'scene_gen_done', label: `Scene generation complete (${Date.now() - sceneGenStartRef.current}ms total)`, data: { totalMs: Date.now() - sceneGenStartRef.current, scenePacing: result.scenePacing, hasDiceRoll: !!result.diceRoll, questOffers: (result.questOffers || []).length } });
        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
        autoSave();

        // FE-side scene compression removed with no-BYOK cleanup. Backend
        // scene pipeline runs its own memoryCompressor.js post-scene, so the
        // client no longer needs to summarize old scenes itself.

        // Deferred image
        if (!earlyImagePromise && imageGenEnabled && hasImageKey) {
          dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
          try {
            let llmPromptOpts = {};
            if (settings.imagePromptLlmEnabled) {
              try {
                const llmResult = await aiService.generateImagePrompt({
                  imagePromptTags: result.imagePrompt || '',
                  narrative: (result.narrative || '').substring(0, 600),
                  imageProvider,
                  imageStyle,
                  darkPalette,
                  seriousness: imageSeriousness,
                  genre: state.campaign?.genre || 'Fantasy',
                  tone: state.campaign?.tone || 'Epic',
                  characterAge: state.character?.age || null,
                  characterGender: state.character?.gender || null,
                  customStyleEnabled: settings.imagePromptCustomStyleEnabled || false,
                  customStyle: settings.imagePromptCustomStyle || '',
                  provider: settings.imagePromptLlmProvider || 'openai',
                  model: settings.imagePromptLlmModel || null,
                });
                if (llmResult.prompt) {
                  llmPromptOpts.preBuiltPrompt = llmResult.prompt;
                  if (llmResult.negativePrompt) {
                    llmPromptOpts.preBuiltNegativePrompt = llmResult.negativePrompt;
                  }
                }
              } catch (llmErr) {
                console.warn('LLM image prompt generation failed, falling back to template:', llmErr.message);
              }
            }

            const { url: imageUrl, prompt: fullImagePrompt } = await imageService.generateSceneImage(
              result.narrative, state.campaign?.genre, state.campaign?.tone, imageApiKey, imageProvider,
              result.imagePrompt, state.campaign?.backendId, imageStyle, darkPalette,
              state.character?.age, state.character?.gender, { sdModel: sdWebuiModel, sdSeed: Number.isInteger(sdWebuiSeed) ? sdWebuiSeed : null, resolutionMultiplier: imageResolutionMultiplier, ipaMode: sdWebuiIpaMode, qualitySteps, qualityCfg, ...llmPromptOpts }, imageSeriousness,
              state.character?.portraitUrl || null
            );
            dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId, image: imageUrl, fullImagePrompt } });
            autoSave();
            const deferredIdx = serverSceneIndex ?? state.scenes.length - 1;
            if (deferredIdx >= 0) storage.saveSceneImageUpdate(state.campaign?.backendId, deferredIdx, { imageUrl, fullImagePrompt });
          } catch (imgErr) {
            console.warn('Image generation failed:', imgErr.message);
          } finally {
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
          }
        }

        return result;
      } catch (err) {
        devLog.emit({ category: 'system', type: 'scene_gen_error', label: `Error: ${err.message?.slice(0, 80)}`, severity: 'error', data: { message: err.message, code: err.code } });
        if (earlyImagePromise) {
          earlyImagePromise.finally(() => dispatch({ type: 'SET_GENERATING_IMAGE', payload: false }));
        }
        recordCompletedSceneGenTiming();

        const hasPartialNarrative = stream.hasPartialNarrative();
        const canRetry = RETRYABLE_CODES.has(err.code) || !err.code;

        if (hasPartialNarrative && canRetry) {
          lastFailedActionRef.current = { playerAction, isFirstScene, isCustomAction, fromAutoPlayer, sceneOptions };
          stream.setStreamError({
            message: err.message,
            code: err.code || null,
            canRetry: true,
          });
          dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
        } else {
          const errorMsg = err.message === 'insufficient_credits'
            ? t('credits.insufficient')
            : err.message;
          dispatch({ type: 'SET_ERROR', payload: errorMsg });
          dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
          stream.clearStreamingOutput();
        }
        throw err;
      }
    }
  );

  const retryAfterStreamError = useCallback(() => {
    const saved = lastFailedActionRef.current;
    if (!saved) return;
    lastFailedActionRef.current = null;
    stream.clearStreamingOutput();
    generateScene(saved.playerAction, saved.isFirstScene, saved.isCustomAction, saved.fromAutoPlayer, saved.sceneOptions).catch(() => {});
  }, [generateScene, stream.clearStreamingOutput]);

  const dismissStreamError = useCallback(() => {
    lastFailedActionRef.current = null;
    stream.clearStreamingOutput();
  }, [stream.clearStreamingOutput]);

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
    streamComplete: stream.streamComplete,
    streamError: stream.streamError,
    retryAfterStreamError,
    dismissStreamError,
    streamedBytes: stream.streamedBytes,
    avgSceneSizeBytes,
  };
}
