import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '../../../services/gameState';
import { parseActionSegments } from '../../../services/actionParser';
import {
  HighlightedText,
  DialogueSegments,
  NarratorHeaderButtons,
  filterDuplicateDialogueSegments,
} from './ChatMessageParts';

export function DmMessage({ message, narrator }) {
  const { t } = useTranslation();
  const [showRawAiSpeech, setShowRawAiSpeech] = useState(false);

  const narrativeText = typeof message.content === 'string' ? message.content : '';
  const sourceSegments = Array.isArray(message.dialogueSegments) ? message.dialogueSegments : [];
  const visibleSegments = filterDuplicateDialogueSegments(sourceSegments, narrativeText);
  const hasVisibleDialogue = visibleSegments.some((segment) => segment?.type === 'dialogue');
  const shouldRenderSegments = visibleSegments.length > 0 && hasVisibleDialogue;
  const rawAiSpeech = message.rawAiSpeech && typeof message.rawAiSpeech === 'object'
    ? message.rawAiSpeech
    : {
      narrative: narrativeText,
      dialogueSegments: Array.isArray(message.dialogueSegments) ? message.dialogueSegments : [],
      scenePacing: message.scenePacing || 'exploration',
    };
  const rawAiSpeechText = JSON.stringify(rawAiSpeech, null, 2);

  return (
    <div className="flex flex-col gap-2 animate-fade-in">
      <div className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center justify-between gap-2 min-w-0">
        <span className="truncate">{t('chat.dmAi')} · {formatTimestamp(message.timestamp)}</span>
        <NarratorHeaderButtons
          message={message}
          narrator={narrator}
          activeAccentClass="text-primary"
          idleHoverClass="hover:text-primary"
        />
      </div>
      <div className="glass-panel p-3 border-l-2 border-primary-dim/60 rounded-r-lg space-y-3 hover:border-primary-dim transition-colors duration-300">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {shouldRenderSegments ? (
              <DialogueSegments segments={visibleSegments} narrator={narrator} messageId={message.id} />
            ) : (
              <p className="text-xs text-on-surface-variant leading-snug italic">
                <HighlightedText text={narrativeText} highlightInfo={narrator?.highlightInfo} segmentIndex={0} messageId={message.id} />
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowRawAiSpeech((prev) => !prev)}
            className="shrink-0 w-7 h-7 rounded-md border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/35 transition-colors"
            title={showRawAiSpeech ? t('chat.hideRawAiSpeech') : t('chat.showRawAiSpeech')}
            aria-label={showRawAiSpeech ? t('chat.hideRawAiSpeech') : t('chat.showRawAiSpeech')}
          >
            <span className="material-symbols-outlined text-sm leading-none">
              {showRawAiSpeech ? 'visibility_off' : 'code'}
            </span>
          </button>
        </div>
        {showRawAiSpeech && (
          <div className="rounded-md border border-outline-variant/20 bg-black/20 overflow-hidden">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/15">
              {t('chat.rawAiSpeechTitle')}
            </div>
            <pre className="p-2 text-[10px] leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words max-h-64 overflow-auto custom-scrollbar">
              {rawAiSpeechText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function CombatCommentaryMessage({ message, narrator }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 animate-fade-in">
      <div className="text-[10px] font-bold text-amber-300 uppercase tracking-widest flex items-center justify-between gap-2 min-w-0">
        <span className="truncate">{t('chat.combatCommentary')} · {formatTimestamp(message.timestamp)}</span>
        <NarratorHeaderButtons
          message={message}
          narrator={narrator}
          activeAccentClass="text-amber-300"
          idleHoverClass="hover:text-amber-300"
        />
      </div>
      <div className="rounded-r-lg border-l-2 border-amber-400/40 bg-amber-400/5 px-3 py-3 space-y-3">
        {message.dialogueSegments?.length > 0 ? (
          <DialogueSegments segments={message.dialogueSegments} narrator={narrator} messageId={message.id} />
        ) : (
          <p className="text-xs text-on-surface leading-snug whitespace-pre-line">
            <HighlightedText text={message.content} highlightInfo={narrator?.highlightInfo} segmentIndex={0} messageId={message.id} />
          </p>
        )}
      </div>
    </div>
  );
}

export const PlayerMessage = memo(function PlayerMessage({ message, isMe }) {
  const { t } = useTranslation();
  const displayName = message.playerName || t('chat.you');
  const segments = useMemo(() => parseActionSegments(message.content), [message.content]);
  const isCurrentUser = isMe !== false;

  return (
    <div className={`flex flex-col gap-2 animate-fade-in ${isCurrentUser ? 'items-end' : 'items-start'}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${isCurrentUser ? 'text-tertiary' : 'text-secondary'}`}>
        {displayName} · {formatTimestamp(message.timestamp)}
      </div>
      <div className={`glass-panel p-3 max-w-[90%] space-y-3 transition-colors duration-300 ${
        isCurrentUser
          ? 'rounded-l-lg rounded-tr-lg border-r-2 border-tertiary/60 bg-tertiary/8 hover:border-tertiary'
          : 'rounded-r-lg rounded-tl-lg border-l-2 border-secondary/55 bg-secondary/8 hover:border-secondary'
      }`}>
        <p className="text-xs text-on-surface leading-snug">
          {segments.map((seg, i) =>
            seg.type === 'dialogue' ? (
              <span
                key={i}
                className={`rounded-sm italic ${
                  isCurrentUser
                    ? 'bg-tertiary/12 text-tertiary'
                    : 'bg-secondary/12 text-secondary'
                }`}
              >{seg.text}</span>
            ) : (
              <span key={i}>{seg.text}</span>
            )
          )}
        </p>
      </div>
    </div>
  );
});

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
  quest_reward:     { icon: 'paid',          color: 'text-amber-400',   line: 'to-amber-400/30' },
  quest_objective_completed: { icon: 'checklist', color: 'text-teal-400', line: 'to-teal-400/30' },
  money_spent:      { icon: 'payments',     color: 'text-orange-400',  line: 'to-orange-400/30' },
  money_gained:     { icon: 'paid',         color: 'text-yellow-400',  line: 'to-yellow-400/30' },
  combat_hit:       { icon: 'swords',       color: 'text-red-400',     line: 'to-red-400/30' },
  combat_miss:      { icon: 'shield',       color: 'text-slate-400',   line: 'to-slate-400/30' },
  combat_critical:  { icon: 'local_fire_department', color: 'text-orange-400', line: 'to-orange-400/30' },
  combat_defeat:    { icon: 'skull',        color: 'text-red-500',     line: 'to-red-500/30' },
  combat_fled:      { icon: 'directions_run', color: 'text-yellow-400', line: 'to-yellow-400/30' },
  combat_end:       { icon: 'flag',         color: 'text-primary',     line: 'to-primary/30' },
};

export const SystemMessage = memo(function SystemMessage({ message }) {
  const style = SUBTYPE_STYLES[message.subtype];

  if (style) {
    const isLevelUp = message.subtype === 'level_up';
    const hasCombatBadge = Boolean(message.combatBadgeText);
    return (
      <div className={`flex items-center gap-3 py-2 animate-fade-in ${isLevelUp ? 'opacity-100' : 'opacity-90'}`}>
        <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${style.line}`} />
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className={`material-symbols-outlined text-sm ${style.color} ${isLevelUp ? 'animate-float' : ''}`}>{style.icon}</span>
          <div className={`text-[10px] uppercase font-bold tracking-widest ${style.color} ${isLevelUp ? 'text-xs' : ''}`}>
            {message.content}
          </div>
          {hasCombatBadge && (
            <span className={`px-2.5 py-1 rounded-md text-sm font-black tracking-wider ${
              message.combatBadgeTone === 'miss'
                ? 'bg-surface-container-high text-on-surface border border-outline-variant/20'
                : 'bg-error/15 text-error border border-error/20'
            }`}>
              {message.combatBadgeText}
            </span>
          )}
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
});

export function TypingIndicator({ typingPlayers }) {
  const { t } = useTranslation();
  const names = Object.values(typingPlayers || {})
    .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
    .filter(Boolean);
  if (names.length === 0) return null;

  const label = names.length === 1
    ? t('multiplayer.playerTyping', { name: names[0] })
    : t('multiplayer.playersTyping', { names: names.join(', ') });

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 animate-fade-in">
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-[10px] text-on-surface-variant/70 italic">{label}</span>
    </div>
  );
}
