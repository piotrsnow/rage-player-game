import { apiClient } from '../apiClient';
import { parsePartialJson } from '../partialJsonParser';
import { repairDialogueSegments } from '../aiResponse';
import { postProcessSuggestedActions, buildFallbackActions, buildFallbackNarrative } from '../../../shared/domain/fallbackActions.js';

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
    const token = apiClient.getToken();
    const response = await fetch(`${baseUrl}/v1/ai/generate-campaign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ settings, language, provider, model: explicitModel || null }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Campaign generation failed: ${response.status}`);
    }

    // Inline SSE — drain chunks and surface `firstScene` progressively via
    // `onPartialScene` as soon as it's parseable mid-stream (typically
    // ~20-30s in). Lets the campaign creator reveal early instead of
    // waiting for the full 8k-token payload.
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

    return { result: postProcessCampaignResult(raw, repairedSegments, settings, language), usage: null };
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

    const response = await fetch(`${baseUrl}/v1/ai/campaigns/${campaignId}/generate-scene-stream`, {
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

    // Read until `complete` event, then return immediately. Post-complete
    // events (quest_nano_update) are consumed in the background via onEvent
    // so the frontend doesn't block on the nano model call.
    let backgroundReader = null;

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
            throw new Error(event.error || 'Stream generation failed');
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
      }

      if (gotComplete) {
        backgroundReader = (async () => {
          let bg = buffer;
          try {
            while (true) {
              const { done: d, value: v } = await reader.read();
              if (d) break;
              bg += decoder.decode(v, { stream: true });
              const bgLines = bg.split('\n');
              bg = bgLines.pop();
              for (const ln of bgLines) {
                if (!ln.startsWith('data: ')) continue;
                try {
                  const ev = JSON.parse(ln.slice(6));
                  if (onEvent) onEvent(ev);
                } catch { /* skip */ }
              }
            }
          } catch { /* stream closed */ }
        })();
        break;
      }
    }

    // Silence unused-var lint; backgroundReader is intentionally orphaned.
    void backgroundReader;

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
    if (typeof onProgress === 'function') {
      onProgress({ phase: 'chunking', currentBatch: 1, totalBatches: 1, recapMode: summaryStyle?.mode || 'story' });
    }

    const data = await apiClient.post('/ai/generate-recap', {
      scenes,
      language,
      provider,
      modelTier,
      sentencesPerScene,
      summaryStyle,
    });

    const result = data?.result || { recap: '' };
    if (typeof onPartial === 'function') {
      onPartial({ text: result.recap || '', currentBatch: 1, totalBatches: 1, recapMode: summaryStyle?.mode || 'story' });
    }
    if (typeof onProgress === 'function') {
      onProgress({ phase: 'done', currentBatch: 1, totalBatches: 1, recapMode: summaryStyle?.mode || 'story' });
    }
    return { result, usage: data?.usage || null };
  },

  async generateStoryPrompt({ genre, tone, style, seedText = '' }, provider, _apiKeyIgnored, language = 'en', _modelTier = 'premium') {
    const data = await apiClient.post('/ai/generate-story-prompt', {
      genre, tone, style, seedText, language, provider,
    });
    return { result: { prompt: data.prompt }, usage: null };
  },

  async generateCombatCommentary(gameState, combatSnapshot, provider, _apiKeyIgnored, language = 'en', modelTier = 'premium', { explicitModel = null } = {}) {
    const data = await apiClient.post('/ai/combat-commentary', {
      gameState,
      combatSnapshot,
      language,
      provider,
      model: explicitModel || null,
      modelTier,
    });
    return { result: data?.result || { narration: '', battleCries: [] }, usage: data?.usage || null };
  },

  async verifyObjective(storyContext, questName, questDescription, objectiveDescription, provider, _apiKeyIgnored, language = 'en', modelTier = 'premium') {
    const data = await apiClient.post('/ai/verify-objective', {
      storyContext,
      questName,
      questDescription,
      objectiveDescription,
      language,
      provider,
      modelTier,
    });
    return { result: data?.result || { fulfilled: false, reasoning: '' }, usage: data?.usage || null };
  },
};
