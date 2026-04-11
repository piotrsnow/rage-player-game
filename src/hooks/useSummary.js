import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient';

const SUMMARY_NARRATION_START_TIMEOUT_MS = 45000;
const SUMMARY_UTTERANCE_PREFETCH_WINDOW = 3;

function hashSummaryCacheKey(input) {
  const text = String(input || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function speakBrowserTts(text, { language, dialogueSpeed }) {
  try {
    if (!text || typeof window === 'undefined') return false;
    const synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') return false;
    synth.cancel();
    const utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = language || 'pl';
    utter.rate = Math.max(0.7, Math.min(1.2, (dialogueSpeed || 100) / 100));
    utter.pitch = 1;
    utter.volume = 1;
    synth.speak(utter);
    return true;
  } catch {
    return false;
  }
}

/**
 * Story-summary subsystem: caching, generation, copy, and narration.
 * Owns all summary-related state and handlers for SummaryModal.
 */
export function useSummary({
  settings,
  state,
  narrator,
  openSettings,
  t,
  generateRecap,
  buildRecapStateForDisplayedScene,
  displayedSceneIndex,
}) {
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryProgress, setSummaryProgress] = useState({
    phase: 'idle',
    currentBatch: 0,
    totalBatches: 0,
    recapMode: 'story',
  });
  const [summarySentencesPerScene, setSummarySentencesPerScene] = useState(1);
  const [summaryOptions, setSummaryOptions] = useState({
    mode: 'story',
    literaryStyle: 50,
    dramaticity: 50,
    factuality: 50,
    dialogueParticipants: 3,
  });
  const [summaryNarrationMessageId, setSummaryNarrationMessageId] = useState(null);
  const [summaryNarrationWordOffset, setSummaryNarrationWordOffset] = useState(0);
  const [summarySpeakLoading, setSummarySpeakLoading] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const summarySpeakTimeoutRef = useRef(null);
  const summaryCopyTimeoutRef = useRef(null);
  const summaryRequestIdRef = useRef(0);

  const openSummaryModal = useCallback(() => {
    setSummaryModalOpen(true);
    setSummaryText('');
    setSummaryError(null);
    setSummaryProgress({
      phase: 'idle',
      currentBatch: 0,
      totalBatches: 0,
      recapMode: summaryOptions?.mode || 'story',
    });
    setSummaryNarrationMessageId(null);
    setSummarySpeakLoading(false);
    setSummaryCopied(false);
  }, [summaryOptions?.mode]);

  const closeSummaryModal = useCallback(() => setSummaryModalOpen(false), []);

  const generateSummary = useCallback(async () => {
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryCopied(false);
    setSummaryText('');
    setSummaryProgress({
      phase: 'initializing',
      currentBatch: 0,
      totalBatches: 0,
      recapMode: summaryOptions?.mode || 'story',
    });
    try {
      const recapState = buildRecapStateForDisplayedScene();
      const recapScenes = Array.isArray(recapState?.scenes) ? recapState.scenes : [];
      const recapSceneIds = recapScenes
        .map((scene, idx) => scene?.id || `idx_${idx + 1}`)
        .join('|');
      const dmSignature = JSON.stringify({
        narrativeStyle: settings.dmSettings?.narrativeStyle ?? 50,
        responseLength: settings.dmSettings?.responseLength ?? 50,
        narratorPoeticism: settings.dmSettings?.narratorPoeticism ?? 50,
        narratorGrittiness: settings.dmSettings?.narratorGrittiness ?? 30,
        narratorDetail: settings.dmSettings?.narratorDetail ?? 50,
        narratorHumor: settings.dmSettings?.narratorHumor ?? 20,
        narratorDrama: settings.dmSettings?.narratorDrama ?? 50,
        narratorCustomInstructions: settings.dmSettings?.narratorCustomInstructions || '',
      });
      const cacheInput = JSON.stringify({
        v: 4,
        language: settings.language || 'pl',
        sceneScope: recapScenes.length,
        displayedSceneIndex,
        chatHistoryLength: Array.isArray(recapState?.chatHistory) ? recapState.chatHistory.length : 0,
        sceneIds: recapSceneIds,
        sentencesPerScene: summarySentencesPerScene,
        summaryOptions,
        dm: dmSignature,
      });
      const cacheKey = `recap_${hashSummaryCacheKey(cacheInput)}`;
      const backendId = recapState?.campaign?.backendId;

      if (backendId && apiClient.isConnected()) {
        try {
          const cached = await apiClient.get(`/campaigns/${backendId}/recaps?key=${encodeURIComponent(cacheKey)}`);
          const cachedRecap = typeof cached?.recap === 'string' ? cached.recap.trim() : '';
          if (cached?.found && cachedRecap) {
            if (summaryRequestIdRef.current !== requestId) return;
            setSummaryText(cachedRecap);
            setSummaryProgress({
              phase: 'done',
              currentBatch: 1,
              totalBatches: 1,
              recapMode: summaryOptions?.mode || 'story',
            });
            return;
          }
        } catch {
          // Ignore cache lookup errors and fall back to AI generation.
        }
      }

      const recap = await generateRecap(recapState, {
        sentencesPerScene: summarySentencesPerScene,
        summaryStyle: summaryOptions,
        onPartial: (partialPayload) => {
          if (summaryRequestIdRef.current !== requestId) return;
          const partialText = typeof partialPayload?.text === 'string' ? partialPayload.text.trim() : '';
          if (partialText) setSummaryText(partialText);
        },
        onProgress: (progressPayload) => {
          if (summaryRequestIdRef.current !== requestId) return;
          const nextCurrentBatch = Number(progressPayload?.currentBatch) || 0;
          const nextTotalBatches = Number(progressPayload?.totalBatches) || 0;
          setSummaryProgress({
            phase: progressPayload?.phase || 'chunking',
            currentBatch: nextCurrentBatch,
            totalBatches: nextTotalBatches,
            recapMode: progressPayload?.recapMode || summaryOptions?.mode || 'story',
          });
        },
      });
      if (summaryRequestIdRef.current !== requestId) return;
      const safeRecap = typeof recap === 'string' ? recap.trim() : '';
      setSummaryText(safeRecap);
      setSummaryProgress((prev) => ({
        ...prev,
        phase: 'done',
      }));
      if (!safeRecap) {
        setSummaryError(t('gameplay.summaryEmptyGenerated', 'AI returned an empty summary. Try again.'));
      } else if (backendId && apiClient.isConnected()) {
        apiClient.post(`/campaigns/${backendId}/recaps`, {
          key: cacheKey,
          recap: safeRecap,
          meta: {
            displayedSceneIndex,
            totalScenes: recapScenes.length,
            sentencesPerScene: summarySentencesPerScene,
            language: settings.language || 'pl',
            summaryStyle: summaryOptions,
          },
        }).catch(() => {});
      }
    } catch (err) {
      if (summaryRequestIdRef.current !== requestId) return;
      setSummaryError(err?.message || t('common.somethingWentWrong'));
    } finally {
      if (summaryRequestIdRef.current !== requestId) return;
      setSummaryLoading(false);
    }
  }, [buildRecapStateForDisplayedScene, displayedSceneIndex, generateRecap, settings.dmSettings, settings.language, summaryOptions, summarySentencesPerScene, t]);

  const copySummary = useCallback(async () => {
    const text = typeof summaryText === 'string' ? summaryText.trim() : '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setSummaryCopied(true);
      if (summaryCopyTimeoutRef.current) {
        window.clearTimeout(summaryCopyTimeoutRef.current);
      }
      summaryCopyTimeoutRef.current = window.setTimeout(() => {
        setSummaryCopied(false);
      }, 2000);
    } catch (err) {
      setSummaryError(err?.message || t('common.somethingWentWrong'));
    }
  }, [summaryText, t]);

  const buildSummaryDialogueSegments = useCallback((text) => {
    const normalized = typeof text === 'string' ? text.trim() : '';
    if (!normalized) return [];

    const lines = normalized
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) return [];

    const speakerLineRegex = /^([A-Za-z0-9\u00C0-\u017F]{1,24})\s*:\s*(.+)$/u;
    const parsedLines = lines.map((line) => {
      const match = line.match(speakerLineRegex);
      if (!match) return null;
      return {
        speaker: match[1].trim(),
        text: match[2].trim(),
      };
    });

    const speakerCount = parsedLines.filter(Boolean).length;
    const isDialogueSummary = speakerCount >= Math.max(2, Math.floor(lines.length * 0.6));
    if (!isDialogueSummary) {
      return [{ type: 'narration', text: normalized }];
    }

    const fallbackVoiceId = settings.narratorVoiceId || state.narratorVoiceId || null;
    const voicePool = [
      ...(settings.maleVoices || []),
      ...(settings.femaleVoices || []),
    ].map((voice) => voice?.voiceId).filter(Boolean);
    const shuffledVoices = shuffleArray(voicePool);
    const speakerVoiceMap = new Map();
    let nextVoiceIndex = 0;

    const assignVoice = (speaker) => {
      if (!speaker) return fallbackVoiceId;
      if (speakerVoiceMap.has(speaker)) return speakerVoiceMap.get(speaker);
      if (shuffledVoices.length === 0) {
        speakerVoiceMap.set(speaker, fallbackVoiceId);
        return fallbackVoiceId;
      }
      const picked = shuffledVoices[nextVoiceIndex % shuffledVoices.length];
      nextVoiceIndex += 1;
      speakerVoiceMap.set(speaker, picked);
      return picked;
    };

    return lines.map((line, index) => {
      const parsed = parsedLines[index];
      if (!parsed || !parsed.text) {
        return {
          type: 'narration',
          text: line,
          voiceId: fallbackVoiceId,
        };
      }
      return {
        type: 'dialogue',
        character: parsed.speaker,
        text: parsed.text,
        voiceId: assignVoice(parsed.speaker),
      };
    });
  }, [settings.maleVoices, settings.femaleVoices, settings.narratorVoiceId, state.narratorVoiceId]);

  const speakSummary = useCallback((textToRead = summaryText, wordOffset = 0) => {
    const normalizedText = typeof textToRead === 'string' ? textToRead.trim() : '';
    if (!normalizedText) return;
    setSummarySpeakLoading(true);
    setSummaryError(null);
    setSummaryNarrationWordOffset(Math.max(0, Number(wordOffset) || 0));
    if (summarySpeakTimeoutRef.current) {
      window.clearTimeout(summarySpeakTimeoutRef.current);
      summarySpeakTimeoutRef.current = null;
    }

    if (narrator.isNarratorReady) {
      const narrationId = `summary_${Date.now()}`;
      const dialogueSegments = buildSummaryDialogueSegments(normalizedText);
      setSummaryNarrationMessageId(narrationId);
      narrator.speakSingle(
        {
          content: normalizedText,
          dialogueSegments,
          segmentPrefetchWindow: SUMMARY_UTTERANCE_PREFETCH_WINDOW,
        },
        narrationId
      );
      summarySpeakTimeoutRef.current = window.setTimeout(() => {
        setSummarySpeakLoading(false);
        setSummaryError(t('gameplay.summaryReadAloudUnavailable', 'Could not start voice playback. Check narrator settings.'));
      }, SUMMARY_NARRATION_START_TIMEOUT_MS);
      return;
    }

    // Fallback: browser TTS — but summary modal requires ElevenLabs
    const ok = speakBrowserTts(normalizedText, {
      language: settings.language,
      dialogueSpeed: settings.dialogueSpeed,
    });
    if (!ok) {
      setSummarySpeakLoading(false);
      setSummaryError(t('gameplay.summaryElevenlabsOnly', 'ElevenLabs narrator is required. Configure narrator voice/settings.'));
      openSettings();
    }
  }, [summaryText, narrator, openSettings, t, buildSummaryDialogueSegments, settings.language, settings.dialogueSpeed]);

  // Clear speak loading when narrator actually starts playing
  useEffect(() => {
    if (!summarySpeakLoading || !summaryNarrationMessageId) return;
    const isThisSummaryPlaying =
      narrator.currentMessageId === summaryNarrationMessageId
      && narrator.playbackState === narrator.STATES.PLAYING;
    if (!isThisSummaryPlaying) return;

    setSummarySpeakLoading(false);
    if (summarySpeakTimeoutRef.current) {
      window.clearTimeout(summarySpeakTimeoutRef.current);
      summarySpeakTimeoutRef.current = null;
    }
  }, [
    summarySpeakLoading,
    summaryNarrationMessageId,
    narrator.currentMessageId,
    narrator.playbackState,
    narrator.STATES.PLAYING,
  ]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (summarySpeakTimeoutRef.current) {
      window.clearTimeout(summarySpeakTimeoutRef.current);
      summarySpeakTimeoutRef.current = null;
    }
    if (summaryCopyTimeoutRef.current) {
      window.clearTimeout(summaryCopyTimeoutRef.current);
      summaryCopyTimeoutRef.current = null;
    }
  }, []);

  return {
    summaryModalOpen,
    summaryText,
    summaryLoading,
    summaryError,
    summaryProgress,
    summarySentencesPerScene,
    setSummarySentencesPerScene,
    summaryOptions,
    setSummaryOptions,
    summaryNarrationMessageId,
    summaryNarrationWordOffset,
    summarySpeakLoading,
    summaryCopied,
    openSummaryModal,
    closeSummaryModal,
    generateSummary,
    copySummary,
    speakSummary,
  };
}
