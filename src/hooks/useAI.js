import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../contexts/GameContext';
import { useSettings } from '../contexts/SettingsContext';
import { aiService } from '../services/ai';
import { imageService } from '../services/imageGen';
import { createSceneId } from '../services/gameState';

export function useAI() {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings } = useSettings();

  const { aiProvider, openaiApiKey, anthropicApiKey, imageGenEnabled, language } = settings;
  const apiKey = aiProvider === 'openai' ? openaiApiKey : anthropicApiKey;

  const generateScene = useCallback(
    async (playerAction, isFirstScene = false) => {
      dispatch({ type: 'SET_GENERATING_SCENE', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const result = await aiService.generateScene(
          state,
          settings.dmSettings,
          playerAction,
          isFirstScene,
          aiProvider,
          apiKey,
          language
        );

        const sceneId = createSceneId();
        const scene = {
          id: sceneId,
          narrative: result.narrative,
          dialogueSegments: result.dialogueSegments || [],
          soundEffect: result.soundEffect || null,
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
                modifier: result.diceRoll.modifier,
                total: result.diceRoll.total,
                dc: result.diceRoll.dc,
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

        if (result.stateChanges && Object.keys(result.stateChanges).length > 0) {
          dispatch({ type: 'APPLY_STATE_CHANGES', payload: result.stateChanges });
        }

        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });

        // Auto-save after scene resolution (delay for state to settle)
        setTimeout(() => autoSave(), 300);

        // Generate scene image asynchronously
        if (imageGenEnabled && openaiApiKey) {
          dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
          try {
            const imageUrl = await imageService.generateSceneImage(
              result.narrative,
              state.campaign?.genre,
              state.campaign?.tone,
              openaiApiKey
            );
            dispatch({
              type: 'UPDATE_SCENE_IMAGE',
              payload: { sceneId, image: imageUrl },
            });
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
    [state, settings, aiProvider, apiKey, openaiApiKey, imageGenEnabled, language, dispatch, autoSave, t]
  );

  const generateCampaign = useCallback(
    async (campaignSettings) => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const result = await aiService.generateCampaign(
          campaignSettings,
          aiProvider,
          apiKey,
          language
        );
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
      const result = await aiService.generateStoryPrompt(
        { genre, tone, style },
        aiProvider,
        apiKey,
        language
      );
      return result.prompt;
    },
    [aiProvider, apiKey, language]
  );

  const generateImageForScene = useCallback(
    async (sceneId, narrative) => {
      if (!imageGenEnabled || !openaiApiKey || !narrative) return;
      dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
      try {
        const imageUrl = await imageService.generateSceneImage(
          narrative,
          state.campaign?.genre,
          state.campaign?.tone,
          openaiApiKey
        );
        dispatch({
          type: 'UPDATE_SCENE_IMAGE',
          payload: { sceneId, image: imageUrl },
        });
      } catch (imgErr) {
        console.warn('Image generation failed:', imgErr.message);
      } finally {
        dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
      }
    },
    [state.campaign?.genre, state.campaign?.tone, imageGenEnabled, openaiApiKey, dispatch]
  );

  return { generateScene, generateCampaign, generateStoryPrompt, generateImageForScene };
}
