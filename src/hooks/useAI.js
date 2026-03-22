import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../contexts/GameContext';
import { useSettings } from '../contexts/SettingsContext';
import { aiService } from '../services/ai';
import { imageService } from '../services/imageGen';
import { createSceneId } from '../services/gameState';
import { contextManager } from '../services/contextManager';
import { calculateCost } from '../services/costTracker';

export function useAI() {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings } = useSettings();

  const { aiProvider, openaiApiKey, anthropicApiKey, imageGenEnabled, imageProvider, stabilityApiKey, language, needsSystemEnabled } = settings;
  const apiKey = aiProvider === 'openai' ? openaiApiKey : anthropicApiKey;
  const imageApiKey = imageProvider === 'stability' ? stabilityApiKey : openaiApiKey;

  const generateScene = useCallback(
    async (playerAction, isFirstScene = false) => {
      dispatch({ type: 'SET_GENERATING_SCENE', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const enhancedContext = !isFirstScene ? contextManager.buildEnhancedContext(state) : null;
        const { result, usage } = await aiService.generateScene(
          state,
          settings.dmSettings,
          playerAction,
          isFirstScene,
          aiProvider,
          apiKey,
          language,
          enhancedContext,
          { needsSystemEnabled }
        );
        if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });

        const sceneId = createSceneId();
        const scene = {
          id: sceneId,
          narrative: result.narrative,
          dialogueSegments: result.dialogueSegments || [],
          soundEffect: result.soundEffect || null,
          musicPrompt: result.musicPrompt || null,
          imagePrompt: result.imagePrompt || null,
          musicUrl: null,
          image: null,
          actions: result.suggestedActions || [],
          chosenAction: playerAction,
          diceRoll: result.diceRoll || null,
          timestamp: Date.now(),
        };

        dispatch({ type: 'ADD_SCENE', payload: scene });

        if (!isFirstScene && playerAction) {
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_player`,
              role: 'player',
              content: playerAction,
              timestamp: Date.now(),
            },
          });
        }

        if (result.diceRoll) {
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_roll`,
              role: 'system',
              content: t('system.diceRollMessage', {
                skill: result.diceRoll.skill,
                roll: result.diceRoll.roll,
                target: result.diceRoll.target || result.diceRoll.dc,
                sl: result.diceRoll.sl ?? 0,
                result: result.diceRoll.success ? t('common.success') : t('common.failure'),
              }),
              timestamp: Date.now(),
            },
          });
        }

        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `msg_${Date.now()}_dm`,
            role: 'dm',
            content: result.narrative,
            dialogueSegments: result.dialogueSegments || [],
            soundEffect: result.soundEffect || null,
            timestamp: Date.now(),
          },
        });

        if (needsSystemEnabled) {
          if (!result.stateChanges) result.stateChanges = {};
          if (!result.stateChanges.timeAdvance) {
            result.stateChanges.timeAdvance = { hoursElapsed: 0.5 };
          } else if (!result.stateChanges.timeAdvance.hoursElapsed) {
            result.stateChanges.timeAdvance.hoursElapsed = 0.5;
          }
        }

        if (result.stateChanges && Object.keys(result.stateChanges).length > 0) {
          dispatch({ type: 'APPLY_STATE_CHANGES', payload: result.stateChanges });
        }

        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });

        // Auto-save after scene resolution (delay for state to settle)
        setTimeout(() => autoSave(), 300);

        // Compress old scenes in the background when threshold exceeded
        if (contextManager.needsCompression(state)) {
          contextManager.compressOldScenes(state, aiProvider, apiKey, language).then((compResult) => {
            if (compResult?.summary) {
              dispatch({ type: 'UPDATE_WORLD', payload: { compressedHistory: compResult.summary } });
              setTimeout(() => autoSave(), 300);
            }
            if (compResult?.usage) {
              dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', compResult.usage) });
            }
          });
        }

        // Generate scene image asynchronously
        if (imageGenEnabled && imageApiKey) {
          dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
          try {
            const imageUrl = await imageService.generateSceneImage(
              result.narrative,
              state.campaign?.genre,
              state.campaign?.tone,
              imageApiKey,
              imageProvider,
              result.imagePrompt
            );
            dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
            dispatch({
              type: 'UPDATE_SCENE_IMAGE',
              payload: { sceneId, image: imageUrl },
            });
            setTimeout(() => autoSave(), 300);
          } catch (imgErr) {
            console.warn('Image generation failed:', imgErr.message);
          } finally {
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
          }
        }

        return result;
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
        throw err;
      }
    },
    [state, settings, aiProvider, apiKey, imageApiKey, imageProvider, imageGenEnabled, language, needsSystemEnabled, dispatch, autoSave, t]
  );

  const generateCampaign = useCallback(
    async (campaignSettings) => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const { result, usage } = await aiService.generateCampaign(
          campaignSettings,
          aiProvider,
          apiKey,
          language
        );
        if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
        return result;
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
        throw err;
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    [aiProvider, apiKey, language, dispatch]
  );

  const generateStoryPrompt = useCallback(
    async ({ genre, tone, style }) => {
      const { result, usage } = await aiService.generateStoryPrompt(
        { genre, tone, style },
        aiProvider,
        apiKey,
        language
      );
      if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
      return result.prompt;
    },
    [aiProvider, apiKey, language, dispatch]
  );

  const generateImageForScene = useCallback(
    async (sceneId, narrative, imagePrompt, campaignOverride) => {
      if (!imageGenEnabled || !imageApiKey || !narrative) return null;
      dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
      try {
        const sceneImagePrompt = imagePrompt || state.scenes?.find((s) => s.id === sceneId)?.imagePrompt;
        const genre = campaignOverride?.genre ?? state.campaign?.genre;
        const tone = campaignOverride?.tone ?? state.campaign?.tone;
        const imageUrl = await imageService.generateSceneImage(
          narrative,
          genre,
          tone,
          imageApiKey,
          imageProvider,
          sceneImagePrompt
        );
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
        dispatch({
          type: 'UPDATE_SCENE_IMAGE',
          payload: { sceneId, image: imageUrl },
        });
        setTimeout(() => autoSave(), 300);
        return imageUrl;
      } catch (imgErr) {
        console.warn('Image generation failed:', imgErr.message);
        return null;
      } finally {
        dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
      }
    },
    [state.scenes, state.campaign?.genre, state.campaign?.tone, imageGenEnabled, imageApiKey, imageProvider, dispatch, autoSave]
  );

  return { generateScene, generateCampaign, generateStoryPrompt, generateImageForScene };
}
