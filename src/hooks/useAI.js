import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../contexts/GameContext';
import { useSettings } from '../contexts/SettingsContext';
import { aiService } from '../services/ai';
import { imageService } from '../services/imageGen';
import { createSceneId, calculateSL, rollD100 } from '../services/gameState';
import { contextManager } from '../services/contextManager';
import { calculateCost } from '../services/costTracker';
import { generateStateChangeMessages } from '../services/stateChangeMessages';
import { validateStateChanges } from '../services/stateValidator';
import { processStateChanges as processAchievements } from '../services/achievementTracker';
import { repairDialogueSegments } from '../services/aiResponseValidator';

export function useAI() {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings } = useSettings();

  const { aiProvider, openaiApiKey, anthropicApiKey, imageGenEnabled, imageProvider, stabilityApiKey, language, needsSystemEnabled, localLLMEnabled, localLLMEndpoint, localLLMModel, localLLMReducedPrompt, aiModelTier = 'premium' } = settings;
  const apiKey = aiProvider === 'openai' ? openaiApiKey : anthropicApiKey;
  const alternateApiKey = aiProvider === 'openai' ? anthropicApiKey : openaiApiKey;
  const imageApiKey = imageProvider === 'stability' ? stabilityApiKey : openaiApiKey;
  const localLLMConfig = localLLMEnabled ? { enabled: true, endpoint: localLLMEndpoint, model: localLLMModel, reducedPrompt: localLLMReducedPrompt } : null;

  const generateScene = useCallback(
    async (playerAction, isFirstScene = false, isCustomAction = false) => {
      dispatch({ type: 'SET_GENERATING_SCENE', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        let enhancedContext = !isFirstScene ? contextManager.buildEnhancedContext(state) : null;
        if (enhancedContext && state.world?.knowledgeBase) {
          const lastScene = state.scenes?.[state.scenes.length - 1];
          const relevantMemories = contextManager.retrieveRelevantKnowledge(
            state.world.knowledgeBase, lastScene?.narrative, playerAction
          );
          if (relevantMemories) {
            enhancedContext = { ...enhancedContext, relevantMemories };
          }
        }
        if (enhancedContext && state.world?.codex) {
          const lastScene = state.scenes?.[state.scenes.length - 1];
          const relevantCodex = contextManager.retrieveRelevantCodex(
            state.world.codex, lastScene?.narrative, playerAction
          );
          if (relevantCodex) {
            enhancedContext = { ...enhancedContext, relevantCodex };
          }
        }
        const testsFrequency = settings.dmSettings?.testsFrequency ?? 50;
        const shouldRollDice = Math.random() * 100 < testsFrequency;
        const preRolledDice = (!isFirstScene && shouldRollDice) ? rollD100() : null;
        const skipDiceRoll = !isFirstScene && !shouldRollDice;
        const momentumBonus = state.momentumBonus || 0;
        const { result, usage } = await aiService.generateScene(
          state,
          settings.dmSettings,
          playerAction,
          isFirstScene,
          aiProvider,
          apiKey,
          language,
          enhancedContext,
          { needsSystemEnabled, isCustomAction, preRolledDice, skipDiceRoll, momentumBonus, localLLMConfig, modelTier: aiModelTier, alternateApiKey }
        );
        if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });

        if (result.diceRoll && result.diceRoll.roll != null && result.diceRoll.target != null) {
          const roll = result.diceRoll.roll;
          const bonus = result.diceRoll.creativityBonus || 0;
          const momentum = result.diceRoll.momentumBonus || 0;
          const effectiveTarget = result.diceRoll.target;

          if (!result.diceRoll.baseTarget && (bonus > 0 || momentum !== 0)) {
            result.diceRoll.baseTarget = effectiveTarget - bonus - momentum;
          }

          const isCriticalSuccess = roll >= 1 && roll <= 4;
          const isCriticalFailure = roll >= 96 && roll <= 100;
          const isSuccess = isCriticalSuccess || (!isCriticalFailure && roll <= effectiveTarget);

          result.diceRoll.success = isSuccess;
          result.diceRoll.criticalSuccess = isCriticalSuccess;
          result.diceRoll.criticalFailure = isCriticalFailure;
          result.diceRoll.sl = calculateSL(roll, effectiveTarget);

          const sl = result.diceRoll.sl;
          dispatch({ type: 'SET_MOMENTUM', payload: sl * 5 });
        }

        const repairedSegments = repairDialogueSegments(
          result.narrative,
          result.dialogueSegments || [],
          [...(state.world?.npcs || []), ...(result.stateChanges?.npcs || [])]
        );

        const sceneId = createSceneId();
        const questOffers = (result.questOffers || []).map((offer) => ({
          ...offer,
          objectives: (offer.objectives || []).map((obj) => ({ ...obj, completed: false })),
          status: 'pending',
        }));
        const scene = {
          id: sceneId,
          narrative: result.narrative,
          dialogueSegments: repairedSegments,
          soundEffect: result.soundEffect || null,
          musicPrompt: result.musicPrompt || null,
          imagePrompt: result.imagePrompt || null,
          musicUrl: null,
          image: null,
          actions: result.suggestedActions || [],
          questOffers,
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
              subtype: 'dice_roll',
              content: t('system.diceRollMessage', {
                skill: result.diceRoll.skill,
                roll: result.diceRoll.roll,
                target: result.diceRoll.target || result.diceRoll.dc,
                sl: result.diceRoll.sl ?? 0,
                result: result.diceRoll.criticalSuccess
                  ? t('common.criticalSuccess')
                  : result.diceRoll.criticalFailure
                    ? t('common.criticalFailure')
                    : result.diceRoll.success ? t('common.success') : t('common.failure'),
              }),
              diceData: result.diceRoll,
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
            dialogueSegments: repairedSegments,
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
          const { validated, warnings, corrections } = validateStateChanges(result.stateChanges, state);
          result.stateChanges = validated;

          dispatch({ type: 'PUSH_UNDO' });
          dispatch({ type: 'APPLY_STATE_CHANGES', payload: validated });

          for (const warn of [...warnings, ...corrections]) {
            dispatch({
              type: 'ADD_CHAT_MESSAGE',
              payload: {
                id: `msg_${Date.now()}_val_${Math.random().toString(36).slice(2, 5)}`,
                role: 'system',
                subtype: 'validation_warning',
                content: `⚠ ${warn}`,
                timestamp: Date.now(),
              },
            });
          }

          const scMessages = generateStateChangeMessages(validated, state, t);
          for (const msg of scMessages) {
            dispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg });
          }

          const { newlyUnlocked, updatedAchievementState } = processAchievements(
            state.achievements, validated, state
          );
          if (updatedAchievementState) {
            dispatch({ type: 'UPDATE_ACHIEVEMENTS', payload: updatedAchievementState });
          }
          for (const ach of newlyUnlocked) {
            dispatch({
              type: 'ADD_CHAT_MESSAGE',
              payload: {
                id: `msg_${Date.now()}_ach_${ach.id}`,
                role: 'system',
                subtype: 'achievement_unlocked',
                content: `${ach.icon || '🏆'} ${t('achievements.unlocked', 'Achievement unlocked')}: ${ach.name}`,
                timestamp: Date.now(),
              },
            });
            if (ach.xpReward && state.character) {
              dispatch({ type: 'APPLY_STATE_CHANGES', payload: { xp: ach.xpReward } });
            }
          }
        }

        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });

        // Auto-save after scene resolution (delay for state to settle)
        setTimeout(() => autoSave(), 300);

        // Compress old scenes in the background when threshold exceeded
        if (contextManager.needsCompression(state)) {
          contextManager.compressOldScenes(state, aiProvider, apiKey, language, aiModelTier).then((compResult) => {
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
    [state, settings, aiProvider, apiKey, alternateApiKey, imageApiKey, imageProvider, imageGenEnabled, language, needsSystemEnabled, aiModelTier, dispatch, autoSave, t]
  );

  const generateCampaign = useCallback(
    async (campaignSettings) => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const { result, usage } = await aiService.generateCampaign(
          campaignSettings,
          aiProvider,
          apiKey,
          language,
          aiModelTier,
          { alternateApiKey }
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
    [aiProvider, apiKey, alternateApiKey, language, aiModelTier, dispatch]
  );

  const generateStoryPrompt = useCallback(
    async ({ genre, tone, style }) => {
      const { result, usage } = await aiService.generateStoryPrompt(
        { genre, tone, style },
        aiProvider,
        apiKey,
        language,
        aiModelTier,
        { alternateApiKey }
      );
      if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
      return result.prompt;
    },
    [aiProvider, apiKey, alternateApiKey, language, aiModelTier, dispatch]
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

  const verifyQuestObjective = useCallback(
    async (questId, objectiveId) => {
      const quest = state.quests?.active?.find((q) => q.id === questId);
      if (!quest) throw new Error('Quest not found');
      const objective = quest.objectives?.find((o) => o.id === objectiveId);
      if (!objective) throw new Error('Objective not found');

      const world = state.world || {};
      const parts = [];
      if (world.compressedHistory) {
        parts.push(`ARCHIVED HISTORY:\n${world.compressedHistory}`);
      }
      if (world.eventHistory?.length > 0) {
        parts.push(`STORY JOURNAL:\n${world.eventHistory.map((e, i) => `${i + 1}. ${e}`).join('\n')}`);
      }
      const enhancedContext = contextManager.buildEnhancedContext(state);
      const sceneText = contextManager.formatSceneHistory(enhancedContext);
      if (sceneText) parts.push(`SCENE HISTORY:\n${sceneText}`);

      const storyContext = parts.join('\n\n') || 'No story events yet.';

      const { result, usage } = await aiService.verifyObjective(
        storyContext, quest.name, quest.description, objective.description,
        aiProvider, apiKey, language, aiModelTier, { alternateApiKey }
      );
      if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });

      if (result.fulfilled) {
        dispatch({
          type: 'APPLY_STATE_CHANGES',
          payload: { questUpdates: [{ questId, objectiveId, completed: true }] },
        });
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `msg_${Date.now()}_verify`,
            role: 'system',
            subtype: 'quest_objective_completed',
            content: t('system.questObjectiveVerified', { quest: quest.name, objective: objective.description }),
            timestamp: Date.now(),
          },
        });
        setTimeout(() => autoSave(), 300);
      }

      return result;
    },
    [state, aiProvider, apiKey, alternateApiKey, language, aiModelTier, dispatch, autoSave, t]
  );

  const acceptQuestOffer = useCallback(
    (sceneId, questOffer) => {
      const quest = {
        id: questOffer.id,
        name: questOffer.name,
        description: questOffer.description,
        completionCondition: questOffer.completionCondition,
        objectives: (questOffer.objectives || []).map((obj) => ({
          ...obj,
          completed: false,
        })),
      };
      dispatch({ type: 'ADD_QUEST', payload: quest });
      dispatch({
        type: 'UPDATE_SCENE_QUEST_OFFER',
        payload: { sceneId, offerId: questOffer.id, status: 'accepted' },
      });
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `msg_${Date.now()}_quest_accept`,
          role: 'system',
          subtype: 'quest_new',
          content: t('system.questNew', { quest: questOffer.name }),
          timestamp: Date.now(),
        },
      });
      setTimeout(() => autoSave(), 300);
    },
    [dispatch, autoSave, t]
  );

  const declineQuestOffer = useCallback(
    (sceneId, offerId) => {
      dispatch({
        type: 'UPDATE_SCENE_QUEST_OFFER',
        payload: { sceneId, offerId, status: 'declined' },
      });
    },
    [dispatch]
  );

  return { generateScene, generateCampaign, generateStoryPrompt, generateImageForScene, verifyQuestObjective, acceptQuestOffer, declineQuestOffer };
}
