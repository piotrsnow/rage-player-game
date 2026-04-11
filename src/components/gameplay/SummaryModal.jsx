import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useSummaryNarrationScroll } from '../../hooks/useSummaryNarrationScroll';
import { buildSummaryBlocks } from '../../services/summaryBlockBuilder';
import SummaryContent from './summary/SummaryContent';
import SummaryOptionsPanel from './summary/SummaryOptionsPanel';

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

  const summaryBlocks = useMemo(
    () => buildSummaryBlocks({ summaryText, summaryMode, recapScenes }),
    [summaryText, summaryMode, recapScenes]
  );

  const {
    summaryScrollRef,
    activeWordRef,
    activeWordIndex,
    activeParagraphIndex,
    setActiveParagraphIndex,
    paragraphEntries,
    scrollToParagraphIndex,
    scrollContainerProps,
  } = useSummaryNarrationScroll({
    summaryBlocks,
    summaryMode,
    narrationMessageId,
    narratorCurrentMessageId,
    narrationWordOffset,
    narratorHighlightInfo,
  });

  const handleReadRelativeParagraph = (step) => {
    if (!hasSummary || typeof onSpeak !== 'function' || paragraphEntries.length === 0 || speakLoading || isLoading) return;
    const nextIndex = Math.max(0, Math.min(activeParagraphIndex + step, paragraphEntries.length - 1));
    const entry = paragraphEntries[nextIndex];
    if (!entry?.text) return;
    setActiveParagraphIndex(nextIndex);
    scrollToParagraphIndex(nextIndex);
    onSpeak(entry.text, entry.wordOffset);
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
          <SummaryOptionsPanel
            summaryOptions={summaryOptions}
            onSummaryOptionsChange={onSummaryOptionsChange}
            sentencesPerScene={sentencesPerScene}
            onSentencesPerSceneChange={onSentencesPerSceneChange}
          />
        </div>

        <div className="px-5 pb-4">
          <div
            ref={summaryScrollRef}
            className="min-h-[220px] max-h-[58vh] overflow-y-auto custom-scrollbar bg-surface-container-low/60 border border-outline-variant/15 rounded-sm p-4"
            {...scrollContainerProps}
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
              <SummaryContent
                summaryBlocks={summaryBlocks}
                summaryMode={summaryMode}
                activeWordIndex={activeWordIndex}
                activeWordRef={activeWordRef}
              />
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
