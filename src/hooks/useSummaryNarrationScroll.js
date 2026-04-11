import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPoemForDisplay } from '../services/summaryBlockBuilder';

export function useSummaryNarrationScroll({
  summaryBlocks,
  summaryMode,
  narrationMessageId,
  narratorCurrentMessageId,
  narrationWordOffset = 0,
  narratorHighlightInfo,
}) {
  const summaryScrollRef = useRef(null);
  const activeWordRef = useRef(null);
  const autoScrollUnlockTimeoutRef = useRef(null);
  const programmaticScrollTimeoutRef = useRef(null);
  const autoScrollLockedRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const lastAutoScrolledParagraphRef = useRef(-1);
  const lastProcessedWordIndexRef = useRef(-1);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(0);

  const isNarratingThisSummary = Boolean(
    narrationMessageId
      && narratorCurrentMessageId
      && narrationMessageId === narratorCurrentMessageId
  );
  const activeWordIndex = isNarratingThisSummary
    ? ((narratorHighlightInfo?.wordIndex ?? -1) + Math.max(0, Number(narrationWordOffset) || 0))
    : -1;

  const lockAutoScroll = (unlockDelay = 700) => {
    autoScrollLockedRef.current = true;
    if (autoScrollUnlockTimeoutRef.current) {
      window.clearTimeout(autoScrollUnlockTimeoutRef.current);
    }
    autoScrollUnlockTimeoutRef.current = window.setTimeout(() => {
      autoScrollLockedRef.current = false;
      autoScrollUnlockTimeoutRef.current = null;
    }, unlockDelay);
  };

  const markProgrammaticScroll = (resetDelay = 900) => {
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimeoutRef.current) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
    }
    programmaticScrollTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      programmaticScrollTimeoutRef.current = null;
    }, resetDelay);
  };

  useEffect(() => () => {
    if (autoScrollUnlockTimeoutRef.current) {
      window.clearTimeout(autoScrollUnlockTimeoutRef.current);
      autoScrollUnlockTimeoutRef.current = null;
    }
    if (programmaticScrollTimeoutRef.current) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
      programmaticScrollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    lastAutoScrolledParagraphRef.current = -1;
    lastProcessedWordIndexRef.current = -1;
  }, [narrationMessageId]);

  const paragraphEntries = useMemo(() => {
    const entries = [];
    let wordOffset = 0;
    summaryBlocks.forEach((block, blockIndex) => {
      if (block.type !== 'text') return;
      const displayText = summaryMode === 'poem'
        ? formatPoemForDisplay(block.text)
        : block.text;
      const wordCount = (displayText.match(/\S+/g) || []).length;
      entries.push({
        blockIndex,
        text: displayText,
        wordOffset,
        wordCount,
      });
      wordOffset += wordCount;
    });
    return entries;
  }, [summaryBlocks, summaryMode]);

  useEffect(() => {
    if (paragraphEntries.length === 0) {
      setActiveParagraphIndex(0);
      return;
    }
    setActiveParagraphIndex((prev) => Math.max(0, Math.min(prev, paragraphEntries.length - 1)));
  }, [paragraphEntries]);

  useEffect(() => {
    if (activeWordIndex < 0 || paragraphEntries.length === 0) return;
    const foundIndex = paragraphEntries.findIndex((entry) => (
      activeWordIndex >= entry.wordOffset
      && activeWordIndex < entry.wordOffset + Math.max(1, entry.wordCount)
    ));
    if (foundIndex >= 0 && foundIndex !== activeParagraphIndex) {
      setActiveParagraphIndex(foundIndex);
    }
  }, [activeWordIndex, paragraphEntries, activeParagraphIndex]);

  useEffect(() => {
    if (!isNarratingThisSummary || activeWordIndex < 0 || autoScrollLockedRef.current) return;
    if (paragraphEntries.length === 0) return;
    if (activeParagraphIndex < 0 || activeParagraphIndex >= paragraphEntries.length) return;

    if (activeWordIndex <= lastProcessedWordIndexRef.current) return;
    lastProcessedWordIndexRef.current = activeWordIndex;

    if (lastAutoScrolledParagraphRef.current >= activeParagraphIndex) return;
    const container = summaryScrollRef.current;
    if (!container) return;
    const entry = paragraphEntries[activeParagraphIndex];
    const paragraphStartWord = entry.wordOffset;
    const wordsFromParagraphStart = activeWordIndex - paragraphStartWord;
    if (wordsFromParagraphStart < 0 || wordsFromParagraphStart > 2) return;
    const target = container.querySelector(`[data-summary-block-index="${entry.blockIndex}"]`);
    if (!target) return;

    lastAutoScrolledParagraphRef.current = activeParagraphIndex;
    markProgrammaticScroll(900);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isNarratingThisSummary, activeWordIndex, activeParagraphIndex, paragraphEntries]);

  const scrollToParagraphIndex = (paragraphIndex) => {
    const entry = paragraphEntries[paragraphIndex];
    if (!entry) return;
    const container = summaryScrollRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-summary-block-index="${entry.blockIndex}"]`);
    if (!target) return;
    markProgrammaticScroll(900);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const scrollContainerProps = {
    onWheel: () => lockAutoScroll(700),
    onTouchMove: () => lockAutoScroll(700),
    onPointerDown: () => lockAutoScroll(1200),
    onPointerUp: () => lockAutoScroll(250),
    onScroll: () => {
      if (isProgrammaticScrollRef.current) return;
      lockAutoScroll(900);
    },
  };

  return {
    summaryScrollRef,
    activeWordRef,
    activeWordIndex,
    activeParagraphIndex,
    setActiveParagraphIndex,
    paragraphEntries,
    scrollToParagraphIndex,
    scrollContainerProps,
  };
}
