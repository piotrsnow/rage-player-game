import { buildSystemPrompt, buildCampaignCreationPrompt, buildRecapPrompt, buildRecapMergePrompt } from '../prompts';
import { apiClient } from '../apiClient';
import { callBackendStream } from '../aiStream';
import {
  safeParseJSON, safeParseAIResponse, repairDialogueSegments,
  CampaignResponseSchema, CompressionResponseSchema,
  RecapResponseSchema, StoryPromptResponseSchema, ObjectiveVerificationSchema, CombatCommentaryResponseSchema,
  SkillCheckInferenceSchema,
} from '../aiResponse';
import { selectModel } from './models';
import { callAI } from './providers';
import { postProcessSuggestedActions, buildFallbackActions, buildFallbackNarrative } from './suggestedActions';

function normalizeRecapNarrative(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return '';

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const listPattern = /^([-*•]|\d+[.)])\s+/;
  const headingPattern = /^#{1,6}\s+/;
  const listLines = lines.filter((line) => listPattern.test(line)).length;
  const hasListFormatting = listLines > 0 || lines.some((line) => headingPattern.test(line));
  if (!hasListFormatting) return raw;

  return lines
    .map((line) => line.replace(headingPattern, '').replace(listPattern, '').trim())
    .filter(Boolean)
    .join(' ');
}

const RECAP_SCENE_CHUNK_SIZE = 50;
const RECAP_COMPLETION_TOKENS = 500;

function chunkArray(items, size) {
  const chunkSize = Math.max(1, Number(size) || 1);
  if (!Array.isArray(items) || items.length === 0) return [];
  const chunks = [];
  for (let idx = 0; idx < items.length; idx += chunkSize) {
    chunks.push(items.slice(idx, idx + chunkSize));
  }
  return chunks;
}

function filterChatHistoryByScenes(chatHistory, sceneChunk, { includeMessagesWithoutSceneId = false } = {}) {
  const messages = Array.isArray(chatHistory) ? chatHistory : [];
  const chunkSceneIds = new Set((Array.isArray(sceneChunk) ? sceneChunk : []).map((scene) => scene?.id).filter(Boolean));
  return messages.filter((msg) => {
    if (!msg?.sceneId) return includeMessagesWithoutSceneId;
    return chunkSceneIds.has(msg.sceneId);
  });
}

function mergeUsageTotals(totalUsage, nextUsage) {
  if (!nextUsage) return totalUsage;
  const current = totalUsage
    ? { ...totalUsage }
    : { prompt_tokens: 0, completion_tokens: 0, model: nextUsage.model || null };
  current.prompt_tokens += Number(nextUsage.prompt_tokens) || 0;
  current.completion_tokens += Number(nextUsage.completion_tokens) || 0;
  if (!current.model && nextUsage.model) current.model = nextUsage.model;
  return current;
}

function formatCombatantForCommentary(combatant) {
  const status = combatant.isDefeated
    ? 'defeated'
    : `${combatant.wounds}/${combatant.maxWounds} wounds`;
  return `- ${combatant.name} [${combatant.type}]${combatant.side ? ` side=${combatant.side}` : ''} — ${status}`;
}

