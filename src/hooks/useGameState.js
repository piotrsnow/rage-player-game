import { useCallback } from 'react';
import { useGame, createDefaultNeeds } from '../contexts/GameContext';
import { storage } from '../services/storage';
import { createCampaignId, createSceneId, createQuestId, generateCharacteristics, calculateWounds } from '../services/gameState';
import { SPECIES, CHARACTERISTIC_KEYS, getCareerByName } from '../data/wfrp';

function buildWfrpCharacter(aiResult, campaignSettings) {
  const speciesName = campaignSettings.species || aiResult.characterSuggestion?.species || 'Human';
  const species = SPECIES[speciesName] || SPECIES.Human;

  const aiChar = aiResult.characterSuggestion || {};
  const characteristics = aiChar.characteristics || generateCharacteristics(speciesName);

  const advances = {};
  for (const key of CHARACTERISTIC_KEYS) {
    advances[key] = 0;
  }

  const careerName = aiChar.career?.name || campaignSettings.careerPreference || 'Soldier';
  const careerDef = getCareerByName(careerName);
  const careerClass = careerDef?.class || aiChar.career?.class || 'Warriors';
  const tier = aiChar.career?.tier || 1;
  const tierData = careerDef?.tiers?.[tier - 1];

  const career = {
    class: careerClass,
    name: careerName,
    tier,
    tierName: tierData?.name || aiChar.career?.tierName || careerName,
    status: tierData?.status || aiChar.career?.status || 'Silver 1',
  };

  const maxWounds = calculateWounds(characteristics);

  const skills = {};
  if (aiChar.skills && typeof aiChar.skills === 'object' && !Array.isArray(aiChar.skills)) {
    Object.assign(skills, aiChar.skills);
  } else if (tierData?.skills) {
    for (const skill of tierData.skills) {
      skills[skill] = 5;
    }
  }

  const talents = aiChar.talents || tierData?.talents?.slice(0, 2) || [];

  return {
    name: campaignSettings.characterName?.trim() || aiChar.name || 'Adventurer',
    species: speciesName,
    career,
    xp: 0,
    xpSpent: 0,
    characteristics,
    advances,
    wounds: maxWounds,
    maxWounds,
    movement: species.movement,
    fate: aiChar.fate ?? species.fate,
    fortune: aiChar.fate ?? species.fate,
    resilience: aiChar.resilience ?? species.resilience,
    resolve: aiChar.resilience ?? species.resilience,
    skills,
    talents,
    inventory: aiChar.inventory || [],
    statuses: [],
    backstory: aiChar.backstory || '',
    needs: createDefaultNeeds(),
  };
}

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

      const character = campaignSettings.existingCharacter
        ? {
            ...campaignSettings.existingCharacter,
            needs: campaignSettings.existingCharacter.needs || createDefaultNeeds(),
          }
        : buildWfrpCharacter(aiResult, campaignSettings);

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
