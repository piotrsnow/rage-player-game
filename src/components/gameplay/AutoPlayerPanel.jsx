import { useTranslation } from 'react-i18next';
import { AI_MODELS, RECOMMENDED_MODELS } from '../../services/ai';
import { useSettings } from '../../contexts/SettingsContext';

const STYLES = ['cautious', 'balanced', 'aggressive', 'chaotic'];
const VERBOSITY_LEVELS = ['low', 'medium', 'high'];

export default function AutoPlayerPanel({
  isAutoPlaying,
  isThinking,
  turnsPlayed,
  lastError,
  toggleAutoPlayer,
  autoPlayerSettings,
  updateAutoPlayerSettings,
  characterName,
  isGeneratingScene,
  onClose,
}) {
  const { settings } = useSettings();
  const { t } = useTranslation();

  const delaySeconds = Math.round((autoPlayerSettings.delay || 3000) / 1000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-surface-container-low border border-outline-variant/20 rounded-lg shadow-2xl animate-fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAutoPlayer}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                isAutoPlaying ? 'bg-primary' : 'bg-outline/30'
              }`}
              aria-label={t('autoPlayer.toggle')}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-on-primary transition-transform duration-200 ${
                  isAutoPlaying ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-xs font-headline uppercase tracking-widest text-on-surface">
              {t('autoPlayer.title')}
            </span>
            {isAutoPlaying && isThinking && (
              <span className="material-symbols-outlined text-sm text-primary animate-spin">progress_activity</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isAutoPlaying && (
              <span className="text-[10px] text-on-surface-variant">
                {isThinking ? (
                  <span className="flex items-center gap-1 text-primary">
                    {t('autoPlayer.thinking')}
                  </span>
                ) : isGeneratingScene ? (
                  <span className="flex items-center gap-1 text-tertiary">
                    <span className="material-symbols-outlined text-xs animate-pulse">auto_stories</span>
                    {t('autoPlayer.dmWorking')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-primary">smart_toy</span>
                    {characterName
                      ? t('autoPlayer.playingAs', { name: characterName })
                      : t('autoPlayer.active')}
                  </span>
                )}
              </span>
            )}

            {turnsPlayed > 0 && (
              <span className="text-[9px] text-outline tabular-nums">
                {turnsPlayed}{autoPlayerSettings.maxTurns > 0 ? `/${autoPlayerSettings.maxTurns}` : ''} {t('autoPlayer.turns')}
              </span>
            )}

            <button
              onClick={onClose}
              className="material-symbols-outlined text-sm text-outline hover:text-on-surface transition-colors"
              aria-label={t('common.close')}
            >
              close
            </button>
          </div>
        </div>

        {/* Error */}
        {lastError && (
          <div className="px-5 pt-3">
            <p className="text-[10px] text-error truncate">{lastError}</p>
          </div>
        )}

        {/* Settings */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Decision Variety */}
          <div className="flex items-start justify-between gap-3 rounded-sm border border-outline-variant/15 bg-surface-container-high/30 px-3 py-2">
            <div>
              <div className="text-[10px] text-on-surface font-label uppercase tracking-widest">
                {t('autoPlayer.decisionVariety', 'Decision variety')}
              </div>
              <div className="text-[10px] text-on-surface-variant mt-1">
                {t(
                  'autoPlayer.decisionVarietyHint',
                  'Avoid repeating similar choices in recent turns when alternatives exist.'
                )}
              </div>
            </div>
            <button
              onClick={() => updateAutoPlayerSettings({ decisionVariety: autoPlayerSettings.decisionVariety !== false ? false : true })}
              className={`relative mt-0.5 w-9 h-5 rounded-full transition-colors duration-200 ${
                autoPlayerSettings.decisionVariety !== false ? 'bg-primary' : 'bg-outline/30'
              }`}
              aria-label={t('autoPlayer.decisionVariety', 'Decision variety')}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-on-primary transition-transform duration-200 ${
                  autoPlayerSettings.decisionVariety !== false ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Play Style */}
          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
              {t('autoPlayer.style')}
            </label>
            <div className="flex gap-1">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => updateAutoPlayerSettings({ style: s })}
                  className={`flex-1 py-1.5 text-[10px] font-label uppercase tracking-wider rounded-sm border transition-all ${
                    autoPlayerSettings.style === s
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-outline-variant/15 text-on-surface-variant hover:border-primary/20 hover:text-primary'
                  }`}
                >
                  {t(`autoPlayer.style_${s}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Action Delay */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('autoPlayer.delay')}
              </label>
              <span className="text-[10px] text-primary font-bold tabular-nums">{delaySeconds}s</span>
            </div>
            <input
              type="range"
              min={1000}
              max={15000}
              step={1000}
              value={autoPlayerSettings.delay || 3000}
              onChange={(e) => updateAutoPlayerSettings({ delay: Number(e.target.value) })}
              className="w-full appearance-none mana-slider bg-transparent cursor-pointer"
            />
          </div>

          {/* Verbosity */}
          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
              {t('autoPlayer.verbosity')}
            </label>
            <div className="flex gap-1">
              {VERBOSITY_LEVELS.map((v) => (
                <button
                  key={v}
                  onClick={() => updateAutoPlayerSettings({ verbosity: v })}
                  className={`flex-1 py-1.5 text-[10px] font-label uppercase tracking-wider rounded-sm border transition-all ${
                    autoPlayerSettings.verbosity === v
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-outline-variant/15 text-on-surface-variant hover:border-primary/20 hover:text-primary'
                  }`}
                >
                  {t(`autoPlayer.verbosity_${v}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
              {t('autoPlayer.model')}
            </label>
            <div className="space-y-1">
              <button
                onClick={() => updateAutoPlayerSettings({ model: '' })}
                className={`w-full p-2 rounded-sm border text-left flex items-center gap-2 transition-all ${
                  !autoPlayerSettings.model
                    ? 'bg-surface-tint/10 border-primary/30 text-primary'
                    : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                }`}
              >
                <span className="material-symbols-outlined text-xs">auto_awesome</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-headline block">{t('autoPlayer.modelRecommended')}</span>
                  <span className="text-[9px] opacity-60 truncate block">
                    {AI_MODELS.find((m) => m.id === RECOMMENDED_MODELS[settings.aiProvider])?.label || RECOMMENDED_MODELS[settings.aiProvider]}
                  </span>
                </div>
                {!autoPlayerSettings.model && (
                  <span className="material-symbols-outlined text-primary text-xs">check_circle</span>
                )}
              </button>
              {AI_MODELS.filter((m) => m.provider === settings.aiProvider).map((m) => (
                <button
                  key={m.id}
                  onClick={() => updateAutoPlayerSettings({ model: m.id })}
                  className={`w-full p-2 rounded-sm border text-left flex items-center gap-2 transition-all ${
                    autoPlayerSettings.model === m.id
                      ? 'bg-surface-tint/10 border-primary/30 text-primary'
                      : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                  }`}
                >
                  <span className="material-symbols-outlined text-xs">{m.tier === 'premium' ? 'diamond' : 'bolt'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-headline block">{m.label}</span>
                    <span className="text-[9px] opacity-60 block">{m.cost}</span>
                  </div>
                  {autoPlayerSettings.model === m.id && (
                    <span className="material-symbols-outlined text-primary text-xs">check_circle</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Max Turns */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('autoPlayer.maxTurns')}
              </label>
              <span className="text-[10px] text-primary font-bold tabular-nums">
                {autoPlayerSettings.maxTurns > 0 ? autoPlayerSettings.maxTurns : '∞'}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={autoPlayerSettings.maxTurns || 0}
              onChange={(e) => updateAutoPlayerSettings({ maxTurns: Number(e.target.value) })}
              className="w-full appearance-none mana-slider bg-transparent cursor-pointer"
            />
          </div>

          {/* Custom Instructions */}
          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-1.5">
              {t('autoPlayer.customInstructions')}
            </label>
            <textarea
              value={autoPlayerSettings.customInstructions || ''}
              onChange={(e) => updateAutoPlayerSettings({ customInstructions: e.target.value })}
              placeholder={t('autoPlayer.customInstructionsPlaceholder')}
              rows={2}
              className="w-full bg-surface-container-high/40 border border-outline-variant/15 rounded-sm px-3 py-2 text-xs text-on-surface placeholder:text-outline/50 resize-none focus:outline-none focus:border-primary/30"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
