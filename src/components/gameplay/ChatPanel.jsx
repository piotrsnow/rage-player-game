import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '../../services/gameState';
import { translateSkill } from '../../utils/wfrpTranslate';

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
  const segmentsComplete = hasSegments && (() => {
    const segText = message.dialogueSegments.map(s => s.text || '').join('');
    return segText.length >= (message.content || '').length * 0.8;
  })();

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
      <div className="glass-panel p-4 border-l-2 border-primary-dim/60 rounded-r-lg space-y-3 hover:border-primary-dim transition-colors duration-300">
        {segmentsComplete ? (
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

function PlayerMessage({ message, isMe }) {
  const { t } = useTranslation();
  const displayName = message.playerName || t('chat.you');
  return (
    <div className={`flex flex-col gap-2 animate-fade-in ${isMe !== false ? 'items-end' : 'items-start'}`}>
      <div className="text-[10px] font-bold text-tertiary-dim uppercase tracking-widest">
        {displayName} · {formatTimestamp(message.timestamp)}
      </div>
      <div className={`p-4 max-w-[90%] ${
        isMe !== false
          ? 'bg-surface-container-high/40 border-r-2 border-tertiary-dim rounded-l-lg'
          : 'bg-surface-container-high/25 border-l-2 border-tertiary-dim/50 rounded-r-lg'
      }`}>
        <p className="text-sm text-on-surface leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}

const SUBTYPE_STYLES = {
  item_gained:      { icon: 'inventory_2',   color: 'text-green-400',  line: 'to-green-400/30' },
  item_lost:        { icon: 'remove_circle', color: 'text-orange-400', line: 'to-orange-400/30' },
  damage:           { icon: 'heart_broken',  color: 'text-red-400',    line: 'to-red-400/30' },
  healing:          { icon: 'favorite',      color: 'text-green-400',  line: 'to-green-400/30' },
  mana:             { icon: 'auto_fix_high', color: 'text-purple-400', line: 'to-purple-400/30' },
  xp:               { icon: 'star',          color: 'text-yellow-400', line: 'to-yellow-400/30' },
  level_up:         { icon: 'military_tech', color: 'text-amber-300',  line: 'to-amber-300/40' },
  quest_new:        { icon: 'assignment',    color: 'text-blue-400',   line: 'to-blue-400/30' },
  quest_completed:  { icon: 'task_alt',      color: 'text-emerald-400', line: 'to-emerald-400/30' },
  quest_objective_completed: { icon: 'checklist', color: 'text-teal-400', line: 'to-teal-400/30' },
  money_spent:      { icon: 'payments',     color: 'text-orange-400',  line: 'to-orange-400/30' },
  money_gained:     { icon: 'paid',         color: 'text-yellow-400',  line: 'to-yellow-400/30' },
};

function DiceRollMessage({ message }) {
  const { t } = useTranslation();
  const d = message.diceData;

  if (!d) {
    return <SystemMessage message={message} />;
  }

  const success = d.success;
  const accentColor = success ? 'text-primary' : 'text-error';
  const bgGlow = success ? 'from-primary/10 via-transparent to-primary/10' : 'from-error/10 via-transparent to-error/10';
  const borderColor = success ? 'border-primary/40' : 'border-error/40';

  return (
    <div className="animate-fade-in my-2">
      <div className={`relative rounded-xl border ${borderColor} bg-gradient-to-r ${bgGlow} px-5 py-4`}>
        <div className="flex items-center gap-4">
          <div className={`flex items-center justify-center w-12 h-12 rounded-lg bg-surface-container-high/60 ${accentColor}`}>
            <span className="material-symbols-outlined text-2xl">casino</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">
              {t('gameplay.diceCheck', { skill: translateSkill(d.skill, t) })}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-lg font-bold text-on-surface">
                🎲 {d.roll}
              </span>
              <span className="text-on-surface-variant text-sm">{t('common.vs')}</span>
              <span className="font-mono text-lg font-bold text-on-surface">
                {d.target || d.dc}
              </span>
              {d.creativityBonus > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  {t('gameplay.creativityBonus', { bonus: d.creativityBonus })}
                </span>
              )}
              {d.momentumBonus > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-400/15 text-blue-300 border border-blue-400/30">
                  {t('gameplay.momentumBonus', { bonus: d.momentumBonus })}
                </span>
              )}
              <span className="text-on-surface-variant">·</span>
              <span className={`text-base font-bold ${accentColor}`}>
                SL {d.sl ?? 0}
              </span>
            </div>
          </div>
          <div className={`text-sm font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg ${
            success
              ? 'bg-primary/15 text-primary'
              : 'bg-error/15 text-error'
          }`}>
            {success ? t('common.success') : t('common.failure')}
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemMessage({ message }) {
  const style = SUBTYPE_STYLES[message.subtype];

  if (style) {
    const isLevelUp = message.subtype === 'level_up';
    return (
      <div className={`flex items-center gap-3 py-2 animate-fade-in ${isLevelUp ? 'opacity-100' : 'opacity-90'}`}>
        <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${style.line}`} />
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-sm ${style.color} ${isLevelUp ? 'animate-float' : ''}`}>{style.icon}</span>
          <div className={`text-[10px] uppercase font-bold tracking-widest ${style.color} ${isLevelUp ? 'text-xs' : ''}`}>
            {message.content}
          </div>
        </div>
        <div className={`h-px flex-1 bg-gradient-to-l from-transparent ${style.line}`} />
      </div>
    );
  }

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

export default function ChatPanel({ messages = [], narrator, autoPlay = false, myOdId = null, momentumBonus = 0 }) {
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
        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-tr from-primary-dim to-primary rounded-full opacity-40 blur-sm animate-pulse-glow" />
          <div className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-primary-dim to-primary flex items-center justify-center shadow-[0_0_15px_rgba(149,71,247,0.4)]">
            <span className="material-symbols-outlined text-on-primary">psychology</span>
          </div>
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
        {momentumBonus > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-400/10 border border-blue-400/30 animate-pulse-glow">
            <span className="material-symbols-outlined text-blue-300 text-sm">bolt</span>
            <span className="text-xs font-bold text-blue-300">
              {t('gameplay.momentumActive', { bonus: momentumBonus })}
            </span>
          </div>
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
          if (msg.role === 'player') {
            const isMe = myOdId ? msg.odId === myOdId : true;
            return <PlayerMessage key={msg.id} message={msg} isMe={isMe} />;
          }
          if (msg.subtype === 'dice_roll') return <DiceRollMessage key={msg.id} message={msg} />;
          return <SystemMessage key={msg.id} message={msg} />;
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
