import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGameDispatch } from '../../stores/gameSelectors';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useElevenlabsVoices } from '../../hooks/useElevenlabsVoices';
import { useXttsVoices } from '../../hooks/useXttsVoices';
import NarratorVoicesSection from './sections/NarratorVoicesSection';
import XttsVoicesSection from './sections/XttsVoicesSection';
import { SfxSection, MusicSection } from './sections/AudioSections';

const TTS_PROVIDERS = [
  { id: 'elevenlabs', icon: 'cloud', label: 'ElevenLabs' },
  { id: 'xtts', icon: 'computer', label: 'XTTS (local)' },
];

export default function AudioConfigModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, hasApiKey, backendUser } = useSettings();
  const dispatch = useGameDispatch();

  const ttsProvider = settings.ttsProvider || 'elevenlabs';

  const handleSwitchProvider = (newProvider) => {
    if (newProvider === ttsProvider) return;
    const oldProvider = ttsProvider;
    const newPools = settings.voicesByProvider?.[newProvider] || {};
    updateSettings({ ttsProvider: newProvider });
    dispatch({
      type: 'SWITCH_CHARACTER_VOICE_PROVIDER',
      payload: {
        oldProvider,
        newProvider,
        maleVoices: newPools.maleVoices || [],
        femaleVoices: newPools.femaleVoices || [],
        narratorVoiceId: newPools.narratorVoiceId || null,
      },
    });
  };

  const el = useElevenlabsVoices({ language: settings.language });
  const xt = useXttsVoices({ language: settings.language });

  useEffect(() => {
    if (ttsProvider === 'elevenlabs' && hasApiKey('elevenlabs') && el.voices.length === 0 && !el.loadingVoices) {
      el.loadVoices();
    } else if (ttsProvider === 'xtts' && hasApiKey('xtts') && xt.voices.length === 0 && !xt.loadingVoices) {
      xt.loadVoices();
    }
  }, [ttsProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadVoices = () => {
    if (!hasApiKey('elevenlabs')) return;
    return el.loadVoices();
  };

  const handleSelectNarratorVoice = (voice) => {
    updateSettings({
      narratorVoiceId: voice.voiceId,
      narratorVoiceName: voice.name,
    });
  };

  const handleToggleGenderPool = (voice, gender) => {
    const key = gender === 'female' ? 'femaleVoices' : 'maleVoices';
    const current = settings[key] || [];
    const exists = current.some((v) => v.voiceId === voice.voiceId);
    if (exists) {
      updateSettings({ [key]: current.filter((v) => v.voiceId !== voice.voiceId) });
    } else {
      updateSettings({ [key]: [...current, { voiceId: voice.voiceId, voiceName: voice.name }] });
    }
  };

  const handleTestVoice = (voiceIdOverride) => {
    const voiceId = voiceIdOverride || settings.narratorVoiceId;
    if (!voiceId || !hasApiKey('elevenlabs')) return;
    el.testVoice(voiceId);
  };

  const handleLoadXttsVoices = () => {
    if (!hasApiKey('xtts')) return;
    return xt.loadVoices();
  };

  const handleXttsSelectNarrator = (voice) => {
    updateSettings({
      narratorVoiceId: voice.voiceId,
      narratorVoiceName: voice.name,
    });
  };

  const handleXttsToggleGenderPool = (voice, gender) => {
    const key = gender === 'female' ? 'femaleVoices' : 'maleVoices';
    const current = settings[key] || [];
    const exists = current.some((v) => v.voiceId === voice.voiceId);
    if (exists) {
      updateSettings({ [key]: current.filter((v) => v.voiceId !== voice.voiceId) });
    } else {
      updateSettings({ [key]: [...current, { voiceId: voice.voiceId, voiceName: voice.name }] });
    }
  };

  const handleXttsTestVoice = (voiceIdOverride) => {
    const voiceId = voiceIdOverride || settings.narratorVoiceId;
    if (!voiceId || !hasApiKey('xtts')) return;
    xt.testVoice(voiceId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.audioTitle')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-3xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">graphic_eq</span>
            {t('settings.audioTitle')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1">
          <div className="max-w-3xl mx-auto px-6 lg:px-10 py-8">
            <header className="mb-8 animate-fade-in">
              <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
                {t('settings.audioSubtitle')}
              </p>
            </header>

            <section className="space-y-6 animate-fade-in">
              <div className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm border-l border-tertiary/20">
                <p className="font-headline text-tertiary mb-3">{t('settings.ttsProvider')}</p>
                <div className="flex gap-2">
                  {TTS_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSwitchProvider(p.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border transition-all ${
                        ttsProvider === p.id
                          ? 'bg-surface-tint/10 border-primary/30 text-primary'
                          : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">{p.icon}</span>
                      <span className="font-headline text-xs">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {ttsProvider === 'elevenlabs' && (
                <NarratorVoicesSection
                  settings={settings}
                  updateSettings={updateSettings}
                  backendUser={backendUser}
                  hasApiKey={hasApiKey}
                  voices={el.voices}
                  loadingVoices={el.loadingVoices}
                  voiceError={el.voiceError}
                  testingVoice={el.testingVoice}
                  onLoadVoices={handleLoadVoices}
                  onSelectNarratorVoice={handleSelectNarratorVoice}
                  onToggleGenderPool={handleToggleGenderPool}
                  onTestVoice={handleTestVoice}
                />
              )}

              {ttsProvider === 'xtts' && (
                <XttsVoicesSection
                  settings={settings}
                  updateSettings={updateSettings}
                  hasApiKey={hasApiKey}
                  voices={xt.voices}
                  loadingVoices={xt.loadingVoices}
                  voiceError={xt.voiceError}
                  testingVoice={xt.testingVoice}
                  onLoadVoices={handleLoadXttsVoices}
                  onSelectNarratorVoice={handleXttsSelectNarrator}
                  onToggleGenderPool={handleXttsToggleGenderPool}
                  onTestVoice={handleXttsTestVoice}
                />
              )}

              <SfxSection settings={settings} updateSettings={updateSettings} />

              <MusicSection settings={settings} updateSettings={updateSettings} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
