import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '../../services/gameState';

function HighlightedText({ text, highlightInfo, segmentIndex, messageId, className }) {
  const hi = highlightInfo;
  const isActive = hi && hi.messageId === messageId && hi.segmentIndex === segmentIndex && hi.wordIndex >= 0;

  if (!isActive) {
    return <span className={className}>{text}</span>;
  }

  const words = text.split(/(\s+)/);
  let wordIdx = -1;

  return (
    <span className={className}>
      {words.map((part, i) => {
        if (/^\s+$/.test(part)) {
          return <span key={i}>{part}</span>;
        }
        wordIdx++;
        const isCurrent = wordIdx === hi.wordIndex;
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

function DialogueSegments({ segments, narrator, messageId }) {
  if (!segments || segments.length === 0) return null;

  const isSegmentActive = (index) => {
    return narrator?.currentMessageId === messageId && narrator?.currentSegmentIndex === index;
  };

  return (
    <div className="space-y-2">
      {segments.map((seg, i) => {
        const active = isSegmentActive(i);
        if (seg.type === 'dialogue' && seg.character) {
          return (
            <div key={i} className={`pl-3 border-l-2 border-tertiary-dim/40 transition-colors ${active ? 'border-tertiary bg-surface-tint/5' : ''}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">
                  {seg.character}
                </span>
                {active && (
                  <span className="material-symbols-outlined text-tertiary text-xs animate-pulse">
                    graphic_eq
                  </span>
                )}
              </div>
              <p className="text-sm text-on-surface leading-relaxed">
                &ldquo;<HighlightedText text={seg.text} highlightInfo={narrator?.highlightInfo} segmentIndex={i} messageId={messageId} />&rdquo;
              </p>
            </div>
          );
        }
        return (
          <div key={i} className={`transition-colors ${active ? 'bg-surface-tint/5 rounded-sm' : ''}`}>
            <p className="text-sm text-on-surface-variant leading-relaxed italic">
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

function DmMessage({ message, narrator }) {
  const { t } = useTranslation();
  const { playbackState, currentMessageId, isNarratorReady, speakSingle, pause, resume, STATES } = narrator || {};
  const isThisPlaying = currentMessageId === message.id && playbackState === STATES?.PLAYING;
  const isThisPaused = currentMessageId === message.id && playbackState === STATES?.PAUSED;
  const isThisLoading = currentMessageId === message.id && playbackState === STATES?.LOADING;

  const handleNarratorToggle = () => {
    if (isThisPlaying) {
      pause();
    } else if (isThisPaused) {
      resume();
    } else {
      speakSingle(message, message.id);
    }
  };

  const hasSegments = message.dialogueSegments && message.dialogueSegments.length > 0;

  return (
    <div className="flex flex-col gap-2 animate-fade-in">
      <div className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center justify-between">
        <span>{t('chat.dmAi')} · {formatTimestamp(message.timestamp)}</span>
        {isNarratorReady && (
          <button
            onClick={handleNarratorToggle}
            className={`flex items-center gap-1 transition-colors ${
              isThisPlaying ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className={`material-symbols-outlined text-sm ${isThisPlaying ? 'animate-pulse' : ''}`}>
              {isThisLoading ? 'hourglass_top' : isThisPlaying ? 'pause' : isThisPaused ? 'play_arrow' : 'volume_up'}
            </span>
          </button>
        )}
      </div>
      <div className="glass-panel p-4 border-l-2 border-primary-dim rounded-r-lg space-y-3">
        {hasSegments ? (
          <DialogueSegments segments={message.dialogueSegments} narrator={narrator} messageId={message.id} />
        ) : (
          <p className="text-sm text-on-surface-variant leading-relaxed italic">
            <HighlightedText text={message.content} highlightInfo={narrator?.highlightInfo} segmentIndex={0} messageId={message.id} />
          </p>
        )}
      </div>
    </div>
  );
}

function PlayerMessage({ message }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 items-end animate-fade-in">
      <div className="text-[10px] font-bold text-tertiary-dim uppercase tracking-widest">
        {t('chat.you')} · {formatTimestamp(message.timestamp)}
      </div>
      <div className="bg-surface-container-high/40 p-4 border-r-2 border-tertiary-dim rounded-l-lg max-w-[90%]">
        <p className="text-sm text-on-surface leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}

function SystemMessage({ message }) {
  return (
    <div className="flex items-center gap-4 py-2 opacity-80 animate-fade-in">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-outline-variant/30" />
      <div className="text-[10px] text-outline uppercase font-bold tracking-widest px-2">
        {message.content}
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-outline-variant/30" />
    </div>
  );
}

export default function ChatPanel({ messages = [], narrator, autoPlay = false }) {
  const { t } = useTranslation();
  const bottomRef = useRef(null);
  const prevMessageCount = useRef(messages.length);

  useEffect(() => {
    if (messages.length <= 1) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!narrator || !autoPlay) {
      prevMessageCount.current = messages.length;
      return;
    }
    const { isNarratorReady, speakScene } = narrator;
    if (!isNarratorReady) {
      prevMessageCount.current = messages.length;
      return;
    }

    if (messages.length > prevMessageCount.current) {
      const newMessages = messages.slice(prevMessageCount.current);
      const dmMessages = newMessages.filter((m) => m.role === 'dm');
      dmMessages.forEach((msg) => {
        speakScene(msg, msg.id);
      });
    }
    prevMessageCount.current = messages.length;
  }, [messages, narrator, autoPlay]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-outline-variant/15 flex items-center gap-4 shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary-dim to-primary flex items-center justify-center shadow-[0_0_15px_rgba(149,71,247,0.4)]">
          <span className="material-symbols-outlined text-on-primary">psychology</span>
        </div>
        <div className="flex-1">
          <h3 className="font-headline text-sm font-bold text-tertiary">{t('chat.dungeonMasterAi')}</h3>
          <div className="text-[10px] text-primary font-bold uppercase tracking-wider flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-primary" /> {t('common.online')}
          </div>
        </div>
        {narrator?.isNarratorReady && narrator.playbackState !== narrator.STATES.IDLE && (
          <button
            onClick={narrator.stop}
            className="flex items-center gap-1 text-on-surface-variant hover:text-error transition-colors"
            title="Stop narrator"
          >
            <span className="material-symbols-outlined text-sm">stop</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-4xl text-outline/20 block mb-2">
              forum
            </span>
            <p className="text-on-surface-variant text-xs">
              {t('chat.awaitingFirstMove')}
            </p>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.role === 'dm') return <DmMessage key={msg.id} message={msg} narrator={narrator} />;
          if (msg.role === 'player') return <PlayerMessage key={msg.id} message={msg} />;
          return <SystemMessage key={msg.id} message={msg} />;
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
