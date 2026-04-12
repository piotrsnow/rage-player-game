import { useTranslation } from 'react-i18next';
import { splitTextForHighlight } from '../../../services/elevenlabs';
import { filterDuplicateDialogueSegments, getDialogueSpeakerLabel } from '../../../services/dialogueSegments';
import Tooltip from '../../ui/Tooltip';

export function HighlightedText({ text, highlightInfo, segmentIndex, messageId, className }) {
  const hi = highlightInfo;
  const highlightedSegmentIndex = hi?.logicalSegmentIndex ?? hi?.segmentIndex;
  const activeWordIndex = Number.isInteger(hi?.segmentWordIndex) ? hi.segmentWordIndex : hi?.wordIndex;
  const isActive = hi && hi.messageId === messageId && highlightedSegmentIndex === segmentIndex && activeWordIndex >= 0;

  if (!isActive) {
    return <span className={className}>{text}</span>;
  }

  const words = splitTextForHighlight(text);
  let wordIdx = -1;

  return (
    <span className={className}>
      {words.map((part, i) => {
        if (/^\s+$/.test(part)) {
          return <span key={i}>{part}</span>;
        }
        wordIdx++;
        const isCurrent = wordIdx === activeWordIndex;
        return (
          <span
            key={i}
            className={`rounded-sm transition-colors duration-100 ${isCurrent ? 'text-primary bg-primary/15' : ''}`}
            style={isCurrent ? { boxShadow: '-2px 0 0 0 rgba(197,154,255,0.15), 2px 0 0 0 rgba(197,154,255,0.15)' } : undefined}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}


export function DialogueSegments({ segments, narrator, messageId }) {
  const { t } = useTranslation();
  if (!segments || segments.length === 0) return null;

  const isSegmentActive = (index) => {
    return narrator?.currentMessageId === messageId && narrator?.currentSegmentIndex === index;
  };


  return (
    <div className="space-y-2">
      {segments.map((seg, i) => {
        const active = isSegmentActive(i);
        if (seg.type === 'dialogue') {
          return (
            <div key={i} className={`pl-3 border-l-2 border-tertiary-dim/40 transition-colors ${active ? 'border-tertiary bg-surface-tint/5' : ''}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">
                  {getDialogueSpeakerLabel(seg, t('common.npc'))}
                </span>
                {active && (
                  <span className="material-symbols-outlined text-tertiary text-xs animate-pulse">
                    graphic_eq
                  </span>
                )}
              </div>
              <p className="text-xs text-on-surface leading-snug">
                &ldquo;<HighlightedText text={seg.text} highlightInfo={narrator?.highlightInfo} segmentIndex={i} messageId={messageId} />&rdquo;
              </p>
            </div>
          );
        }
        return (
          <div key={i} className={`transition-colors ${active ? 'bg-surface-tint/5 rounded-sm' : ''}`}>
            <p className="text-xs text-on-surface-variant leading-snug italic">
              <HighlightedText text={seg.text} highlightInfo={narrator?.highlightInfo} segmentIndex={i} messageId={messageId} />
              {active && (
                <span className="material-symbols-outlined text-primary text-xs ml-1 align-middle animate-pulse">
                  graphic_eq
                </span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function NarratorHeaderButtons({ message, narrator, activeAccentClass, idleHoverClass }) {
  const { t } = useTranslation();
  const {
    playbackState,
    currentMessageId,
    isNarratorReady,
    speakSingle,
    pause,
    resume,
    startNarrationFastForwardHold,
    stopNarrationFastForwardHold,
    narrationFastForwardRate,
    STATES,
  } = narrator || {};

  const isThisPlaying = currentMessageId === message.id && playbackState === STATES?.PLAYING;
  const isThisPaused = currentMessageId === message.id && playbackState === STATES?.PAUSED;
  const isThisLoading = currentMessageId === message.id && playbackState === STATES?.LOADING;
  const isActiveNarration = currentMessageId === message.id;
  const showFastForward = isActiveNarration && (
    playbackState === STATES?.PLAYING || playbackState === STATES?.PAUSED || playbackState === STATES?.LOADING
  );

  const handleNarratorToggle = () => {
    if (isThisPlaying) {
      pause();
    } else if (isThisPaused) {
      resume();
    } else {
      speakSingle(message, message.id);
    }
  };

  if (!isNarratorReady) return null;

  const ffRate = Number(narrationFastForwardRate) > 1 ? Number(narrationFastForwardRate) : 1;
  const ffActive = ffRate > 1.001;
  const ffRateLabel = ffRate.toFixed(2).replace(/\.?0+$/, '');

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        onClick={handleNarratorToggle}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
          isThisPlaying ? activeAccentClass : `text-on-surface-variant ${idleHoverClass}`
        }`}
        title={
          isThisLoading
            ? t('chat.narratorLoading')
            : isThisPlaying
              ? t('chat.narratorPause')
              : isThisPaused
                ? t('chat.narratorResume')
                : t('chat.narratorPlay')
        }
      >
        <span className={`material-symbols-outlined text-sm ${isThisPlaying ? 'animate-pulse' : ''}`}>
          {isThisLoading ? 'hourglass_top' : isThisPlaying ? 'pause' : isThisPaused ? 'play_arrow' : 'volume_up'}
        </span>
      </button>
      {showFastForward && (
        <Tooltip content={t('chat.narratorFastForwardTip', { rate: ffRateLabel })}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation();
              startNarrationFastForwardHold?.();
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              stopNarrationFastForwardHold?.();
            }}
            onMouseLeave={() => {
              stopNarrationFastForwardHold?.();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              startNarrationFastForwardHold?.();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              stopNarrationFastForwardHold?.();
            }}
            onTouchCancel={() => {
              stopNarrationFastForwardHold?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                startNarrationFastForwardHold?.();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                stopNarrationFastForwardHold?.();
              }
            }}
            onBlur={() => {
              stopNarrationFastForwardHold?.();
            }}
            className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
              ffActive ? activeAccentClass : `text-on-surface-variant ${idleHoverClass}`
            }`}
          >
            <span className="material-symbols-outlined text-sm leading-none">fast_forward</span>
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Renders streaming content: structured dialogueSegments when available,
 * otherwise falls back to narrative text with regex-based dialogue detection.
 */
export function StreamingContent({ narrative, segments }) {
  const { t } = useTranslation();
  const hasSegments = Array.isArray(segments) && segments.length > 0;

  if (hasSegments) {
    return (
      <>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          if (seg.type === 'dialogue') {
            const speaker = getDialogueSpeakerLabel(seg, t('common.npc'));
            return (
              <div key={i} className="pl-3 border-l-2 border-tertiary-dim/40">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">
                    {speaker}
                  </span>
                </div>
                <p className="text-xs text-on-surface leading-snug">
                  &ldquo;{seg.text}{isLast && <span className="inline-block w-1 h-3 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />}&rdquo;
                </p>
              </div>
            );
          }
          return (
            <div key={i}>
              <p className="text-xs text-on-surface-variant leading-snug italic whitespace-pre-line">
                {seg.text}{isLast && <span className="inline-block w-1 h-3 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />}
              </p>
            </div>
          );
        })}
      </>
    );
  }

  if (!narrative) return null;

  const parts = [];
  const dialogueRegex = /[„"«]([^"»"]*)[""»]|"([^"]*)"/g;
  let lastIndex = 0;
  let match;

  while ((match = dialogueRegex.exec(narrative)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'narrative', text: narrative.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'dialogue', text: match[0] });
    lastIndex = match.index + match[0].length;
  }

  const remaining = narrative.slice(lastIndex);
  const openQuoteMatch = remaining.match(/[„"«"]\s*([^"»""]*$)/);
  if (openQuoteMatch) {
    const beforeQuote = remaining.slice(0, openQuoteMatch.index);
    if (beforeQuote) parts.push({ type: 'narrative', text: beforeQuote });
    parts.push({ type: 'dialogue', text: openQuoteMatch[0] + '\u2026"' });
  } else if (remaining) {
    parts.push({ type: 'narrative', text: remaining });
  }

  if (parts.length === 0) {
    parts.push({ type: 'narrative', text: narrative });
  }

  return (
    <>
      {parts.map((part, i) => (
        part.type === 'dialogue' ? (
          <p key={i} className="text-xs text-on-surface leading-snug font-medium whitespace-pre-line pl-2 border-l border-tertiary/40">
            {part.text}
          </p>
        ) : (
          <p key={i} className="text-xs text-on-surface-variant leading-snug italic whitespace-pre-line">
            {part.text}
          </p>
        )
      ))}
      <span className="inline-block w-1 h-3 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />
    </>
  );
}
