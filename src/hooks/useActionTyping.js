import { useCallback, useEffect, useRef } from 'react';
import { TYPING_DRAFT_MAX_LENGTH } from '../../shared/contracts/multiplayer.js';

export function useActionTyping({ mp, isMultiplayer, setCustomAction }) {
  const typingTimerRef = useRef(null);
  const typingBroadcastTimerRef = useRef(null);
  const typingKeepAliveRef = useRef(null);
  const queuedDraftRef = useRef('');
  const isTypingRef = useRef(false);

  const sendTypingState = useCallback((isTyping, draft = '') => {
    mp.sendTyping(isTyping, String(draft || '').slice(0, TYPING_DRAFT_MAX_LENGTH));
  }, [mp]);

  const emitTypingStop = useCallback((preserveDraft = false) => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      const finalDraft = preserveDraft
        ? String(queuedDraftRef.current || '').slice(0, TYPING_DRAFT_MAX_LENGTH)
        : '';
      sendTypingState(false, finalDraft);
    }
    clearInterval(typingKeepAliveRef.current);
    typingKeepAliveRef.current = null;
  }, [sendTypingState]);

  const scheduleTypingBroadcast = useCallback((draft) => {
    queuedDraftRef.current = String(draft || '').slice(0, TYPING_DRAFT_MAX_LENGTH);
    if (typingBroadcastTimerRef.current) return;
    typingBroadcastTimerRef.current = setTimeout(() => {
      typingBroadcastTimerRef.current = null;
      if (isTypingRef.current) {
        sendTypingState(true, queuedDraftRef.current);
      }
    }, 120);
  }, [sendTypingState]);

  const handleTypingChange = useCallback((value) => {
    setCustomAction(value);
    if (!isMultiplayer) return;

    if (value.trim()) {
      const draft = value.trim().slice(0, TYPING_DRAFT_MAX_LENGTH);
      queuedDraftRef.current = draft;
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        sendTypingState(true, draft);
      } else {
        scheduleTypingBroadcast(draft);
      }
      if (!typingKeepAliveRef.current) {
        typingKeepAliveRef.current = setInterval(() => {
          if (!isTypingRef.current) return;
          sendTypingState(true, queuedDraftRef.current);
        }, 900);
      }
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => emitTypingStop(true), 2000);
    } else {
      clearTimeout(typingTimerRef.current);
      clearTimeout(typingBroadcastTimerRef.current);
      typingBroadcastTimerRef.current = null;
      emitTypingStop(false);
    }
  }, [isMultiplayer, emitTypingStop, scheduleTypingBroadcast, sendTypingState, setCustomAction]);

  const cancelPendingBroadcasts = useCallback(() => {
    clearTimeout(typingTimerRef.current);
    clearTimeout(typingBroadcastTimerRef.current);
    typingBroadcastTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      clearTimeout(typingBroadcastTimerRef.current);
      clearInterval(typingKeepAliveRef.current);
      typingKeepAliveRef.current = null;
      if (isTypingRef.current) {
        sendTypingState(false, '');
      }
    };
  }, [sendTypingState]);

  return {
    handleTypingChange,
    emitTypingStop,
    cancelPendingBroadcasts,
    isTypingRef,
  };
}
