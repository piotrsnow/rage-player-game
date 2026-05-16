import { apiClient } from '../apiClient';
import { parsePartialJson } from '../partialJsonParser';
import { repairDialogueSegments } from '../aiResponse';
import { postProcessSuggestedActions, buildFallbackActions, buildFallbackNarrative } from '../../../shared/domain/fallbackActions.js';
import { aiCallLog } from '../../stores/aiCallLogStore';

const RECAP_BATCH_SIZE = 20;

function shortLabel(text, max = 80) {
  if (!text) return '';
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function mergeRecapUsage(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const out = { ...a };
  for (const key of Object.keys(b)) {
    if (typeof b[key] === 'number') {
      out[key] = (typeof a[key] === 'number' ? a[key] : 0) + b[key];
    }
  }
  return out;
}

// Frontend AI service — every method proxies to the backend. No BYOK: users
// store their keys server-side via /v1/auth/settings, and the backend
// resolves per-user keys (falling back to env) when making provider calls.
//
// This file used to host direct OpenAI/Anthropic fetches as a fallback when
// the user hadn't configured a backend. That mode is gone. All callers
// still pass `(provider, apiKey, language, modelTier)` positional args for
// backward compatibility with hooks, but `apiKey` is ignored here — the
// backend resolves the key from the authenticated user's stored bundle.

// Post-process a raw campaign result so the first scene has sensible
// defaults. Kept on the client because the backend returns the raw AI
// shape and FE adds language-specific fallbacks for any missing field.
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
      atmosphere: rawScene.atmosphere && typeof rawScene.atmosphere === 'object' ? rawScene.atmosphere : {},
      journalEntries: Array.isArray(rawScene.journalEntries) ? rawScene.journalEntries : [],
    },
    initialQuest: raw.initialQuest || undefined,
    initialNPCs: Array.isArray(raw.initialNPCs) ? raw.initialNPCs : [],
    initialWorldFacts: Array.isArray(raw.initialWorldFacts) ? raw.initialWorldFacts : [],
  };
}

// Drain the legacy SSE response shape used when the backend is running
// without Redis + BullMQ — campaign gen still streams progressively in
// that fallback path. New Redis-enabled path returns 202 + jobId.
async function drainCampaignStream(response, { onPartialJson } = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = null;
  let sseBuffer = '';
  let rawAccumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'chunk' && event.text) {
          rawAccumulated += event.text;
          if (onPartialJson) {
            const partial = parsePartialJson(rawAccumulated);
            if (partial) onPartialJson(partial);
          }
        } else if (event.type === 'complete') {
          result = event.data;
        } else if (event.type === 'error') {
          throw new Error(event.error || 'Campaign stream error');
        }
      } catch (e) {
        if (e.message && !e.message.includes('JSON')) throw e;
      }
    }
  }

  if (!result) throw new Error('Campaign stream ended without complete event');
  return result;
}

