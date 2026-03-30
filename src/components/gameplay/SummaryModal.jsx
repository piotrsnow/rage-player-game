import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import { apiClient } from '../../services/apiClient';
import CustomSelect from '../ui/CustomSelect';

export default function SummaryModal({
  onClose,
  onGenerate,
  onCopy,
  onSpeak,
  summaryText,
  isLoading,
  error,
  progress = {},
  copied = false,
  summaryOptions = {},
  onSummaryOptionsChange,
  sceneIndex,
  totalScenes,
  narrationMessageId,
  narrationWordOffset = 0,
  narratorCurrentMessageId,
  narratorHighlightInfo,
  speakLoading = false,
  sentencesPerScene = 1,
  onSentencesPerSceneChange,
  recapScenes = [],
}) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const summaryScrollRef = useRef(null);
  const activeWordRef = useRef(null);
  const autoScrollUnlockTimeoutRef = useRef(null);
  const programmaticScrollTimeoutRef = useRef(null);
  const autoScrollLockedRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const lastAutoScrolledParagraphRef = useRef(-1);
  const lastProcessedWordIndexRef = useRef(-1);
  const hasSummary = Boolean(summaryText?.trim());
  const progressPhase = progress?.phase || 'idle';
  const progressCurrentBatch = Number(progress?.currentBatch) || 0;
  const progressTotalBatches = Number(progress?.totalBatches) || 0;
  const isBackgroundLoading = isLoading && hasSummary;
  const showBatchProgress = progressTotalBatches > 1 && progressCurrentBatch > 0;
  const phaseStatusText = (() => {
    if (!isLoading) return '';
    if (progressPhase === 'merging') {
      return t('gameplay.summaryMergingBatches', 'Merging generated batches...');
    }
    if (isBackgroundLoading) {
      return t('gameplay.summaryLoadingBackground', 'First part is ready. Loading next batches in the background...');
    }
    return t('gameplay.summaryGeneratingFirstBatch', 'Generating first batch...');
  })();
  const generateButtonLabel = (() => {
    if (!isLoading) return t('gameplay.summaryGenerate', 'Generate summary');
    if (progressPhase === 'merging') return t('gameplay.summaryMergingBatches', 'Merging generated batches...');
    if (isBackgroundLoading) return t('gameplay.summaryLoadingBackground', 'First part is ready. Loading next batches in the background...');
    return t('gameplay.summaryGeneratingFirstBatch', 'Generating first batch...');
  })();
  const summaryMode = summaryOptions?.mode || 'story';
  const literaryStyle = Number.isFinite(Number(summaryOptions?.literaryStyle)) ? Number(summaryOptions.literaryStyle) : 50;
  const dramaticity = Number.isFinite(Number(summaryOptions?.dramaticity)) ? Number(summaryOptions.dramaticity) : 50;
  const factuality = Number.isFinite(Number(summaryOptions?.factuality)) ? Number(summaryOptions.factuality) : 50;
  const dialogueParticipants = Number.isFinite(Number(summaryOptions?.dialogueParticipants)) ? Number(summaryOptions.dialogueParticipants) : 3;
  const isNarratingThisSummary = Boolean(
    narrationMessageId
      && narratorCurrentMessageId
      && narrationMessageId === narratorCurrentMessageId
  );
  const activeWordIndex = isNarratingThisSummary
    ? ((narratorHighlightInfo?.wordIndex ?? -1) + Math.max(0, Number(narrationWordOffset) || 0))
    : -1;
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(0);
  const sliderClassName = 'flex-1 min-w-0 h-6 appearance-none mana-slider bg-transparent cursor-ew-resize touch-none';
  const rangeValue = (e) => Number(e?.target?.value ?? 0);

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

  const splitIntoSentences = (text) => {
    return (text || '')
      .trim()
      .split(/(?<=[.!?…])\s+/)
      .filter(Boolean);
  };

  const splitSummaryIntoParagraphs = (text) => {
    const normalized = (text || '').trim();
    if (!normalized) return [];

    // Prefer AI-provided paragraph breaks if present.
    const provided = normalized
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (provided.length > 1) return provided;

    // Fallback: build 3-6 sentence paragraphs (target 4).
    const sentences = splitIntoSentences(normalized);
    if (sentences.length <= 6) return [normalized];

    const paragraphs = [];
    let index = 0;
    while (index < sentences.length) {
      const remaining = sentences.length - index;
      if (remaining <= 6) {
        paragraphs.push(sentences.slice(index).join(' '));
        break;
      }

      let take = 4;
      // Avoid leaving a final paragraph with fewer than 3 sentences.
      if (remaining - take < 3) {
        take = 3;
      }
      paragraphs.push(sentences.slice(index, index + take).join(' '));
      index += take;
    }

    return paragraphs;
  };

  const pickDistributedImages = (images, count) => {
    if (!Array.isArray(images) || images.length === 0 || count <= 0) return [];
    const picked = [];
    const used = new Set();
    const step = images.length / (count + 1);
    for (let i = 0; i < count; i += 1) {
      let idx = Math.max(0, Math.min(images.length - 1, Math.round((i + 1) * step) - 1));
      while (used.has(idx) && idx < images.length - 1) idx += 1;
      while (used.has(idx) && idx > 0) idx -= 1;
      if (!used.has(idx)) {
        used.add(idx);
        picked.push(images[idx]);
      }
    }
    return picked;
  };

  const getRecapImages = () => {
    return (Array.isArray(recapScenes) ? recapScenes : [])
      .map((scene, idx) => {
        if (!scene?.image) return null;
        return {
          id: scene.id || `scene_${idx + 1}`,
          sceneNumber: idx + 1,
          src: apiClient.resolveMediaUrl(scene.image),
          prompt: scene.imagePrompt || '',
        };
      })
      .filter((image) => Boolean(image?.src));
  };

  const injectImagesIntoTextBlocks = (textBlocks, imageEvery = 2) => {
    const recapImages = getRecapImages();
    if (!Array.isArray(textBlocks) || textBlocks.length === 0) return [];
    if (recapImages.length === 0) {
      return textBlocks.map((text) => ({ type: 'text', text }));
    }

    const imageSlots = Math.min(
      recapImages.length,
      Math.max(1, Math.floor(textBlocks.length / Math.max(1, imageEvery)))
    );
    const selectedImages = pickDistributedImages(recapImages, imageSlots);
    const result = [];
    let imageIndex = 0;

    textBlocks.forEach((text, index) => {
      result.push({ type: 'text', text });
      const shouldInsertImage = (
        selectedImages.length > imageIndex
        && (index + 1) % Math.max(1, imageEvery) === 0
        && index < textBlocks.length - 1
      );
      if (shouldInsertImage) {
        result.push({ type: 'image', image: selectedImages[imageIndex] });
        imageIndex += 1;
      }
    });

    return result;
  };

  const buildNarrativeBlocks = (text) => {
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) return [];

    const storyImages = getRecapImages();

    const sentenceInterval = 7; // Keeps images every 5-10 sentences.
    const imageSlots = Math.min(storyImages.length, Math.floor(sentences.length / sentenceInterval));
    const selectedImages = pickDistributedImages(storyImages, imageSlots);

    if (selectedImages.length === 0) {
      return splitSummaryIntoParagraphs(text).map((paragraph) => ({
        type: 'text',
        text: paragraph,
      }));
    }

    const blocks = [];
    let sentenceIndex = 0;
    let imageIndex = 0;

    while (sentenceIndex < sentences.length) {
      const remaining = sentences.length - sentenceIndex;
      const take = Math.min(sentenceInterval, remaining);
      const paragraphText = sentences.slice(sentenceIndex, sentenceIndex + take).join(' ');
      blocks.push({ type: 'text', text: paragraphText });
      sentenceIndex += take;

      if (imageIndex < selectedImages.length && sentenceIndex < sentences.length) {
        blocks.push({ type: 'image', image: selectedImages[imageIndex] });
        imageIndex += 1;
      }
    }

    return blocks;
  };

  const renderParagraphTokens = (paragraphText, wordCounterRef) => {
    const tokens = paragraphText.split(/(\s+)/);

    return tokens.map((token, index) => {
      if (/^\s+$/.test(token)) {
        return token;
      }

      const isActive = wordCounterRef.current === activeWordIndex;
      wordCounterRef.current += 1;

      return (
        <span
          key={`word_${index}_${token}`}
          className={isActive ? 'bg-primary/20 text-primary rounded-sm' : ''}
          style={isActive ? { boxShadow: '-1px 0 0 0 rgba(197,154,255,0.15), 1px 0 0 0 rgba(197,154,255,0.15)' } : undefined}
          ref={isActive ? (node) => { activeWordRef.current = node; } : null}
        >
          {token}
        </span>
      );
    });
  };

  const buildStructuredBlocks = (text) => {
    const normalized = (text || '').trim();
    if (!normalized) return [];

    const chunks = normalized
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    if (chunks.length > 0) {
      return injectImagesIntoTextBlocks(chunks, 2);
    }

    return injectImagesIntoTextBlocks([normalized], 2);
  };

  const buildPoemBlocks = (text) => {
    const formatted = formatPoemForDisplay((text || '').trim());
    if (!formatted) return [];

    const lines = formatted.split('\n');
    const nonEmptyLineCount = lines.filter((line) => line.trim().length > 0).length;
    const poemImages = getRecapImages();
    const imageSlots = Math.min(poemImages.length, Math.floor(nonEmptyLineCount / 12));
    const selectedImages = pickDistributedImages(poemImages, imageSlots);

    const blocks = [];
    let imageIndex = 0;
    let linesInChunk = 0;
    let chunkLines = [];

    const flushChunk = () => {
      if (chunkLines.length === 0) return;
      blocks.push({ type: 'text', text: chunkLines.join('\n') });
      chunkLines = [];
    };

    lines.forEach((line) => {
      chunkLines.push(line);
      if (line.trim()) {
        linesInChunk += 1;
      }
      if (linesInChunk >= 12) {
        flushChunk();
        linesInChunk = 0;
        if (imageIndex < selectedImages.length) {
          blocks.push({ type: 'image', image: selectedImages[imageIndex], variant: 'poem-pencil' });
          imageIndex += 1;
        }
      }
    });

    flushChunk();
    return blocks;
  };

  const formatPoemForDisplay = (text) => {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');
  };

  const buildSummaryBlocks = () => {
    if (summaryMode === 'poem') return buildPoemBlocks(summaryText);
    if (summaryMode === 'dialogue' || summaryMode === 'report') return buildStructuredBlocks(summaryText);
    return buildNarrativeBlocks(summaryText);
  };

  const summaryBlocks = useMemo(
    () => buildSummaryBlocks(),
    [summaryText, summaryMode, recapScenes]
  );

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

    // Ignore jitter/backtracking from word-level timestamp drift.
    if (activeWordIndex <= lastProcessedWordIndexRef.current) return;
    lastProcessedWordIndexRef.current = activeWordIndex;

    if (lastAutoScrolledParagraphRef.current >= activeParagraphIndex) return;
    const container = summaryScrollRef.current;
    if (!container) return;
    const entry = paragraphEntries[activeParagraphIndex];
    const paragraphStartWord = entry.wordOffset;
    const wordsFromParagraphStart = activeWordIndex - paragraphStartWord;
    // Scroll only at paragraph start to avoid repeated jumps.
    if (wordsFromParagraphStart < 0 || wordsFromParagraphStart > 2) return;
    const target = container.querySelector(`[data-summary-block-index="${entry.blockIndex}"]`);
    if (!target) return;

    // Scroll only once when a new paragraph begins.
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

  const handleReadRelativeParagraph = (step) => {
    if (!hasSummary || typeof onSpeak !== 'function' || paragraphEntries.length === 0 || speakLoading || isLoading) return;
    const nextIndex = Math.max(0, Math.min(activeParagraphIndex + step, paragraphEntries.length - 1));
    const entry = paragraphEntries[nextIndex];
    if (!entry?.text) return;
    setActiveParagraphIndex(nextIndex);
    scrollToParagraphIndex(nextIndex);
    onSpeak(entry.text, entry.wordOffset);
  };

  const renderSummaryWithHighlight = () => {
    const wordCounterRef = { current: 0 };

    const renderBlock = (block, blockKey) => {
      if (block.type === 'image') {
        const isPoemImage = block.variant === 'poem-pencil' || summaryMode === 'poem';
        return (
          <figure
            key={`summary_image_${block.image.id}_${blockKey}`}
            className={isPoemImage
              ? 'my-4 mx-auto w-full max-w-xl overflow-hidden rounded-sm border border-outline-variant/25 bg-surface-container-low/45 shadow-[0_8px_28px_rgba(0,0,0,0.35)]'
              : 'my-2 overflow-hidden rounded-sm border border-outline-variant/20 bg-surface-container-low/40'}
          >
            <img
              src={block.image.src}
              alt={t('gameplay.summaryImageAlt', 'Illustration from scene {{scene}}', { scene: block.image.sceneNumber })}
              className={isPoemImage ? 'w-full max-h-96 object-cover' : 'w-full max-h-72 object-cover'}
              style={isPoemImage
                ? { filter: 'grayscale(1) contrast(1.35) brightness(1.08) saturate(0)' }
                : undefined}
              loading="lazy"
            />
            <figcaption className={isPoemImage
              ? 'px-3 py-2 text-[10px] text-center uppercase tracking-widest text-on-surface-variant/90'
              : 'px-3 py-2 text-[10px] uppercase tracking-widest text-on-surface-variant'}
            >
              {t('common.scene')} {block.image.sceneNumber}
            </figcaption>
          </figure>
        );
      }

      const displayText = summaryMode === 'poem'
        ? formatPoemForDisplay(block.text)
        : block.text;

      return (
        <p
          key={`summary_paragraph_${blockKey}`}
          data-summary-block-index={typeof blockKey === 'number' ? blockKey : undefined}
          className={summaryMode === 'poem'
            ? 'text-base text-on-surface leading-8 whitespace-pre-line text-center'
            : 'text-sm text-on-surface leading-7 whitespace-pre-line'}
          style={summaryMode === 'poem'
            ? {
              fontFamily: '"Bradley Hand","Segoe Print","Lucida Handwriting","Caveat",cursive',
              letterSpacing: '0.01em',
              textShadow: '0.25px 0.25px 0 rgba(226,229,235,0.28), 0 0 0.6px rgba(8,10,14,0.45)',
            }
            : {
              fontFamily: '"Bradley Hand","Segoe Print","Lucida Handwriting","Caveat",cursive',
              letterSpacing: '0.005em',
              textShadow: '0.2px 0.2px 0 rgba(226,229,235,0.2), 0 0 0.45px rgba(8,10,14,0.35)',
            }}
        >
          {renderParagraphTokens(displayText, wordCounterRef)}
        </p>
      );
    };

    return (
      <div className="space-y-4">
        {summaryBlocks.map((block, blockIndex) => renderBlock(block, blockIndex))}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('gameplay.summaryTitle', 'Story summary')}
    >
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">short_text</span>
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest">
              {t('gameplay.summaryTitle', 'Story summary')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors"
          >
            close
          </button>
        </div>

        <div className="px-5 pt-4 pb-2">
          <p className="text-xs text-on-surface-variant">
            {t('gameplay.summaryScope', 'From the beginning to scene {{current}}/{{total}}.', {
              current: Math.max(1, sceneIndex + 1),
              total: Math.max(1, totalScenes),
            })}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
              {t('gameplay.summarySentencesPerScene', 'Sentences per scene')}
            </label>
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.25}
              value={sentencesPerScene}
              onChange={(e) => onSentencesPerSceneChange?.(rangeValue(e))}
              onInput={(e) => onSentencesPerSceneChange?.(rangeValue(e))}
              className={sliderClassName}
            />
            <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider min-w-[44px] text-right">
              {Number(sentencesPerScene).toFixed(2)}x
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
              {t('gameplay.summaryMode', 'Type')}
            </label>
            <CustomSelect
              value={summaryMode}
              onChange={(nextMode) => onSummaryOptionsChange?.((prev) => ({ ...prev, mode: nextMode }))}
              options={[
                { value: 'story', label: t('gameplay.summaryModeStory', 'Story') },
                { value: 'dialogue', label: t('gameplay.summaryModeDialogue', 'Dialogue') },
                { value: 'poem', label: t('gameplay.summaryModePoem', 'Poem') },
                { value: 'report', label: t('gameplay.summaryModeReport', 'Report') },
              ]}
              className="flex-1"
              buttonClassName="text-xs py-1.5"
              menuClassName="text-xs"
            />
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
                {t('gameplay.summaryLiteraryStyle', 'Literary style')}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={literaryStyle}
                onChange={(e) => onSummaryOptionsChange?.((prev) => ({ ...prev, literaryStyle: rangeValue(e) }))}
                onInput={(e) => onSummaryOptionsChange?.((prev) => ({ ...prev, literaryStyle: rangeValue(e) }))}
                className={sliderClassName}
              />
              <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider min-w-[32px] text-right">
                {Math.round(literaryStyle)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
                {t('gameplay.summaryDramaticity', 'Dramaticity')}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={dramaticity}
                onChange={(e) => onSummaryOptionsChange?.((prev) => ({ ...prev, dramaticity: rangeValue(e) }))}
                onInput={(e) => onSummaryOptionsChange?.((prev) => ({ ...prev, dramaticity: rangeValue(e) }))}
                className={sliderClassName}
              />
              <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider min-w-[32px] text-right">
                {Math.round(dramaticity)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
                {t('gameplay.summaryFactuality', 'Factuality')}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={factuality}
                onChange={(e) => onSummaryOptionsChange?.((prev) => ({ ...prev, factuality: rangeValue(e) }))}
                onInput={(e) => onSummaryOptionsChange?.((prev) => ({ ...prev, factuality: rangeValue(e) }))}
                className={sliderClassName}
              />
              <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider min-w-[32px] text-right">
                {Math.round(factuality)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
                {t('gameplay.summaryDialogueParticipants', 'Dialogue participants')}
              </label>
              <input
                type="range"
                min={2}
                max={6}
                step={1}
                value={dialogueParticipants}
                onChange={(e) => onSummaryOptionsChange?.((prev) => ({ ...prev, dialogueParticipants: rangeValue(e) }))}
                onInput={(e) => onSummaryOptionsChange?.((prev) => ({ ...prev, dialogueParticipants: rangeValue(e) }))}
                className={sliderClassName}
              />
              <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider min-w-[32px] text-right">
                {Math.round(dialogueParticipants)}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-4">
          <div
            ref={summaryScrollRef}
            className="min-h-[220px] max-h-[58vh] overflow-y-auto custom-scrollbar bg-surface-container-low/60 border border-outline-variant/15 rounded-sm p-4"
            onWheel={() => lockAutoScroll(700)}
            onTouchMove={() => lockAutoScroll(700)}
            onPointerDown={() => lockAutoScroll(1200)}
            onPointerUp={() => lockAutoScroll(250)}
            onScroll={() => {
              if (isProgrammaticScrollRef.current) return;
              lockAutoScroll(900);
            }}
          >
            {isLoading && !error && (
              <div className="mb-3 rounded-sm border border-primary/20 bg-primary/10 px-3 py-2">
                <p className="text-xs text-primary font-label uppercase tracking-wider animate-pulse">
                  {phaseStatusText}
                </p>
                {showBatchProgress && (
                  <p className="text-[10px] text-primary/80 mt-1">
                    {t('gameplay.summaryBatchProgress', {
                      defaultValue: 'Batch {{current}}/{{total}}',
                      current: Math.min(progressCurrentBatch, progressTotalBatches),
                      total: progressTotalBatches,
                    })}
                  </p>
                )}
              </div>
            )}
            {error && (
              <p className="text-sm text-error">
                {error}
              </p>
            )}
            {!error && hasSummary && (
              <div className="space-y-4">
                {renderSummaryWithHighlight()}
              </div>
            )}
            {!error && !hasSummary && !isLoading && (
              <p className="text-sm text-on-surface-variant">
                {t('gameplay.summaryEmpty', 'Click generate to create a summary for this part of the story.')}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          <button
            onClick={onGenerate}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary/15 border border-primary/30 rounded-sm text-[10px] font-label uppercase tracking-widest text-primary hover:bg-primary/25 transition-all disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-sm ${isLoading ? 'animate-spin' : ''}`}>
              {isLoading ? 'progress_activity' : 'auto_awesome'}
            </span>
            {generateButtonLabel}
          </button>

          <button
            onClick={onCopy}
            disabled={!hasSummary || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-surface-container-high/50 border border-outline-variant/20 rounded-sm text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-sm">
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied
              ? t('gameplay.summaryCopied', 'Copied')
              : t('gameplay.summaryCopy', 'Copy')}
          </button>

          <button
            onClick={() => onSpeak?.()}
            disabled={!hasSummary || isLoading || speakLoading}
            className="flex items-center gap-2 px-4 py-2 bg-surface-container-high/50 border border-outline-variant/20 rounded-sm text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all disabled:opacity-40"
          >
            <span className={`material-symbols-outlined text-sm ${speakLoading ? 'animate-spin' : ''}`}>
              {speakLoading ? 'progress_activity' : 'volume_up'}
            </span>
            {speakLoading
              ? t('gameplay.summaryReadAloudLoading', 'Starting narrator...')
              : t('gameplay.summaryReadAloud', 'Read aloud')}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleReadRelativeParagraph(-1)}
              disabled={!hasSummary || isLoading || speakLoading || paragraphEntries.length === 0 || activeParagraphIndex <= 0}
              className="flex items-center gap-1 px-3 py-2 bg-surface-container-high/50 border border-outline-variant/20 rounded-sm text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
              {t('common.prev', 'Previous')}
            </button>
            <button
              onClick={() => handleReadRelativeParagraph(1)}
              disabled={!hasSummary || isLoading || speakLoading || paragraphEntries.length === 0 || activeParagraphIndex >= paragraphEntries.length - 1}
              className="flex items-center gap-1 px-3 py-2 bg-surface-container-high/50 border border-outline-variant/20 rounded-sm text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all disabled:opacity-40"
            >
              {t('common.next', 'Next')}
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
