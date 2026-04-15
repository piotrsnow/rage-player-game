import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useElevenlabsVoices } from '../../hooks/useElevenlabsVoices';
import { useMediaCacheStats } from '../../hooks/useMediaCacheStats';
import { useConfigImportExport } from '../../hooks/useConfigImportExport';
import Button from '../ui/Button';
import LanguageSection from './sections/LanguageSection';
import BackendServerSection from './sections/BackendServerSection';
import ConfigBackupSection from './sections/ConfigBackupSection';
import NarrativeAnchorsSection from './sections/NarrativeAnchorsSection';
import NarratorStyleSection from './sections/NarratorStyleSection';
import SceneVisualizationSection from './sections/SceneVisualizationSection';
import EffectIntensitySection from './sections/EffectIntensitySection';
import LLMTimeoutSection from './sections/LLMTimeoutSection';
import NarratorVoicesSection from './sections/NarratorVoicesSection';
import { SfxSection, MusicSection } from './sections/AudioSections';

export default function DMSettingsPage({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const {
    settings,
    updateSettings,
    updateDMSettings,
    resetSettings,
    importSettings,
    loadFromAccount,
    hasApiKey,
    backendUser,
    backendAuthChecking,
    backendLogout,
  } = useSettings();

  const {
    voices,
    loadingVoices,
    voiceError,
    testingVoice,
    loadVoices,
    clearVoices,
    testVoice,
  } = useElevenlabsVoices({ language: settings.language });

  const { cacheStats } = useMediaCacheStats({
    useBackend: settings.useBackend,
    backendUrl: settings.backendUrl,
  });

  const { fileInputRef, importStatus, exportConfig, importConfig } = useConfigImportExport({
    importSettings,
  });

  const handleReset = () => {
    resetSettings();
    clearVoices();
  };

  const handleLoadVoices = () => {
    if (!hasApiKey('elevenlabs')) return;
    return loadVoices();
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
    testVoice(voiceId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.title')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-7xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">settings</span>
            {t('settings.title')}
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
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
            <header className="mb-12 animate-fade-in">
              <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
                {t('settings.subtitle')}
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: DM & Gameplay Settings */}
              <section className="space-y-6 animate-fade-in">
                <LanguageSection
                  language={settings.language}
                  onChange={(language) => updateSettings({ language })}
                />

                <NarrativeAnchorsSection
                  dmSettings={settings.dmSettings}
                  updateDMSettings={updateDMSettings}
                />

                <NarratorStyleSection
                  dmSettings={settings.dmSettings}
                  updateDMSettings={updateDMSettings}
                />

                <SceneVisualizationSection
                  settings={settings}
                  updateSettings={updateSettings}
                  updateDMSettings={updateDMSettings}
                />

                <EffectIntensitySection
                  settings={settings}
                  updateSettings={updateSettings}
                />

                <LLMTimeoutSection
                  dmSettings={settings.dmSettings}
                  updateDMSettings={updateDMSettings}
                />
              </section>

              {/* Right Column: Media & Backend Settings */}
              <section className="space-y-6 animate-fade-in">
                <NarratorVoicesSection
                  settings={settings}
                  updateSettings={updateSettings}
                  backendUser={backendUser}
                  hasApiKey={hasApiKey}
                  voices={voices}
                  loadingVoices={loadingVoices}
                  voiceError={voiceError}
                  testingVoice={testingVoice}
                  onLoadVoices={handleLoadVoices}
                  onSelectNarratorVoice={handleSelectNarratorVoice}
                  onToggleGenderPool={handleToggleGenderPool}
                  onTestVoice={handleTestVoice}
                />

                <SfxSection settings={settings} updateSettings={updateSettings} />

                <MusicSection settings={settings} updateSettings={updateSettings} />

                <BackendServerSection
                  backendAuthChecking={backendAuthChecking}
                  backendUser={backendUser}
                  backendLogout={backendLogout}
                  cacheStats={cacheStats}
                />

                <ConfigBackupSection
                  fileInputRef={fileInputRef}
                  importStatus={importStatus}
                  onExport={exportConfig}
                  onImport={importConfig}
                />
              </section>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-outline-variant/15 bg-surface-container-highest/80 backdrop-blur-xl px-6 lg:px-12 py-4 flex justify-end">
          <Button variant="ghost" onClick={handleReset}>
            {t('settings.resetGrimoire')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
