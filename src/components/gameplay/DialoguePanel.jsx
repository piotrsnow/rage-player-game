import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const ATTITUDE_COLORS = {
  hostile: 'text-error border-error/30',
  neutral: 'text-warning border-warning/30',
  friendly: 'text-success border-success/30',
};

export default function DialoguePanel({
  dialogue,
  gameState,
  onAction,
  onEndDialogue,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [customReply, setCustomReply] = useState('');
  const logEndRef = useRef(null);
  const textareaRef = useRef(null);

  const lastScene = gameState?.scenes?.[gameState.scenes.length - 1];
  const actions = lastScene?.actions || [];
  const dialogueSegments = lastScene?.dialogueSegments || [];
  const npcLines = dialogueSegments.filter((seg) => seg.type === 'dialogue');
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

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [npcLines.length]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [customReply, autoResize]);

  const handleSubmitReply = (e) => {
    e.preventDefault();
    if (customReply.trim() && !disabled) {
      onAction(customReply.trim(), true);
      setCustomReply('');
    }
  };

  const handleSuggestedReply = (reply) => {
    if (!disabled) {
      onAction(reply, false);
    }
  };

  const handleEndEarly = () => {
    if (!disabled) {
      onEndDialogue({
        rounds: dialogue.round,
        maxRounds: dialogue.maxRounds,
        npcs: dialogue.npcs?.map((n) => n.name) || [],
        endedEarly: true,
      });
    }
  };

  if (!dialogue?.active) return null;

  const roundProgress = dialogue.round / dialogue.maxRounds;
  const roundsLeft = dialogue.maxRounds - dialogue.round;

  return (
    <div className="space-y-3 bg-surface-container-low/60 border border-tertiary/20 rounded-sm p-4 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary text-lg">forum</span>
          <h3 className="font-headline text-sm text-tertiary uppercase tracking-widest">
            {t('dialogue.title')}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-label text-on-surface-variant">
            {t('dialogue.round')} {dialogue.round}/{dialogue.maxRounds}
          </span>
          <button
            onClick={handleEndEarly}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-error border border-outline-variant/15 hover:border-error/30 rounded-sm transition-all disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-xs">close</span>
            {t('dialogue.endDialogue')}
          </button>
        </div>
      </div>

      {/* Round progress bar */}
      <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-tertiary/60 to-tertiary transition-all duration-500"
          style={{ width: `${roundProgress * 100}%` }}
        />
      </div>

      {/* NPCs in conversation */}
      <div className="flex flex-wrap gap-2">
        {(dialogue.npcs || []).map((npc) => {
          const colorClass = ATTITUDE_COLORS[npc.attitude] || ATTITUDE_COLORS.neutral;
          return (
            <div
              key={npc.name}
              className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-sm bg-surface-container/40 ${colorClass}`}
            >
              <span className="material-symbols-outlined text-xs">person</span>
              <span className="text-[11px] font-label">{npc.name}</span>
              {npc.role && (
                <span className="text-[9px] text-on-surface-variant/60 italic">({npc.role})</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Dialogue log */}
      {npcLines.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {npcLines.map((seg, i) => (
            <div
              key={i}
              className="pl-3 border-l-2 border-tertiary-dim/40"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">
                  {getDialogueSpeakerLabel(seg)}
                </span>
              </div>
              <p className="text-sm text-on-surface leading-relaxed">
                &ldquo;{seg.text}&rdquo;
              </p>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* Suggested dialogue options */}
      {actions.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] text-on-surface-variant/60 font-label uppercase tracking-widest">
            {t('dialogue.yourTurn')}
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {actions.slice(0, 3).map((action, i) => (
              <button
                key={`${action.substring(0, 30)}_${i}`}
                onClick={() => handleSuggestedReply(action)}
                disabled={disabled}
                className="text-left px-3 py-2 bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 hover:border-tertiary/30 rounded-sm transition-all group disabled:opacity-50"
              >
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-xs text-tertiary/50 group-hover:text-tertiary mt-0.5 shrink-0">
                    chat_bubble
                  </span>
                  <p className="text-xs text-on-surface-variant group-hover:text-on-surface transition-colors leading-snug line-clamp-2">
                    {action}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom reply input */}
      <form onSubmit={handleSubmitReply} className="flex items-center gap-2">
        <textarea
          ref={textareaRef}
          value={customReply}
          onChange={(e) => setCustomReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmitReply(e);
            }
          }}
          placeholder={t('dialogue.replyPlaceholder')}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent border-0 border-b-2 border-outline-variant/20 focus:border-tertiary/50 focus:ring-0 text-sm py-1.5 px-1 resize-none placeholder:text-outline/40 overflow-hidden disabled:opacity-50 transition-all leading-[1.5]"
        />
        <button
          type="submit"
          disabled={!customReply.trim() || disabled}
          className="shrink-0 text-tertiary hover:text-on-surface transition-all flex items-center justify-center w-8 h-8 rounded-sm hover:bg-tertiary/10 disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-lg">send</span>
        </button>
      </form>

      {/* Rounds remaining hint */}
      {roundsLeft > 0 && (
        <p className="text-[10px] text-on-surface-variant/40 text-center italic">
          {t('dialogue.roundsRemaining', { count: roundsLeft })}
        </p>
      )}
      {roundsLeft === 0 && (
        <p className="text-[10px] text-warning/60 text-center font-label uppercase tracking-wider">
          {t('dialogue.lastRound')}
        </p>
      )}
    </div>
  );
}
