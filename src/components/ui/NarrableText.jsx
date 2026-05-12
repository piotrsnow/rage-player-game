import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettings } from '../../contexts/SettingsContext';

/**
 * Two modes based on whether `narrator` prop is provided:
 *
 * Mode A (narrator available): atomic narrator operation
 *   - Click -> narrator.playSegment(seg, messageId, segmentIndex, scenePacing)
 *   - State derived from narrator (currentMessageId, currentSegmentIndex, loadingSegmentIndices)
 *
 * Mode B (narrator=null): standalone browser speechSynthesis fallback
 *   - For non-gameplay contexts (CharacterPicker, modals without narrator access)
 */
export function NarrableText({
  text,
  narrator = null,
  messageId = null,
  segmentIndex = 0,
  seg = null,
  scenePacing = null,
  className = '',
  as: Tag = 'span',
  children = null,
}) {
  if (narrator) {
    return (
      <NarratorModeTrigger
        text={text}
        narrator={narrator}
        messageId={messageId}
        segmentIndex={segmentIndex}
        seg={seg}
        scenePacing={scenePacing}
        className={className}
        as={Tag}
      >
        {children}
      </NarratorModeTrigger>
    );
  }

  return (
    <BrowserSpeechTrigger text={text} className={className} as={Tag}>
      {children}
    </BrowserSpeechTrigger>
  );
}

function NarratorModeTrigger({
  text,
  narrator,
  messageId,
  segmentIndex,
  seg,
  scenePacing,
  className,
  as: Tag,
  children,
}) {
  const isThisMessage = narrator.currentMessageId === messageId;
  const isPlaying = isThisMessage && narrator.currentSegmentIndex === segmentIndex;
  const isLoading = !isPlaying && isThisMessage && narrator.loadingSegmentIndices?.has(segmentIndex);

  const handleClick = (e) => {
    e.stopPropagation();
    if (isPlaying || isLoading) {
      narrator.stop();
      return;
    }
    const segment = seg || { type: 'narration', text };
    narrator.playSegment(segment, messageId, segmentIndex, scenePacing);
  };

  const icon = isLoading
    ? 'hourglass_top'
    : isPlaying
      ? 'stop_circle'
      : 'volume_up';

  const needsGroup = !children;
  return (
    <Tag className={`${needsGroup ? 'group/seg ' : ''}${className}`}>
      {children || text}
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-all shrink-0 ml-1 ${
          isPlaying || isLoading
            ? 'opacity-100 bg-primary/10'
            : 'opacity-0 group-hover/seg:opacity-60 hover:!opacity-100 hover:bg-primary/10'
        }`}
        aria-label={isPlaying ? 'Stop' : 'Read aloud'}
      >
        <span className={`material-symbols-outlined text-[12px] text-primary/70 hover:text-primary ${isLoading ? 'animate-spin' : ''}`}>
          {icon}
        </span>
      </button>
    </Tag>
  );
}

function BrowserSpeechTrigger({ text, className, as: Tag, children }) {
  const { settings } = useSettings();
  const [state, setState] = useState('idle');
  const mountedRef = useRef(true);
  const utteranceRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (utteranceRef.current) {
        window.speechSynthesis?.cancel();
        utteranceRef.current = null;
      }
    };
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    if (mountedRef.current) setState('idle');
  }, []);

  const toggle = (e) => {
    e.stopPropagation();
    if (state === 'playing') { stop(); return; }

    const synth = window.speechSynthesis;
    if (!synth) return;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = settings.language || 'pl';
    u.rate = 1;
    u.onend = () => {
      utteranceRef.current = null;
      if (mountedRef.current) setState('idle');
    };
    u.onerror = () => {
      utteranceRef.current = null;
      if (mountedRef.current) setState('idle');
    };
    utteranceRef.current = u;
    setState('playing');
    synth.speak(u);
  };

  const icon = state === 'playing' ? 'stop_circle' : 'volume_up';

  const needsGroup = !children;
  return (
    <Tag className={`${needsGroup ? 'group/seg ' : ''}${className}`}>
      {children || text}
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-all shrink-0 ml-1 ${
          state !== 'idle'
            ? 'opacity-100 bg-primary/10'
            : 'opacity-0 group-hover/seg:opacity-60 hover:!opacity-100 hover:bg-primary/10'
        }`}
        aria-label={state === 'playing' ? 'Stop' : 'Read aloud'}
      >
        <span className="material-symbols-outlined text-[12px] text-primary/70 hover:text-primary">
          {icon}
        </span>
      </button>
    </Tag>
  );
}