function buildCombatCommentaryPrompts(gameState, combatSnapshot, language = 'en') {
  const campaignName = gameState?.campaign?.name || 'Unnamed Campaign';
  const currentLocation = gameState?.world?.currentLocation || 'Unknown';
  const activeCombatants = combatSnapshot?.activeCombatants || [];
  const defeatedCombatants = combatSnapshot?.defeatedCombatants || [];
  const recentResults = combatSnapshot?.recentResults || [];
  const recentLogEntries = combatSnapshot?.recentLogEntries || [];
  const langNote = language === 'pl'
    ? 'Write both the narration and battle cries in Polish.'
    : 'Write both the narration and battle cries in English.';

  const activeBlock = activeCombatants.length > 0
    ? activeCombatants.map(formatCombatantForCommentary).join('\n')
    : '- No active combatants remain.';
  const defeatedBlock = defeatedCombatants.length > 0
    ? defeatedCombatants.map(formatCombatantForCommentary).join('\n')
    : '- Nobody has been defeated yet.';
  const recentResultsBlock = recentResults.length > 0
    ? recentResults.map((entry) => `- ${entry}`).join('\n')
    : '- No recent exchanges recorded.';
  const recentLogBlock = recentLogEntries.length > 0
    ? recentLogEntries.map((entry) => `- ${entry}`).join('\n')
    : '- No recent combat log lines.';

  return {
    system: `You are a battle commentator for the tabletop RPG campaign "${campaignName}" with a grim, dark-fantasy tone.

Your job is to add a short mid-combat narration to an already active fight.

MANDATORY RULES:
- This is NOT a full scene. Do not continue the adventure outside the current fight.
- Do NOT invent or request any state changes, combat resolution, new enemies, victory, surrender, or an end to combat.
- Write exactly ONE narrator paragraph summarizing the current state and momentum of the battle.
- Then provide exactly ONE short, vicious battle cry for EACH active combatant listed in the input.
- Battle cries must be direct speech only, with no narration around them.
- Use only the listed combatants and recent combat context. Do not introduce new speakers.
- Keep the output tight and vivid. The commentary should feel fast and reactive, not like a full prose scene.
- ${langNote}
- Respond with ONLY valid JSON in this exact format:
{
  "narration": "One paragraph of battle narration...",
  "battleCries": [
    { "speaker": "Combatant Name", "text": "Short battle cry!" }
  ]
}`,
    user: `Generate a mid-combat commentary for an already active fight.

ROUND: ${combatSnapshot?.round ?? 0}
LOCATION: ${currentLocation}
REASON FOR THE FIGHT: ${combatSnapshot?.reason || 'Unknown'}
ACTIVE COMBATANT COUNT: ${activeCombatants.length}

ACTIVE COMBATANTS:
${activeBlock}

DEFEATED COMBATANTS:
${defeatedBlock}

RECENT RESOLUTION SNAPSHOT:
${recentResultsBlock}

RECENT COMBAT LOG:
${recentLogBlock}

REMINDERS:
- Narration must stay in the present battle and reflect visible momentum, wounds, pressure, positioning, fear, fury, or desperation.
- Battle cries must cover every active combatant exactly once.
- Do not duplicate the same cry wording for everyone.
- Do not mention JSON, rules, or mechanics in the narration unless it is natural diegetic language.`,
  };
}

function buildObjectiveVerificationPrompt(storyContext, questName, questDescription, objectiveDescription, language = 'en') {
  const lang = language === 'pl' ? 'Polish' : 'English';
  return {
    system: 'You are an impartial story analyst for a tabletop RPG game. Your job is to determine whether a specific quest objective has been fulfilled based on the events that occurred in the story. Analyze the provided story context carefully and objectively. Respond with ONLY valid JSON.',
    user: `Analyze the following story to determine if the quest objective has been fulfilled.

STORY CONTEXT:
${storyContext}

QUEST: ${questName}
Quest description: ${questDescription}

OBJECTIVE TO VERIFY: "${objectiveDescription}"

Has this specific objective been fulfilled based on the story events? Consider partial or indirect fulfillment as well — if the spirit of the objective has been met, it counts as fulfilled.

Respond with ONLY valid JSON:
{"fulfilled": true or false, "reasoning": "A brief 1-2 sentence explanation in ${lang} of why the objective is or is not fulfilled based on story events."}`,
  };
}

