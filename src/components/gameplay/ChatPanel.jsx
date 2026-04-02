import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '../../services/gameState';
import { translateSkill } from '../../utils/wfrpTranslate';
import { parseActionSegments } from '../../services/actionParser';
import { splitTextForHighlight } from '../../services/elevenlabs';
import Tooltip from '../ui/Tooltip';

function HighlightedText({ text, highlightInfo, segmentIndex, messageId, className }) {
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

function DialogueSegments({ segments, narrator, messageId }) {
  const { t } = useTranslation();
  if (!segments || segments.length === 0) return null;

  const isSegmentActive = (index) => {
    return narrator?.currentMessageId === messageId && narrator?.currentSegmentIndex === index;
  };

  const getDialogueSpeakerLabel = (segment) => {
    const character = typeof segment?.character === 'string' ? segment.character.trim() : '';
    if (character && character.toLowerCase() !== 'npc') {
      return character;
    }
    const speaker = typeof segment?.speaker === 'string' ? segment.speaker.trim() : '';
    if (speaker && speaker.toLowerCase() !== 'npc') {
      return speaker;
    }
    return t('common.npc');
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
                  {getDialogueSpeakerLabel(seg)}
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

function NarratorHeaderButtons({ message, narrator, activeAccentClass, idleHoverClass }) {
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

function DmMessage({ message, narrator }) {
  const { t } = useTranslation();
  const [showRawAiSpeech, setShowRawAiSpeech] = useState(false);

  const hasSegments = message.dialogueSegments && message.dialogueSegments.length > 0;
  const shouldRenderSegments = hasSegments;
  const rawAiSpeech = message.rawAiSpeech && typeof message.rawAiSpeech === 'object'
    ? message.rawAiSpeech
    : {
      narrative: typeof message.content === 'string' ? message.content : '',
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
              <DialogueSegments segments={message.dialogueSegments} narrator={narrator} messageId={message.id} />
            ) : (
              <p className="text-xs text-on-surface-variant leading-snug italic">
                <HighlightedText text={message.content} highlightInfo={narrator?.highlightInfo} segmentIndex={0} messageId={message.id} />
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

function CombatCommentaryMessage({ message, narrator }) {
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

function PlayerMessage({ message, isMe }) {
  const { t } = useTranslation();
  const displayName = message.playerName || t('chat.you');
  const segments = parseActionSegments(message.content);
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

function ModifierIconTag({ icon, value, label, toneClass, tooltipClassName, tooltipAccentClassName }) {
  return (
    <Tooltip
      className="inline-flex"
      tooltipClassName={tooltipClassName}
      content={
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-base leading-none ${tooltipAccentClassName}`}>
              {icon}
            </span>
            <span className={`text-xs font-bold tracking-wide ${tooltipAccentClassName}`}>
              {value}
            </span>
          </div>
          <div className="text-sm font-semibold leading-snug text-white/95">
            {label}
          </div>
        </div>
      }
    >
      <span
        aria-label={label}
        className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${toneClass}`}
      >
        <span className="material-symbols-outlined text-[13px] leading-none">{icon}</span>
        <span>{value}</span>
      </span>
    </Tooltip>
  );
}

function BonusTags({ d, t, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`.trim()}>
      {d.characteristic && d.characteristicValue != null && (
        <ModifierIconTag
          icon="person"
          value={d.characteristicValue}
          label={`${t(`stats.${d.characteristic}Long`)} ${d.characteristicValue}`}
          toneClass="bg-purple-400/15 text-purple-300 border-purple-400/30"
          tooltipClassName="border-purple-400/45 bg-[linear-gradient(135deg,rgba(168,85,247,0.26),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(168,85,247,0.22)]"
          tooltipAccentClassName="text-purple-200"
        />
      )}
      {d.skillAdvances > 0 && (
        <ModifierIconTag
          icon="school"
          value={`+${d.skillAdvances}`}
          label={`${translateSkill(d.skill, t)} +${d.skillAdvances}`}
          toneClass="bg-emerald-400/15 text-emerald-300 border-emerald-400/30"
          tooltipClassName="border-emerald-400/45 bg-[linear-gradient(135deg,rgba(52,211,153,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(52,211,153,0.18)]"
          tooltipAccentClassName="text-emerald-200"
        />
      )}
      {d.creativityBonus > 0 && (
        <ModifierIconTag
          icon="emoji_objects"
          value={`+${d.creativityBonus}`}
          label={t('gameplay.creativityBonus', { bonus: d.creativityBonus })}
          toneClass="bg-amber-400/15 text-amber-300 border-amber-400/30"
          tooltipClassName="border-amber-400/45 bg-[linear-gradient(135deg,rgba(251,191,36,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(251,191,36,0.18)]"
          tooltipAccentClassName="text-amber-200"
        />
      )}
      {d.difficultyModifier != null && d.difficultyModifier !== 0 && (
        <ModifierIconTag
          icon={d.difficultyModifier > 0 ? 'target' : 'warning'}
          value={`${d.difficultyModifier > 0 ? '+' : ''}${d.difficultyModifier}`}
          label={t('gameplay.difficultyModifier', { bonus: (d.difficultyModifier > 0 ? '+' : '') + d.difficultyModifier })}
          toneClass={d.difficultyModifier > 0
            ? 'bg-teal-400/15 text-teal-300 border-teal-400/30'
            : 'bg-rose-400/15 text-rose-300 border-rose-400/30'}
          tooltipClassName={d.difficultyModifier > 0
            ? 'border-teal-400/45 bg-[linear-gradient(135deg,rgba(45,212,191,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(45,212,191,0.18)]'
            : 'border-rose-400/45 bg-[linear-gradient(135deg,rgba(251,113,133,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(251,113,133,0.18)]'}
          tooltipAccentClassName={d.difficultyModifier > 0 ? 'text-teal-200' : 'text-rose-200'}
        />
      )}
      {d.momentumBonus != null && d.momentumBonus !== 0 && (
        <ModifierIconTag
          icon={d.momentumBonus > 0 ? 'bolt' : 'trending_down'}
          value={`${d.momentumBonus > 0 ? '+' : ''}${d.momentumBonus}`}
          label={t('gameplay.momentumBonus', { bonus: (d.momentumBonus > 0 ? '+' : '') + d.momentumBonus })}
          toneClass={d.momentumBonus > 0
            ? 'bg-blue-400/15 text-blue-300 border-blue-400/30'
            : 'bg-red-400/15 text-red-300 border-red-400/30'}
          tooltipClassName={d.momentumBonus > 0
            ? 'border-blue-400/45 bg-[linear-gradient(135deg,rgba(96,165,250,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(96,165,250,0.18)]'
            : 'border-red-400/45 bg-[linear-gradient(135deg,rgba(248,113,113,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(248,113,113,0.18)]'}
          tooltipAccentClassName={d.momentumBonus > 0 ? 'text-blue-200' : 'text-red-200'}
        />
      )}
      {d.dispositionBonus != null && d.dispositionBonus !== 0 && (
        <ModifierIconTag
          icon={d.dispositionBonus > 0 ? 'mood' : 'sentiment_dissatisfied'}
          value={`${d.dispositionBonus > 0 ? '+' : ''}${d.dispositionBonus}`}
          label={t('gameplay.dispositionBonus', { bonus: (d.dispositionBonus > 0 ? '+' : '') + d.dispositionBonus })}
          toneClass={d.dispositionBonus > 0
            ? 'bg-pink-400/15 text-pink-300 border-pink-400/30'
            : 'bg-orange-400/15 text-orange-300 border-orange-400/30'}
          tooltipClassName={d.dispositionBonus > 0
            ? 'border-pink-400/45 bg-[linear-gradient(135deg,rgba(244,114,182,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(244,114,182,0.18)]'
            : 'border-orange-400/45 bg-[linear-gradient(135deg,rgba(251,146,60,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(251,146,60,0.18)]'}
          tooltipAccentClassName={d.dispositionBonus > 0 ? 'text-pink-200' : 'text-orange-200'}
        />
      )}
    </div>
  );
}

function RollEdgeBadge({ value, t, className = '' }) {
  const numericValue = value ?? 0;
  const toneClass = numericValue > 0
    ? 'text-emerald-300 bg-emerald-500/12 border-emerald-500/25'
    : numericValue < 0
      ? 'text-rose-300 bg-rose-500/12 border-rose-500/25'
      : 'text-on-surface-variant bg-surface-container-high/40 border-outline-variant/20';

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${toneClass} ${className}`.trim()}>
      <span className="material-symbols-outlined text-[14px] leading-none">fitness_center</span>
      <span className="text-xs font-bold">
        {t('gameplay.rollEdge', { value: `${numericValue > 0 ? '+' : ''}${numericValue}` })}
      </span>
    </div>
  );
}

function DiceRollMessage({ message }) {
  const { t } = useTranslation();
  const d = message.diceData;
  const [expanded, setExpanded] = useState(false);

  if (!d) {
    return <SystemMessage message={message} />;
  }

  const success = d.success;
  const isCritical = d.criticalSuccess || d.criticalFailure;
  const accentColor = d.criticalSuccess
    ? 'text-amber-400'
    : d.criticalFailure
      ? 'text-red-700'
      : success
        ? 'text-emerald-400'
        : 'text-rose-400';
  const bgGlow = d.criticalSuccess
    ? 'from-amber-400/10 via-transparent to-amber-400/10'
    : d.criticalFailure
      ? 'from-red-700/10 via-transparent to-red-700/10'
      : success
        ? 'from-emerald-500/10 via-transparent to-emerald-500/10'
        : 'from-rose-500/10 via-transparent to-rose-500/10';
  const borderColor = d.criticalSuccess
    ? 'border-amber-400/40'
    : d.criticalFailure
      ? 'border-red-700/40'
      : success
        ? 'border-emerald-500/35'
        : 'border-rose-500/35';
  const outcomeLabel = d.criticalSuccess
    ? t('common.criticalSuccess')
    : d.criticalFailure
      ? t('common.criticalFailure')
      : success
        ? t('common.success')
        : t('common.failure');
  const rollTarget = d.target ?? d.dc ?? '?';

  if (!expanded) {
    return (
      <div className="animate-fade-in my-1.5 flex justify-center">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={t('chat.expandDiceRoll', 'Expand dice roll details')}
          className={`w-[92px] h-[92px] rounded-xl border ${borderColor} bg-gradient-to-r ${bgGlow} flex flex-col items-center justify-center gap-1 transition-transform duration-200 hover:scale-[1.03]`}
          title={t('chat.expandDiceRoll', 'Expand dice roll details')}
        >
          <span className={`material-symbols-outlined text-lg ${accentColor}`}>casino</span>
          <span className="font-mono text-xs font-bold text-on-surface">
            {d.roll} {t('common.vs')} {rollTarget}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in my-2">
      <div className={`relative rounded-xl border ${borderColor} bg-gradient-to-r ${bgGlow} px-4 py-3 min-h-[152px] flex flex-col items-center text-center`}>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded
          aria-label={t('chat.collapseDiceRoll', 'Collapse dice roll details')}
          className="absolute top-2 right-2 w-6 h-6 rounded-md border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-colors"
          title={t('chat.collapseDiceRoll', 'Collapse dice roll details')}
        >
          <span className="material-symbols-outlined text-sm leading-none">unfold_less</span>
        </button>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
          {t('gameplay.diceCheck', { skill: translateSkill(d.skill, t) })}
        </p>

        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2">
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg bg-surface-container-high/60 ${accentColor}`}>
            <span className="material-symbols-outlined text-xl">casino</span>
          </div>
          <div className="flex items-baseline justify-center gap-2 flex-wrap">
            <span className="font-mono text-2xl font-bold text-on-surface leading-none">
              {d.roll}
            </span>
            <span className="text-on-surface-variant text-xs uppercase tracking-wide">{t('common.vs')}</span>
            <span className="font-mono text-2xl font-bold text-on-surface leading-none">
              {rollTarget}
            </span>
          </div>
          <RollEdgeBadge value={d.sl ?? 0} t={t} />
          <div className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
            d.criticalSuccess
              ? 'bg-amber-400/15 text-amber-400 border-amber-400/20'
              : d.criticalFailure
                ? 'bg-red-700/10 text-red-700 border-red-700/20'
                : success
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/25'
          }`}>
            {outcomeLabel}
          </div>
          {isCritical ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
              {success ? t('common.success') : t('common.failure')}
            </p>
          ) : null}
        </div>

        <div className="mt-auto w-full flex justify-center">
          <BonusTags d={d} t={t} className="justify-center" />
        </div>
      </div>
    </div>
  );
}

function SystemMessage({ message }) {
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
}

function TypingIndicator({ typingPlayers }) {
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

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function ChatPanel({
  messages = [],
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
}) {
  const { t } = useTranslation();
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const prevMessageCountForScroll = useRef(messages.length);
  const prevMessageCountForNarration = useRef(messages.length);
  const lastNarratedMessageIdRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const explicitScrollInProgressRef = useRef(false);

  const isNearBottom = useCallback((el, threshold = 48) => {
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= threshold;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    shouldStickToBottomRef.current = isNearBottom(el);
    const onScroll = () => {
      shouldStickToBottomRef.current = isNearBottom(el);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isNearBottom]);

  useEffect(() => {
    const hasNewMessages = messages.length > prevMessageCountForScroll.current;
    prevMessageCountForScroll.current = messages.length;
    if (!hasNewMessages || explicitScrollInProgressRef.current || scrollToMessageId) return;
    if (!shouldStickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, scrollToMessageId]);

  useEffect(() => {
    if (!scrollToMessageId || !containerRef.current) return;
    explicitScrollInProgressRef.current = true;
    let frame = null;
    let tries = 0;
    const maxTries = 4;

    const tryScroll = () => {
      const targetEl = containerRef.current?.querySelector(`[data-message-id="${scrollToMessageId}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        shouldStickToBottomRef.current = false;
        explicitScrollInProgressRef.current = false;
        onScrollTargetHandled?.(scrollToMessageId);
        return;
      }
      tries += 1;
      if (tries >= maxTries) {
        explicitScrollInProgressRef.current = false;
        onScrollTargetHandled?.(scrollToMessageId);
        return;
      }
      frame = requestAnimationFrame(tryScroll);
    };

    frame = requestAnimationFrame(tryScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      explicitScrollInProgressRef.current = false;
    };
  }, [scrollToMessageId, onScrollTargetHandled]);

  useEffect(() => {
    if (!narrator || !autoPlay) {
      prevMessageCountForNarration.current = messages.length;
      return;
    }
    const { isNarratorReady, speakSingle } = narrator;
    if (!isNarratorReady) {
      prevMessageCountForNarration.current = messages.length;
      return;
    }

    if (messages.length > prevMessageCountForNarration.current) {
      const newMessages = messages.slice(prevMessageCountForNarration.current);
      const spokenMessages = newMessages.filter((m) => m.role === 'dm' || m.subtype === 'combat_commentary');
      const latestSpokenMessage = spokenMessages.at(-1);
      if (latestSpokenMessage && latestSpokenMessage.id !== lastNarratedMessageIdRef.current) {
        // Auto-play should always follow the newest action/scene and cut old narration.
        speakSingle(latestSpokenMessage, latestSpokenMessage.id);
        lastNarratedMessageIdRef.current = latestSpokenMessage.id;
      }
    }
    prevMessageCountForNarration.current = messages.length;
  }, [messages, narrator, autoPlay]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-outline-variant/15 shrink-0 space-y-2">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="absolute -inset-0.5 bg-gradient-to-tr from-primary-dim to-primary rounded-full opacity-40 blur-sm animate-pulse-glow" />
            <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-primary-dim to-primary flex items-center justify-center shadow-[0_0_12px_rgba(149,71,247,0.4)]">
              <span className="material-symbols-outlined text-on-primary text-base">psychology</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-headline text-sm font-bold text-tertiary truncate">{t('chat.dungeonMasterAi')}</h3>
              <span className="text-[9px] text-primary font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                <span className="w-1 h-1 rounded-full bg-primary" /> {t('common.online')}
              </span>
            </div>
          </div>
          {narrator?.isNarratorReady && narrator.playbackState !== narrator.STATES.IDLE && (
            <button
              onClick={narrator.stop}
              className="shrink-0 flex items-center gap-1 text-on-surface-variant hover:text-error transition-colors"
              title="Stop narrator"
            >
              <span className="material-symbols-outlined text-sm">stop</span>
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="text-xs text-on-surface-variant/50 flex items-center gap-1.5"
            title={`${t('chat.sessionTime')}: ${formatDuration(sessionSeconds)} / ${t('chat.totalPlayTime')}: ${formatDuration(totalPlayTime)}`}
          >
            <span className="material-symbols-outlined text-sm">timer</span>
            {formatDuration(sessionSeconds)}
            {totalPlayTime > sessionSeconds && (
              <span className="text-on-surface-variant/35">/ {formatDuration(totalPlayTime)}</span>
            )}
          </span>
          {narrationTime > 0 && (
            <span className="text-xs text-on-surface-variant/50 flex items-center gap-1.5" title={t('chat.narrationTime')}>
              <span className="material-symbols-outlined text-sm">record_voice_over</span>
              {formatDuration(Math.round(narrationTime))}
            </span>
          )}
          {momentumBonus !== 0 && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold ${
              momentumBonus > 0
                ? 'bg-blue-400/10 border border-blue-400/30 text-blue-300'
                : 'bg-red-400/10 border border-red-400/30 text-red-300'
            }`}>
              <span className={`material-symbols-outlined text-xs`}>
                {momentumBonus > 0 ? 'bolt' : 'trending_down'}
              </span>
              {t('gameplay.momentumActive', { bonus: (momentumBonus > 0 ? '+' : '') + momentumBonus })}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
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
          if (msg.role === 'dm') return <div key={msg.id} data-testid="chat-message" data-message-id={msg.id} className="px-2"><DmMessage message={msg} narrator={narrator} /></div>;
          if (msg.subtype === 'combat_commentary') return <div key={msg.id} data-testid="chat-message" data-message-id={msg.id} className="px-2"><CombatCommentaryMessage message={msg} narrator={narrator} /></div>;
          if (msg.role === 'player') {
            const isMe = myOdId ? msg.odId === myOdId : true;
            return <div key={msg.id} data-testid="chat-message" data-message-id={msg.id} className="px-2"><PlayerMessage message={msg} isMe={isMe} /></div>;
          }
          if (msg.subtype === 'dice_roll') return <div key={msg.id} data-testid="chat-message" data-message-id={msg.id} className="px-3"><DiceRollMessage message={msg} /></div>;
          return <div key={msg.id} data-testid="chat-message" data-message-id={msg.id} className="px-2"><SystemMessage message={msg} /></div>;
        })}
        <TypingIndicator typingPlayers={typingPlayers} />
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
