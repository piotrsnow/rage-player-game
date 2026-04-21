import { useEffect, useRef } from 'react';

/**
 * Auto-play narrator reaction to new chat messages.
 *
 * Tracks the latest spoken message (DM / combat-commentary) by id rather than
 * by count, so that messages arriving while the narrator is busy or autoplay
 * is temporarily suppressed (e.g. the player-action typewriter overlay is
 * showing) are NOT lost — they get narrated as soon as conditions allow.
 *
 * Coordinates with other narration sources (streaming narrator,
 * `handlePlayerActionOverlayComplete`) via `narrator.currentMessageId` and
 * `narrator.isStreaming` to avoid double-narrating the same scene.
 */
export function useChatAutoNarration({ messages, narrator, autoPlay }) {
  // `undefined` = first run (snapshot), null = nothing yet, string = id
  const lastHandledIdRef = useRef(undefined);

  useEffect(() => {
    const latestSpoken = [...messages]
      .reverse()
      .find((m) => m.role === 'dm' || m.subtype === 'combat_commentary');
    const latestId = latestSpoken?.id ?? null;

    // First mount: snapshot what's already there so we don't replay history.
    if (lastHandledIdRef.current === undefined) {
      lastHandledIdRef.current = latestId;
      return;
    }

    if (!latestSpoken || latestId === lastHandledIdRef.current) return;

    // If another narration source already grabbed this exact message
    // (handlePlayerActionOverlayComplete just called speakSingle, or the
    // streaming narrator is currently reading the live scene), claim it as
    // handled so we don't double-narrate later.
    if (
      narrator?.currentMessageId === latestId
      || narrator?.isStreaming
    ) {
      lastHandledIdRef.current = latestId;
      return;
    }

    if (!narrator || !autoPlay || !narrator.isNarratorReady) {
      // Don't claim — we want to narrate this message later when conditions
      // become favorable (overlay closes / narrator becomes ready).
      return;
    }

    const alreadyActive =
      narrator.playbackState === narrator.STATES?.PLAYING
      || narrator.playbackState === narrator.STATES?.LOADING;
    if (alreadyActive) {
      // Don't claim — re-evaluate when narrator goes back to idle and
      // GameplayPage re-renders with the new narrator object.
      return;
    }

    narrator.speakSingle(latestSpoken, latestSpoken.id);
    lastHandledIdRef.current = latestId;
  }, [messages, narrator, autoPlay]);
}
