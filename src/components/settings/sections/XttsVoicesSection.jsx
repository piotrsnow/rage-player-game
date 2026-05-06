import { useTranslation } from 'react-i18next';
import Slider from '../../ui/Slider';
import Toggle from '../../ui/Toggle';

const tagBase =
  'inline-flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shrink-0';

export default function XttsVoicesSection({
  settings,
  updateSettings,
  hasApiKey,
  voices,
  loadingVoices,
  voiceError,
  testingVoice,
  onLoadVoices,
  onSelectNarratorVoice,
  onToggleGenderPool,
  onTestVoice,
}) {
  const { t } = useTranslation();

  const isNarratorVoice = (voiceId) => settings.narratorVoiceId === voiceId;
  const isInPool = (voiceId, gender) => {
    const key = gender === 'female' ? 'femaleVoices' : 'maleVoices';
    return (settings[key] || []).some((v) => v.voiceId === voiceId);
  };

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
      <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">record_voice_over</span>
        {t('settings.xttsTitle')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-6">{t('settings.xttsDesc')}</p>

      <div className="flex items-center justify-between mb-6 p-4 bg-surface-container-high/40 rounded-sm border-b border-outline-variant/15">
        <div>
          <p className="font-headline text-tertiary text-sm">{t('settings.narratorEnabled')}</p>
        </div>
        <Toggle
          checked={!!settings.narratorEnabled}
          onClick={() => updateSettings({ narratorEnabled: !settings.narratorEnabled })}
        />
      </div>

      <div className="flex items-center justify-between mb-6 p-4 bg-surface-container-high/40 rounded-sm border-b border-outline-variant/15">
        <div>
          <p className="font-headline text-tertiary text-sm">{t('settings.narratorAutoPlay')}</p>
          <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
            {t('settings.narratorAutoPlayDesc')}
          </p>
        </div>
        <Toggle
          checked={!!settings.narratorAutoPlay}
          onClick={() => updateSettings({ narratorAutoPlay: !settings.narratorAutoPlay })}
        />
      </div>

      <Slider
        label={t('settings.dialogueSpeed')}
        description={t('settings.dialogueSpeedDesc')}
        min={50}
        max={200}
        value={settings.dialogueSpeed ?? 100}
        onChange={(v) => updateSettings({ dialogueSpeed: v })}
        displayValue={`${((settings.dialogueSpeed ?? 100) / 100).toFixed(1)}x`}
      />

      <div className="mb-6">
        <button
          onClick={onLoadVoices}
          disabled={!hasApiKey('xtts') || loadingVoices}
          className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:text-tertiary transition-colors disabled:opacity-30"
        >
          {loadingVoices ? t('settings.loadingVoices') : t('settings.loadVoices')}
        </button>
        {!hasApiKey('xtts') && (
          <p className="text-[10px] text-on-surface-variant mt-2">{t('settings.configureXtts')}</p>
        )}
        {voiceError && <p className="text-error text-xs mt-2">{voiceError}</p>}
      </div>

      {voices.length > 0 && (
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
              {t('settings.narratorVoice', 'Narrator')}
            </label>
            <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto custom-scrollbar pr-1 pb-0.5">
              {voices.map((voice) => {
                const isNarrator = isNarratorVoice(voice.voiceId);
                return (
                  <span key={voice.voiceId} className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onSelectNarratorVoice(voice)}
                      title={voice.name}
                      className={`${tagBase} min-w-0 truncate ${
                        isNarrator
                          ? 'border-primary/35 bg-primary/10 text-primary shadow-[0_0_12px_rgba(197,154,255,0.12)]'
                          : 'border-outline-variant/25 bg-surface-container-high/50 text-on-surface-variant hover:border-primary/25 hover:text-tertiary'
                      }`}
                    >
                      <span className="shrink-0 opacity-70">{voice.gender === 'female' ? '♀' : '♂'}</span>
                      <span className="truncate">{voice.name}</span>
                    </button>
                    {isNarrator && (
                      <button
                        type="button"
                        onClick={() => onTestVoice(voice.voiceId)}
                        disabled={testingVoice}
                        title={t('settings.testVoice')}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-base leading-none">play_arrow</span>
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
              {t('settings.maleVoices', 'Male NPC voices')} ({(settings.maleVoices || []).length})
            </label>
            <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto custom-scrollbar pr-1 pb-0.5">
              {voices.map((voice) => {
                const checked = isInPool(voice.voiceId, 'male');
                return (
                  <button
                    key={voice.voiceId}
                    type="button"
                    onClick={() => onToggleGenderPool(voice, 'male')}
                    title={voice.name}
                    className={`${tagBase} ${
                      checked
                        ? 'border-blue-400/45 bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/20'
                        : 'border-outline-variant/25 bg-surface-container-high/50 text-on-surface-variant hover:border-blue-400/35'
                    }`}
                  >
                    <span className="shrink-0 opacity-70">{voice.gender === 'female' ? '♀' : '♂'}</span>
                    <span className="truncate max-w-[11rem]">{voice.name}</span>
                    {checked && (
                      <span className="material-symbols-outlined text-[14px] shrink-0 leading-none text-blue-300">
                        check
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
              {t('settings.femaleVoices', 'Female NPC voices')} ({(settings.femaleVoices || []).length})
            </label>
            <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto custom-scrollbar pr-1 pb-0.5">
              {voices.map((voice) => {
                const checked = isInPool(voice.voiceId, 'female');
                return (
                  <button
                    key={voice.voiceId}
                    type="button"
                    onClick={() => onToggleGenderPool(voice, 'female')}
                    title={voice.name}
                    className={`${tagBase} ${
                      checked
                        ? 'border-pink-400/45 bg-pink-500/15 text-pink-100 ring-1 ring-pink-400/20'
                        : 'border-outline-variant/25 bg-surface-container-high/50 text-on-surface-variant hover:border-pink-400/35'
                    }`}
                  >
                    <span className="shrink-0 opacity-70">{voice.gender === 'female' ? '♀' : '♂'}</span>
                    <span className="truncate max-w-[11rem]">{voice.name}</span>
                    {checked && (
                      <span className="material-symbols-outlined text-[14px] shrink-0 leading-none text-pink-300">
                        check
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
