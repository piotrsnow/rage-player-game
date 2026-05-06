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
import Toggle from '../ui/Toggle';

const TTS_PROVIDERS = [
  { id: 'elevenlabs', icon: 'cloud', label: 'ElevenLabs' },
  { id: 'xtts', icon: 'computer', label: 'XTTS (local)' },
];

export default function AudioConfigModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const {
    settings, updateSettings, hasApiKey, backendUser,
    globalVoiceConfig, updateGlobalVoiceConfig,
  } = useSettings();
  const dispatch = useGameDispatch();

  const ttsProvider = settings.ttsProvider || 'elevenlabs';
  const isAdmin = !!backendUser?.isAdmin;

  const providerVoices = globalVoiceConfig[ttsProvider] || {};

  const handleSwitchProvider = (newProvider) => {
    if (newProvider === ttsProvider) return;
    updateSettings({ ttsProvider: newProvider });
    dispatch({
      type: 'SWITCH_CHARACTER_VOICE_PROVIDER',
      payload: {
        oldProvider: ttsProvider,
        newProvider,
        maleVoices: globalVoiceConfig[newProvider]?.maleVoices || [],
        femaleVoices: globalVoiceConfig[newProvider]?.femaleVoices || [],
        narratorVoiceId: globalVoiceConfig[newProvider]?.narratorVoiceId || null,
      },
    });
  };

  const el = useElevenlabsVoices({ language: settings.language });
  const xt = useXttsVoices({ language: settings.language });

  useEffect(() => {
    if (!isAdmin) return;
    if (ttsProvider === 'elevenlabs' && hasApiKey('elevenlabs') && el.voices.length === 0 && !el.loadingVoices) {
      el.loadVoices();
    } else if (ttsProvider === 'xtts' && hasApiKey('xtts') && xt.voices.length === 0 && !xt.loadingVoices) {
      xt.loadVoices();
    }
  }, [ttsProvider, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectNarratorVoice = (voice) => {
    updateGlobalVoiceConfig(ttsProvider, {
      narratorVoiceId: voice.voiceId,
      narratorVoiceName: voice.name,
      maleVoices: providerVoices.maleVoices || [],
      femaleVoices: providerVoices.femaleVoices || [],
    });
  };

  const handleToggleGenderPool = (voice, gender) => {
    const key = gender === 'female' ? 'femaleVoices' : 'maleVoices';
    const current = providerVoices[key] || [];
    const exists = current.some((v) => v.voiceId === voice.voiceId);
    const updated = exists
      ? current.filter((v) => v.voiceId !== voice.voiceId)
      : [...current, { voiceId: voice.voiceId, voiceName: voice.name }];

    updateGlobalVoiceConfig(ttsProvider, {
      narratorVoiceId: providerVoices.narratorVoiceId || '',
      narratorVoiceName: providerVoices.narratorVoiceName || '',
      maleVoices: gender === 'male' ? updated : (providerVoices.maleVoices || []),
      femaleVoices: gender === 'female' ? updated : (providerVoices.femaleVoices || []),
    });
  };

  const handleTestVoice = (voiceIdOverride) => {
    const voiceId = voiceIdOverride || providerVoices.narratorVoiceId;
    if (!voiceId || !hasApiKey('elevenlabs')) return;
    el.testVoice(voiceId);
  };

  const handleXttsTestVoice = (voiceIdOverride) => {
    const voiceId = voiceIdOverride || providerVoices.narratorVoiceId;
    if (!voiceId || !hasApiKey('xtts')) return;
    xt.testVoice(voiceId);
  };

  const voiceSettingsForSection = {
    narratorVoiceId: providerVoices.narratorVoiceId || '',
    narratorVoiceName: providerVoices.narratorVoiceName || '',
    maleVoices: providerVoices.maleVoices || [],
    femaleVoices: providerVoices.femaleVoices || [],
    narratorEnabled: settings.narratorEnabled,
    narratorAutoPlay: settings.narratorAutoPlay,
    dialogueSpeed: settings.dialogueSpeed,
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
        className={`relative w-full max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in ${isAdmin ? 'max-w-6xl' : 'max-w-3xl'}`}
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
          <div className={`mx-auto px-6 lg:px-10 py-8 ${isAdmin ? 'max-w-6xl' : 'max-w-3xl'}`}>
            <header className="mb-8 animate-fade-in">
              <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
                {t('settings.audioSubtitle')}
              </p>
            </header>

            {isAdmin ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                <div className="space-y-6">
                  <div className="relative bg-surface-container-highest/50 rounded-sm ring-1 ring-outline-variant/10">
                    <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] text-on-surface-variant/60 font-label uppercase tracking-widest">
                      <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                      Admin
                    </div>
                    <div className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm">
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
                  </div>

                  <div className="relative bg-surface-container-highest/50 rounded-sm ring-1 ring-outline-variant/10">
                    <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] text-on-surface-variant/60 font-label uppercase tracking-widest z-10">
                      <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                      Admin
                    </div>
                    {ttsProvider === 'elevenlabs' && (
                      <NarratorVoicesSection
                        settings={voiceSettingsForSection}
                        updateSettings={updateSettings}
                        backendUser={backendUser}
                        hasApiKey={hasApiKey}
                        voices={el.voices}
                        loadingVoices={el.loadingVoices}
                        voiceError={el.voiceError}
                        testingVoice={el.testingVoice}
                        onLoadVoices={() => hasApiKey('elevenlabs') && el.loadVoices()}
                        onSelectNarratorVoice={handleSelectNarratorVoice}
                        onToggleGenderPool={handleToggleGenderPool}
                        onTestVoice={handleTestVoice}
                      />
                    )}
                    {ttsProvider === 'xtts' && (
                      <XttsVoicesSection
                        settings={voiceSettingsForSection}
                        updateSettings={updateSettings}
                        hasApiKey={hasApiKey}
                        voices={xt.voices}
                        loadingVoices={xt.loadingVoices}
                        voiceError={xt.voiceError}
                        testingVoice={xt.testingVoice}
                        onLoadVoices={() => hasApiKey('xtts') && xt.loadVoices()}
                        onSelectNarratorVoice={handleSelectNarratorVoice}
                        onToggleGenderPool={handleToggleGenderPool}
                        onTestVoice={handleXttsTestVoice}
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <SfxSection settings={settings} updateSettings={updateSettings} />
                  <MusicSection settings={settings} updateSettings={updateSettings} />
                </div>
              </div>
            ) : (
              <section className="space-y-6 animate-fade-in">
                <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
                  <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-dim">record_voice_over</span>
                    {t('settings.narrator')}
                  </h2>
                  <div className="space-y-4 mt-4">
                    <div className="flex items-center justify-between p-4 bg-surface-container-high/40 rounded-sm border-b border-outline-variant/15">
                      <p className="font-headline text-tertiary text-sm">{t('settings.narratorEnabled')}</p>
                      <Toggle
                        checked={!!settings.narratorEnabled}
                        onClick={() => updateSettings({ narratorEnabled: !settings.narratorEnabled })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-surface-container-high/40 rounded-sm border-b border-outline-variant/15">
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
                  </div>
                </div>

                <SfxSection settings={settings} updateSettings={updateSettings} />
                <MusicSection settings={settings} updateSettings={updateSettings} />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
