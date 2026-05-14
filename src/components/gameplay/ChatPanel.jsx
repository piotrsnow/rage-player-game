import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatScrollSync } from '../../hooks/useChatScrollSync';
import { useChatAutoNarration } from '../../hooks/useChatAutoNarration';
import {
  DmMessage,
  CombatCommentaryMessage,
  NeedsCommentaryMessage,
  PlayerMessage,
  SystemMessage,
  TypingIndicator,
  QuickBeatMessage,
} from './chat/ChatMessages';
import { StreamingContent } from './chat/ChatMessageParts';
import DiceRollCard from './DiceRollCard';
import Tooltip from '../ui/Tooltip';

const FONT_SIZE_KEY = 'rpgon:chatFontScale';
const FONT_STEP = 0.1;
const FONT_MIN = 0.7;
const FONT_MAX = 1.8;

function readInitialScale() {
  try {
    const v = parseFloat(localStorage.getItem(FONT_SIZE_KEY));
    if (Number.isFinite(v) && v >= FONT_MIN && v <= FONT_MAX) return v;
  } catch { /* ignore */ }
  return 1;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function SceneDivider() {
  return (
    <div className="flex items-center py-2 px-2 opacity-30">
      <svg className="w-full h-3" viewBox="0 0 300 12" preserveAspectRatio="none">
        <path
          d="M0 6 Q 7.5 1, 15 6 T 30 6 T 45 6 T 60 6 T 75 6 T 90 6 T 105 6 T 120 6 T 135 6 T 150 6 T 165 6 T 180 6 T 195 6 T 210 6 T 225 6 T 240 6 T 255 6 T 270 6 T 285 6 T 300 6"
          stroke="currentColor"
          fill="none"
          strokeWidth="0.8"
          className="text-outline-variant"
        />
      </svg>
    </div>
  );
}

export default function ChatPanel({
  messages = [],
  streamingNarrative = null,
  streamingSegments = null,
  streamError = null,
  onRetryStream = null,
  onDismissStreamError = null,
  narrator,
  autoPlay = false,
  myOdId = null,
  momentumBonus = 0,
  onMomentumClick = null,
  momentumMinigameActive = false,
  scrollToMessageId = null,
  onScrollTargetHandled = null,
  typingPlayers = {},
  sessionSeconds = 0,
  totalPlayTime = 0,
  narrationTime = 0,
  chatGate = false,
}) {
  const { t } = useTranslation();
  const [fontScale, setFontScale] = useState(readInitialScale);

  const adjustFont = useCallback((delta) => {
    setFontScale((prev) => {
      const next = Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta)) * 10) / 10;
      try { localStorage.setItem(FONT_SIZE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

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

  const totalCreativity = useMemo(
    () => messages.reduce((sum, m) => m.subtype === 'creativity_score' ? sum + (m.creativityBonus || 0) : sum, 0),
    [messages],
  );

  return (
    <div className="flex min-h-0 flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Tooltip content={t('chat.totalPlayTime')} placement="bottom" variant="compact" asChild>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs bg-on-surface/5 border border-outline-variant/20 text-on-surface-variant/60 tabular-nums">
              <span className="material-symbols-outlined text-sm">timer</span>
              {formatDuration(totalPlayTime)}
            </span>
          </Tooltip>
          {narrationTime > 0 && (
            <Tooltip content={t('chat.narrationTime')} placement="bottom" variant="compact" asChild>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs bg-on-surface/5 border border-outline-variant/20 text-on-surface-variant/60 tabular-nums">
                <span className="material-symbols-outlined text-sm">record_voice_over</span>
                {formatDuration(Math.round(narrationTime))}
              </span>
            </Tooltip>
          )}
          <Tooltip content={momentumMinigameActive ? t('gameplay.momentumMinigameActive') : t('gameplay.momentumClickHint')} placement="bottom" variant="compact" asChild>
            <button
              type="button"
              onClick={onMomentumClick}
              disabled={!onMomentumClick || momentumMinigameActive}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs tabular-nums transition-all ${
                momentumMinigameActive
                  ? 'bg-amber-400/15 border border-amber-400/50 text-amber-300 animate-pulse cursor-default'
                  : momentumBonus > 0
                    ? 'bg-blue-400/10 border border-blue-400/30 text-blue-300 hover:bg-blue-400/20 hover:border-blue-400/50 cursor-pointer'
                    : momentumBonus < 0
                      ? 'bg-red-400/10 border border-red-400/30 text-red-300 hover:bg-red-400/20 hover:border-red-400/50 cursor-pointer'
                      : 'bg-on-surface/5 border border-outline-variant/20 text-on-surface-variant/60 hover:bg-on-surface/10 hover:border-outline-variant/40 cursor-pointer'
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {momentumMinigameActive ? 'target' : momentumBonus > 0 ? 'bolt' : momentumBonus < 0 ? 'trending_down' : 'casino'}
              </span>
              {(momentumBonus > 0 ? '+' : '') + momentumBonus}
            </button>
          </Tooltip>
          {totalCreativity > 0 && (
            <Tooltip content={t('chat.totalCreativity')} placement="bottom" variant="compact" asChild>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs bg-amber-400/10 border border-amber-400/30 text-amber-300 tabular-nums">
                <span className="material-symbols-outlined text-sm">emoji_objects</span>
                {totalCreativity}
              </span>
            </Tooltip>
          )}
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-sm bg-on-surface/5 border border-outline-variant/20">
            <button
              type="button"
              onClick={() => adjustFont(-FONT_STEP)}
              disabled={fontScale <= FONT_MIN}
              className="w-5 h-5 flex items-center justify-center rounded text-on-surface-variant/60 hover:text-on-surface hover:bg-on-surface/10 disabled:opacity-30 disabled:cursor-default transition-colors text-xs font-bold"
              title={t('chat.fontDecrease', 'Zmniejsz czcionkę')}
            >−</button>
            <span className="text-[10px] tabular-nums text-on-surface-variant/50 w-7 text-center select-none">{Math.round(fontScale * 100)}%</span>
            <button
              type="button"
              onClick={() => adjustFont(FONT_STEP)}
              disabled={fontScale >= FONT_MAX}
              className="w-5 h-5 flex items-center justify-center rounded text-on-surface-variant/60 hover:text-on-surface hover:bg-on-surface/10 disabled:opacity-30 disabled:cursor-default transition-colors text-xs font-bold"
              title={t('chat.fontIncrease', 'Zwiększ czcionkę')}
            >+</button>
          </div>
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
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar origin-top"
        style={{ zoom: fontScale }}
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
        {visibleMessages.map((msg, idx) => {
          let inner;
          let px = 'px-2';
          const needsSceneDivider = msg.role === 'player' && msg.subtype !== 'quick_beat' && msg.subtype !== 'needs_commentary' && idx > 0;
          if (msg.subtype === 'quick_beat') inner = <QuickBeatMessage message={msg} narrator={narrator} />;
          else if (msg.subtype === 'needs_commentary') inner = <NeedsCommentaryMessage message={msg} />;
          else if (msg.role === 'dm') inner = <DmMessage message={msg} narrator={narrator} />;
          else if (msg.subtype === 'combat_commentary') inner = <CombatCommentaryMessage message={msg} narrator={narrator} />;
          else if (msg.role === 'player') { const isMe = myOdId ? msg.odId === myOdId : true; inner = <PlayerMessage message={msg} isMe={isMe} />; }
          else if (msg.subtype === 'dice_roll') { inner = msg.diceData ? <DiceRollCard diceData={msg.diceData} /> : <SystemMessage message={msg} />; px = 'px-3'; }
          else inner = <SystemMessage message={msg} />;
          return (
            <div key={msg.id}>
              {needsSceneDivider && <SceneDivider />}
              <div data-testid="chat-message" data-message-id={msg.id} className={px}>{inner}</div>
            </div>
          );
        })}
        {/* Live streaming narrative bubble — visible while SSE is in progress */}
        {!chatGate && streamingNarrative && !streamError && (
          <div className="px-2 animate-fade-in">
            <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">
              {t('chat.dmAi')}
            </div>
            <div className="glass-panel p-3 border-l-2 border-primary/60 rounded-r-lg">
              <StreamingContent narrative={streamingNarrative} segments={streamingSegments} />
            </div>
          </div>
        )}
        {/* Stream error — retry/dismiss UI */}
        {!chatGate && streamError && (
          <div className="px-2 animate-fade-in">
            <div className="flex flex-col gap-2">
              <div className="rounded-lg border border-amber-500/30 bg-black/70 backdrop-blur-md px-4 py-3 animate-fade-in" role="alert">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-base mt-0.5 shrink-0">warning</span>
                  <p className="text-amber-200 text-xs leading-snug min-w-0 break-words">
                    {streamError.code === 'LLM_TIMEOUT'
                      ? t('gameplay.streamErrorTimeout', 'Generowanie sceny przekroczyło limit czasu.')
                      : t('gameplay.streamErrorGeneric', 'Wystąpił błąd podczas generowania sceny.')}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-2.5">
                  {streamError.canRetry && onRetryStream && (
                    <button
                      type="button"
                      onClick={onRetryStream}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-medium hover:bg-amber-500/25 hover:border-amber-400/60 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">refresh</span>
                      {t('gameplay.retryGeneration', 'Spróbuj ponownie')}
                    </button>
                  )}
                  {onDismissStreamError && (
                    <button
                      type="button"
                      onClick={onDismissStreamError}
                      className="text-amber-400/60 hover:text-amber-300 text-xs transition-colors"
                    >
                      {t('common.dismiss', 'Odrzuć')}
                    </button>
                  )}
                </div>
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
