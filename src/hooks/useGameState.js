import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame, createDefaultNeeds } from '../contexts/GameContext';
import { storage } from '../services/storage';
import { createCampaignId, createSceneId, createQuestId, generateAttributes, calculateMaxWounds, generateStartingMoney } from '../services/gameState';
import { normalizeCharacterAge } from '../services/characterAge';
import { SPECIES, createStartingSkills } from '../data/rpgSystem';
import { gameData } from '../services/gameDataService';

function buildCharacter(aiResult, campaignSettings) {
  // If a fully pre-built character was created via the CharacterCreationModal, use it directly
  if (campaignSettings.createdCharacter) {
    const cc = campaignSettings.createdCharacter;
    return {
      ...cc,
      age: normalizeCharacterAge(cc.age),
      needs: cc.needs || createDefaultNeeds(),
    };
  }

  const speciesName = campaignSettings.species || aiResult.characterSuggestion?.species || 'Human';
  const species = SPECIES[speciesName] || SPECIES.Human;

  const aiChar = aiResult.characterSuggestion || {};
  const attributes = aiChar.attributes || generateAttributes(speciesName);

  const maxWounds = calculateMaxWounds(attributes.wytrzymalosc ?? 10);

  const skills = aiChar.skills && typeof aiChar.skills === 'object' && !Array.isArray(aiChar.skills)
    ? aiChar.skills
    : createStartingSkills(speciesName);

  return {
    name: campaignSettings.characterName?.trim() || aiChar.name || 'Adventurer',
    age: normalizeCharacterAge(aiChar.age ?? campaignSettings.characterAge),
    species: speciesName,
    characterLevel: 1,
    characterXp: 0,
    attributePoints: 0,
    attributes,
    wounds: maxWounds,
    maxWounds,
    movement: species.movement,
    mana: { current: species.startingMana || 0, max: species.startingMana || 0 },
    spells: { known: [], usageCounts: {}, scrolls: [] },
    skills,
    inventory: gameData.mapStartingInventoryToCatalog(aiChar.inventory || []),
    money: aiChar.money || generateStartingMoney(),
    statuses: [],
    backstory: aiChar.backstory || '',
    needs: createDefaultNeeds(),
  };
}

export function useGameState() {
  const { state, dispatch, autoSave } = useGame();
  const { t } = useTranslation();

  const startNewCampaign = useCallback(
    async (aiResult, campaignSettings) => {
      // Equipment catalog is needed by buildCharacter() to resolve AI starting
      // inventory items into real catalog baseTypes. Cached after first load.
      try {
        await gameData.loadEquipment();
      } catch (err) {
        console.warn('[useGameState] Failed to load equipment catalog before campaign start:', err.message);
      }
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
        characterIds: [], // populated after the character is saved below
      };

      const initialCharacter = campaignSettings.existingCharacter
        ? {
            attributes: generateAttributes(campaignSettings.existingCharacter.species || 'Human'),
            skills: createStartingSkills(campaignSettings.existingCharacter.species || 'Human'),
            inventory: [],
            money: { gold: 0, silver: 0, copper: 0 },
            movement: 4,
            mana: { current: 0, max: 0 },
            spells: { known: [], usageCounts: {}, scrolls: [] },
            statuses: [],
            backstory: '',
            ...campaignSettings.existingCharacter,
            age: normalizeCharacterAge(campaignSettings.existingCharacter.age),
            needs: campaignSettings.existingCharacter.needs || createDefaultNeeds(),
          }
        : buildCharacter(aiResult, campaignSettings);

      // If the character was pre-built (via CharacterCreationModal or library) and has no
      // inventory, fold in the AI's campaign-specific starting gear so it isn't lost.
      const aiStartingInventory = aiResult?.characterSuggestion?.inventory || [];
      const addedStartingItems = [];
      if ((!initialCharacter.inventory || initialCharacter.inventory.length === 0) && aiStartingInventory.length > 0) {
        const mapped = gameData.mapStartingInventoryToCatalog(aiStartingInventory);
        initialCharacter.inventory = mapped;
        addedStartingItems.push(...mapped);
      }

      // Persist character to its own collection FIRST so we get a backendId
      // to reference from the new campaign. Falls back to a local-only character
      // (no backendId) if backend is offline — campaign save will use that path.
      const character = await storage.saveCharacter(initialCharacter);

      const firstScene = {
        id: createSceneId(),
        narrative: aiResult.firstScene?.narrative || aiResult.hook,
        dialogueSegments: aiResult.firstScene?.dialogueSegments || [],
        soundEffect: aiResult.firstScene?.soundEffect || null,
        imagePrompt: aiResult.firstScene?.imagePrompt || null,
        sceneGrid: aiResult.firstScene?.sceneGrid || null,
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
          sceneId: firstScene.id,
          content: aiResult.firstScene?.narrative || aiResult.hook,
          dialogueSegments: aiResult.firstScene?.dialogueSegments || [],
          soundEffect: aiResult.firstScene?.soundEffect || null,
          timestamp: Date.now(),
        },
      ];

      if (addedStartingItems.length > 0) {
        const charName = initialCharacter.name || 'Character';
        const baseTs = Date.now();
        addedStartingItems.forEach((item, idx) => {
          const itemName = typeof item === 'string' ? item : item.name;
          chatHistory.push({
            id: `msg_${baseTs}_start_item_${idx}`,
            role: 'system',
            subtype: 'item_gained',
            content: t('system.itemGained', { name: charName, item: itemName }),
            timestamp: baseTs + idx,
          });
        });
      }

      const initialQuest = aiResult.initialQuest
        ? {
            id: createQuestId(),
            ...aiResult.initialQuest,
            objectives: (aiResult.initialQuest.objectives || []).map((obj) => ({
              ...obj,
              completed: obj.completed ?? false,
            })),
            questItems: (aiResult.initialQuest.questItems || []).map((item) => ({
              ...item,
            })),
          }
        : null;

      const quests = {
        active: initialQuest ? [initialQuest] : [],
        completed: [],
      };

      const initialNPCs = (aiResult.initialNPCs || []).map((npc) => ({
        id: `npc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: npc.name,
        gender: npc.gender || 'unknown',
        role: npc.role || '',
        personality: npc.personality || '',
        attitude: npc.attitude || 'neutral',
        lastLocation: npc.location || '',
        alive: true,
        notes: '',
        disposition: 0,
        factionId: npc.factionId || null,
        relatedQuestIds: initialQuest ? [initialQuest.id] : [],
        relationships: npc.relationships || [],
      }));

      const world = {
        locations: [],
        npcs: initialNPCs,
        facts: aiResult.initialWorldFacts || [],
        eventHistory: aiResult.firstScene?.journalEntries || [],
      };

      // The character now lives in /characters and is referenced from the
      // campaign by ID. backendId is only present if the backend was online
      // during saveCharacter; offline runs fall back to local-only persistence.
      if (character.backendId) {
        campaign.characterIds = [character.backendId];
      }

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
      await storage.saveCampaign(fullState);

      return campaign.backendId || campaignId;
    },
    [dispatch, t]
  );

  const loadCampaign = useCallback(
    async (campaignId) => {
      try {
        const data = await storage.loadCampaign(campaignId);
        if (data) {
          dispatch({ type: 'LOAD_CAMPAIGN', payload: data });
          return true;
        }
      } catch (err) {
        console.warn('[useGameState] Failed to load campaign:', err.message);
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
