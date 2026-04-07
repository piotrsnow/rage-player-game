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
import { processStateChanges as processAchievements } from '../services/achievementTracker';
import { repairDialogueSegments, ensurePlayerDialogue } from '../services/aiResponseValidator';
import { checkWorldConsistency, applyConsistencyPatches, buildConsistencyWarningsForPrompt } from '../services/worldConsistency';
import { detectCombatIntent, buildSpeculativeImageDescription } from '../services/prompts';
import { calculateTensionScore } from '../services/tensionTracker';
import { checkPendingCallbacks, checkNpcAgendas, checkSeedResolution, checkQuestDeadlines, shouldGenerateDilemma } from '../services/narrativeEngine';
import { advanceDialogueRound } from '../services/dialogueEngine';
import { getSceneAIGovernance, resolvePromptProfile } from '../services/promptGovernance';
import { hasNamedSpeaker } from '../services/dialogueSegments';
import { resolveVoiceForCharacter } from '../services/characterVoiceResolver';
import { resolveMechanics } from '../services/mechanics/index';
import { calculateNextMomentum } from '../services/mechanics/momentumTracker';
import { gameData } from '../services/gameDataService';

const ITEM_IMAGE_RETRY_COOLDOWN_MS = 60000;

const SCENE_GEN_DURATION_HISTORY_KEY = 'rpgon_scene_gen_durations_ms';
const SCENE_GEN_DURATION_HISTORY_LEGACY_KEY = 'rpgon_last_scene_gen_ms';
const SCENE_GEN_HISTORY_MAX = 5;
const SCENE_GEN_ESTIMATE_PADDING_MS = 3000;
const NARRATION_ADDRESS_EN = /\byou\s+(?:see|notice|feel|hear|smell|remember|watch|stand|walk|step|enter|approach|move|turn|look|find|spot|sense|are|have|can)\b/i;
const NARRATION_ADDRESS_PL = /(?:^|\W)(?:widzisz|czujesz|słyszysz|zauważasz|przypominasz sobie|stoisz|idziesz|wchodzisz|zbliżasz się|rozglądasz się)(?:\W|$)/i;
const SPEECH_VERB_HINT = /(?:^|\W)(?:mówi|powiedzia(?:ł|ła|łem|łam|łeś|łaś)|rzek(?:ł|ła)|mrukn(?:ął|ęła)|szepn(?:ął|ęła)|krzykn(?:ął|ęła)|spyta(?:ł|ła)|odpar(?:ł|ła)|odpow(?:iada|iedzia(?:ł|ła))|said|says|asked|asks|replied|replies|whispered|whispers|shouted|shouts|told|tells)(?:\W|$)/i;

