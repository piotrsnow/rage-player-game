import { useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { storage } from '../services/storage';
import { createCampaignId, createSceneId, createQuestId } from '../services/gameState';

export function useGameState() {
  const { state, dispatch, autoSave } = useGame();

  const startNewCampaign = useCallback(
    (aiResult, campaignSettings) => {
      const campaignId = createCampaignId();
      const campaign = {
        id: campaignId,
        name: aiResult.name,
        genre: campaignSettings.genre,
        tone: campaignSettings.tone,
        style: campaignSettings.style,
        difficulty: campaignSettings.difficulty,
        length: campaignSettings.length,
        worldDescription: aiResult.worldDescription,
        hook: aiResult.hook,
      };

      const character = {
        name: campaignSettings.characterName?.trim() || aiResult.characterSuggestion?.name || 'Adventurer',
        class: aiResult.characterSuggestion?.class || 'Wanderer',
        level: 1,
        xp: 0,
        hp: 100,
        maxHp: 100,
        mana: 50,
        maxMana: 50,
        stats: { str: 10, dex: 12, con: 10, int: 14, wis: 12, cha: 10 },
        inventory: [],
        statuses: [],
        skills: [],
        backstory: aiResult.characterSuggestion?.backstory || '',
      };

      const firstScene = {
        id: createSceneId(),
        narrative: aiResult.firstScene?.narrative || aiResult.hook,
        dialogueSegments: aiResult.firstScene?.dialogueSegments || [],
        soundEffect: aiResult.firstScene?.soundEffect || null,
        image: null,
        actions: aiResult.firstScene?.suggestedActions || [],
        chosenAction: null,
        diceRoll: null,
        timestamp: Date.now(),
      };

      const chatHistory = [
        {
          id: `msg_${Date.now()}_dm`,
          role: 'dm',
          content: aiResult.firstScene?.narrative || aiResult.hook,
          dialogueSegments: aiResult.firstScene?.dialogueSegments || [],
          soundEffect: aiResult.firstScene?.soundEffect || null,
          timestamp: Date.now(),
        },
      ];

      const quests = {
        active: aiResult.initialQuest
          ? [{ id: createQuestId(), ...aiResult.initialQuest }]
          : [],
        completed: [],
      };

      const world = {
        locations: [],
        facts: aiResult.initialWorldFacts || [],
        eventHistory: aiResult.firstScene?.journalEntries || [],
      };

      dispatch({
        type: 'START_CAMPAIGN',
        payload: { campaign, character, world, scenes: [firstScene], chatHistory },
      });

      // Also set quests via separate dispatch
      if (quests.active.length > 0) {
        quests.active.forEach((q) => dispatch({ type: 'ADD_QUEST', payload: q }));
      }

      const fullState = {
        campaign,
        character,
        world,
        quests,
        scenes: [firstScene],
        chatHistory,
      };
      storage.saveCampaign(fullState);

      return campaignId;
    },
    [dispatch]
  );

  const loadCampaign = useCallback(
    (campaignId) => {
      const data = storage.loadCampaign(campaignId);
      if (data) {
        dispatch({ type: 'LOAD_CAMPAIGN', payload: data });
        return true;
      }
      return false;
    },
    [dispatch]
  );

  const resetGame = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  return {
    state,
    startNewCampaign,
    loadCampaign,
    resetGame,
    autoSave,
  };
}
