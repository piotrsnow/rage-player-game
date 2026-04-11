import { useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { parseActionSegments } from '../../../services/actionParser';

export default function CustomActionForm({
  customAction,
  onTypingChange,
  onSubmit,
  onSoloSubmit,
  disabled,
  autoPlayerTypingText,
  listening,
  supported,
  interim,
  onToggleVoice,
  isMultiplayer,
  soloAvailable,
  soloCooldownTime,
  isGenerating,
  textareaRef,
}) {
  const { t } = useTranslation();

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  const isAutoTyping = !!autoPlayerTypingText;
  const displayValue = isAutoTyping
    ? autoPlayerTypingText
    : customAction + (interim ? (customAction ? ' ' : '') + interim : '');
  const displaySegments = useMemo(() => parseActionSegments(displayValue), [displayValue]);
  const hasDialogueText = displaySegments.some((s) => s.type === 'dialogue');

  useEffect(() => {
    autoResize();
  }, [displayValue, autoResize]);

  return (
    <form onSubmit={onSubmit} className="flex-1 min-w-0">
      <div
        className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ${
          hasDialogueText ? 'max-h-10 opacity-100 mb-1' : 'max-h-0 opacity-0 mb-0'
        }`}
      >
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-amber-400/15 border border-amber-400/30">
          <span className="material-symbols-outlined text-amber-300 text-xs">chat_bubble</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
            {t('gameplay.dialogueTag')}
          </span>
        </span>
        <span className="text-[10px] text-amber-300/50 italic">
          {t('gameplay.dialogueHint')}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {supported && !isAutoTyping && (
          <button
            type="button"
            onClick={onToggleVoice}
            disabled={disabled}
            title={listening ? t('gameplay.voiceStop') : t('gameplay.voiceStart')}
            className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300 disabled:opacity-30 ${
              listening
                ? 'text-error-light bg-error/15 mic-pulse'
                : 'text-primary/70 hover:text-primary hover:bg-primary/10'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {listening ? 'mic' : 'mic_none'}
            </span>
          </button>
        )}
        {isAutoTyping && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary animate-pulse">
            <span className="material-symbols-outlined text-sm">smart_toy</span>
          </span>
        )}
        <div className="relative flex-1 min-w-0">
          <div
            aria-hidden="true"
            className="absolute inset-0 w-full text-sm py-1.5 px-1 pointer-events-none whitespace-pre-wrap break-words overflow-hidden leading-[1.5]"
          >
            {displaySegments.map((seg, i) =>
              seg.type === 'dialogue' ? (
                <span
                  key={i}
                  className="bg-amber-400/15 rounded-sm text-amber-300 border-b border-amber-400/40 transition-colors"
                >{seg.text}</span>
              ) : (
                <span key={i} className="text-on-surface">{seg.text}</span>
              )
            )}
          </div>
          <textarea
            data-testid="action-input"
            ref={textareaRef}
            value={displayValue}
            onChange={(e) => !isAutoTyping && onTypingChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder={
              listening
                ? t('gameplay.voiceListening')
                : supported
                  ? t('gameplay.customActionPlaceholderVoice')
                  : t('gameplay.customActionPlaceholder')
            }
            rows={1}
            disabled={disabled && !isAutoTyping}
            readOnly={listening || isAutoTyping}
            style={hasDialogueText && !isAutoTyping ? { color: 'transparent', caretColor: '#fffbfe' } : undefined}
            className={`relative w-full bg-transparent border-0 border-b-2 focus:ring-0 text-sm py-1.5 px-1 resize-none placeholder:text-outline/40 overflow-hidden disabled:opacity-50 transition-all duration-300 leading-[1.5] ${
              hasDialogueText ? 'selection:bg-amber-400/30' : ''
            } ${
              isAutoTyping
                ? 'border-primary/60 text-primary shadow-[0_2px_8px_rgba(197,154,255,0.2)]'
                : listening
                  ? `border-primary/60 shadow-[0_2px_8px_rgba(197,154,255,0.15)]${!hasDialogueText ? ' text-on-surface' : ''}`
                  : hasDialogueText
                    ? 'border-amber-400/40 shadow-[0_2px_8px_rgba(251,191,36,0.08)]'
                    : 'border-outline-variant/20 focus:border-primary/50 focus:shadow-[0_2px_8px_rgba(197,154,255,0.1)]'
            }`}
          />
        </div>
        {isMultiplayer && (
          <button
            type="button"
            onClick={onSoloSubmit}
            disabled={!customAction.trim() || disabled || !soloAvailable || isGenerating}
            title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
            className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-tertiary hover:text-on-surface bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
          </button>
        )}
        <button
          data-testid="submit-action"
          type="submit"
          disabled={!customAction.trim() || disabled}
          className="shrink-0 text-primary hover:text-on-surface transition-all flex items-center justify-center w-8 h-8 rounded-sm hover:bg-primary/10 disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-lg">send</span>
        </button>
      </div>
      {listening && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 animate-pulse mt-1 block">
          {t('gameplay.voiceListening')}
        </span>
      )}
    </form>
  );
}
