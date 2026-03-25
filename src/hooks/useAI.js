import { useCallback, useRef } from 'react';
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
import { repairDialogueSegments, ensurePlayerDialogue } from '../services/aiResponseValidator';
import { checkWorldConsistency, applyConsistencyPatches, buildConsistencyWarningsForPrompt } from '../services/worldConsistency';
import { detectCombatIntent } from '../services/prompts';
import { resolveDiceRollCharacteristic, normalizeSkillName, inferSkillFromCharacter, pickBestSkill } from '../services/diceRollInference';

const MAX_COMBINED_BONUS = 30;
const MIN_DIFFICULTY_MODIFIER = -40;
const MAX_DIFFICULTY_MODIFIER = 40;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeDifficultyModifier(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER)
    : 0;
}

function snapDifficultyModifier(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.round(value / 10) * 10, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER);
}

export function useAI() {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings, hasApiKey } = useSettings();

  const compressionGenRef = useRef(0);
  const { aiProvider, openaiApiKey, anthropicApiKey, sceneVisualization, imageProvider, stabilityApiKey, geminiApiKey, language, needsSystemEnabled, localLLMEnabled, localLLMEndpoint, localLLMModel, localLLMReducedPrompt, aiModelTier = 'premium', aiModel = '' } = settings;
  const imageStyle = settings.dmSettings?.imageStyle || 'painting';
  const darkPalette = settings.dmSettings?.darkPalette || false;
  const imageGenEnabled = sceneVisualization === 'image';
  const apiKey = aiProvider === 'openai' ? openaiApiKey : anthropicApiKey;
  const alternateApiKey = aiProvider === 'openai' ? anthropicApiKey : openaiApiKey;
  const imgKeyProvider = imageProvider === 'stability' ? 'stability' : imageProvider === 'gemini' ? 'gemini' : 'openai';
  const imageApiKey = imageProvider === 'stability' ? stabilityApiKey : imageProvider === 'gemini' ? geminiApiKey : openaiApiKey;
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
            state.world.knowledgeBase, lastScene?.narrative, playerAction, state
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
        const isIdleWorldEvent = playerAction && playerAction.startsWith('[IDLE_WORLD_EVENT');
        const testsFrequency = settings.dmSettings?.testsFrequency ?? 50;
        const shouldRollDice = !isIdleWorldEvent && Math.random() * 100 < testsFrequency;
        const preRolledDice = (!isFirstScene && shouldRollDice) ? rollD100() : null;
        const skipDiceRoll = isIdleWorldEvent || (!isFirstScene && !shouldRollDice);
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
          { needsSystemEnabled, isCustomAction, preRolledDice, skipDiceRoll, momentumBonus, localLLMConfig, modelTier: aiModelTier, alternateApiKey, explicitModel: aiModel || null }
        );
        if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });

        if (!isFirstScene && !isIdleWorldEvent && detectCombatIntent(playerAction)) {
          const hasCombatUpdate = result.stateChanges?.combatUpdate && result.stateChanges.combatUpdate.active === true;
          if (!hasCombatUpdate) {
            console.warn('[useAI] Combat intent detected but AI omitted combatUpdate — retrying with reinforced prompt');
            try {
              const retryAction = `[SYSTEM: COMBAT MUST START THIS SCENE] ${playerAction}`;
              const { result: retryResult, usage: retryUsage } = await aiService.generateScene(
                state, settings.dmSettings, retryAction, false, aiProvider, apiKey, language, enhancedContext,
                { needsSystemEnabled, isCustomAction, preRolledDice, skipDiceRoll, momentumBonus, localLLMConfig, modelTier: aiModelTier, alternateApiKey, explicitModel: aiModel || null }
              );
              if (retryUsage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', retryUsage) });
              if (retryResult.stateChanges?.combatUpdate?.active === true) {
                console.log('[useAI] Retry succeeded — combatUpdate present');
                Object.assign(result, retryResult);
              } else {
                console.warn('[useAI] Retry also omitted combatUpdate — using original response');
              }
            } catch (retryErr) {
              console.warn('[useAI] Combat retry failed, using original response:', retryErr.message);
            }
          }
        }

        if (result.diceRoll && result.diceRoll.roll != null && result.diceRoll.target != null) {
          let resolvedCharacteristic = resolveDiceRollCharacteristic(result.diceRoll, playerAction);
          if (!resolvedCharacteristic) {
            result.diceRoll = null;
          } else {
            result.diceRoll.characteristic = resolvedCharacteristic;

            if (result.diceRoll.characteristicValue == null) {
              result.diceRoll.characteristicValue = state.character?.characteristics?.[resolvedCharacteristic] ?? null;
            }

            if (result.diceRoll.characteristicValue == null) {
              result.diceRoll = null;
            } else {
              const bestSkill = pickBestSkill(
                result.diceRoll.suggestedSkills,
                state.character?.skills,
                state.character?.characteristics,
              );
              if (bestSkill) {
                result.diceRoll.skill = bestSkill.skill;
                result.diceRoll.skillAdvances = bestSkill.advances;
                if (bestSkill.characteristic !== resolvedCharacteristic) {
                  resolvedCharacteristic = bestSkill.characteristic;
                  result.diceRoll.characteristic = resolvedCharacteristic;
                  result.diceRoll.characteristicValue =
                    state.character?.characteristics?.[resolvedCharacteristic] ?? result.diceRoll.characteristicValue;
                }
                result.diceRoll.baseTarget = result.diceRoll.characteristicValue + bestSkill.advances;
              }

              const originalTarget = result.diceRoll.target;
              const roll = result.diceRoll.roll;
              const bonus = result.diceRoll.creativityBonus || 0;
              const momentum = result.diceRoll.momentumBonus || 0;
              const disposition = result.diceRoll.dispositionBonus || 0;
              const providedDifficultyModifier = result.diceRoll.difficultyModifier != null
                ? normalizeDifficultyModifier(result.diceRoll.difficultyModifier)
                : null;

              let baseTarget;
              if (result.diceRoll.baseTarget) {
                baseTarget = result.diceRoll.baseTarget;
              } else if (result.diceRoll.characteristicValue != null && result.diceRoll.skillAdvances != null) {
                baseTarget = result.diceRoll.characteristicValue + result.diceRoll.skillAdvances;
              } else {
                baseTarget = result.diceRoll.target - bonus - momentum - disposition - (providedDifficultyModifier ?? 0);
              }
              result.diceRoll.baseTarget = baseTarget;

              if (result.diceRoll.skillAdvances == null && result.diceRoll.characteristicValue != null) {
                result.diceRoll.skillAdvances = Math.max(0, baseTarget - result.diceRoll.characteristicValue);
              }

              if (result.diceRoll.skill) {
                const normalized = normalizeSkillName(result.diceRoll.skill);
                if (normalized) {
                  result.diceRoll.skill = normalized;
                }
              }
              if (!result.diceRoll.skill && result.diceRoll.skillAdvances > 0) {
                const inferred = inferSkillFromCharacter(
                  resolvedCharacteristic,
                  result.diceRoll.skillAdvances,
                  state.character?.skills
                );
                if (inferred) result.diceRoll.skill = inferred;
              }

              const totalBonus = bonus + momentum + disposition;
              const cappedBonus = Math.min(totalBonus, MAX_COMBINED_BONUS);
              const difficultyModifier = providedDifficultyModifier ?? snapDifficultyModifier(originalTarget - baseTarget - cappedBonus);
              result.diceRoll.difficultyModifier = difficultyModifier;
              const effectiveTarget = baseTarget + cappedBonus + difficultyModifier;
              result.diceRoll.target = effectiveTarget;

              const isCriticalSuccess = roll >= 1 && roll <= 4;
              const isCriticalFailure = roll >= 96 && roll <= 100;
              const isSuccess = isCriticalSuccess || (!isCriticalFailure && roll <= effectiveTarget);

              result.diceRoll.success = isSuccess;
              result.diceRoll.criticalSuccess = isCriticalSuccess;
              result.diceRoll.criticalFailure = isCriticalFailure;
              result.diceRoll.sl = calculateSL(roll, effectiveTarget);

              const sl = result.diceRoll.sl;
              const currentMomentum = state.momentumBonus || 0;
              const newValue = sl * 5;
              let nextMomentum;
              if (sl === 0) {
                nextMomentum = currentMomentum > 0 ? Math.max(0, currentMomentum - 5) : currentMomentum < 0 ? Math.min(0, currentMomentum + 5) : 0;
              } else if (sl > 0) {
                if (currentMomentum < 0) {
                  nextMomentum = newValue;
                } else {
                  nextMomentum = newValue > currentMomentum ? newValue : Math.max(0, currentMomentum - 5);
                }
              } else {
                if (currentMomentum > 0) {
                  nextMomentum = newValue;
                } else {
                  nextMomentum = newValue < currentMomentum ? newValue : Math.min(0, currentMomentum + 5);
                }
              }
              dispatch({ type: 'SET_MOMENTUM', payload: Math.max(-30, Math.min(30, nextMomentum)) });
            }
          }
        }

        const activeChar = state.party?.find(c => c.id === state.activeCharacterId) || state.character;
        const playerNames = (state.party || [state.character]).map(c => c?.name).filter(Boolean);

        const repairedSegments = repairDialogueSegments(
          result.narrative,
          result.dialogueSegments || [],
          [...(state.world?.npcs || []), ...(result.stateChanges?.npcs || [])],
          playerNames
        );
        const finalSegments = (!isFirstScene && !isIdleWorldEvent)
          ? ensurePlayerDialogue(repairedSegments, playerAction, activeChar?.name, activeChar?.gender)
          : repairedSegments;

        const sceneId = createSceneId();
        const questOffers = (result.questOffers || []).map((offer) => ({
          ...offer,
          objectives: (offer.objectives || []).map((obj) => ({ ...obj, completed: false })),
          status: 'pending',
        }));
        const scene = {
          id: sceneId,
          narrative: result.narrative,
          dialogueSegments: finalSegments,
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

        if (!isFirstScene && playerAction && !isIdleWorldEvent) {
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

        if (isIdleWorldEvent) {
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_world_event`,
              role: 'system',
              subtype: 'world_event',
              content: t('idle.worldEvent', 'Something stirs in the world...'),
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
            sceneId,
            content: result.narrative,
            dialogueSegments: finalSegments,
            soundEffect: result.soundEffect || null,
            timestamp: Date.now(),
          },
        });

        if (needsSystemEnabled) {
          if (!result.stateChanges) result.stateChanges = {};
          if (!result.stateChanges.timeAdvance) {
            result.stateChanges.timeAdvance = { hoursElapsed: 0.5 };
          } else if (result.stateChanges.timeAdvance.hoursElapsed == null) {
            result.stateChanges.timeAdvance.hoursElapsed = 0.5;
          }
        }

        if (result.stateChanges && Object.keys(result.stateChanges).length > 0) {
          const { validated, warnings, corrections } = validateStateChanges(result.stateChanges, state);
          result.stateChanges = validated;

          const previousFactions = { ...(state.world?.factions || {}) };

          dispatch({ type: 'PUSH_UNDO' });
          dispatch({ type: 'APPLY_STATE_CHANGES', payload: validated });

          // Run world consistency checker after state changes
          const postState = {
            ...state,
            world: { ...state.world, factions: { ...(state.world?.factions || {}), ...(validated.factionChanges || {}) } },
          };
          const consistency = checkWorldConsistency(postState, previousFactions);
          const patches = applyConsistencyPatches(postState, consistency.statePatches);
          if (patches) {
            if (patches.npcs) {
              dispatch({ type: 'UPDATE_WORLD', payload: { npcs: patches.npcs } });
            }
            if (patches.newWorldFacts?.length > 0) {
              dispatch({ type: 'APPLY_STATE_CHANGES', payload: { worldFacts: patches.newWorldFacts } });
            }
          }

          for (const warn of [...warnings, ...corrections, ...consistency.corrections]) {
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

        if (contextManager.needsCompression(state)) {
          const gen = ++compressionGenRef.current;
          contextManager.compressOldScenes(state, aiProvider, apiKey, language, aiModelTier).then((compResult) => {
            if (gen !== compressionGenRef.current) return;
            if (compResult?.summary) {
              const worldUpdate = { compressedHistory: compResult.summary };
              if (compResult.entitySnapshot) {
                worldUpdate.compressedEntityState = compResult.entitySnapshot;
              }
              dispatch({ type: 'UPDATE_WORLD', payload: worldUpdate });
              setTimeout(() => autoSave(), 300);
            }
            if (compResult?.usage) {
              dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', compResult.usage) });
            }
          });
        }

        const hasImageKey = imageApiKey || hasApiKey(imgKeyProvider);
        if (imageGenEnabled && hasImageKey) {
          dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
          try {
            const imageUrl = await imageService.generateSceneImage(
              result.narrative,
              state.campaign?.genre,
              state.campaign?.tone,
              imageApiKey,
              imageProvider,
              result.imagePrompt,
              state.campaign?.backendId,
              imageStyle,
              darkPalette
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
    [state, settings, aiProvider, apiKey, alternateApiKey, imageApiKey, imageProvider, imageGenEnabled, imageStyle, darkPalette, language, needsSystemEnabled, aiModelTier, aiModel, hasApiKey, dispatch, autoSave, t]
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
    [aiProvider, apiKey, alternateApiKey, language, aiModelTier, aiModel, dispatch]
  );

  const generateStoryPrompt = useCallback(
    async ({ genre, tone, style, seedText = '' }) => {
      const { result, usage } = await aiService.generateStoryPrompt(
        { genre, tone, style, seedText },
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
      const hasImgKey = imageApiKey || hasApiKey(imgKeyProvider);
      if (!imageGenEnabled || !hasImgKey || !narrative) return null;
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
          sceneImagePrompt,
          state.campaign?.backendId,
          imageStyle,
          darkPalette
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
    [state.scenes, state.campaign?.genre, state.campaign?.tone, imageGenEnabled, imageApiKey, imageProvider, imageStyle, darkPalette, hasApiKey, dispatch, autoSave]
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

  return { generateScene, generateCampaign, generateStoryPrompt, generateCombatCommentary, generateImageForScene, verifyQuestObjective, acceptQuestOffer, declineQuestOffer };
}
