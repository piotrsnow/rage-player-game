import { useCallback } from 'react';
import { elevenlabsService } from '../../services/elevenlabs';
import { xttsService } from '../../services/xtts';
import {
  reassignVoiceOnError,
  isVoiceNotFoundError,
  resolveSegmentVoice as resolveSegmentVoiceShared,
} from '../../services/characterVoiceResolver';
import { KNOWN_TTS_PROVIDERS } from './narratorUtils';

export function useNarratorVoice({
  viewerMode,
  backendUrl,
  shareToken,
  settings,
  voicePools,
  state,
  dispatch,
  hasApiKey,
}) {
  const activeTtsProvider = KNOWN_TTS_PROVIDERS.includes(settings.sceneTtsTier)
    ? settings.sceneTtsTier
    : (settings.ttsProvider || 'elevenlabs');

  const fetchTts = useCallback(async (voiceId, chunk, campaignId, pacing) => {
    if (viewerMode && backendUrl && shareToken) {
      return elevenlabsService.textToSpeechFromCache(backendUrl, shareToken, voiceId, chunk, undefined, campaignId);
    }
    if (activeTtsProvider === 'xtts') {
      const speed = (settings.dialogueSpeed || 100) / 100;
      return xttsService.textToSpeech(voiceId, chunk, settings.language || 'pl', campaignId, speed);
    }
    return elevenlabsService.textToSpeechWithTimestamps(undefined, voiceId, chunk, undefined, campaignId, pacing);
  }, [viewerMode, backendUrl, shareToken, activeTtsProvider, settings.language, settings.dialogueSpeed]);

  const fetchTtsWithRecovery = useCallback(async (voiceId, chunk, campaignId, pacing, segCtx) => {
    try {
      return await fetchTts(voiceId, chunk, campaignId, pacing);
    } catch (err) {
      if (!isVoiceNotFoundError(err) || !segCtx) throw err;
      if (segCtx.type === 'narration' || !segCtx.characterName) throw err;

      const newVoiceId = reassignVoiceOnError(
        segCtx.characterName,
        voiceId,
        segCtx.gender || null,
        state.characterVoiceMap || {},
        { maleVoices: voicePools.maleVoices, femaleVoices: voicePools.femaleVoices, narratorVoiceId: voicePools.narratorVoiceId, ttsProvider: activeTtsProvider },
        dispatch
      );
      if (!newVoiceId) throw err;
      if (segCtx.onVoiceReassigned) segCtx.onVoiceReassigned(newVoiceId);
      return await fetchTts(newVoiceId, chunk, campaignId, pacing);
    }
  }, [fetchTts, voicePools, state.characterVoiceMap, dispatch, activeTtsProvider]);

  const resolveDefaultVoiceId = useCallback(() => {
    const narratorVoiceId = voicePools.narratorVoiceId;
    const maleVoices = voicePools.maleVoices;
    const femaleVoices = voicePools.femaleVoices;
    const allProviderVoiceIds = new Set([
      ...(maleVoices || []).map((v) => v.voiceId),
      ...(femaleVoices || []).map((v) => v.voiceId),
      ...(narratorVoiceId ? [narratorVoiceId] : []),
    ].filter(Boolean));
    const stateNarratorValid = state.narratorVoiceId
      && allProviderVoiceIds.size > 0 && allProviderVoiceIds.has(state.narratorVoiceId);
    return viewerMode
      ? ((stateNarratorValid && state.narratorVoiceId) || narratorVoiceId)
      : (narratorVoiceId || (stateNarratorValid && state.narratorVoiceId));
  }, [voicePools, state.narratorVoiceId, viewerMode]);

  const createLocalVoiceResolver = useCallback((defaultVoiceId) => {
    const localVoiceMap = { ...(state.characterVoiceMap || {}) };
    return (seg) => {
      const { voiceId, persistMapping } = resolveSegmentVoiceShared(seg, {
        defaultVoiceId,
        narratorVoiceId: voicePools.narratorVoiceId,
        maleVoices: voicePools.maleVoices,
        femaleVoices: voicePools.femaleVoices,
        characterVoiceMap: localVoiceMap,
        ttsProvider: activeTtsProvider,
        viewerMode,
        dispatch,
      });
      if (persistMapping) {
        localVoiceMap[persistMapping.characterName] = {
          voiceId: persistMapping.voiceId,
          gender: persistMapping.gender,
        };
      }
      return voiceId;
    };
  }, [state.characterVoiceMap, voicePools, activeTtsProvider, viewerMode, dispatch]);

  const isVoiceConfigured = viewerMode
    ? !!(
        (state.narratorVoiceId || voicePools.narratorVoiceId)
        && backendUrl
        && shareToken
      )
    : !!(hasApiKey(activeTtsProvider) && voicePools.narratorVoiceId);

  return {
    fetchTts,
    fetchTtsWithRecovery,
    activeTtsProvider,
    resolveDefaultVoiceId,
    createLocalVoiceResolver,
    isVoiceConfigured,
  };
}