export const aiService = {
  async generateCampaign(settings, provider, _apiKeyIgnored, language = 'en', _modelTier = 'premium', { explicitModel = null, onPartialScene = null } = {}) {
    const baseUrl = apiClient.getBaseUrl();
    const requestBody = { settings, language, provider, model: explicitModel || null };
    const logId = aiCallLog.start({
      type: 'campaign',
      label: shortLabel(settings?.storyPrompt || `Campaign (${settings?.genre || ''} / ${settings?.tone || ''})`),
      provider,
      model: explicitModel || null,
      request: requestBody,
    });
    try {
      const response = await apiClient.fetchAuthed(`${baseUrl}/v1/ai/generate-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Campaign generation failed: ${response.status}`);
      }

      let repairedSegments = null;
      const knownNpcs = [];
      const raw = await drainCampaignStream(response, {
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
      });

      const result = postProcessCampaignResult(raw, repairedSegments, settings, language);
      aiCallLog.finish(logId, { raw, processed: result });
      return { result, usage: null };
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
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
    combatResult = null,
    forceRoll = null,
    entityTags = null,
    travelFailureReason = null,
    achievementState = null,
    onEvent = null,
  } = {}) {
    const baseUrl = apiClient.getBaseUrl();

    const requestBody = {
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
      combatResult,
      forceRoll,
      entityTags,
      travelFailureReason,
      achievementState,
    };

    const sceneLabel = isFirstScene
      ? 'First scene'
      : (playerAction ? shortLabel(playerAction) : (fromAutoPlayer ? 'Auto-player' : 'Continue'));

    const logId = aiCallLog.start({
      type: 'scene',
      label: sceneLabel,
      provider,
      model,
      request: { campaignId, ...requestBody },
      meta: { sceneCount, isCustomAction, fromAutoPlayer },
    });

    try {
      const response = await apiClient.fetchAuthed(`${baseUrl}/v1/ai/campaigns/${campaignId}/generate-scene-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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

        let gotComplete = false;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (onEvent) onEvent(event);

            if (event.type === 'complete') {
              result = event.data;
              gotComplete = true;
            } else if (event.type === 'error') {
              const sseErr = new Error(event.error || 'Stream generation failed');
              sseErr.code = event.code || undefined;
              throw sseErr;
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }

        if (gotComplete) break;
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

      const finalResult = {
        result: scene,
        usage: null,
        sceneIndex: result.sceneIndex,
        sceneId: result.sceneId,
        character: result.character || null,
        quests: result.quests || null,
        newlyUnlockedAchievements: result.newlyUnlockedAchievements || [],
        updatedAchievementState: result.updatedAchievementState || null,
        generationDurationMs: result.generationDurationMs || null,
        responseSizeBytes: result.responseSizeBytes || null,
        avgResponseSizeBytes: result.avgResponseSizeBytes || null,
      };

      aiCallLog.finish(logId, finalResult);
      return finalResult;
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },

  /**
   * Quick beat ("mała akcja") — lightweight RP-beat via the backend nano path.
   * Returns one of:
   *   { kind: 'complete', data }    — beat saved, payload ready for ADD_QUICK_BEAT
   *   { kind: 'escalate', reason }  — caller must fall back to full scene flow
   *   { kind: 'error', message, code }
   */
  async quickBeatViaBackendStream(campaignId, playerAction, {
    provider = 'openai',
    language = 'pl',
    characterId = null,
    entityTags = null,
    boardContext = null,
    dmSettings = {},
  } = {}) {
    const baseUrl = apiClient.getBaseUrl();

    const requestBody = {
      playerAction,
      provider,
      language,
      characterId,
      entityTags,
      ...(boardContext ? { boardContext } : {}),
      dmSettings,
    };

    const logId = aiCallLog.start({
      type: 'quick-beat',
      label: shortLabel(playerAction),
      provider,
      request: { campaignId, ...requestBody },
    });

    try {
      const response = await apiClient.fetchAuthed(`${baseUrl}/v1/ai/campaigns/${campaignId}/quick-beat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const e = new Error(err.error || `Stream error: ${response.status}`);
        e.code = err.code || 'HTTP_ERROR';
        throw e;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let outcome = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        let stop = false;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'complete') {
              outcome = { kind: 'complete', data: event.data };
              stop = true;
            } else if (event.type === 'escalate') {
              outcome = { kind: 'escalate', reason: event.reason || 'unknown' };
              stop = true;
            } else if (event.type === 'error') {
              outcome = { kind: 'error', message: event.error || 'Quick beat failed', code: event.code || 'QUICK_BEAT_ERROR' };
              stop = true;
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
        if (stop) break;
      }

      if (!outcome) outcome = { kind: 'error', message: 'Stream ended without event', code: 'EMPTY_STREAM' };

      aiCallLog.finish(logId, outcome);
      return outcome;
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },

  async needsCommentaryViaBackendStream(campaignId, {
    characterNeeds,
    characterName = null,
    provider = 'openai',
    language = 'pl',
    characterId = null,
    sceneIndex = null,
    dmSettings = {},
  } = {}) {
    const baseUrl = apiClient.getBaseUrl();
    const requestBody = {
      characterNeeds,
      characterName,
      provider,
      language,
      characterId,
      sceneIndex,
      dmSettings,
    };

    try {
      const response = await apiClient.fetchAuthed(`${baseUrl}/v1/ai/campaigns/${campaignId}/needs-commentary-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) return null;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let outcome = null;
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
            if (event.type === 'complete') {
              outcome = event.data;
            }
          } catch { /* ignore parse errors */ }
        }
        if (outcome) break;
      }
      return outcome;
    } catch {
      return null;
    }
  },

  async creatureEncounterViaBackend(campaignId, {
    provider = 'openai',
    language = 'pl',
    dmSettings = {},
    encounterKind = undefined,
  } = {}) {
    const baseUrl = apiClient.getBaseUrl();

    const requestBody = { provider, language, dmSettings };
    if (encounterKind) requestBody.encounterKind = encounterKind;

    const logId = aiCallLog.start({
      type: 'creature-encounter',
      label: 'Creature encounter',
      provider,
      request: { campaignId },
    });

    try {
      const response = await apiClient.fetchAuthed(`${baseUrl}/v1/ai/campaigns/${campaignId}/creature-encounter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const e = new Error(err.error || `Stream error: ${response.status}`);
        e.code = err.code || 'HTTP_ERROR';
        throw e;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let outcome = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        let stop = false;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'complete') {
              outcome = { kind: 'complete', data: event.data };
              stop = true;
            } else if (event.type === 'error') {
              outcome = { kind: 'error', message: event.error || 'Creature encounter failed', code: event.code || 'CREATURE_ERROR' };
              stop = true;
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
        if (stop) break;
      }

      if (!outcome) outcome = { kind: 'error', message: 'Stream ended without event', code: 'EMPTY_STREAM' };

      aiCallLog.finish(logId, outcome);
      return outcome;
    } catch (err) {
      aiCallLog.fail(logId, err);
      throw err;
    }
  },

  async generateRecap(
    gameState,
    _dmSettings,
    provider,
    _apiKeyIgnored,
    language = 'en',
    modelTier = 'premium',
    {
      sentencesPerScene = 1,
      summaryStyle = null,
      onPartial = null,
      onProgress = null,
    } = {}
  ) {
    const scenes = Array.isArray(gameState?.scenes) ? gameState.scenes : [];
    const recapMode = summaryStyle?.mode || 'story';
    const emitProgress = (payload) => {
      if (typeof onProgress === 'function') onProgress(payload);
    };
    const emitPartial = (payload) => {
      if (typeof onPartial === 'function') onPartial(payload);
    };

    const callRecapEndpoint = async (sceneBatch) => {
      const requestBody = {
        scenes: sceneBatch,
        language,
        provider,
        modelTier,
        sentencesPerScene,
        summaryStyle,
      };
      const logId = aiCallLog.start({
        type: 'recap',
        label: `Recap (${sceneBatch.length} scenes, ${recapMode})`,
        provider,
        model: null,
        request: requestBody,
      });
      try {
        const data = await apiClient.post('/ai/generate-recap', requestBody);
        aiCallLog.finish(logId, data);
        return data;
      } catch (e) {
        aiCallLog.fail(logId, e);
        throw e;
      }
    };

    if (scenes.length === 0) {
      emitProgress({ phase: 'chunking', currentBatch: 1, totalBatches: 1, recapMode });
      const data = await callRecapEndpoint([]);
      const result = data?.result || { recap: '' };
      emitPartial({ text: result.recap || '', currentBatch: 1, totalBatches: 1, recapMode });
      emitProgress({ phase: 'done', currentBatch: 1, totalBatches: 1, recapMode });
      return { result, usage: data?.usage || null };
    }

    const batches = [];
    for (let i = 0; i < scenes.length; i += RECAP_BATCH_SIZE) {
      batches.push(scenes.slice(i, i + RECAP_BATCH_SIZE));
    }
    const totalBatches = batches.length;

    const partialRecaps = [];
    let combinedUsage = null;
    let degradedMeta = null;

    for (let i = 0; i < batches.length; i += 1) {
      const currentBatch = i + 1;
      emitProgress({ phase: 'chunking', currentBatch, totalBatches, recapMode });

      const data = await callRecapEndpoint(batches[i]);
      const partRecap = typeof data?.result?.recap === 'string' ? data.result.recap : '';
      const partMeta = data?.result?.meta && typeof data.result.meta === 'object' ? data.result.meta : null;
      combinedUsage = mergeRecapUsage(combinedUsage, data?.usage || null);
      if (partMeta?.degraded && !degradedMeta) degradedMeta = partMeta;

      partialRecaps.push(partRecap);
      emitPartial({
        text: partialRecaps.filter(Boolean).join('\n\n'),
        currentBatch,
        totalBatches,
        recapMode,
      });
    }

    const combined = partialRecaps.filter(Boolean).join('\n\n');
    emitProgress({ phase: 'done', currentBatch: totalBatches, totalBatches, recapMode });
    return {
      result: degradedMeta ? { recap: combined, meta: degradedMeta } : { recap: combined },
      usage: combinedUsage,
    };
  },

  async generateStoryPrompt({ genre, tone, seedText = '' }, provider, _apiKeyIgnored, language = 'en', _modelTier = 'premium') {
    const requestBody = { genre, tone, seedText, language, provider };
    const logId = aiCallLog.start({
      type: 'story-prompt',
      label: `Story prompt (${genre || '?'} / ${tone || '?'})`,
      provider,
      model: null,
      request: requestBody,
    });
    try {
      const data = await apiClient.post('/ai/generate-story-prompt', requestBody);
      const result = { prompt: data.prompt };
      aiCallLog.finish(logId, { result, raw: data });
      return { result, usage: null };
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },

  async generateCharacterLegend(character, provider, language = 'en', _modelTier = 'premium') {
    const requestBody = { character, language, provider };
    const logId = aiCallLog.start({
      type: 'character-legend',
      label: `Legend: ${shortLabel(character?.name || 'unknown', 40)}`,
      provider,
      model: null,
      request: requestBody,
    });
    try {
      const data = await apiClient.post('/ai/generate-character-legend', requestBody);
      const result = { legend: data?.legend || '' };
      aiCallLog.finish(logId, { result, raw: data });
      return { result, usage: data?.usage || null };
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },

  async enhanceImagePrompt({
    keywords,
    imageStyle = 'painting',
    darkPalette = false,
    seriousness = null,
    genre = 'Fantasy',
    tone = 'Epic',
    language = 'en',
    provider = 'openai',
    model = null,
  } = {}) {
    const requestBody = { keywords, imageStyle, darkPalette, seriousness, genre, tone, language, provider, model };
    const logId = aiCallLog.start({
      type: 'enhance-image-prompt',
      label: `Enhance: ${shortLabel(Array.isArray(keywords) ? keywords.join(', ') : keywords)}`,
      provider,
      model,
      request: requestBody,
    });
    try {
      const data = await apiClient.post('/ai/enhance-image-prompt', requestBody);
      const out = { description: data?.description || '' };
      aiCallLog.finish(logId, { result: out, raw: data });
      return out;
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },

  async generateImagePrompt({
    imagePromptTags,
    narrative,
    imageProvider = 'dalle',
    imageStyle = 'painting',
    darkPalette = false,
    seriousness = null,
    genre = 'Fantasy',
    tone = 'Epic',
    characterAge = null,
    characterGender = null,
    customStyleEnabled = false,
    customStyle = '',
    provider = 'openai',
    model = null,
  } = {}) {
    const requestBody = {
      imagePromptTags, narrative, imageProvider, imageStyle, darkPalette, seriousness,
      genre, tone, characterAge, characterGender, customStyleEnabled, customStyle, provider, model,
    };
    const logId = aiCallLog.start({
      type: 'image-prompt',
      label: `Image prompt: ${shortLabel(Array.isArray(imagePromptTags) ? imagePromptTags.join(', ') : imagePromptTags || narrative)}`,
      provider,
      model,
      request: requestBody,
    });
    try {
      const data = await apiClient.post('/ai/generate-image-prompt', requestBody);
      const out = { prompt: data?.prompt || '', negativePrompt: data?.negativePrompt || '' };
      aiCallLog.finish(logId, { result: out, raw: data });
      return out;
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },

  async generateCombatCommentary(gameState, combatSnapshot, provider, _apiKeyIgnored, language = 'en', modelTier = 'premium', { explicitModel = null } = {}) {
    const requestBody = {
      gameState, combatSnapshot, language, provider, model: explicitModel || null, modelTier,
    };
    const logId = aiCallLog.start({
      type: 'combat-commentary',
      label: 'Combat commentary',
      provider,
      model: explicitModel || null,
      request: requestBody,
    });
    try {
      const data = await apiClient.post('/ai/combat-commentary', requestBody);
      const result = data?.result || { narration: '', battleCries: [] };
      aiCallLog.finish(logId, { result, raw: data });
      return { result, usage: data?.usage || null };
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },

  async resolveCombatTurn(combatSnapshot, playerAction, provider, language = 'pl', modelTier = 'standard', options = {}) {
    const requestBody = {
      combatSnapshot,
      playerAction,
      language,
      provider,
      modelTier,
      diceRoll: options?.diceRoll ?? null,
    };
    const logId = aiCallLog.start({
      type: 'combat-turn-resolve',
      label: `Combat turn: ${shortLabel(playerAction)}`,
      provider,
      model: null,
      request: requestBody,
    });
    try {
      const data = await apiClient.post('/ai/combat-turn-resolve', requestBody);
      const result = data?.result || { narration: '', enemyDamage: [], playerDamage: 0, playerHealing: 0, statusEffects: [], manaChange: 0, itemConsumed: false };
      aiCallLog.finish(logId, { result, raw: data });
      return { result, usage: data?.usage || null };
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },

  async verifyObjective(storyContext, questName, questDescription, objectiveDescription, provider, _apiKeyIgnored, language = 'en', modelTier = 'premium') {
    const requestBody = {
      storyContext, questName, questDescription, objectiveDescription, language, provider, modelTier,
    };
    const logId = aiCallLog.start({
      type: 'verify-objective',
      label: `Verify: ${shortLabel(objectiveDescription || questName)}`,
      provider,
      model: null,
      request: requestBody,
    });
    try {
      const data = await apiClient.post('/ai/verify-objective', requestBody);
      const result = data?.result || { fulfilled: false, reasoning: '' };
      aiCallLog.finish(logId, { result, raw: data });
      return { result, usage: data?.usage || null };
    } catch (e) {
      aiCallLog.fail(logId, e);
      throw e;
    }
  },
};
