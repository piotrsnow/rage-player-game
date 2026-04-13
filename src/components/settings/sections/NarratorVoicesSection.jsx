import { useTranslation } from 'react-i18next';
import Slider from '../../ui/Slider';
import Toggle from '../../ui/Toggle';

export default function NarratorVoicesSection({
  settings,
  updateSettings,
  backendUser,
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
        {t('settings.narrator')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-6">{t('settings.narratorDesc')}</p>
      {backendUser && (
        <div className="mb-6 rounded-sm border border-tertiary/20 bg-tertiary/5 px-4 py-3 text-xs text-tertiary">
          {t('settings.sharedVoiceSettingsHint')}
        </div>
      )}

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
          disabled={!hasApiKey('elevenlabs') || loadingVoices}
          className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:text-tertiary transition-colors disabled:opacity-30"
        >
          {loadingVoices ? t('settings.loadingVoices') : t('settings.loadVoices')}
        </button>
        {!hasApiKey('elevenlabs') && (
          <p className="text-[10px] text-on-surface-variant mt-2">{t('keys.configureElevenlabs')}</p>
        )}
        {voiceError && <p className="text-error text-xs mt-2">{voiceError}</p>}
      </div>

      {voices.length > 0 && (
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
              {t('settings.narratorVoice', 'Narrator')}
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar">
              {voices.map((voice) => {
                const isNarrator = isNarratorVoice(voice.voiceId);
                return (
                  <div
                    key={voice.voiceId}
                    className={`w-full rounded-sm border flex items-center justify-between transition-all ${
                      isNarrator
                        ? 'bg-surface-tint/10 border-primary/30 text-primary'
                        : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNarratorVoice(voice)}
                      className="flex-1 p-2 text-left font-headline text-sm"
                    >
                      {voice.name}
                    </button>
                    {isNarrator && (
                      <button
                        type="button"
                        onClick={() => onTestVoice(voice.voiceId)}
                        disabled={testingVoice}
                        className="flex items-center gap-1 px-2 py-1 mr-1 text-[10px] font-bold uppercase text-primary hover:text-tertiary disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-sm">play_arrow</span>
                        {t('settings.testVoice')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
              {t('settings.maleVoices', 'Male NPC voices')} ({(settings.maleVoices || []).length})
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar">
              {voices.map((voice) => {
                const checked = isInPool(voice.voiceId, 'male');
                return (
                  <button
                    key={voice.voiceId}
                    onClick={() => onToggleGenderPool(voice, 'male')}
                    className={`w-full p-2 rounded-sm border text-left flex items-center justify-between transition-all ${
                      checked
                        ? 'bg-blue-500/10 border-blue-400/40 text-blue-200'
                        : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-blue-400/30'
                    }`}
                  >
                    <span className="font-headline text-sm">♂ {voice.name}</span>
                    {checked && <span className="material-symbols-outlined text-sm">check</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
              {t('settings.femaleVoices', 'Female NPC voices')} ({(settings.femaleVoices || []).length})
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar">
              {voices.map((voice) => {
                const checked = isInPool(voice.voiceId, 'female');
                return (
                  <button
                    key={voice.voiceId}
                    onClick={() => onToggleGenderPool(voice, 'female')}
                    className={`w-full p-2 rounded-sm border text-left flex items-center justify-between transition-all ${
                      checked
                        ? 'bg-pink-500/10 border-pink-400/40 text-pink-200'
                        : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-pink-400/30'
                    }`}
                  >
                    <span className="font-headline text-sm">♀ {voice.name}</span>
                    {checked && <span className="material-symbols-outlined text-sm">check</span>}
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