function postProcessCampaignResult(raw, repairedSegments, settings, language) {
  if (!raw || typeof raw !== 'object') raw = {};
  const rawScene = raw.firstScene && typeof raw.firstScene === 'object' ? raw.firstScene : {};
  const fallbackNarrative = buildFallbackNarrative(language);
  const narrative = typeof rawScene.narrative === 'string' && rawScene.narrative.trim()
    ? rawScene.narrative.trim()
    : typeof raw.hook === 'string' && raw.hook.trim()
      ? raw.hook.trim()
      : fallbackNarrative;

  const suggestedActions = postProcessSuggestedActions({
    suggestedActions: Array.isArray(rawScene.suggestedActions) && rawScene.suggestedActions.length > 0
      ? rawScene.suggestedActions.filter((a) => typeof a === 'string' && a.trim())
      : buildFallbackActions(language, { narrative }),
    language,
    gameState: null,
    narrative,
    stateChanges: rawScene?.stateChanges || {},
  });

  const dialogueSegments = repairedSegments
    || (Array.isArray(rawScene.dialogueSegments) && rawScene.dialogueSegments.length > 0
      ? rawScene.dialogueSegments
      : [{ type: 'narration', text: narrative }]);

  return {
    name: typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : settings?.storyPrompt ? `Campaign: ${String(settings.storyPrompt).slice(0, 40)}` : 'Unnamed Campaign',
    worldDescription: typeof raw.worldDescription === 'string' && raw.worldDescription.trim()
      ? raw.worldDescription.trim()
      : language === 'pl'
        ? 'Świat jest pełen napięć, konfliktów frakcji i ukrytych zagrożeń.'
        : 'The world is full of tension, faction conflict, and hidden threats.',
    hook: typeof raw.hook === 'string' && raw.hook.trim()
      ? raw.hook.trim()
      : language === 'pl'
        ? 'Twoja historia zaczyna się od niepozornego tropu, który prowadzi do większej intrygi.'
        : 'Your story begins with a small clue that opens into a larger conspiracy.',
    characterSuggestion: raw.characterSuggestion || undefined,
    firstScene: {
      narrative,
      dialogueSegments,
      suggestedActions,
      soundEffect: rawScene.soundEffect ?? null,
      musicPrompt: rawScene.musicPrompt ?? null,
      imagePrompt: rawScene.imagePrompt ?? null,
      sceneGrid: rawScene.sceneGrid ?? null,
      atmosphere: rawScene.atmosphere && typeof rawScene.atmosphere === 'object' ? rawScene.atmosphere : {},
      journalEntries: Array.isArray(rawScene.journalEntries) ? rawScene.journalEntries : [],
    },
    initialQuest: raw.initialQuest || undefined,
    initialNPCs: Array.isArray(raw.initialNPCs) ? raw.initialNPCs : [],
    initialWorldFacts: Array.isArray(raw.initialWorldFacts) ? raw.initialWorldFacts : [],
    campaignStructure: raw.campaignStructure || undefined,
  };
}

