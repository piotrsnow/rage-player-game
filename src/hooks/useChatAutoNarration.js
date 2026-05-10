import { useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import {
  silencePeerDialogAudio,
  beginDialogSession,
  setDialogSessionState,
  endDialogSession,
} from '../utils/readAloudExclusive';

/**
 * Auto-play narrator reaction to new chat messages.
 *
 * Tracks the latest spoken message (DM / combat-commentary) by id rather than
 * by count, so that messages arriving while autoplay is temporarily suppressed
 * (e.g. the player-action typewriter overlay is showing) are NOT lost — they
 * get narrated as soon as conditions allow.
 *
 * When a newer DM message arrives while narration is already playing another
 * message, the previous playback is stopped — only one narration runs at a time.
 *
 * Uses backend TTS when `narrator.isNarratorReady`; otherwise falls back to
 * browser `speechSynthesis` (same contract as manual play / viewer mode in
 * GameplayPage `playSceneNarration`). Without this, users with narrator on but
 * missing backend keys or no voice configured never heard auto-play at all.
 */
export function useChatAutoNarration({ messages, narrator, autoPlay }) {
  const { settings } = useSettings();
  const lastHandledIdRef = useRef(undefined);

  useEffect(() => {
    const latestSpoken = [...messages]
      .reverse()
      .find((m) => m.role === 'dm' || m.subtype === 'combat_commentary');
    const latestId = latestSpoken?.id ?? null;

    if (lastHandledIdRef.current === undefined) {
      lastHandledIdRef.current = latestId;
      return;
    }

    if (!latestSpoken || latestId === lastHandledIdRef.current) return;

    const S = narrator?.STATES;
    const busyWithThisMessage = narrator?.currentMessageId === latestId
      && S
      && narrator.playbackState !== S.IDLE;

    if (busyWithThisMessage || narrator?.isStreaming) {
      lastHandledIdRef.current = latestId;
      return;
    }

    if (!autoPlay || !narrator) return;

    const speakBrowser = () => {
      try {
        silencePeerDialogAudio();
        const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
        if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') return false;
        const raw = latestSpoken.content ?? latestSpoken.narrative ?? '';
        const text = typeof raw === 'string' ? raw : '';
        if (!text.trim()) return false;
        synth.cancel();
        const csid = beginDialogSession({ source: 'autoplay-synth', messageId: latestId });
        const utter = new window.SpeechSynthesisUtterance(text);
        utter.lang = settings.language || 'pl';
        utter.rate = Math.max(0.7, Math.min(1.2, (settings.dialogueSpeed || 100) / 100));
        setDialogSessionState(csid, 'playing');
        utter.onend = () => endDialogSession(csid);
        utter.onerror = () => endDialogSession(csid);
        synth.speak(utter);
        return true;
      } catch {
        return false;
      }
    };

    if (narrator.isNarratorReady && typeof narrator.speakSingle === 'function') {
      narrator.speakSingle(latestSpoken, latestSpoken.id);
      lastHandledIdRef.current = latestId;
      return;
    }

    if (speakBrowser()) {
      lastHandledIdRef.current = latestId;
    }
  }, [
    messages,
    narrator,
    autoPlay,
    settings.language,
    settings.dialogueSpeed,
  ]);
}
