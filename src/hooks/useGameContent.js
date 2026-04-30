import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../contexts/GameContext';
import { useSettings } from '../contexts/SettingsContext';
import { aiService } from '../services/ai';
import { calculateCost } from '../services/costTracker';
import { contextManager } from '../services/contextManager';

export function useGameContent() {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings } = useSettings();

  const { aiProvider, language, aiModelTier = 'premium', aiModel = '', sceneVisualization = 'image' } = settings;
  // API keys resolve server-side from env; these positional args exist only
  // for backward-compat with aiService and are ignored (see `_apiKeyIgnored`
  // params in src/services/ai/service.js).
  const apiKey = '';
  const alternateApiKey = '';

  const generateCampaign = useCallback(
    async (campaignSettings) => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const { result, usage } = await aiService.generateCampaign(
          { ...campaignSettings, sceneVisualization },
          aiProvider,
          apiKey,
          language,
          aiModelTier,
          { alternateApiKey, explicitModel: aiModel || null }
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
    [aiProvider, apiKey, alternateApiKey, language, aiModelTier, aiModel, sceneVisualization, dispatch]
  );

  const generateStoryPrompt = useCallback(
    async ({ genre, tone, seedText = '' }) => {
      const { result, usage } = await aiService.generateStoryPrompt(
        { genre, tone, seedText },
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

  const generateCharacterLegend = useCallback(
    async (character) => {
      const { result, usage } = await aiService.generateCharacterLegend(
        character,
        aiProvider,
        language,
        aiModelTier,
      );
      if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
      return result?.legend || '';
    },
    [aiProvider, language, aiModelTier, dispatch],
  );

  const generateRecap = useCallback(
    async (gameStateOverride = state, options = {}) => {
      const effectiveState = gameStateOverride || state;
      const { result, usage } = await aiService.generateRecap(
        effectiveState,
        settings.dmSettings,
        aiProvider,
        apiKey,
        language,
        aiModelTier,
        {
          alternateApiKey,
          sentencesPerScene: options.sentencesPerScene,
          summaryStyle: options.summaryStyle,
          onPartial: options.onPartial,
          onProgress: options.onProgress,
        }
      );
      if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
      return result?.recap || '';
    },
    [state, settings.dmSettings, aiProvider, apiKey, language, aiModelTier, alternateApiKey, dispatch]
  );

  const generateCombatCommentary = useCallback(
    async (combat, { gameState = state, recentResults = [], recentLogEntries = [] } = {}) => {
      if (!combat?.active) {
        throw new Error('Combat commentary requires an active combat state');
      }

      const activeCombatants = (combat.combatants || [])
        .filter((combatant) => !combatant.isDefeated)
        .map((combatant) => ({
          id: combatant.id,
          name: combatant.name,
          type: combatant.type,
          side: combatant.type === 'enemy' ? 'enemy' : 'friendly',
          wounds: combatant.wounds ?? 0,
          maxWounds: combatant.maxWounds ?? combatant.wounds ?? 0,
          isDefeated: Boolean(combatant.isDefeated),
        }));

      const defeatedCombatants = (combat.combatants || [])
        .filter((combatant) => combatant.isDefeated)
        .map((combatant) => ({
          id: combatant.id,
          name: combatant.name,
          type: combatant.type,
          side: combatant.type === 'enemy' ? 'enemy' : 'friendly',
          wounds: combatant.wounds ?? 0,
          maxWounds: combatant.maxWounds ?? combatant.wounds ?? 0,
          isDefeated: true,
        }));

      const summarizedResults = recentResults
        .filter(Boolean)
        .map((result) => {
          if (result.outcome === 'hit') {
            return `${result.actor} hits ${result.targetName || 'their target'} for ${result.damage ?? 0} damage${result.criticalHit ? ' with a critical blow' : ''}${result.targetDefeated ? ', defeating them' : ''}.`;
          }
          if (result.outcome === 'miss') {
            return `${result.actor} misses ${result.targetName || 'their target'}.`;
          }
          if (result.outcome === 'fled') {
            return `${result.actor} flees the fight.`;
          }
          if (result.outcome === 'failed_flee') {
            return `${result.actor} tries to flee but fails.`;
          }
          if (result.outcome === 'defensive') {
            return `${result.actor} focuses on ${result.manoeuvre || result.manoeuvreKey || 'defense'}.`;
          }
          return `${result.actor || 'A combatant'} presses the fight.`;
        });

      const combatSnapshot = {
        round: combat.round ?? 0,
        reason: combat.reason || '',
        activeCombatants,
        defeatedCombatants,
        recentResults: summarizedResults,
        recentLogEntries: recentLogEntries.filter(Boolean).slice(-5),
      };

      const { result, usage } = await aiService.generateCombatCommentary(
        gameState,
        combatSnapshot,
        aiProvider,
        apiKey,
        language,
        aiModelTier,
        { alternateApiKey, explicitModel: aiModel || null }
      );

      if (usage) {
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
      }

      const battleCries = Array.isArray(result.battleCries) ? result.battleCries : [];
      const dialogueSegments = [
        { type: 'narration', text: result.narration || '' },
        ...battleCries.map((cry) => ({
          type: 'dialogue',
          character: cry.speaker,
          text: cry.text,
        })),
      ].filter((segment) => segment.text);

      const content = [
        result.narration || '',
        ...battleCries.map((cry) => `${cry.speaker}: "${cry.text}"`),
      ].filter(Boolean).join('\n\n');

      return {
        narration: result.narration || '',
        battleCries,
        dialogueSegments,
        content,
      };
    },
    [state, aiProvider, apiKey, alternateApiKey, language, aiModelTier, aiModel, dispatch]
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
        autoSave();
      }

      return result;
    },
    [state, aiProvider, apiKey, alternateApiKey, language, aiModelTier, dispatch, autoSave, t]
  );

  return {
    generateCampaign,
    generateStoryPrompt,
    generateCharacterLegend,
    generateRecap,
    generateCombatCommentary,
    verifyQuestObjective,
  };
}