function isValidDurationEntry(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function loadSceneGenDurationHistory() {
  try {
    const raw = localStorage.getItem(SCENE_GEN_DURATION_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const nums = parsed.filter(isValidDurationEntry);
        if (nums.length) return nums.slice(-SCENE_GEN_HISTORY_MAX);
      }
    }
    const legacy = localStorage.getItem(SCENE_GEN_DURATION_HISTORY_LEGACY_KEY);
    if (legacy) {
      const v = Number(legacy);
      if (isValidDurationEntry(v)) return [v];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function appendSceneGenDuration(history, elapsedMs) {
  if (!isValidDurationEntry(elapsedMs)) return history;
  return [...history, elapsedMs].slice(-SCENE_GEN_HISTORY_MAX);
}

function historyToSceneGenEstimateMs(history) {
  if (!history.length) return null;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  return Math.round(avg + SCENE_GEN_ESTIMATE_PADDING_MS);
}

function persistSceneGenDurationHistory(history) {
  try {
    localStorage.setItem(SCENE_GEN_DURATION_HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
}

function normalizeActionText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}


function downgradeLowConfidenceDialogueSegments(segments) {
  return (segments || []).map((seg) => {
    if (seg?.type !== 'dialogue' || !seg?.character || !seg?.text) return seg;
    const text = seg.text.trim();
    if (text.length < 20) return seg;
    const looksLikeNarration = NARRATION_ADDRESS_EN.test(text) || NARRATION_ADDRESS_PL.test(text);
    if (!looksLikeNarration) return seg;
    const hasStrongSpeechSignal = /[!?]/.test(text) || SPEECH_VERB_HINT.test(text);
    if (hasStrongSpeechSignal) return seg;
    return { type: 'narration', text };
  });
}

const HARD_DEDUP_WORD_REGEX = /[A-Za-z0-9ĄąĆćĘęŁłŃńÓóŚśŹźŻż]+/g;

function tokenizeSpeechText(text) {
  return String(text || '')
    .toLowerCase()
    .match(HARD_DEDUP_WORD_REGEX) || [];
}

function normalizeSpeechText(text) {
  return tokenizeSpeechText(text).join(' ').trim();
}

function stripLeadingDelimiters(text) {
  return String(text || '')
    .replace(/^[\s"'`„“«».,:;!?…\-–—(){}\[\]]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sliceAfterWordTokens(text, tokenCount) {
  if (!text || tokenCount <= 0) return String(text || '');
  const re = new RegExp(HARD_DEDUP_WORD_REGEX.source, 'g');
  let match;
  let seen = 0;
  let cutIndex = 0;
  while ((match = re.exec(text)) !== null) {
    seen += 1;
    cutIndex = match.index + match[0].length;
    if (seen >= tokenCount) break;
  }
  if (seen < tokenCount) return String(text || '');
  return String(text || '').slice(cutIndex);
}

function stripLeadingDialogueEcho(narrationText, dialogueTexts) {
  let output = String(narrationText || '').trim();
  if (!output || !Array.isArray(dialogueTexts) || dialogueTexts.length === 0) return output;

  const sortedDialogueTokens = dialogueTexts
    .map((text) => tokenizeSpeechText(text))
    .filter((tokens) => tokens.length >= 2)
    .sort((a, b) => b.length - a.length);

  for (const dialogueTokens of sortedDialogueTokens) {
    const narrationTokens = tokenizeSpeechText(output);
    if (narrationTokens.length < dialogueTokens.length) continue;

    let matchesPrefix = true;
    for (let i = 0; i < dialogueTokens.length; i += 1) {
      if (narrationTokens[i] !== dialogueTokens[i]) {
        matchesPrefix = false;
        break;
      }
    }
    if (!matchesPrefix) continue;

    output = stripLeadingDelimiters(sliceAfterWordTokens(output, dialogueTokens.length));
    if (!output) return '';
  }

  return output;
}

function hardRemoveNarrationDialogueRepeats(segments) {
  const source = Array.isArray(segments) ? segments : [];
  if (source.length === 0) return [];

  const dialogueTexts = source
    .filter((seg) => seg?.type === 'dialogue' && typeof seg?.text === 'string' && seg.text.trim())
    .map((seg) => seg.text.trim());
  const dialogueTextSet = new Set(dialogueTexts.map((text) => normalizeSpeechText(text)).filter(Boolean));

  const sanitized = [];
  for (const seg of source) {
    if (!seg || typeof seg !== 'object') continue;
    if (seg.type !== 'narration') {
      sanitized.push(seg);
      continue;
    }

    let text = String(seg.text || '').trim();
    if (!text) continue;

    text = stripLeadingDialogueEcho(text, dialogueTexts);
    const normalized = normalizeSpeechText(text);
    if (!normalized) continue;
    if (dialogueTextSet.has(normalized)) continue;

    const prev = sanitized[sanitized.length - 1];
    if (prev?.type === 'narration' && normalizeSpeechText(prev.text) === normalized) {
      continue;
    }

    sanitized.push({ ...seg, text });
  }

  return sanitized;
}

function demoteAnonymousDialogueSegments(segments) {
  return (segments || []).map((seg) => {
    if (seg?.type !== 'dialogue') return seg;
    if (hasNamedSpeaker(seg?.character)) return seg;
    const text = String(seg?.text || '').trim();
    if (!text) return null;
    return {
      ...seg,
      type: 'dialogue',
      character: 'NPC',
      text,
    };
  }).filter((seg) => typeof seg?.text === 'string' && seg.text.trim());
}

function normalizeIncomingDialogueSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map((segment) => {
    if (!segment || typeof segment !== 'object') return segment;
    if (segment.type !== 'dialogue') return segment;

    const character = typeof segment.character === 'string' ? segment.character.trim() : '';
    const speaker = typeof segment.speaker === 'string' ? segment.speaker.trim() : '';
    if (character) return segment;
    if (!speaker) return segment;

    return {
      ...segment,
      character: speaker,
    };
  });
}

function pickRandomVoiceForSpeaker(voices, gender) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const byGender = (gender === 'male' || gender === 'female')
    ? voices.filter((voice) => voice?.gender === gender)
    : voices;
  const pool = byGender.length > 0 ? byGender : voices;
  if (pool.length === 0) return null;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index]?.voiceId || null;
}

function enrichDialogueSpeakers({
  segments,
  stateChanges,
  worldNpcs = [],
  characterVoiceMap = {},
  characterVoices = [],
  playerNames = [],
  currentLocation = '',
  dispatch,
}) {
  const source = Array.isArray(segments) ? segments : [];
  if (source.length === 0) {
    return { segments: source, stateChanges: stateChanges || {} };
  }

  const nextStateChanges = { ...(stateChanges || {}) };
  const npcChanges = Array.isArray(nextStateChanges.npcs) ? [...nextStateChanges.npcs] : [];
  const existingNpcChangeNames = new Set(
    npcChanges
      .map((npc) => (typeof npc?.name === 'string' ? npc.name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  const knownNpcNames = new Set(
    (Array.isArray(worldNpcs) ? worldNpcs : [])
      .map((npc) => (typeof npc?.name === 'string' ? npc.name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  const playerNameSet = new Set(
    (Array.isArray(playerNames) ? playerNames : [])
      .map((name) => (typeof name === 'string' ? name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  const localVoiceMap = new Map();

  const nextSegments = source.map((segment) => {
    if (!segment || segment.type !== 'dialogue') return segment;
    if (!hasNamedSpeaker(segment.character)) return segment;

    const speakerName = String(segment.character || '').trim();
    if (!speakerName) return segment;
    const speakerKey = speakerName.toLowerCase();
    if (playerNameSet.has(speakerKey)) return segment;

    const speakerGender = segment.gender === 'male' || segment.gender === 'female'
      ? segment.gender
      : null;
    const hasKnownNpc = knownNpcNames.has(speakerKey) || existingNpcChangeNames.has(speakerKey);

    let voiceId = characterVoiceMap?.[speakerName]?.voiceId || null;
    if (hasKnownNpc) {
      voiceId = resolveVoiceForCharacter(
        speakerName,
        speakerGender,
        characterVoiceMap,
        localVoiceMap,
        characterVoices,
        dispatch
      ) || voiceId;
    } else {
      voiceId = pickRandomVoiceForSpeaker(characterVoices, speakerGender) || voiceId;
      if (voiceId) {
        localVoiceMap.set(speakerName, { voiceId, gender: speakerGender });
        dispatch?.({
          type: 'MAP_CHARACTER_VOICE',
          payload: { characterName: speakerName, voiceId, gender: speakerGender },
        });
      }
      if (!existingNpcChangeNames.has(speakerKey)) {
        npcChanges.push({
          action: 'introduce',
          name: speakerName,
          ...(speakerGender ? { gender: speakerGender } : {}),
          ...(currentLocation ? { location: currentLocation } : {}),
        });
        existingNpcChangeNames.add(speakerKey);
      }
    }

    if (!voiceId) return segment;
    return {
      ...segment,
      voiceId,
    };
  });

  if (npcChanges.length > 0) {
    nextStateChanges.npcs = npcChanges;
  }

  return {
    segments: nextSegments,
    stateChanges: nextStateChanges,
  };
}


function mergeNpcHintsFromDialogue(stateChanges, dialogueSegments, worldNpcs, { currentLocation = '', playerName = '' } = {}) {
  const next = { ...(stateChanges || {}) };
  const existingNpcChanges = Array.isArray(next.npcs) ? [...next.npcs] : [];
  const existingNames = new Set(
    existingNpcChanges
      .map((npc) => (typeof npc?.name === 'string' ? npc.name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  const knownWorldNpcs = new Map(
    (Array.isArray(worldNpcs) ? worldNpcs : [])
      .filter((npc) => typeof npc?.name === 'string' && npc.name.trim())
      .map((npc) => [npc.name.trim().toLowerCase(), npc])
  );

  const normalizedPlayer = typeof playerName === 'string' ? playerName.trim().toLowerCase() : '';

  for (const segment of Array.isArray(dialogueSegments) ? dialogueSegments : []) {
    if (segment?.type !== 'dialogue' || typeof segment?.character !== 'string') continue;
    const speakerName = segment.character.trim();
    const speakerKey = speakerName.toLowerCase();
    if (!speakerKey || speakerKey === normalizedPlayer || existingNames.has(speakerKey)) continue;

    const worldNpc = knownWorldNpcs.get(speakerKey);
    if (!worldNpc) continue;

    existingNpcChanges.push({
      action: 'update',
      name: worldNpc.name || speakerName,
      ...(currentLocation ? { location: currentLocation } : {}),
    });
    existingNames.add(speakerKey);
  }

  if (existingNpcChanges.length > 0) {
    next.npcs = existingNpcChanges;
  }

  return next;
}

export function useAI() {
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
  const { settings, hasApiKey } = useSettings();

  const compressionGenRef = useRef(0);
  const compressionInFlightRef = useRef(false);
  const degradeStatsRef = useRef({ total: 0, truncated: 0, schema: 0, lastWarnAt: 0 });
  const sceneGenStartRef = useRef(null);
  const sceneGenDurationHistoryRef = useRef(null);
  const itemImageGenerationLocksRef = useRef(new Set());
  const itemImageFailureTimestampsRef = useRef(new Map());
  const [earlyDiceRoll, setEarlyDiceRoll] = useState(null);
  const [lastSceneGenMs, setLastSceneGenMs] = useState(() => {
    const history = loadSceneGenDurationHistory();
    sceneGenDurationHistoryRef.current = history;
    return historyToSceneGenEstimateMs(history);
  });
  const [sceneGenStartTime, setSceneGenStartTime] = useState(null);
  const { aiProvider, openaiApiKey, anthropicApiKey, sceneVisualization, imageProvider, stabilityApiKey, geminiApiKey, language, needsSystemEnabled, localLLMEnabled, localLLMEndpoint, localLLMModel, localLLMReducedPrompt, aiModelTier = 'premium', aiModel = '' } = settings;
  const imageStyle = settings.dmSettings?.imageStyle || 'painting';
  const darkPalette = settings.dmSettings?.darkPalette || false;
  const imageSeriousness = settings.dmSettings?.narratorSeriousness ?? null;
  const imageGenEnabled = sceneVisualization === 'image';
  const apiKey = aiProvider === 'openai' ? openaiApiKey : anthropicApiKey;
  const alternateApiKey = aiProvider === 'openai' ? anthropicApiKey : openaiApiKey;
  const imgKeyProvider = imageProvider === 'stability' ? 'stability' : imageProvider === 'gemini' ? 'gemini' : 'openai';
  const imageApiKey = imageProvider === 'stability' ? stabilityApiKey : imageProvider === 'gemini' ? geminiApiKey : openaiApiKey;
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

  const generateItemImageForInventoryItem = useCallback(
    async (item, options = {}) => {
      if (!item || typeof item !== 'object') return null;
      const itemId = typeof item.id === 'string' ? item.id : '';
      if (!itemId || item.imageUrl) return item.imageUrl || null;

      const activeLocks = itemImageGenerationLocksRef.current;
      const failedAt = itemImageFailureTimestampsRef.current.get(itemId);
      if (failedAt && (Date.now() - failedAt) < ITEM_IMAGE_RETRY_COOLDOWN_MS) {
        return null;
      }
      if (activeLocks.has(itemId)) return null;
      activeLocks.add(itemId);

      try {
        const imageUrl = await imageService.generateItemImage(item, {
          genre: options.genre ?? state.campaign?.genre,
          tone: options.tone ?? state.campaign?.tone,
          provider: imageProvider,
          imageStyle,
          darkPalette,
          seriousness: imageSeriousness,
          campaignId: state.campaign?.backendId,
        });
        if (!imageUrl) return null;

        dispatch({
          type: 'UPDATE_INVENTORY_ITEM_IMAGE',
          payload: { itemId, imageUrl },
        });
        itemImageFailureTimestampsRef.current.delete(itemId);
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
        if (!options.skipAutoSave) {
          setTimeout(() => autoSave(), 300);
        }
        return imageUrl;
      } catch (err) {
        const message = err?.message || 'Item image generation failed';
        itemImageFailureTimestampsRef.current.set(itemId, Date.now());
        console.warn('Item image generation failed:', message);
        if (options.emitWarning !== false) {
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_item_image_warn_${Math.random().toString(36).slice(2, 6)}`,
              role: 'system',
              subtype: 'validation_warning',
              content: `⚠ ${message}`,
              timestamp: Date.now(),
            },
          });
        }
        return null;
      } finally {
        activeLocks.delete(itemId);
      }
    },
    [state.campaign?.genre, state.campaign?.tone, state.campaign?.backendId, imageProvider, imageStyle, darkPalette, dispatch, autoSave]
  );

  const ensureMissingInventoryImages = useCallback(
    async (items = [], options = {}) => {
      const candidates = (Array.isArray(items) ? items : []).filter((item) =>
        item
        && typeof item === 'object'
        && typeof item.id === 'string'
        && !item.imageUrl
      );
      if (candidates.length === 0) {
        return { generated: 0, failed: 0 };
      }

      let generated = 0;
      let failed = 0;
      for (const item of candidates) {
        const imageUrl = await generateItemImageForInventoryItem(item, {
          ...options,
          skipAutoSave: true,
        });
        if (imageUrl) generated += 1;
        else failed += 1;
      }

      if (!options.skipAutoSave && generated > 0) {
        setTimeout(() => autoSave(), 300);
      }
      return { generated, failed };
    },
    [generateItemImageForInventoryItem, autoSave]
  );

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

        // Resolve all deterministic mechanics BEFORE AI call
        const resolved = await resolveMechanics({
          state,
          playerAction,
          settings,
          isFirstScene,
          isCustomAction,
          fromAutoPlayer,
          t,
          inferSkillCheckFn,
        });

        if (resolved.diceRoll) {
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
            // Mutate in place — same pattern as storage.js; persisted on next autoSave
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
              backendResult = await aiService.generateSceneViaBackendStream(backendCampaignId, playerAction, {
                ...backendOpts,
                onEvent: (event) => {
                  if (event.type === 'intent') {
                    console.log('[useAI] Stream intent:', event.data?.intent);
                  }
                },
              });
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

        // Use FE-resolved dice roll instead of AI-generated one
        result.diceRoll = resolved.diceRoll || null;

        // Update momentum AFTER the roll for next scene
        if (resolved.diceRoll) {
          const nextMomentum = calculateNextMomentum(state.momentumBonus || 0, resolved.diceRoll.sl);
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
          timestamp: Date.now(),
        };

        dispatch({ type: 'ADD_SCENE', payload: scene });

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
        throw err;
      }
    },
    [state, settings, aiProvider, apiKey, alternateApiKey, imageApiKey, imageProvider, imageGenEnabled, imageStyle, darkPalette, language, needsSystemEnabled, aiModelTier, aiModel, hasApiKey, dispatch, autoSave, t, recordCompletedSceneGenTiming, ensureMissingInventoryImages, inferSkillCheckFn]
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

  const generateImageForScene = useCallback(
    async (sceneId, narrative, imagePrompt, campaignOverride, options = {}) => {
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
          darkPalette,
          state.character?.age,
          state.character?.gender,
          { forceNew: Boolean(options.forceNew) },
          imageSeriousness,
          state.character?.portraitUrl || null
        );
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
        dispatch({
          type: 'UPDATE_SCENE_IMAGE',
          payload: { sceneId, image: imageUrl },
        });
        if (!options.skipAutoSave) {
          setTimeout(() => autoSave(), 300);
        }
        return imageUrl;
      } catch (imgErr) {
        console.warn('Image generation failed:', imgErr.message);
        return null;
      } finally {
        dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
      }
    },
    [state.scenes, state.campaign?.genre, state.campaign?.tone, state.character?.portraitUrl, imageGenEnabled, imageApiKey, imageProvider, imageStyle, darkPalette, hasApiKey, dispatch, autoSave]
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

  const clearEarlyDiceRoll = useCallback(() => setEarlyDiceRoll(null), []);

  return {
    generateScene,
    generateCampaign,
    generateStoryPrompt,
    generateRecap,
    generateCombatCommentary,
    generateImageForScene,
    generateItemImageForInventoryItem,
    ensureMissingInventoryImages,
    verifyQuestObjective,
    acceptQuestOffer,
    declineQuestOffer,
    sceneGenStartTime,
    lastSceneGenMs,
    earlyDiceRoll,
    clearEarlyDiceRoll,
  };
}
