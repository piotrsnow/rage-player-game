import { useEffect, useRef } from 'react';

/**
 * Auto-play narrator reaction to new chat messages.
 *
 * When new DM / combat-commentary messages arrive and the narrator is ready
 * (and not already speaking the current scene via streaming narration), kick
 * off playback on the latest one. Old narration is cut intentionally — the
 * UX goal is to follow the newest action.
 */
export function useChatAutoNarration({ messages, narrator, autoPlay }) {
  const prevMessageCountRef = useRef(messages.length);
  const lastNarratedMessageIdRef = useRef(null);

  useEffect(() => {
    if (!narrator || !autoPlay) {
      prevMessageCountRef.current = messages.length;
      return;
    }
    const { isNarratorReady, speakSingle } = narrator;
    if (!isNarratorReady) {
      prevMessageCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMessageCountRef.current) {
      const alreadyActive =
        narrator.playbackState === narrator.STATES?.PLAYING ||
        narrator.playbackState === narrator.STATES?.LOADING;
      const newMessages = messages.slice(prevMessageCountRef.current);
      const spokenMessages = newMessages.filter(
        (m) => m.role === 'dm' || m.subtype === 'combat_commentary',
      );
      const latestSpokenMessage = spokenMessages.at(-1);
      if (
        latestSpokenMessage &&
        latestSpokenMessage.id !== lastNarratedMessageIdRef.current &&
        !alreadyActive
      ) {
        speakSingle(latestSpokenMessage, latestSpokenMessage.id);
        lastNarratedMessageIdRef.current = latestSpokenMessage.id;
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, narrator, autoPlay]);
}
