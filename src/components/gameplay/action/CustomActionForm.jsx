import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TaggableInput from './TaggableInput';
import { looksLikeQuickBeat } from '../../../services/quickBeatDetector';

export default function CustomActionForm({
  customAction,
  onTypingChange,
  onSubmit,
  onSoloSubmit,
  onQuickBeatSubmit = null,
  quickBeatAvailable = false,
  quickBeatStreak = 0,
  quickBeatLimit = 5,
  isQuickBeatLocked = false,
  isQuickBeatPending = false,
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
  inputRef: externalInputRef,
}) {
  const { t } = useTranslation();
  const internalInputRef = useRef(null);
  const inputRef = externalInputRef || internalInputRef;
  const [inputFocused, setInputFocused] = useState(false);

  const isAutoTyping = !!autoPlayerTypingText;
  const displayValue = isAutoTyping
    ? autoPlayerTypingText
    : customAction + (interim ? (customAction ? ' ' : '') + interim : '');

  const handleInputChange = useCallback((text, tags) => {
    if (!isAutoTyping) {
      onTypingChange(text, tags);
    }
  }, [isAutoTyping, onTypingChange]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault?.();
    onSubmit(e || new Event('submit'));
  }, [onSubmit]);

  const handleEditorSubmit = useCallback(() => {
    onSubmit(new Event('submit'));
  }, [onSubmit]);

  const trimmedAction = (customAction || '').trim();
  const quickBeatHinted = useMemo(
    () => quickBeatAvailable && !isQuickBeatLocked && trimmedAction.length > 0 && looksLikeQuickBeat(trimmedAction),
    [quickBeatAvailable, isQuickBeatLocked, trimmedAction],
  );
  const quickBeatRemaining = Math.max(0, quickBeatLimit - quickBeatStreak);
  const handleQuickBeatClick = useCallback((e) => {
    e?.preventDefault?.();
    if (onQuickBeatSubmit) onQuickBeatSubmit();
  }, [onQuickBeatSubmit]);

  return (
    <form onSubmit={handleSubmit} className="flex-1 min-w-0">
      <div className="flex items-center gap-3">
        {dictation?.enabled && supported && !isAutoTyping && dictation.autoMode && (
          <div className="shrink-0 flex items-center rounded-full overflow-hidden border border-outline-variant/30 bg-surface-container-high/30">
            <button
              type="button"
              onClick={() => dictation.toggleListening?.()}
              disabled={disabled}
              title={dictation.pausedByTTS
                ? t('gameplay.dictationMutedByNarrator', { defaultValue: 'Narrator is speaking — mic muted' })
                : t('gameplay.dictationAutoTooltip', { defaultValue: 'Auto-detect mode (click to toggle mic)' })}
              aria-label="AUTO"
              aria-pressed={listening}
              className={`flex items-center gap-1 px-2 h-7 transition-all duration-200 disabled:opacity-30 ${
                dictation.pausedByTTS
                  ? 'text-sky-300 bg-sky-400/15'
                  : listening
                    ? (dictation.detectedMode === 'dialogue'
                        ? 'text-amber-200 bg-amber-400/25 mic-pulse'
                        : 'text-error-light bg-error/20 mic-pulse')
                    : 'text-primary bg-primary/10'
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {dictation.pausedByTTS
                  ? 'graphic_eq'
                  : dictation.detectedMode === 'dialogue'
                    ? 'format_quote'
                    : 'mic'}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">
                AUTO
              </span>
            </button>
            <button
              type="button"
              onClick={() => dictation.setAutoMode?.(false)}
              disabled={disabled}
              title={t('gameplay.dictationDisableAuto', { defaultValue: 'Switch to manual mode toggle' })}
              aria-label={t('gameplay.dictationDisableAuto', { defaultValue: 'Disable auto mode' })}
              className="flex items-center px-1.5 h-7 border-l border-outline-variant/30 text-on-surface-variant/50 hover:text-on-surface-variant transition-all duration-200 disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[14px]">tune</span>
            </button>
          </div>
        )}
        {dictation?.enabled && supported && !isAutoTyping && !dictation.autoMode && (
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
            <button
              type="button"
              onClick={() => dictation.setAutoMode?.(true)}
              disabled={disabled}
              title={t('gameplay.dictationEnableAuto', { defaultValue: 'Re-enable auto mode' })}
              aria-label={t('gameplay.dictationEnableAuto', { defaultValue: 'Enable auto mode' })}
              className="flex items-center px-1.5 h-7 border-l border-outline-variant/30 text-on-surface-variant/50 hover:text-primary transition-all duration-200 disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
            </button>
          </div>
        )}
        {isAutoTyping && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary animate-pulse">
            <span className="material-symbols-outlined text-sm">smart_toy</span>
          </span>
        )}
        <TaggableInput
          ref={inputRef}
          value={displayValue}
          onChange={handleInputChange}
          onSubmit={handleEditorSubmit}
          onQuickBeatSubmit={quickBeatAvailable && !isQuickBeatLocked ? handleQuickBeatClick : null}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          disabled={disabled && !isAutoTyping}
          readOnly={listening || isAutoTyping}
          autoPlayerTypingText={autoPlayerTypingText}
          placeholder={
            listening
              ? t('gameplay.voiceListening')
              : supported
                ? t('gameplay.customActionPlaceholderVoice')
                : t('gameplay.customActionPlaceholder')
          }
          className={`${
            isAutoTyping
              ? 'border-primary/60 text-primary shadow-[0_2px_8px_rgba(197,154,255,0.2)]'
              : listening
                ? 'border-primary/60 shadow-[0_2px_8px_rgba(197,154,255,0.15)] text-on-surface'
                : 'border-outline-variant/20 focus:border-primary/50 focus:shadow-[0_2px_8px_rgba(197,154,255,0.1)] focus:bg-primary/[0.04]'
          }`}
        />
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
        {quickBeatAvailable && (
          <button
            type="button"
            data-testid="quick-beat-button"
            onClick={handleQuickBeatClick}
            disabled={!customAction.trim() || disabled || isQuickBeatLocked || isQuickBeatPending}
            title={isQuickBeatPending
              ? t('gameplay.quickBeatPending', { defaultValue: 'Mała akcja w toku…' })
              : isQuickBeatLocked
                ? t('gameplay.quickBeatLocked', { defaultValue: 'Limit małych akcji osiągnięty — wyślij pełną akcję' })
                : t('gameplay.quickBeatTooltip', { defaultValue: 'Mała akcja · Shift+Enter (drobny RP-beat, bez nowej sceny). Pozostało: {{remaining}}/{{limit}}', remaining: quickBeatRemaining, limit: quickBeatLimit })}
            className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-sm transition-all duration-300 disabled:cursor-not-allowed ${
              isQuickBeatPending
                ? 'text-amber-300 bg-amber-400/20 border border-amber-400/40 animate-pulse'
                : quickBeatHinted
                  ? 'text-amber-200 bg-amber-400/15 border border-amber-400/30 shadow-[0_0_8px_rgba(251,191,36,0.15)]'
                  : 'text-on-surface-variant/70 hover:text-amber-200 hover:bg-amber-400/10 border border-outline-variant/20'
            } ${!isQuickBeatPending ? 'disabled:opacity-30' : ''}`}
          >
            <span className={`material-symbols-outlined text-[18px] ${isQuickBeatPending ? 'animate-spin' : ''}`}>
              {isQuickBeatPending ? 'progress_activity' : 'flash_on'}
            </span>
          </button>
        )}
        <button
          data-testid="submit-action"
          type="submit"
          disabled={!customAction.trim() || disabled}
          className={`shrink-0 text-primary hover:text-on-surface transition-all duration-300 flex items-center justify-center w-11 h-11 rounded-sm hover:bg-primary/10 disabled:opacity-30 ${
            inputFocused && !disabled ? 'bg-primary/[0.07] shadow-[0_0_10px_rgba(197,154,255,0.1)]' : ''
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">send</span>
        </button>
      </div>
      {quickBeatAvailable && isQuickBeatPending && (
        <span className="text-[10px] font-label uppercase tracking-widest text-amber-300/80 animate-pulse mt-1 block">
          {t('gameplay.quickBeatPending', { defaultValue: 'Mała akcja w toku…' })}
        </span>
      )}
      {quickBeatAvailable && quickBeatHinted && !isQuickBeatLocked && !isQuickBeatPending && (
        <span className="text-[10px] font-label uppercase tracking-widest text-amber-200/80 mt-1 block">
          {t('gameplay.quickBeatHint', { defaultValue: 'Wygląda na małą akcję — kliknij ⚡ lub Shift+Enter' })}
        </span>
      )}
      {quickBeatAvailable && isQuickBeatLocked && (
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60 mt-1 block">
          {t('gameplay.quickBeatLockedHint', { defaultValue: 'Limit małych akcji osiągnięty — następna akcja musi być pełną sceną' })}
        </span>
      )}
      {dictation?.pausedByTTS && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-sky-300/70 mt-1 block">
          {t('gameplay.dictationMutedByNarrator', { defaultValue: 'Narrator speaking — mic muted' })}
        </span>
      )}
      {listening && !dictation?.pausedByTTS && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 animate-pulse mt-1 block">
          {t('gameplay.voiceListening')}
          {dictation?.autoMode && dictation?.detectedMode && (
            <span className="ml-1.5 text-on-surface-variant/60">
              · {dictation.detectedMode === 'dialogue'
                ? t('gameplay.dictationModeDialogue')
                : t('gameplay.dictationModeAction')}
            </span>
          )}
        </span>
      )}
    </form>
  );
}
