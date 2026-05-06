import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatScrollSync } from '../../hooks/useChatScrollSync';
import { useChatAutoNarration } from '../../hooks/useChatAutoNarration';
import { StreamingContent } from './chat/ChatMessageParts';
import {
  DmMessage,
  CombatCommentaryMessage,
  PlayerMessage,
  SystemMessage,
  TypingIndicator,
} from './chat/ChatMessages';
import DiceRollMessage from './chat/DiceRollMessage';

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function ChatPanel({
  messages = [],
  streamingNarrative = null,
  streamingSegments = null,
  narrator,
  autoPlay = false,
  myOdId = null,
  momentumBonus = 0,
  scrollToMessageId = null,
  onScrollTargetHandled = null,
  typingPlayers = {},
  sessionSeconds = 0,
  totalPlayTime = 0,
  narrationTime = 0,
  chatGate = false,
}) {
  const { t } = useTranslation();
  const { bottomRef, containerRef } = useChatScrollSync({
    messageCount: messages.length,
    streamingNarrative,
    scrollToMessageId,
    onScrollTargetHandled,
  });
  useChatAutoNarration({ messages, narrator, autoPlay });

  // Boundary fixed at the moment chatGate switches false→true: hide everything
  // added while the typewriter overlay is up (stream preview + new DM).
  const gateBoundaryId = useMemo(() => {
    if (!chatGate) return null;
    return messages.length > 0 ? messages[messages.length - 1].id : '__none__';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatGate]);

  const visibleMessages = useMemo(() => {
    if (!chatGate || gateBoundaryId === null) return messages;
    if (gateBoundaryId === '__none__') return [];
    const idx = messages.findIndex((m) => m.id === gateBoundaryId);
    return idx >= 0 ? messages.slice(0, idx + 1) : messages;
  }, [chatGate, gateBoundaryId, messages]);

  return (
    <div className="flex min-h-0 flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 border-b border-outline-variant/15 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs bg-on-surface/5 border border-outline-variant/20 text-on-surface-variant/60 tabular-nums"
            title={`${t('chat.sessionTime')}: ${formatDuration(sessionSeconds)} / ${t('chat.totalPlayTime')}: ${formatDuration(totalPlayTime)}`}
          >
            <span className="material-symbols-outlined text-sm">timer</span>
            {formatDuration(sessionSeconds)}
            {totalPlayTime > sessionSeconds && (
              <span className="text-on-surface-variant/35">/ {formatDuration(totalPlayTime)}</span>
            )}
          </span>
          {narrationTime > 0 && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs bg-on-surface/5 border border-outline-variant/20 text-on-surface-variant/60 tabular-nums" title={t('chat.narrationTime')}>
              <span className="material-symbols-outlined text-sm">record_voice_over</span>
              {formatDuration(Math.round(narrationTime))}
            </span>
          )}
          {momentumBonus !== 0 && (
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs tabular-nums ${
              momentumBonus > 0
                ? 'bg-blue-400/10 border border-blue-400/30 text-blue-300'
                : 'bg-red-400/10 border border-red-400/30 text-red-300'
            }`}>
              <span className="material-symbols-outlined text-sm">
                {momentumBonus > 0 ? 'bolt' : 'trending_down'}
              </span>
              {t('gameplay.momentumActive', { bonus: (momentumBonus > 0 ? '+' : '') + momentumBonus })}
            </span>
          )}
          {narrator?.isNarratorReady && narrator.playbackState !== narrator.STATES.IDLE && (
            <button
              onClick={narrator.stop}
              className="ml-auto shrink-0 flex items-center gap-1 text-on-surface-variant hover:text-error transition-colors"
              title="Stop narrator"
            >
              <span className="material-symbols-outlined text-sm">stop</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        data-chat-scroll-root
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
      >
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
        {visibleMessages.map((msg) => {
          let inner;
          let px = 'px-2';
          if (msg.role === 'dm') inner = <DmMessage message={msg} narrator={narrator} />;
          else if (msg.subtype === 'combat_commentary') inner = <CombatCommentaryMessage message={msg} narrator={narrator} />;
          else if (msg.role === 'player') { const isMe = myOdId ? msg.odId === myOdId : true; inner = <PlayerMessage message={msg} isMe={isMe} />; }
          else if (msg.subtype === 'dice_roll') { inner = <DiceRollMessage message={msg} />; px = 'px-3'; }
          else inner = <SystemMessage message={msg} />;
          return <div key={msg.id} data-testid="chat-message" data-message-id={msg.id} className={px}>{inner}</div>;
        })}
        {/* Streaming narrative — shown while AI generates (suppressed while
            a typewriter overlay is up so the chat stays quiet until it closes). */}
        {!chatGate && streamingNarrative && (
          <div className="px-2 animate-fade-in">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                {t('chat.dmAi', 'DM (AI)')} · ...
              </span>
              <div className="glass-panel p-3 border-l-2 border-primary-dim/60 rounded-r-lg space-y-2">
                <StreamingContent narrative={streamingNarrative} segments={streamingSegments} />
              </div>
            </div>
          </div>
        )}
        <TypingIndicator typingPlayers={typingPlayers} />
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
