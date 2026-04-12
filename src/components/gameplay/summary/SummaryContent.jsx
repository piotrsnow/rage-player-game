import { useTranslation } from 'react-i18next';
import { formatPoemForDisplay } from '../../../services/summaryBlockBuilder';

function ParagraphTokens({ text, wordCounterRef, activeWordIndex, activeWordRef }) {
  const tokens = text.split(/(\s+)/);
  return tokens.map((token, index) => {
    if (/^\s+$/.test(token)) return token;

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
}

export default function SummaryContent({
  summaryBlocks,
  summaryMode,
  activeWordIndex,
  activeWordRef,
}) {
  const { t } = useTranslation();
  const wordCounterRef = { current: 0 };

  const renderBlock = (block, blockIndex) => {
    if (block.type === 'image') {
      const isPoemImage = block.variant === 'poem-pencil' || summaryMode === 'poem';
      return (
        <figure
          key={`summary_image_${block.image.id}_${blockIndex}`}
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
        key={`summary_paragraph_${blockIndex}`}
        data-summary-block-index={blockIndex}
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
        <ParagraphTokens
          text={displayText}
          wordCounterRef={wordCounterRef}
          activeWordIndex={activeWordIndex}
          activeWordRef={activeWordRef}
        />
      </p>
    );
  };

  return (
    <div className="space-y-4">
      {summaryBlocks.map((block, blockIndex) => renderBlock(block, blockIndex))}
    </div>
  );
}