export const aiService = {
  async generateCampaign(settings, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null, explicitModel = null, onPartialScene = null } = {}) {
    if (apiClient.isConnected()) {
      let repairedSegments = null;
      const knownNpcs = [];

      const raw = await callBackendStream('/ai/generate-campaign', {
        settings, language, provider,
        model: explicitModel || null,
      }, {
        onPartialJson(partial) {
          if (partial.initialNPCs) {
            for (const npc of partial.initialNPCs) {
              if (npc?.name && !knownNpcs.some((n) => n.name === npc.name)) {
                knownNpcs.push(npc);
              }
            }
          }
          const fs = partial.firstScene;
          if (fs?.dialogueSegments?.length > 0 && fs.narrative) {
            const npcNames = knownNpcs.map((n) => n.name);
            repairedSegments = repairDialogueSegments(fs.narrative, fs.dialogueSegments, npcNames);
            if (onPartialScene) onPartialScene({ ...fs, dialogueSegments: repairedSegments });
          }
        },
        schema: CampaignResponseSchema,
      });

      return { result: postProcessCampaignResult(raw, repairedSegments, settings, language), usage: null };
    }

    const model = explicitModel || selectModel(provider, modelTier, 'generateCampaign');
    const systemPrompt = 'You are a master RPG campaign designer. Create rich, immersive campaign foundations that draw players into the story. Always respond with valid JSON only.';
    const userPrompt = buildCampaignCreationPrompt(settings, language);
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 8000, { model, modelTier, taskType: 'generateCampaign', alternateApiKey });
    const validated = safeParseAIResponse(result, CampaignResponseSchema, { language });
    if (validated.ok) return { result: validated.data, usage };

    return { result: postProcessCampaignResult(validated.data || result, null, settings, language), usage };
  },

  async generateSceneViaBackendStream(campaignId, playerAction, {
    provider = 'openai',
    model = null,
    language = 'pl',
    dmSettings = {},
    resolvedMechanics = null,
    needsSystemEnabled = false,
    characterNeeds = null,
    isFirstScene = false,
    sceneCount = 0,
    isCustomAction = false,
    fromAutoPlayer = false,
    gameState = null,
    onEvent = null,
  } = {}) {
    const baseUrl = apiClient.getBaseUrl();
    const token = apiClient.getToken();

    const response = await fetch(`${baseUrl}/ai/campaigns/${campaignId}/generate-scene-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        playerAction: playerAction || '',
        provider,
        model,
        language,
        dmSettings,
        resolvedMechanics,
        needsSystemEnabled,
        characterNeeds,
        isFirstScene,
        sceneCount,
        isCustomAction,
        fromAutoPlayer,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (onEvent) onEvent(event);

          if (event.type === 'complete') {
            result = event.data;
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Stream generation failed');
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
      }
    }

    if (!result) throw new Error('Stream ended without complete event');

    const scene = result.scene || {};

    if (scene.suggestedActions && gameState) {
      scene.suggestedActions = postProcessSuggestedActions({
        suggestedActions: scene.suggestedActions,
        language,
        gameState,
        narrative: scene.narrative,
        stateChanges: scene.stateChanges,
      });
    }

    scene.meta = { ...(scene.meta || {}), contextQuality: 'full', backendStreaming: true };

    return {
      result: scene,
      usage: null,
      sceneIndex: result.sceneIndex,
      sceneId: result.sceneId,
      character: result.character || null,
    };
  },

  async generateRecap(
    gameState,
    dmSettings,
    provider,
    apiKey,
    language = 'en',
    modelTier = 'premium',
    {
      alternateApiKey = null,
      sentencesPerScene = 1,
      summaryStyle = null,
      onPartial = null,
      onProgress = null,
    } = {}
  ) {
    const model = selectModel(provider, modelTier, 'generateRecap');
    const allScenes = Array.isArray(gameState?.scenes) ? gameState.scenes : [];
    const totalSceneCount = allScenes.length;
    const requestedMode = summaryStyle && typeof summaryStyle === 'object' ? summaryStyle.mode : null;
    const recapMode = ['story', 'dialogue', 'poem', 'report'].includes(requestedMode) ? requestedMode : 'story';
    const useChunking = totalSceneCount > RECAP_SCENE_CHUNK_SIZE;
    const emitProgress = (payload) => {
      if (typeof onProgress === 'function') onProgress(payload);
    };
    const emitPartial = (payload) => {
      if (typeof onPartial === 'function') onPartial(payload);
    };

    const runRecapCall = async (stateForPrompt, userPrompt, validationErrorCode = 'recap_schema_validation_failed') => {
      const systemPrompt = buildSystemPrompt(stateForPrompt, dmSettings, language, null, { fullSceneHistory: true });
      const { result, usage } = await callAI(
        provider,
        apiKey,
        systemPrompt,
        userPrompt,
        RECAP_COMPLETION_TOKENS,
        { model, modelTier, taskType: 'generateRecap', alternateApiKey }
      );
      const validated = safeParseAIResponse(result, RecapResponseSchema);
      if (!validated.ok) {
        return {
          ok: false,
          usage,
          error: validated.error || validationErrorCode,
        };
      }
      return {
        ok: true,
        usage,
        recap: normalizeRecapNarrative(validated.data.recap),
      };
    };

    if (!useChunking) {
      emitProgress({
        phase: 'chunking',
        currentBatch: 1,
        totalBatches: 1,
        recapMode,
      });
      const userPrompt = buildRecapPrompt(language, {
        sceneCount: totalSceneCount,
        sentencesPerScene,
        summaryStyle,
      });
      const single = await runRecapCall(gameState, userPrompt);
      if (single.ok) {
        emitPartial({
          text: single.recap,
          currentBatch: 1,
          totalBatches: 1,
          recapMode,
        });
        emitProgress({
          phase: 'done',
          currentBatch: 1,
          totalBatches: 1,
          recapMode,
        });
        return {
          result: {
            recap: single.recap,
          },
          usage: single.usage,
        };
      }
      return {
        result: {
          recap: language === 'pl'
            ? 'Dotąd: bohater przemierza niebezpieczny świat, a konsekwencje decyzji zaczynają się kumulować.'
            : 'So far: the hero moves through a dangerous world, and consequences of prior choices are mounting.',
          meta: { degraded: true, reason: single.error || 'recap_schema_validation_failed' },
        },
        usage: single.usage,
      };
    }

    const sceneChunks = chunkArray(allScenes, RECAP_SCENE_CHUNK_SIZE);
    const partialRecaps = [];
    let combinedUsage = null;
    for (let chunkIndex = 0; chunkIndex < sceneChunks.length; chunkIndex += 1) {
      const sceneChunk = sceneChunks[chunkIndex];
      const chunkState = {
        ...gameState,
        scenes: sceneChunk,
        chatHistory: filterChatHistoryByScenes(gameState?.chatHistory, sceneChunk, {
          includeMessagesWithoutSceneId: chunkIndex === 0,
        }),
      };
      const chunkPrompt = buildRecapPrompt(language, {
        sceneCount: sceneChunk.length,
        sentencesPerScene,
        summaryStyle,
      });
      const chunkResult = await runRecapCall(
        chunkState,
        chunkPrompt,
        `recap_chunk_${chunkIndex + 1}_schema_validation_failed`
      );
      combinedUsage = mergeUsageTotals(combinedUsage, chunkResult.usage);
      if (!chunkResult.ok) {
        const chunkNumber = chunkIndex + 1;
        throw new Error(
          language === 'pl'
            ? `Nie udało się wygenerować streszczenia dla paczki scen ${chunkNumber}/${sceneChunks.length}.`
            : `Failed to generate recap for scene chunk ${chunkNumber}/${sceneChunks.length}.`
        );
      }
      partialRecaps.push(chunkResult.recap);
      emitPartial({
        text: partialRecaps.join('\n\n'),
        currentBatch: chunkIndex + 1,
        totalBatches: sceneChunks.length,
        recapMode,
      });
      emitProgress({
        phase: 'chunking',
        currentBatch: chunkIndex + 1,
        totalBatches: sceneChunks.length,
        recapMode,
      });
    }

    if (partialRecaps.length === 1) {
      emitProgress({
        phase: 'done',
        currentBatch: 1,
        totalBatches: 1,
        recapMode,
      });
      return {
        result: {
          recap: partialRecaps[0],
        },
        usage: combinedUsage,
      };
    }

    emitProgress({
      phase: 'merging',
      currentBatch: sceneChunks.length,
      totalBatches: sceneChunks.length,
      recapMode,
    });
    const mergePrompt = buildRecapMergePrompt(language, partialRecaps, {
      sceneCount: totalSceneCount,
      sentencesPerScene,
      summaryStyle,
    });
    const mergeState = {
      ...gameState,
      scenes: allScenes.slice(-Math.min(RECAP_SCENE_CHUNK_SIZE, allScenes.length)),
      chatHistory: filterChatHistoryByScenes(gameState?.chatHistory, allScenes.slice(-Math.min(RECAP_SCENE_CHUNK_SIZE, allScenes.length))),
    };
    const merged = await runRecapCall(mergeState, mergePrompt, 'recap_merge_schema_validation_failed');
    combinedUsage = mergeUsageTotals(combinedUsage, merged.usage);
    if (!merged.ok) {
      return {
        result: {
          recap: language === 'pl'
            ? 'Dotąd: bohater przemierza niebezpieczny świat, a konsekwencje decyzji zaczynają się kumulować.'
            : 'So far: the hero moves through a dangerous world, and consequences of prior choices are mounting.',
          meta: { degraded: true, reason: merged.error || 'recap_merge_schema_validation_failed' },
        },
        usage: combinedUsage,
      };
    }

    emitProgress({
      phase: 'done',
      currentBatch: sceneChunks.length,
      totalBatches: sceneChunks.length,
      recapMode,
    });
    return {
      result: {
        recap: merged.recap,
      },
      usage: combinedUsage,
    };
  },

  async compressScenes(scenesText, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    const model = selectModel(provider, modelTier, 'compressScenes');
    const langNote = language === 'pl' ? ' Write the summary in Polish, matching the language of the source scenes.' : '';
    const systemPrompt = `You are a narrative summarizer for an RPG game. Compress scene histories into concise but complete summaries that preserve all important details: NPC names, locations, player decisions, consequences, combat outcomes, items found, and plot developments. Always respond with valid JSON only.${langNote}`;
    const userPrompt = `Summarize the following RPG scene history into a concise narrative summary (max 4500 characters). Preserve key facts: NPC names and fates, locations visited, items acquired/lost, major decisions and their consequences, combat outcomes, and unresolved plot threads.\n\nSCENES:\n${scenesText}\n\nRespond with JSON: {"summary": "Your compressed summary here..."}`;
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 800, { model, modelTier, taskType: 'compressScenes', alternateApiKey });
    const validated = safeParseAIResponse(result, CompressionResponseSchema);
    if (validated.ok) return { result: validated.data, usage };
    return {
      result: {
        summary: String(scenesText || '').slice(0, 1400),
        meta: { degraded: true, reason: validated.error || 'compression_schema_validation_failed' },
      },
      usage,
    };
  },

  async generateStoryPrompt({ genre, tone, style, seedText = '' }, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    if (apiClient.isConnected()) {
      const data = await apiClient.post('/ai/generate-story-prompt', {
        genre, tone, style, seedText, language, provider,
      });
      return { result: { prompt: data.prompt }, usage: null };
    }

    const model = selectModel(provider, modelTier, 'generateStoryPrompt');
    const systemPrompt = 'You are a creative RPG story idea generator. Invent original, evocative adventure premises. Always respond with valid JSON only.';
    const humorousGuidance = tone === 'Humorous'
      ? ` The humor must NOT be random absurdity or slapstick nonsense. Instead, ground the premise in a believable world and weave in 1-2 genuinely controversial, provocative, or morally ambiguous elements (e.g. corrupt religious authorities, morally grey freedom fighters, taboo social customs, ethically questionable magical practices, politically charged factions). The comedy should emerge naturally from how characters navigate these uncomfortable realities — dark irony, social satire, awkward moral dilemmas, and characters who take absurd stances on serious issues. Think Terry Pratchett or Monty Python: sharp wit wrapped around real-world controversies, not random zaniness.`
      : '';
    const trimmedSeedText = seedText.trim();
    const userPrompt = [
      `Generate ONE unique, creative RPG story premise for a ${genre} campaign with a ${tone} tone and ${style} play style.`,
      `The premise should be 1-2 sentences, intriguing, and specific enough to spark a full campaign.${humorousGuidance}`,
      trimmedSeedText
        ? `Use the following user-provided words, phrases, or notes as core inspiration. Rework them into a polished adventure premise, but keep the important ideas and explicitly incorporate the provided concepts: "${trimmedSeedText}".`
        : 'Invent the premise from scratch.',
      `Write the premise in ${language === 'pl' ? 'Polish' : 'English'}.`,
      `Respond with JSON: { "prompt": "<the story premise>" }`,
    ].join('\n');
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 300, { model, modelTier, taskType: 'generateStoryPrompt', alternateApiKey });
    const validated = safeParseAIResponse(result, StoryPromptResponseSchema);
    if (validated.ok) return { result: validated.data, usage };
    return {
      result: {
        prompt: seedText?.trim()
          ? seedText.trim()
          : (language === 'pl'
            ? `Mroczna przygoda ${genre || 'fantasy'} o tonie ${tone || 'epickim'} i stylu ${style || 'hybrydowym'}.`
            : `A dark ${genre || 'fantasy'} adventure with a ${tone || 'epic'} tone and ${style || 'hybrid'} style.`),
        meta: { degraded: true, reason: validated.error || 'story_prompt_schema_validation_failed' },
      },
      usage,
    };
  },

  async generateCombatCommentary(gameState, combatSnapshot, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null, explicitModel = null } = {}) {
    const model = explicitModel || selectModel(provider, modelTier, 'generateCombatCommentary');
    const prompts = buildCombatCommentaryPrompts(gameState, combatSnapshot, language);
    const { result, usage } = await callAI(provider, apiKey, prompts.system, prompts.user, 700, {
      model,
      modelTier,
      taskType: 'generateCombatCommentary',
      alternateApiKey,
    });
    const validated = safeParseAIResponse(result, CombatCommentaryResponseSchema);
    if (validated.ok) return { result: validated.data, usage };
    return {
      result: {
        narration: language === 'pl'
          ? 'Walka trwa, obie strony szukają przewagi, a napięcie rośnie z każdym ciosem.'
          : 'The fight continues, both sides look for an edge, and tension rises with every blow.',
        battleCries: [],
        meta: { degraded: true, reason: validated.error || 'combat_commentary_schema_validation_failed' },
      },
      usage,
    };
  },

  async verifyObjective(storyContext, questName, questDescription, objectiveDescription, provider, apiKey, language = 'en', modelTier = 'premium', { alternateApiKey = null } = {}) {
    const model = selectModel(provider, modelTier, 'verifyObjective');
    const prompts = buildObjectiveVerificationPrompt(storyContext, questName, questDescription, objectiveDescription, language);
    const { result, usage } = await callAI(provider, apiKey, prompts.system, prompts.user, 500, { model, modelTier, taskType: 'verifyObjective', alternateApiKey });
    const validated = safeParseAIResponse(result, ObjectiveVerificationSchema);
    if (validated.ok) return { result: validated.data, usage };
    return {
      result: {
        fulfilled: false,
        reasoning: language === 'pl'
          ? 'Tryb degradacji: nie udało się bezpiecznie zweryfikować celu.'
          : 'Degraded mode: objective could not be safely verified.',
        meta: { degraded: true, reason: validated.error || 'objective_schema_validation_failed' },
      },
      usage,
    };
  },

  async inferSkillCheck(actionText, characterSkills, provider, apiKey, { alternateApiKey = null } = {}) {
    const model = selectModel(provider, 'nano', 'inferSkillCheck');
    const systemPrompt = 'RPGon skill check classifier. Given a player action, return JSON with the most appropriate d50 test.\nValid attributes: sila, inteligencja, charyzma, zrecznosc, wytrzymalosc, szczescie.\nReturn: {"attribute":"<key>","skill":"<RPGon skill name>","difficultyModifier":<-40 to 40 step 10>}\nIf the action is trivial/automatic and needs no test, return: {"skip":true}\nPrefer the character\'s trained skills when relevant. Respond with JSON only.';
    const skillList = Object.entries(characterSkills || {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} +${v}`)
      .join(', ');
    const userPrompt = `Action: "${actionText}"\nCharacter skills: ${skillList || 'none'}`;
    const { result, usage } = await callAI(provider, apiKey, systemPrompt, userPrompt, 100, {
      model, modelTier: 'nano', taskType: 'inferSkillCheck', alternateApiKey,
    });
    const parsed = safeParseJSON(result);
    if (!parsed.ok) return { result: { skip: true }, usage };
    const validated = SkillCheckInferenceSchema.safeParse(parsed.data);
    if (!validated.success) return { result: { skip: true }, usage };
    return { result: validated.data, usage };
  },
};
