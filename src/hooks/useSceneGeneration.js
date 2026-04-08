import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../contexts/GameContext';
import { useSettings } from '../contexts/SettingsContext';
import { aiService } from '../services/ai';
import { imageService } from '../services/imageGen';
import { apiClient } from '../services/apiClient';
import { createSceneId } from '../services/gameState';
import { contextManager } from '../services/contextManager';
import { calculateCost } from '../services/costTracker';
import { generateStateChangeMessages } from '../services/stateChangeMessages';
import { validateStateChanges } from '../services/stateValidator';
import { calculateDiceRollSkillXP } from '../data/rpgSystem';
import { processStateChanges as processAchievements } from '../services/achievementTracker';
import { repairDialogueSegments, ensurePlayerDialogue } from '../services/aiResponseValidator';
import { checkWorldConsistency, applyConsistencyPatches } from '../services/worldConsistency';
import { detectCombatIntent, buildSpeculativeImageDescription } from '../services/prompts';
import { calculateTensionScore } from '../services/tensionTracker';
import { checkPendingCallbacks, checkNpcAgendas, checkSeedResolution, checkQuestDeadlines, shouldGenerateDilemma } from '../services/narrativeEngine';
import { advanceDialogueRound } from '../services/dialogueEngine';
import { parsePartialJson } from '../services/partialJsonParser';
import { getSceneAIGovernance, resolvePromptProfile } from '../services/promptGovernance';
import { resolveMechanics } from '../services/mechanics/index';
import { calculateNextMomentum } from '../services/mechanics/momentumTracker';
import { gameData } from '../services/gameDataService';
import { loadSceneGenDurationHistory, appendSceneGenDuration, historyToSceneGenEstimateMs, persistSceneGenDurationHistory } from '../services/performanceTracker';
import { downgradeLowConfidenceDialogueSegments, hardRemoveNarrationDialogueRepeats } from '../services/textSanitizer';
import { demoteAnonymousDialogueSegments, normalizeIncomingDialogueSegments, enrichDialogueSpeakers, mergeNpcHintsFromDialogue } from '../services/dialogueProcessor';

