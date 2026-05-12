import { useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGame } from '../contexts/GameContext';
import { useNarratorVoice } from './narrator/useNarratorVoice';
import { useNarratorPlayback } from './narrator/useNarratorPlayback';
import { useNarratorQueue } from './narrator/useNarratorQueue';
import { STATES } from './narrator/narratorUtils';

export function useNarrator({ viewerMode = false, shareToken = null, backendUrl = null } = {}) {
  const { settings, hasApiKey, voicePools, perVoiceVolumes } = useSettings();
  const { state, dispatch } = useGame();

  const coordinatorSessionRef = useRef(null);

  const voice = useNarratorVoice({
    viewerMode,
    backendUrl,
    shareToken,
    settings,
    voicePools,
    state,
    dispatch,
    hasApiKey,
  });

  const playback = useNarratorPlayback({
    settings,
    perVoiceVolumes,
    dispatch,
    viewerMode,
    coordinatorSessionRef,
  });

  const queue = useNarratorQueue({
    viewerMode,
    voice,
    playback,
    settings,
    voicePools,
    perVoiceVolumes,
    state,
    dispatch,
    hasApiKey,
    coordinatorSessionRef,
  });

  return {
    playbackState: playback.playbackState,
    narrationSecondsRemaining: playback.narrationSecondsRemaining,
    currentMessageId: queue.currentMessageId,
    currentSegmentIndex: queue.currentSegmentIndex,
    currentCharacter: queue.currentCharacter,
    highlightInfo: playback.highlightInfo,
    currentChunk: playback.currentChunk,
    loadingSegmentIndices: queue.loadingSegmentIndices,
    isNarratorReady: viewerMode
      ? voice.isVoiceConfigured
      : !!(settings.narratorEnabled && voice.isVoiceConfigured),
    speak: queue.speak,
    speakScene: queue.speakScene,
    speakSingle: queue.speakSingle,
    playSegment: queue.playSegment,
    pause: playback.pause,
    resume: playback.resume,
    stop: queue.stop,
    skipSegment: playback.skipSegment,
    startStreaming: queue.startStreaming,
    pushStreamingSegments: queue.pushStreamingSegments,
    finishStreaming: queue.finishStreaming,
    isStreaming: queue.isStreaming,
    startNarrationFastForwardHold: playback.startNarrationFastForwardHold,
    stopNarrationFastForwardHold: playback.stopNarrationFastForwardHold,
    narrationFastForwardRate: playback.narrationFastForwardRate,
    isNarrationFastForwardHolding: playback.isNarrationFastForwardHolding,
    STATES,
  };
}
