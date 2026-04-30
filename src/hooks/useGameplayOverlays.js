import { useCallback, useEffect, useRef, useState } from 'react';

const DICE_AFTER_TYPEWRITER_DELAY_MS = 500;

/**
 * Owns the scene-change overlay state: typewriter preview, active
 * player-action overlay, and the dice-reveal timing flag. `autoPlayer` is
 * NOT a dep — the page composes autoPlayer's overlay contribution on top
 * of this hook's output so we don't create a hook cycle (autoPlayer needs
 * handleAction, which wants to flip overlays from here).
 *
 * Returns raw state + helpers; the page builds the final `overlayText`
 * and `overlayOnComplete` by layering autoPlayer in between.
 */
export function useGameplayOverlays({
  scenes,
  narrator,
  autoPlayScenes,
  displayedSceneIndex,
  earlyDiceRoll,
  clearEarlyDiceRoll,
  getSceneActionText,
  onSceneNavigate,
  setViewingSceneIndex,
}) {
  const [typewriterAction, setTypewriterAction] = useState(null);
  const [playerActionOverlayText, setPlayerActionOverlayText] = useState(null);
  const [playerOverlayTypingDone, setPlayerOverlayTypingDone] = useState(false);
  const [diceAfterTypewriter, setDiceAfterTypewriter] = useState(false);

  const typewriterNextIndexRef = useRef(null);
  const autoPlayRef = useRef(autoPlayScenes);
  const displayedSceneIndexRef = useRef(displayedSceneIndex);
  const diceTypewriterTimerRef = useRef(null);

  autoPlayRef.current = autoPlayScenes;
  displayedSceneIndexRef.current = displayedSceneIndex;

  const navigateWithTypewriter = useCallback((nextIdx) => {
    if (typewriterAction) return;
    const nextScene = scenes[nextIdx];
    const actionText = getSceneActionText(nextScene);
    if (actionText) {
      typewriterNextIndexRef.current = nextIdx;
      setTypewriterAction(actionText);
    } else {
      const targetIdx = nextIdx >= scenes.length - 1 ? null : nextIdx;
      setViewingSceneIndex(targetIdx);
      onSceneNavigate?.(nextIdx);
    }
  }, [typewriterAction, scenes, getSceneActionText, onSceneNavigate, setViewingSceneIndex]);

  // Auto-advance: when narrator finishes a scene AND autoPlayScenes is on,
  // type-then-navigate to the next.
  useEffect(() => {
    if (
      narrator.playbackState === 'idle'
      && autoPlayRef.current
      && scenes.length > 0
      && !typewriterAction
    ) {
      const currentIdx = displayedSceneIndexRef.current;
      if (currentIdx < scenes.length - 1) {
        const timer = setTimeout(() => {
          if (!autoPlayRef.current) return;
          navigateWithTypewriter(currentIdx + 1);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [narrator.playbackState, scenes.length, typewriterAction, navigateWithTypewriter]);

  const handleTypewriterComplete = useCallback(() => {
    const nextIdx = typewriterNextIndexRef.current;
    typewriterNextIndexRef.current = null;
    setTypewriterAction(null);
    if (nextIdx != null) {
      const targetIdx = nextIdx >= scenes.length - 1 ? null : nextIdx;
      setViewingSceneIndex(targetIdx);
      onSceneNavigate?.(nextIdx);
    }
  }, [scenes.length, onSceneNavigate, setViewingSceneIndex]);

  const handlePlayerActionOverlayComplete = useCallback(() => {
    clearEarlyDiceRoll();
    setPlayerActionOverlayText(null);
    setPlayerOverlayTypingDone(false);
    // Auto-narration is fully owned by useChatAutoNarration. As soon as
    // playerActionOverlayText flips to null, the autoPlay flag passed to
    // ChatPanel becomes true and the hook narrates the latest unhandled DM
    // message — coordinating with streaming via narrator.isStreaming so we
    // don't double-read scenes that were already streamed live.
  }, [clearEarlyDiceRoll]);

  const markPlayerOverlayTypingDone = useCallback(() => {
    setPlayerOverlayTypingDone(true);
  }, []);

  // Dice reveal — waits for the player-action typewriter to finish typing
  // before showing dice (otherwise dice would paint over an in-progress
  // typewriter). The overlay's holdOpen (computed in the page) keeps the
  // animation alive until scene generation lifts all active overlays.
  useEffect(() => {
    if (diceTypewriterTimerRef.current) {
      clearTimeout(diceTypewriterTimerRef.current);
      diceTypewriterTimerRef.current = null;
    }

    const playerOverlayBlocking = !!playerActionOverlayText && !playerOverlayTypingDone;

    if (earlyDiceRoll && !playerOverlayBlocking) {
      diceTypewriterTimerRef.current = setTimeout(
        () => setDiceAfterTypewriter(true),
        DICE_AFTER_TYPEWRITER_DELAY_MS,
      );
      return () => {
        if (diceTypewriterTimerRef.current) {
          clearTimeout(diceTypewriterTimerRef.current);
          diceTypewriterTimerRef.current = null;
        }
      };
    }

    setDiceAfterTypewriter(false);
    return undefined;
  }, [earlyDiceRoll, playerActionOverlayText, playerOverlayTypingDone]);

  // External API for the action handler — show the typewriter immediately.
  // The narrator-stop effect in GameplayPage hushes any active TTS the moment
  // playerActionOverlayText flips truthy, so we don't need to queue here.
  const showPlayerActionOverlay = useCallback((action) => {
    if (!action) return;
    setPlayerOverlayTypingDone(false);
    setPlayerActionOverlayText(action);
  }, []);

  return {
    // Raw overlay state (for page-level composition with autoPlayer)
    typewriterAction,
    playerActionOverlayText,
    diceAfterTypewriter,
    // Completion handlers — the page picks one based on which overlay is active
    handleTypewriterComplete,
    handlePlayerActionOverlayComplete,
    // Navigation + external API
    navigateWithTypewriter,
    showPlayerActionOverlay,
    markPlayerOverlayTypingDone,
  };
}