export function useSceneGeneration({ ensureMissingInventoryImages, imageGenEnabled, imageApiKey, imageProvider, imageStyle, darkPalette, imageSeriousness, imgKeyProvider }) {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings, hasApiKey } = useSettings();

  const compressionGenRef = useRef(0);
  const compressionInFlightRef = useRef(false);
  const degradeStatsRef = useRef({ total: 0, truncated: 0, schema: 0, lastWarnAt: 0 });
  const sceneGenStartRef = useRef(null);
  const sceneGenDurationHistoryRef = useRef(null);
  const [earlyDiceRoll, setEarlyDiceRoll] = useState(null);
  const [streamingNarrative, setStreamingNarrative] = useState(null);
  const [streamingSegments, setStreamingSegments] = useState(null);
  const [lastSceneGenMs, setLastSceneGenMs] = useState(() => {
    const history = loadSceneGenDurationHistory();
    sceneGenDurationHistoryRef.current = history;
    return historyToSceneGenEstimateMs(history);
  });
  const [sceneGenStartTime, setSceneGenStartTime] = useState(null);

  const { aiProvider, openaiApiKey, anthropicApiKey, language, needsSystemEnabled, localLLMEnabled, localLLMEndpoint, localLLMModel, localLLMReducedPrompt, aiModelTier = 'premium', aiModel = '' } = settings;
  const apiKey = aiProvider === 'openai' ? openaiApiKey : anthropicApiKey;
  const alternateApiKey = aiProvider === 'openai' ? anthropicApiKey : openaiApiKey;
  const localLLMConfig = localLLMEnabled ? { enabled: true, endpoint: localLLMEndpoint, model: localLLMModel, reducedPrompt: localLLMReducedPrompt } : null;

  const inferSkillCheckFn = useCallback(
    async (actionText, characterSkills) => {
      if (localLLMConfig?.enabled) return null;
      const { result, usage } = await aiService.inferSkillCheck(
        actionText, characterSkills, aiProvider, apiKey, { alternateApiKey }
      );
      if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
      return result;
    },
    [aiProvider, apiKey, alternateApiKey, localLLMConfig?.enabled, dispatch]
  );

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

  const generateScene = useCallback(
    async (playerAction, isFirstScene = false, isCustomAction = false, fromAutoPlayer = false) => {
      dispatch({ type: 'SET_GENERATING_SCENE', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      setEarlyDiceRoll(null);
      sceneGenStartRef.current = Date.now();
      setSceneGenStartTime(Date.now());

      let earlyImagePromise = null;

      try {
        const promptProfile = resolvePromptProfile(settings.dmSettings, aiModelTier, Boolean(localLLMConfig?.enabled));
        const governance = getSceneAIGovernance({
          profileId: promptProfile,
          modelTier: aiModelTier,
          isFirstScene,
          localLLMEnabled: Boolean(localLLMConfig?.enabled),
          sceneCount: state.scenes?.length || 0,
        });
        const requestedContextDepth = settings.dmSettings?.contextDepth ?? 100;
        const contextDepth = contextManager.resolveContextDepth(requestedContextDepth, governance.profile.id, aiModelTier);
        let enhancedContext = !isFirstScene ? contextManager.buildEnhancedContext(state, contextDepth) : null;
        if (enhancedContext && contextDepth >= governance.knowledgeMinContextDepth && state.world?.knowledgeBase) {
          const lastScene = state.scenes?.[state.scenes.length - 1];
          const relevantMemories = contextManager.retrieveRelevantKnowledge(
            state.world.knowledgeBase, lastScene?.narrative, playerAction, state
          );
          if (relevantMemories) {
            enhancedContext = { ...enhancedContext, relevantMemories };
          }
        }
        if (enhancedContext && contextDepth >= governance.knowledgeMinContextDepth && state.world?.codex) {
          const lastScene = state.scenes?.[state.scenes.length - 1];
          const relevantCodex = contextManager.retrieveRelevantCodex(
            state.world.codex, lastScene?.narrative, playerAction
          );
          if (relevantCodex) {
            enhancedContext = { ...enhancedContext, relevantCodex };
          }
        }
        const isIdleWorldEvent = playerAction && playerAction.startsWith('[IDLE_WORLD_EVENT');
        const isPassiveSceneAction = Boolean(isIdleWorldEvent || playerAction === '[WAIT]');

        // Resolve deterministic mechanics BEFORE AI call
        // In backend mode: skip dice roll (backend resolves it after nano intent classification)
        const willUseBackend = apiClient.isConnected() && !settings.localLLM?.enabled && state.campaign?.backendId;
        const resolved = await resolveMechanics({
          state,
          playerAction,
          settings,
          isFirstScene,
          isCustomAction,
          fromAutoPlayer,
          t,
          inferSkillCheckFn: willUseBackend ? null : inferSkillCheckFn, // backend handles skill inference
          skipDiceRoll: !!willUseBackend, // backend resolves dice after nano
        });

        if (resolved.diceRoll && !willUseBackend) {
          setEarlyDiceRoll(resolved.diceRoll);
          if (!isFirstScene && playerAction && !Boolean(isIdleWorldEvent || playerAction === '[WAIT]')) {
            const playerChatContent = playerAction === '[CONTINUE]'
              ? t('gameplay.continueChatMessage')
              : playerAction;
            dispatch({
              type: 'ADD_CHAT_MESSAGE',
              payload: {
                id: `msg_${Date.now()}_player_early`,
                role: 'player',
                content: playerChatContent,
                timestamp: Date.now(),
              },
            });
          }
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_roll`,
              role: 'system',
              subtype: 'dice_roll',
              content: t('system.diceRollMessage', {
                skill: resolved.diceRoll.skill,
                roll: resolved.diceRoll.roll,
                target: resolved.diceRoll.target || resolved.diceRoll.dc,
                sl: resolved.diceRoll.sl ?? 0,
                result: resolved.diceRoll.criticalSuccess
                  ? t('common.criticalSuccess')
                  : resolved.diceRoll.criticalFailure
                    ? t('common.criticalFailure')
                    : resolved.diceRoll.success ? t('common.success') : t('common.failure'),
              }),
              diceData: resolved.diceRoll,
              timestamp: Date.now(),
            },
          });
        }

        const hasImageKey = imageApiKey || hasApiKey(imgKeyProvider);
        if (imageGenEnabled && hasImageKey && !isFirstScene) {
          const previousScene = state.scenes?.[state.scenes.length - 1];
          if (previousScene?.narrative) {
            const speculativeDesc = buildSpeculativeImageDescription(
              previousScene.narrative,
              playerAction,
              resolved.diceRoll
            );
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
            earlyImagePromise = imageService.generateSceneImage(
              '',
              state.campaign?.genre,
              state.campaign?.tone,
              imageApiKey,
              imageProvider,
              speculativeDesc,
              state.campaign?.backendId,
              imageStyle,
              darkPalette,
              state.character?.age,
              state.character?.gender,
              {},
              imageSeriousness,
              state.character?.portraitUrl || null
            ).catch((imgErr) => {
              console.warn('Early image generation failed:', imgErr.message);
              return null;
            });
          }
        }

        const triggeredCallbacks = !isFirstScene ? checkPendingCallbacks(state.world?.knowledgeBase?.decisions, state) : [];
        const triggeredAgendas = !isFirstScene ? checkNpcAgendas(state.world?.npcAgendas, state) : [];
        const readySeeds = !isFirstScene ? checkSeedResolution(state.world?.narrativeSeeds, state) : [];
        const { expired: expiredQuests, warning: warningQuests } = !isFirstScene ? checkQuestDeadlines(state.quests?.active, state.world?.timeState) : { expired: [], warning: [] };
        const tensionScore = !isFirstScene ? calculateTensionScore(state.scenes, state.combat, state.dialogue) : 50;
        const dilemmaScheduled = !isFirstScene ? shouldGenerateDilemma(state.scenes) : false;

        if (enhancedContext && !isFirstScene) {
          enhancedContext = {
            ...enhancedContext,
            triggeredCallbacks,
            triggeredAgendas,
            readySeeds,
            expiredQuests,
            warningQuests,
            tensionScore,
            dilemmaScheduled,
          };
        }

        // Backend flow is primary when connected; proxy is fallback for local LLM or no backend
        let backendCampaignId = state.campaign?.backendId;
        const canUseBackend = apiClient.isConnected() && !localLLMConfig?.enabled;
        let result, usage;

        // Auto-sync campaign to backend if not yet synced
        if (canUseBackend && !backendCampaignId) {
          try {
            const { scenes: allScenes, isLoading, isGeneratingScene, isGeneratingImage, error: _err, ...rest } = state;
            const coreState = { ...rest };
            if (coreState.chatHistory?.length > 10) coreState.chatHistory = coreState.chatHistory.slice(-10);
            const characterState = coreState.character || {};
            delete coreState.character;
            const created = await apiClient.post('/campaigns', {
              name: state.campaign?.name || '',
              genre: state.campaign?.genre || '',
              tone: state.campaign?.tone || '',
              coreState,
              characterState,
            });
            backendCampaignId = created.id;
            state.campaign.backendId = created.id;
            console.log('[useAI] Auto-synced campaign to backend:', created.id);
          } catch (syncErr) {
            console.warn('[useAI] Failed to auto-sync campaign:', syncErr.message);
          }
        }

        if (canUseBackend && backendCampaignId) {
          try {
            const useStreaming = settings.dmSettings?.useStreaming !== false;
            const backendOpts = {
              provider: aiProvider,
              model: aiModel || null,
              language,
              dmSettings: settings.dmSettings,
              resolvedMechanics: resolved,
              needsSystemEnabled,
              characterNeeds: state.character?.needs || null,
              dialogue: state.dialogue || null,
              dialogueCooldown: state.dialogueCooldown || 0,
              isFirstScene,
              isCustomAction,
              fromAutoPlayer,
              sceneCount: state.scenes?.length || 0,
              gameState: state,
            };

            let backendResult;
            if (useStreaming) {
              let rawAccumulated = '';
              setStreamingNarrative('');
              setStreamingSegments(null);
              backendResult = await aiService.generateSceneViaBackendStream(backendCampaignId, playerAction, {
                ...backendOpts,
                onEvent: (event) => {
                  if (event.type === 'intent') {
                    console.log('[useAI] Stream intent:', event.data?.intent);
                  } else if (event.type === 'chunk' && event.text) {
                    rawAccumulated += event.text;
                    // Parse partial JSON to extract narrative + dialogueSegments incrementally
                    const parsed = parsePartialJson(rawAccumulated);
                    if (!parsed) return;
                    if (typeof parsed.narrative === 'string') {
                      setStreamingNarrative(parsed.narrative);
                    }
                    if (Array.isArray(parsed.dialogueSegments) && parsed.dialogueSegments.length > 0) {
                      setStreamingSegments(parsed.dialogueSegments);
                    }
                  }
                },
              });
              // Don't clear streaming yet — let it stay until the final scene message replaces it
            } else {
              backendResult = await aiService.generateSceneViaBackend(backendCampaignId, playerAction, backendOpts);
            }
            result = backendResult.result;
            usage = backendResult.usage;
          } catch (backendErr) {
            console.warn('[useAI] Backend generate-scene failed, falling back to proxy:', backendErr.message);
          }
        }

        // Proxy fallback (local LLM or backend unavailable)
        if (!result) {
          const proxyResult = await aiService.generateScene(
            state,
            settings.dmSettings,
            playerAction,
            isFirstScene,
            aiProvider,
            apiKey,
            language,
            enhancedContext,
            {
              needsSystemEnabled,
              isCustomAction,
              fromAutoPlayer,
              resolvedMechanics: resolved,
              localLLMConfig,
              modelTier: aiModelTier,
              alternateApiKey,
              explicitModel: aiModel || null,
              promptProfile: governance.profile.id,
              sceneTokenBudget: governance.sceneTokenBudget,
              promptTokenBudget: governance.promptTokenBudget,
            }
          );
          result = proxyResult.result;
          usage = proxyResult.usage;
        }
        if (usage) dispatch({ type: 'ADD_AI_COST', payload: calculateCost('ai', usage) });
        if (result?.meta?.degraded) {
          degradeStatsRef.current.total += 1;
          if (result?.meta?.degradeType === 'context_truncate' || String(result?.meta?.reason || '').includes('context_truncate')) {
            degradeStatsRef.current.truncated += 1;
          } else {
            degradeStatsRef.current.schema += 1;
          }
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_ai_degraded`,
              role: 'system',
              subtype: 'ai_degraded_mode',
              content: t('system.aiDegradedMode', 'AI response validation failed, so a safe fallback scene was generated.'),
              timestamp: Date.now(),
            },
          });
        }
        if (result?.meta?.promptTruncated) {
          degradeStatsRef.current.truncated += 1;
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_prompt_truncated`,
              role: 'system',
              subtype: 'validation_warning',
              content: t(
                'system.promptTruncatedWarning',
                'Prompt context was trimmed to fit model limits. Story continuity may be reduced this turn.'
              ),
              timestamp: Date.now(),
            },
          });
        }
        if (
          degradeStatsRef.current.total >= 3
          && Date.now() - degradeStatsRef.current.lastWarnAt > 120000
        ) {
          degradeStatsRef.current.lastWarnAt = Date.now();
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_degrade_summary`,
              role: 'system',
              subtype: 'validation_warning',
              content: t(
                'system.aiQualityWarning',
                `AI quality warning: ${degradeStatsRef.current.total} degraded scenes in this session (${degradeStatsRef.current.truncated} from prompt truncation). Consider increasing prompt profile/model tier.`
              ),
              timestamp: Date.now(),
            },
          });
        }

        // Fallback: if AI omitted combatUpdate despite explicit combat intent, inject a minimal one
        if (!isFirstScene && !isPassiveSceneAction && detectCombatIntent(playerAction)) {
          const hasCombatUpdate = result.stateChanges?.combatUpdate?.active === true;
          if (!hasCombatUpdate) {
            const currentLocation = state.world?.currentLocation || '';
            const fallbackNpc = (state.world?.npcs || []).find((npc) => {
              if (!npc?.name || npc.alive === false) return false;
              if (!currentLocation) return true;
              return String(npc.lastLocation || '').trim().toLowerCase() === String(currentLocation).trim().toLowerCase();
            });
            const fallbackEnemyName = fallbackNpc?.name || t('gameplay.combatFallbackEnemyName', 'Hostile Foe');
            const bestiaryMatch = gameData.findClosestBestiaryEntry(fallbackEnemyName);
            const fallbackStats = bestiaryMatch || {
              characteristics: { ws: 30, bs: 30, s: 30, t: 30, i: 30, ag: 30, dex: 25, int: 20, wp: 25, fel: 20 },
              maxWounds: 10, skills: { 'Melee (Basic)': 5 }, traits: [], armour: { body: 1 }, weapons: ['Hand Weapon'],
            };
            result.stateChanges = {
              ...(result.stateChanges || {}),
              combatUpdate: {
                active: true,
                enemies: [{
                  name: fallbackEnemyName,
                  characteristics: fallbackStats.characteristics,
                  wounds: fallbackStats.maxWounds,
                  maxWounds: fallbackStats.maxWounds,
                  skills: fallbackStats.skills,
                  traits: fallbackStats.traits || [],
                  armour: fallbackStats.armour || { body: 0 },
                  weapons: fallbackStats.weapons || ['Hand Weapon'],
                }],
                reason: 'Combat intent fallback (AI omitted combatUpdate)',
              },
            };
            console.warn('[useAI] Injected fallback combatUpdate — AI omitted it despite combat intent');
          }
        }

        const rawAiSpeech = {
          narrative: typeof result.narrative === 'string' ? result.narrative : '',
          dialogueSegments: Array.isArray(result.dialogueSegments)
            ? result.dialogueSegments.map((segment) => (
              segment && typeof segment === 'object'
                ? { ...segment }
                : segment
            ))
            : [],
          scenePacing: result.scenePacing || 'exploration',
        };

        const incomingDialogueSegments = normalizeIncomingDialogueSegments(result.dialogueSegments || []);

        // Use server dice rolls (backend mode) or FE-resolved dice roll (proxy mode)
        // Backend now returns diceRolls (array) — normalize both formats
        const serverDiceRolls = Array.isArray(result.diceRolls) ? result.diceRolls
          : result.diceRoll ? [result.diceRoll] : [];
        const effectiveDiceRolls = serverDiceRolls.length > 0 ? serverDiceRolls
          : resolved.diceRoll ? [resolved.diceRoll] : [];
        result.diceRolls = effectiveDiceRolls.length > 0 ? effectiveDiceRolls : undefined;
        // Keep legacy diceRoll for backward compat
        result.diceRoll = effectiveDiceRolls[0] || null;

        // Show dice rolls from server response (backend mode — wasn't shown earlier)
        if (serverDiceRolls.length > 0 && !resolved.diceRoll) {
          setEarlyDiceRoll(serverDiceRolls[0]);
          for (const roll of serverDiceRolls) {
            dispatch({
              type: 'ADD_CHAT_MESSAGE',
              payload: {
                id: `msg_${Date.now()}_roll_server_${roll.skill}`,
                role: 'system',
                subtype: 'dice_roll',
                content: `${roll.skill || '?'}: d50=${roll.roll} → ${roll.success ? '✓' : '✗'} (margin ${roll.margin})`,
                diceData: roll,
                timestamp: Date.now(),
              },
            });
          }
        }

        // Update momentum AFTER the rolls for next scene (use last roll's margin)
        if (effectiveDiceRolls.length > 0) {
          const lastRoll = effectiveDiceRolls[effectiveDiceRolls.length - 1];
          const nextMomentum = calculateNextMomentum(state.momentumBonus || 0, lastRoll.margin || lastRoll.sl || 0);
          dispatch({ type: 'SET_MOMENTUM', payload: nextMomentum });
        }

        const activeChar = state.party?.find(c => c.id === state.activeCharacterId) || state.character;
        const playerNames = (state.party || [state.character]).map(c => c?.name).filter(Boolean);
        const factionNames = Object.keys(state.world?.factions || {});
        const locationNames = (state.world?.mapState || []).map(l => l.name).filter(Boolean);
        const excludeFromSpeakers = [
          ...playerNames,
          ...factionNames,
          ...locationNames,
          ...(state.world?.currentLocation ? [state.world.currentLocation] : []),
          ...(state.campaign?.name ? [state.campaign.name] : []),
        ];

        const repairedSegments = repairDialogueSegments(
          result.narrative,
          incomingDialogueSegments,
          [...(state.world?.npcs || []), ...(result.stateChanges?.npcs || [])],
          excludeFromSpeakers
        );
        const withPlayerDialogue = (!isFirstScene && !isPassiveSceneAction)
          ? ensurePlayerDialogue(repairedSegments, playerAction, activeChar?.name, activeChar?.gender)
          : repairedSegments;
        let finalSegments = hardRemoveNarrationDialogueRepeats(
          demoteAnonymousDialogueSegments(
            downgradeLowConfidenceDialogueSegments(withPlayerDialogue)
          )
        );

        const voiceEnriched = enrichDialogueSpeakers({
          segments: finalSegments,
          stateChanges: result.stateChanges,
          worldNpcs: state.world?.npcs || [],
          characterVoiceMap: state.characterVoiceMap || {},
          characterVoices: settings.characterVoices || [],
          playerNames,
          currentLocation: result.stateChanges?.currentLocation || state.world?.currentLocation || '',
          dispatch,
        });
        finalSegments = voiceEnriched.segments;
        result.stateChanges = voiceEnriched.stateChanges;

        const sceneId = createSceneId();
        const questOffers = (result.questOffers || []).map((offer) => ({
          ...offer,
          objectives: (offer.objectives || []).map((obj) => ({ ...obj, completed: false })),
          status: 'pending',
        }));
        const scene = {
          id: sceneId,
          narrative: result.narrative,
          scenePacing: result.scenePacing || 'exploration',
          dialogueSegments: finalSegments,
          soundEffect: result.soundEffect || null,
          musicPrompt: result.musicPrompt || null,
          imagePrompt: result.imagePrompt || null,
          sceneGrid: result.sceneGrid || null,
          musicUrl: null,
          image: null,
          actions: result.suggestedActions || [],
          questOffers,
          chosenAction: playerAction,
          diceRoll: result.diceRoll || null,
          diceRolls: result.diceRolls || undefined,
          timestamp: Date.now(),
        };

        dispatch({ type: 'ADD_SCENE', payload: scene });
        setStreamingNarrative(null); // Clear streaming now that final scene is in chat
        setStreamingSegments(null);

        if (earlyImagePromise) {
          const capturedSceneId = sceneId;
          earlyImagePromise.then((imageUrl) => {
            if (imageUrl) {
              dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
              dispatch({
                type: 'UPDATE_SCENE_IMAGE',
                payload: { sceneId: capturedSceneId, image: imageUrl },
              });
              setTimeout(() => autoSave(), 300);
            }
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
          });
        }

        const earlyPlayerMsgSent = Boolean(resolved.diceRoll);
        if (!earlyPlayerMsgSent && !isFirstScene && playerAction && !isPassiveSceneAction) {
          const playerChatContent = playerAction === '[CONTINUE]'
            ? t('gameplay.continueChatMessage')
            : playerAction;
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_player`,
              role: 'player',
              content: playerChatContent,
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

        if (playerAction === '[WAIT]') {
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_wait`,
              role: 'system',
              subtype: 'wait',
              content: t('gameplay.waitSystemMessage'),
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
            scenePacing: result.scenePacing || 'exploration',
            dialogueSegments: finalSegments,
            rawAiSpeech,
            soundEffect: result.soundEffect || null,
            timestamp: Date.now(),
          },
        });

        if (needsSystemEnabled) {
          if (!result.stateChanges) result.stateChanges = {};
          const rawTimeAdvance = result.stateChanges.timeAdvance;
          if (typeof rawTimeAdvance === 'number' && Number.isFinite(rawTimeAdvance)) {
            result.stateChanges.timeAdvance = { hoursElapsed: rawTimeAdvance };
          } else if (typeof rawTimeAdvance === 'string') {
            const parsedHours = Number(rawTimeAdvance);
            result.stateChanges.timeAdvance = Number.isFinite(parsedHours)
              ? { hoursElapsed: parsedHours }
              : {};
          } else if (!rawTimeAdvance || typeof rawTimeAdvance !== 'object' || Array.isArray(rawTimeAdvance)) {
            result.stateChanges.timeAdvance = {};
          }

          if (!result.stateChanges.timeAdvance) {
            result.stateChanges.timeAdvance = { hoursElapsed: 0.5 };
          } else if (result.stateChanges.timeAdvance.hoursElapsed == null) {
            result.stateChanges.timeAdvance.hoursElapsed = 0.5;
          }
        }

        // Apply rest recovery from pre-resolved mechanics (10% HP/hour)
        if (resolved.isRest && resolved.restRecovery) {
          const mergedNeedsChanges = {
            ...(result.stateChanges?.needsChanges || {}),
            ...(resolved.restRecovery.needsChanges || {}),
          };
          result.stateChanges = {
            ...(result.stateChanges || {}),
            ...(resolved.restRecovery.woundsChange !== undefined
              ? { woundsChange: resolved.restRecovery.woundsChange }
              : {}),
            ...(resolved.restRecovery.fortuneChange !== undefined
              ? { fortuneChange: resolved.restRecovery.fortuneChange }
              : {}),
            ...(Object.keys(mergedNeedsChanges).length > 0 ? { needsChanges: mergedNeedsChanges } : {}),
          };
        }

        result.stateChanges = mergeNpcHintsFromDialogue(
          result.stateChanges,
          finalSegments,
          state.world?.npcs || [],
          {
            currentLocation: result.stateChanges?.currentLocation || state.world?.currentLocation || '',
            playerName: activeChar?.name || state.character?.name || '',
          }
        );

        // Fill in enemy stats from bestiary (AI provides name, engine provides stats)
        if (result.stateChanges?.combatUpdate?.enemies?.length && gameData.isLoaded) {
          result.stateChanges.combatUpdate.enemies = result.stateChanges.combatUpdate.enemies.map((enemy) => {
            const match = gameData.findClosestBestiaryEntry(enemy.name);
            if (!match) return enemy;
            return {
              name: enemy.name,
              characteristics: match.characteristics,
              wounds: match.maxWounds,
              maxWounds: match.maxWounds,
              skills: match.skills,
              traits: match.traits,
              armour: match.armour,
              weapons: match.weapons,
            };
          });
        }

        if (result.stateChanges && Object.keys(result.stateChanges).length > 0) {
          const { validated, warnings, corrections } = validateStateChanges(result.stateChanges, state);
          result.stateChanges = validated;

          // Inject dice roll skill XP (deterministic, based on resolved mechanics)
          // Backend calculates this for backend mode, but proxy mode needs it here
          const diceRollsForXp = effectiveDiceRolls.length > 0 ? effectiveDiceRolls : (resolved.diceRoll ? [resolved.diceRoll] : []);
          for (const diceForXp of diceRollsForXp) {
            if (diceForXp?.skill && diceForXp?.difficulty) {
              const skillXp = calculateDiceRollSkillXP(diceForXp.difficulty, diceForXp.success);
              if (!validated.skillProgress) validated.skillProgress = {};
              validated.skillProgress[diceForXp.skill] = (validated.skillProgress[diceForXp.skill] || 0) + skillXp;
            }
          }

          const previousFactions = { ...(state.world?.factions || {}) };

          dispatch({ type: 'APPLY_STATE_CHANGES', payload: validated });
          if (Array.isArray(validated.newItems) && validated.newItems.length > 0) {
            void ensureMissingInventoryImages(validated.newItems, { emitWarning: false });
          }

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
            if (ach.xpReward && state.character) {
              dispatch({ type: 'APPLY_STATE_CHANGES', payload: { xp: ach.xpReward } });
            }
          }
        }

        if (!isFirstScene && expiredQuests.length > 0) {
          for (const q of expiredQuests) {
            dispatch({
              type: 'ADD_CHAT_MESSAGE',
              payload: {
                id: `msg_${Date.now()}_deadline_${q.id}`,
                role: 'system',
                subtype: 'quest_deadline',
                content: `⏰ ${t('gameplay.questDeadlineExpired', 'Quest deadline expired')}: ${q.name} — ${q.deadline?.consequence || ''}`,
                timestamp: Date.now(),
              },
            });
          }
        }

        if (state.dialogue?.active && result.stateChanges?.dialogueUpdate?.active !== false) {
          const advanced = advanceDialogueRound(state.dialogue);
          if (!advanced.active) {
            dispatch({ type: 'END_DIALOGUE' });
          } else {
            dispatch({ type: 'UPDATE_DIALOGUE', payload: { round: advanced.round } });
          }
        }

        recordCompletedSceneGenTiming();

        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });

        // Auto-save after scene resolution (delay for state to settle)
        setTimeout(() => autoSave(), 300);

        if (!compressionInFlightRef.current && contextManager.needsCompression(state)) {
          compressionInFlightRef.current = true;
          const gen = ++compressionGenRef.current;
          contextManager.compressOldScenes(state, aiProvider, apiKey, language, aiModelTier).then((compResult) => {
            compressionInFlightRef.current = false;
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
          }).catch(() => {
            compressionInFlightRef.current = false;
          });
        }

        if (!earlyImagePromise && imageGenEnabled && hasImageKey) {
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
              darkPalette,
              state.character?.age,
              state.character?.gender,
              {},
              imageSeriousness,
              state.character?.portraitUrl || null
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
        if (earlyImagePromise) {
          earlyImagePromise.finally(() => {
            dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
          });
        }
        recordCompletedSceneGenTiming();
        dispatch({ type: 'SET_ERROR', payload: err.message });
        dispatch({ type: 'SET_GENERATING_SCENE', payload: false });
        setStreamingNarrative(null);
        throw err;
      }
    },
    [state, settings, aiProvider, apiKey, alternateApiKey, imageApiKey, imageProvider, imageGenEnabled, imageStyle, darkPalette, imageSeriousness, language, needsSystemEnabled, aiModelTier, aiModel, hasApiKey, imgKeyProvider, dispatch, autoSave, t, recordCompletedSceneGenTiming, ensureMissingInventoryImages, inferSkillCheckFn, localLLMConfig]
  );

  const acceptQuestOffer = useCallback(
    (sceneId, questOffer) => {
      const fallbackLocation = state.world?.currentLocation || null;
      const quest = {
        id: questOffer.id,
        name: questOffer.name,
        description: questOffer.description,
        completionCondition: questOffer.completionCondition,
        objectives: (questOffer.objectives || []).map((obj) => ({
          ...obj,
          completed: false,
        })),
        locationId: questOffer.locationId || fallbackLocation,
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
    [state.world?.currentLocation, dispatch, autoSave, t]
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

  const clearEarlyDiceRoll = useCallback(() => setEarlyDiceRoll(null), []);

  return {
    generateScene,
    acceptQuestOffer,
    declineQuestOffer,
    sceneGenStartTime,
    lastSceneGenMs,
    earlyDiceRoll,
    clearEarlyDiceRoll,
    streamingNarrative,
    streamingSegments,
  };
}
