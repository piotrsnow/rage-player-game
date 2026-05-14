import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '../../../services/gameState';
import { parseActionSegments } from '../../../services/actionParser';
import {
  HighlightedText,
  DialogueSegments,
  NarratorHeaderButtons,
  NarrativeWithLoading,
} from './ChatMessageParts';
import { NarrableText } from '../../ui/NarrableText';
import { filterDuplicateDialogueSegmentsWithIndex } from '../../../services/dialogueSegments';
import { getPacingStyle } from './pacingStyles';
import Tooltip from '../../ui/Tooltip';

function formatSceneStats(message) {
  const parts = [];
  if (message.responseSizeBytes > 0) {
    parts.push(`${(message.responseSizeBytes / 1024).toFixed(1)} kB`);
  }
  if (message.generationDurationMs > 0) {
    parts.push(`${(message.generationDurationMs / 1000).toFixed(1)}s`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function DmMessage({ message, narrator }) {
  const { t } = useTranslation();
  const [showRawAiSpeech, setShowRawAiSpeech] = useState(false);

  const narrativeText = typeof message.content === 'string' ? message.content : '';
  const sourceSegments = Array.isArray(message.dialogueSegments) ? message.dialogueSegments : [];
  const visibleSegments = filterDuplicateDialogueSegmentsWithIndex(sourceSegments, narrativeText);
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
  const statsLabel = formatSceneStats(message);
  const pacing = getPacingStyle(message.scenePacing);

  return (
    <div className="flex flex-col gap-2 animate-fade-in">
      <div className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center justify-between gap-2 min-w-0">
        <span className="truncate">
          {t('chat.dmAi')} · {formatTimestamp(message.timestamp)}
          {statsLabel && <span className="text-on-surface-variant/60 font-normal"> · {statsLabel}</span>}
        </span>
        <NarratorHeaderButtons
          message={message}
          narrator={narrator}
          activeAccentClass="text-primary"
          idleHoverClass="hover:text-primary"
        />
      </div>
      <div className={`glass-panel p-3 border-l-2 rounded-r-lg space-y-3 transition-colors duration-300 relative overflow-hidden ${pacing.border} ${pacing.hoverBorder} ${pacing.bg}`}>
        <div className="absolute bottom-1 right-2 z-[1]">
          <Tooltip
            content={<span className="font-headline tracking-widest uppercase text-sm">{pacing.label}</span>}
            variant="compact"
            tooltipClassName={`!bg-surface-container-lowest/90 backdrop-blur-md border ${pacing.tooltipBorder} ${pacing.tooltipGlow} !rounded-md !px-4 !py-2`}
            asChild
          >
            <span className={`material-symbols-outlined text-[56px] leading-none select-none transition-colors duration-300 cursor-default ${pacing.iconColor} ${pacing.hoverIcon}`}>
              {pacing.icon}
            </span>
          </Tooltip>
        </div>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {shouldRenderSegments ? (
              <DialogueSegments segments={visibleSegments} narrator={narrator} messageId={message.id} scenePacing={message.scenePacing} />
            ) : (
              <NarrativeWithLoading narrator={narrator} messageId={message.id} segmentIndex={0}>
                <NarrableText
                  text={narrativeText}
                  narrator={narrator}
                  messageId={message.id}
                  segmentIndex={0}
                  scenePacing={message.scenePacing}
                  className="flex items-start gap-0.5"
                  as="div"
                >
                  <p className="text-xs text-on-surface-variant leading-snug italic flex-1">
                    <HighlightedText text={narrativeText} highlightInfo={narrator?.highlightInfo} segmentIndex={0} messageId={message.id} />
                  </p>
                </NarrableText>
              </NarrativeWithLoading>
            )}
            <QuestWrapupEpilogue wrapup={message.dialogueIfQuestTargetCompleted} />
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

function QuestWrapupEpilogue({ wrapup }) {
  if (!wrapup || typeof wrapup !== 'object' || !wrapup.text) return null;
  const { text, speakerType, speakerName } = wrapup;

  if (speakerType === 'npc' || speakerType === 'companion') {
    return (
      <div className="mt-3 pt-3 border-t border-emerald-400/20">
        <div className="text-[10px] font-bold text-emerald-300/90 uppercase tracking-widest mb-1">
          {speakerName || '—'}
        </div>
        <p className="text-xs text-emerald-50/90 leading-snug italic">
          &ldquo;{text}&rdquo;
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 pt-3 border-t border-emerald-400/20">
      <p className="text-xs text-emerald-100/80 leading-snug italic">
        {text}
      </p>
    </div>
  );
}

/**
 * Quick beat ("mała akcja") — rendered like a normal DM message but with a
 * subtle warm background tint so the player can tell it apart at a glance.
 */
export const QuickBeatMessage = memo(function QuickBeatMessage({ message, narrator }) {
  const { t } = useTranslation();
  const isPlayer = message.role === 'player';
  const segments = Array.isArray(message.dialogueSegments) ? message.dialogueSegments : [];
  const hasDialogue = segments.some((seg) => seg?.type === 'dialogue');

  if (isPlayer) {
    return (
      <div className="flex flex-col gap-2 animate-fade-in items-end">
        <div className="text-[10px] font-bold uppercase tracking-widest text-tertiary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[11px] leading-none text-amber-300/70">flash_on</span>
          <span className="truncate">
            {t('chat.quickBeatPlayer', { defaultValue: 'Mała akcja' })}
            {' · '}{formatTimestamp(message.timestamp)}
          </span>
        </div>
        <div className="glass-panel p-3 max-w-[90%] rounded-l-lg rounded-tr-lg border-r-2 border-tertiary/60 bg-amber-400/[0.04] hover:border-tertiary transition-colors duration-300">
          <p className="text-xs text-on-surface leading-snug">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-fade-in">
      <div className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-1.5 truncate">
          <span className="material-symbols-outlined text-[11px] leading-none text-amber-300/70">flash_on</span>
          <span className="truncate">
            {t('chat.quickBeatDm', { defaultValue: 'Mała akcja · DM' })}
            {' · '}{formatTimestamp(message.timestamp)}
          </span>
        </span>
        <NarratorHeaderButtons
          message={message}
          narrator={narrator}
          activeAccentClass="text-primary"
          idleHoverClass="hover:text-primary"
        />
      </div>
      <div className="glass-panel p-3 border-l-2 border-amber-400/40 rounded-r-lg space-y-3 bg-amber-400/[0.06] hover:border-amber-400/60 transition-colors duration-300">
        <div className="min-w-0 flex-1">
          {hasDialogue ? (
            <DialogueSegments segments={segments} narrator={narrator} messageId={message.id} scenePacing={message.scenePacing || 'exploration'} />
          ) : (
            <NarrativeWithLoading narrator={narrator} messageId={message.id} segmentIndex={0}>
              <NarrableText
                text={message.content}
                narrator={narrator}
                messageId={message.id}
                segmentIndex={0}
                scenePacing={message.scenePacing || 'exploration'}
                className="flex items-start gap-0.5"
                as="div"
              >
                <p className="text-xs text-on-surface-variant leading-snug italic flex-1">
                  <HighlightedText text={message.content} highlightInfo={narrator?.highlightInfo} segmentIndex={0} messageId={message.id} />
                </p>
              </NarrableText>
            </NarrativeWithLoading>
          )}
        </div>
      </div>
    </div>
  );
});

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
          <DialogueSegments segments={message.dialogueSegments} narrator={narrator} messageId={message.id} scenePacing={message.scenePacing || 'combat'} />
        ) : (
          <NarrativeWithLoading narrator={narrator} messageId={message.id} segmentIndex={0}>
            <NarrableText
              text={message.content}
              narrator={narrator}
              messageId={message.id}
              segmentIndex={0}
              scenePacing={message.scenePacing || 'combat'}
              className="flex items-start gap-0.5"
              as="div"
            >
              <p className="text-xs text-on-surface leading-snug whitespace-pre-line flex-1">
                <HighlightedText text={message.content} highlightInfo={narrator?.highlightInfo} segmentIndex={0} messageId={message.id} />
              </p>
            </NarrableText>
          </NarrativeWithLoading>
        )}
      </div>
    </div>
  );
}

export const NeedsCommentaryMessage = memo(function NeedsCommentaryMessage({ message }) {
  return (
    <div className="flex flex-col gap-1.5 animate-fade-in">
      <div className="text-[10px] font-bold text-orange-300/80 uppercase tracking-widest flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[11px] leading-none text-orange-300/70">sentiment_stressed</span>
        <span className="truncate">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
      <div className="rounded-r-lg border-l-2 border-orange-400/30 bg-orange-400/5 px-3 py-2">
        <p className="text-xs text-orange-200/90 leading-snug italic whitespace-pre-line">{message.content}</p>
      </div>
    </div>
  );
});

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
  creativity_score: { icon: 'emoji_objects',  color: 'text-amber-300',  line: 'to-amber-300/35' },
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
  skill_xp:         { icon: 'trending_up',   color: 'text-cyan-400',    line: 'to-cyan-400/35' },
  skill_levelup:    { icon: 'workspace_premium', color: 'text-violet-300', line: 'to-violet-400/40' },
  char_xp:          { icon: 'auto_awesome', color: 'text-sky-400',     line: 'to-sky-400/35' },
  character_levelup: { icon: 'stars',      color: 'text-amber-300',   line: 'to-amber-400/45' },
  achievement_unlock: { icon: 'emoji_events', color: 'text-amber-400', line: 'to-amber-400/40' },
  location_discovered: { icon: 'explore', color: 'text-teal-300', line: 'to-teal-300/30' },
  location_changed:    { icon: 'place', color: 'text-teal-300', line: 'to-teal-300/30' },
  spell_learned:       { icon: 'auto_stories', color: 'text-purple-300', line: 'to-purple-300/30' },
  scroll_gained:       { icon: 'description', color: 'text-amber-300', line: 'to-amber-300/30' },
  scroll_consumed:     { icon: 'description', color: 'text-orange-300', line: 'to-orange-300/30' },
  status_change:       { icon: 'medical_information', color: 'text-red-400', line: 'to-red-400/30' },
  combat_start:        { icon: 'swords', color: 'text-red-500', line: 'to-red-500/30' },
  campaign_end:        { icon: 'auto_stories', color: 'text-amber-400', line: 'to-amber-400/40' },
  npc_met:             { icon: 'person_add', color: 'text-sky-300', line: 'to-sky-300/30' },
  npc_died:            { icon: 'skull', color: 'text-red-400', line: 'to-red-400/30' },
  npc_disposition:     { icon: 'mood', color: 'text-pink-300', line: 'to-pink-300/30' },
  faction_change:      { icon: 'groups', color: 'text-indigo-300', line: 'to-indigo-300/30' },
  attribute_change:    { icon: 'fitness_center', color: 'text-amber-300', line: 'to-amber-300/30' },
  mana_max:            { icon: 'auto_fix_high', color: 'text-purple-300', line: 'to-purple-300/30' },
  skill_badge:         { icon: 'military_tech', color: 'text-violet-300', line: 'to-violet-300/30' },
  effect_added:        { icon: 'whatshot', color: 'text-cyan-300', line: 'to-cyan-300/30' },
  crafting_failed:     { icon: 'cancel', color: 'text-red-400', line: 'to-red-400/30' },
  alchemy_failed:      { icon: 'cancel', color: 'text-red-400', line: 'to-red-400/30' },
};

/** Rich inline colors for skill / character XP system lines (matches `stateChangeMessages` shapes). */
function styledSystemLineContent(subtype, content) {
  if (typeof content !== 'string') return null;

  if (subtype === 'skill_levelup') {
    const m = content.match(/^(.+?) \+(\d+) XP — Level Up! \((\d+) → (\d+)\)$/);
    if (m) {
      const [, skill, xp, from, to] = m;
      return (
        <>
          <span className="text-sky-300">{skill}</span>
          <span className="text-amber-300 font-black"> +{xp} XP</span>
          <span className="text-fuchsia-300"> — Level Up!</span>
          <span className="text-slate-300/90"> ({from} → </span>
          <span className="text-emerald-300 font-black">{to}</span>
          <span className="text-slate-300/90">)</span>
        </>
      );
    }
  }

  if (subtype === 'skill_xp') {
    const m = content.match(/^(.+?) \+(\d+) XP$/);
    if (m) {
      const [, skill, xp] = m;
      return (
        <>
          <span className="text-sky-300">{skill}</span>
          <span className="text-amber-300 font-black"> +{xp} XP</span>
        </>
      );
    }
  }

  if (subtype === 'char_xp') {
    const m = content.match(/^\+(\d+)\s*(.*)$/);
    if (m) {
      const [, n, rest] = m;
      return (
        <>
          <span className="text-amber-300 font-black">+{n}</span>
          <span className="text-sky-200/95">{rest ? ` ${rest}` : ''}</span>
        </>
      );
    }
  }

  if (subtype === 'character_levelup') {
    const m = content.match(/^(.+?\D)(\d+)\s*→\s*(\d+)([\s\S]*)$/);
    if (m) {
      const [, before, oldL, newL, after] = m;
      const bonus = after.match(/^(!\s*)(\+)(\d+)(\s*)([\s\S]*)$/);
      if (bonus) {
        const [, bang, plus, pts, sp, tail] = bonus;
        return (
          <>
            <span className="text-amber-200/95">{before}</span>
            <span className="text-amber-300 font-black">{oldL}</span>
            <span className="text-slate-300"> → </span>
            <span className="text-emerald-300 font-black">{newL}</span>
            <span className="text-amber-200/95">{bang}</span>
            <span className="text-yellow-300 font-black">{plus}{pts}</span>
            <span className="text-amber-200/95">{sp}{tail}</span>
          </>
        );
      }
      return (
        <>
          <span className="text-amber-200/95">{before}</span>
          <span className="text-amber-300 font-black">{oldL}</span>
          <span className="text-slate-300"> → </span>
          <span className="text-emerald-300 font-black">{newL}</span>
          <span className="text-amber-200/95">{after}</span>
        </>
      );
    }
  }

  if (subtype === 'achievement_unlock') {
    const m = content.match(/^(.+?)(?:\s*—\s*\+(\d+)\s*XP)?$/);
    if (m) {
      const [, name, xp] = m;
      return (
        <>
          <span className="text-amber-300 font-black">{name}</span>
          {xp && <span className="text-yellow-200"> — +{xp} XP</span>}
        </>
      );
    }
  }

  return null;
}

export const SystemMessage = memo(function SystemMessage({ message }) {
  const style = SUBTYPE_STYLES[message.subtype];

  if (style) {
    const isLevelUp = message.subtype === 'level_up'
      || message.subtype === 'skill_levelup'
      || message.subtype === 'character_levelup'
      || message.subtype === 'achievement_unlock';
    const hasCombatBadge = Boolean(message.combatBadgeText);
    const richLine = styledSystemLineContent(message.subtype, message.content);
    const useRichLine = Boolean(richLine);
    return (
      <div className={`flex items-center gap-3 py-2 animate-fade-in ${isLevelUp ? 'opacity-100' : 'opacity-90'}`}>
        <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${style.line}`} />
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className={`material-symbols-outlined text-sm ${style.color} ${isLevelUp ? 'animate-float' : ''}`}>{style.icon}</span>
          <div
            className={`text-[10px] font-bold tracking-widest ${
              useRichLine
                ? 'normal-case tracking-wide text-[11px] leading-snug text-on-surface'
                : `uppercase ${style.color} ${message.subtype === 'level_up' ? 'text-xs' : ''}`
            }`}
          >
            {richLine || message.content}
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
