import { useEffect, useRef } from 'react';

let pendingAutoPlayId = null;

export function getPendingAutoPlayId() { return pendingAutoPlayId; }
export function clearPendingAutoPlayId(id) {
  if (pendingAutoPlayId === id) pendingAutoPlayId = null;
}

/**
 * Auto-play narrator for new chat messages.
 *
 * Sets a module-level `pendingAutoPlayId` when a new DM message appears.
 * `NarratorHeaderButtons` checks this on mount — if its message.id matches,
 * it fires `speakSingle` immediately (same path as a manual click).
 */
export function useChatAutoNarration({ messages, narrator, autoPlay }) {
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

    if (narrator?.isStreaming) return;

    const S = narrator?.STATES;
    const busyWithThisMessage = narrator?.currentMessageId === latestId
      && S
      && narrator.playbackState !== S.IDLE;

    if (busyWithThisMessage) {
      lastHandledIdRef.current = latestId;
      return;
    }

    if (!autoPlay || !narrator) return;

    lastHandledIdRef.current = latestId;
    pendingAutoPlayId = latestId;
  }, [
    messages,
    narrator,
    autoPlay,
  ]);
}
