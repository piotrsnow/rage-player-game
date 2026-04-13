import { useCallback, useEffect, useRef } from 'react';

/**
 * Chat viewport scroll orchestration.
 *
 * Handles four independent-but-related concerns that used to live inline in
 * ChatPanel:
 *
 *  1) Track whether the user is "near the bottom" so auto-scroll only kicks in
 *     when they haven't scrolled away manually.
 *  2) When new messages append and the user is stuck to bottom, scroll down.
 *  3) During streaming narrative, keep scrolling to bottom as text grows.
 *  4) When an explicit `scrollToMessageId` is requested, hunt the DOM node
 *     across a few animation frames (it may not be rendered yet), scroll to
 *     it, then notify the caller so it can clear the request.
 *
 * Returns refs the component binds to its scroll container and bottom anchor.
 */
export function useChatScrollSync({
  messageCount,
  streamingNarrative,
  scrollToMessageId,
  onScrollTargetHandled,
}) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const prevMessageCountRef = useRef(messageCount);
  const shouldStickToBottomRef = useRef(true);
  const explicitScrollInProgressRef = useRef(false);

  const isNearBottom = useCallback((el, threshold = 48) => {
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= threshold;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    shouldStickToBottomRef.current = isNearBottom(el);
    const onScroll = () => {
      shouldStickToBottomRef.current = isNearBottom(el);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isNearBottom]);

  useEffect(() => {
    const hasNewMessages = messageCount > prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;
    if (!hasNewMessages || explicitScrollInProgressRef.current || scrollToMessageId) return;
    if (!shouldStickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messageCount, scrollToMessageId]);

  useEffect(() => {
    if (!streamingNarrative || !shouldStickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [streamingNarrative]);

  useEffect(() => {
    if (!scrollToMessageId || !containerRef.current) return;
    explicitScrollInProgressRef.current = true;
    let frame = null;
    let tries = 0;
    const maxTries = 4;

    const tryScroll = () => {
      const targetEl = containerRef.current?.querySelector(`[data-message-id="${scrollToMessageId}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        shouldStickToBottomRef.current = false;
        explicitScrollInProgressRef.current = false;
        onScrollTargetHandled?.(scrollToMessageId);
        return;
      }
      tries += 1;
      if (tries >= maxTries) {
        explicitScrollInProgressRef.current = false;
        onScrollTargetHandled?.(scrollToMessageId);
        return;
      }
      frame = requestAnimationFrame(tryScroll);
    };

    frame = requestAnimationFrame(tryScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      explicitScrollInProgressRef.current = false;
    };
  }, [scrollToMessageId, onScrollTargetHandled]);

  return { bottomRef, containerRef };
}
