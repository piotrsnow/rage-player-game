import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import TaggableInput from './TaggableInput';

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
  inputRef: externalInputRef,
  spellOptions = [],
  mana = null,
}) {
  const { t } = useTranslation();
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);
  const internalInputRef = useRef(null);
  const inputRef = externalInputRef || internalInputRef;

  const isAutoTyping = !!autoPlayerTypingText;
  const displayValue = isAutoTyping
    ? autoPlayerTypingText
    : customAction + (interim ? (customAction ? ' ' : '') + interim : '');

  useEffect(() => {
    if (spellOptions.length === 0 || disabled || isAutoTyping) {
      setSpellPickerOpen(false);
    }
  }, [spellOptions.length, disabled, isAutoTyping]);

  const handleSpellSelect = useCallback((spell) => {
    const tag = {
      kind: 'spell',
      id: `${spell.treeId}/${spell.name}`,
      name: spell.name,
      meta: { tree: spell.treeName, manaCost: spell.manaCost },
    };
    inputRef.current?.insertTag(tag);
    setSpellPickerOpen(false);
    inputRef.current?.focus();
  }, [inputRef]);

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

  return (
    <form onSubmit={handleSubmit} className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
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
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSpellPickerOpen((v) => !v)}
            disabled={disabled || isAutoTyping || listening || spellOptions.length === 0}
            title={spellOptions.length > 0
              ? t('magic.pickSpell', 'Wybierz zaklecie')
              : t('magic.noSpells', 'Brak znanych zakleć')}
            aria-label={t('magic.pickSpell', 'Wybierz zaklecie')}
            aria-expanded={spellPickerOpen}
            className="flex items-center justify-center w-8 h-8 rounded-sm border border-tertiary/20 bg-tertiary/10 text-tertiary hover:bg-tertiary/20 hover:text-on-surface transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-lg">auto_awesome</span>
          </button>

          {spellPickerOpen && (
            <div className="absolute left-0 bottom-full mb-2 w-72 max-h-80 overflow-y-auto custom-scrollbar rounded-sm border border-tertiary/20 bg-surface-container-highest/95 backdrop-blur-xl shadow-2xl z-40 p-2">
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-outline-variant/10 mb-1">
                <span className="text-[10px] font-label uppercase tracking-widest text-tertiary">
                  {t('magic.spells', 'Zaklecia')}
                </span>
                {mana && (
                  <span className="text-[10px] text-on-surface-variant tabular-nums">
                    {mana.current}/{mana.max} mana
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {spellOptions.map((spell) => {
                  const hasEnoughMana = !mana || mana.current >= spell.manaCost;
                  return (
                    <button
                      key={spell.name}
                      type="button"
                      onClick={() => handleSpellSelect(spell)}
                      className={`w-full text-left flex items-start gap-2 px-2 py-2 rounded-sm border transition-colors ${
                        hasEnoughMana
                          ? 'border-transparent hover:border-tertiary/25 hover:bg-tertiary/10'
                          : 'border-transparent opacity-60 hover:bg-surface-container-high/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-tertiary text-lg mt-0.5 shrink-0">
                        {spell.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-on-surface truncate">{spell.name}</span>
                          <span className="text-[10px] text-on-surface-variant tabular-nums shrink-0">
                            {spell.manaCost} many
                          </span>
                        </span>
                        <span className="block text-[10px] text-on-surface-variant/75 leading-tight line-clamp-2">
                          {spell.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <TaggableInput
          ref={inputRef}
          value={displayValue}
          onChange={handleInputChange}
          onSubmit={handleEditorSubmit}
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
          className={
            isAutoTyping
              ? 'border-primary/60 text-primary shadow-[0_2px_8px_rgba(197,154,255,0.2)]'
              : listening
                ? 'border-primary/60 shadow-[0_2px_8px_rgba(197,154,255,0.15)] text-on-surface'
                : 'border-outline-variant/20 focus:border-primary/50 focus:shadow-[0_2px_8px_rgba(197,154,255,0.1)]'
          }
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
        <button
          data-testid="submit-action"
          type="submit"
          disabled={!customAction.trim() || disabled}
          className="shrink-0 text-primary hover:text-on-surface transition-all flex items-center justify-center w-8 h-8 rounded-sm hover:bg-primary/10 disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-lg">send</span>
        </button>
      </div>
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
