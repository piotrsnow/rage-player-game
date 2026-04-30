import { useEffect, useRef } from 'react';

/**
 * Drives the narrator with segments streamed from an in-flight scene
 * generation. Starts a streaming playback when the first segment arrives,
 * pushes new segments as they come, and finalizes when `streamingNarrative`
 * flips back to null (scene complete).
 *
 * Extracted from GameplayPage so that the streaming lifecycle can be reasoned
 * about in isolation.
 */
export function useStreamingNarrator({
  narrator,
  streamingSegments,
  streamingNarrative,
  enabled,
  autoPlay,
  readOnly,
}) {
  const activeRef = useRef(false);
  const msgIdRef = useRef(null);

  useEffect(() => {
    if (!streamingSegments || streamingSegments.length === 0) return;
    if (activeRef.current) return;
    if (!enabled || !autoPlay || !narrator.isNarratorReady) return;
    if (readOnly) return;

    const messageId = `streaming_${Date.now()}`;
    msgIdRef.current = messageId;
    activeRef.current = true;
    narrator.startStreaming(messageId);
  }, [streamingSegments, enabled, autoPlay, narrator.isNarratorReady, readOnly, narrator]);

  useEffect(() => {
    if (!activeRef.current) return;
    if (!streamingSegments || streamingSegments.length === 0) return;
    narrator.pushStreamingSegments(streamingSegments);
  }, [streamingSegments, narrator]);

  useEffect(() => {
    if (streamingNarrative !== null) return;
    if (!activeRef.current) return;
    activeRef.current = false;
    // Flush the tail from the raw streamed buffer inside useNarrator — the
    // post-processed DM segments in chatHistory would be positionally
    // misaligned (processSceneDialogue can insert player dialogue or remove
    // echo narration), causing either early cutoff or replayed tail.
    narrator.finishStreaming();
    msgIdRef.current = null;
  }, [streamingNarrative, narrator]);

  return { streamingNarrationActiveRef: activeRef };
}
