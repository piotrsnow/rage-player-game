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
  dictation,
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
        {dictation?.enabled && supported && !isAutoTyping && (
          <div className="shrink-0 flex items-center rounded-full overflow-hidden border border-outline-variant/30 bg-surface-container-high/30">
            <button
              type="button"
              onClick={() => {
                if (dictation.mode === 'action') {
                  dictation.toggleListening();
                } else {
                  dictation.setMode('action');
                  if (!listening) dictation.start?.();
                }
              }}
              disabled={disabled}
              title={t('gameplay.dictationModeActionTooltip')}
              aria-label={t('gameplay.dictationModeAction')}
              aria-pressed={dictation.mode === 'action'}
              className={`flex items-center gap-1 px-2 h-7 transition-all duration-200 disabled:opacity-30 ${
                dictation.mode === 'action'
                  ? listening
                    ? 'text-error-light bg-error/20 mic-pulse'
                    : 'text-primary bg-primary/15'
                  : 'text-on-surface-variant/70 hover:text-primary hover:bg-primary/10'
              }`}
            >
              <span className="material-symbols-outlined text-sm">mic</span>
              <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">
                {t('gameplay.dictationModeAction')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (dictation.mode === 'dialogue') {
                  dictation.toggleListening();
                } else {
                  dictation.setMode('dialogue');
                  if (!listening) dictation.start?.();
                }
              }}
              disabled={disabled}
              title={t('gameplay.dictationModeDialogueTooltip')}
              aria-label={t('gameplay.dictationModeDialogue')}
              aria-pressed={dictation.mode === 'dialogue'}
              className={`flex items-center gap-1 px-2 h-7 border-l border-outline-variant/30 transition-all duration-200 disabled:opacity-30 ${
                dictation.mode === 'dialogue'
                  ? listening
                    ? 'text-amber-200 bg-amber-400/25 mic-pulse'
                    : 'text-amber-300 bg-amber-400/15'
                  : 'text-on-surface-variant/70 hover:text-amber-300 hover:bg-amber-400/10'
              }`}
            >
              <span className="material-symbols-outlined text-sm">format_quote</span>
              <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">
                {t('gameplay.dictationModeDialogue')}
              </span>
            </button>
          </div>
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
