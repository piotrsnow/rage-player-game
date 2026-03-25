import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const STYLES = ['cautious', 'balanced', 'aggressive', 'chaotic'];
const VERBOSITY_LEVELS = ['low', 'medium', 'high'];
const MODEL_TIERS = ['standard', 'premium'];

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
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const delaySeconds = Math.round((autoPlayerSettings.delay || 3000) / 1000);

  return (
    <div className="bg-surface-container-low/60 backdrop-blur-md border border-outline-variant/15 rounded-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-2.5">
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
          <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            {t('autoPlayer.title')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Status */}
          {isAutoPlaying && (
            <span className="text-[10px] text-on-surface-variant">
              {isThinking ? (
                <span className="flex items-center gap-1 text-primary">
                  <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
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

          {/* Expand/collapse */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
            aria-label={expanded ? t('common.close') : t('autoPlayer.settings')}
          >
            {expanded ? 'expand_less' : 'tune'}
          </button>
        </div>
      </div>

      {/* Error */}
      {lastError && (
        <div className="px-4 pb-2">
          <p className="text-[10px] text-error truncate">{lastError}</p>
        </div>
      )}

      {/* Expanded Settings */}
      {expanded && (
        <div className="border-t border-outline-variant/10 px-4 py-3 space-y-4 animate-fade-in">
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

          {/* Model Tier */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('autoPlayer.modelTier')}
              </label>
              <span className="text-[9px] text-outline">{t('autoPlayer.modelTierHint')}</span>
            </div>
            <div className="flex gap-1">
              {MODEL_TIERS.map((tier) => (
                <button
                  key={tier}
                  onClick={() => updateAutoPlayerSettings({ modelTier: tier })}
                  className={`flex-1 py-1.5 text-[10px] font-label uppercase tracking-wider rounded-sm border transition-all ${
                    (autoPlayerSettings.modelTier || 'standard') === tier
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-outline-variant/15 text-on-surface-variant hover:border-primary/20 hover:text-primary'
                  }`}
                >
                  {t(`autoPlayer.modelTier_${tier}`)}
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
      )}
    </div>
  );
}
