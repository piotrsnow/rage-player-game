import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { apiClient } from '../../services/apiClient';
import { useModalA11y } from '../../hooks/useModalA11y';
import { AI_MODELS } from '../../services/ai';
import Button from '../ui/Button';
import AiProviderSection from './keys/AiProviderSection';
import ImageProviderSection from './keys/ImageProviderSection';
import LocalLLMSection from './keys/LocalLLMSection';
import ApiKeysPanel from './keys/ApiKeysPanel';

export default function KeysModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, hasApiKey, backendKeys, fetchBackendKeys } = useSettings();

  const [localKeys, setLocalKeys] = useState({
    openaiApiKey: settings.openaiApiKey,
    anthropicApiKey: settings.anthropicApiKey,
    stabilityApiKey: settings.stabilityApiKey,
    geminiApiKey: settings.geminiApiKey,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalKeys({
      openaiApiKey: settings.openaiApiKey,
      anthropicApiKey: settings.anthropicApiKey,
      stabilityApiKey: settings.stabilityApiKey,
      geminiApiKey: settings.geminiApiKey,
    });
  }, [settings.openaiApiKey, settings.anthropicApiKey, settings.stabilityApiKey, settings.geminiApiKey]);

  const handleApply = async () => {
    updateSettings({
      openaiApiKey: localKeys.openaiApiKey,
      anthropicApiKey: localKeys.anthropicApiKey,
      stabilityApiKey: localKeys.stabilityApiKey,
      geminiApiKey: localKeys.geminiApiKey,
      elevenlabsApiKey: '',
    });

    if (apiClient.isConnected()) {
      try {
        await apiClient.put('/auth/settings', {
          apiKeys: {
            openai: localKeys.openaiApiKey || '',
            anthropic: localKeys.anthropicApiKey || '',
            stability: localKeys.stabilityApiKey || '',
            gemini: localKeys.geminiApiKey || '',
          },
        });
        fetchBackendKeys();
      } catch {
        // local save still succeeds
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('keys.title')} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-5xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">vpn_key</span>
            {t('keys.title')}
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
          <div className="max-w-5xl mx-auto px-6 lg:px-12 py-8">
            <header className="mb-8 animate-fade-in">
              <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
                {t('keys.subtitle')}
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="space-y-6 animate-fade-in">
                <AiProviderSection settings={settings} updateSettings={updateSettings} />
                {(settings.sceneVisualization || 'image') === 'image' && (
                  <ImageProviderSection
                    settings={settings}
                    updateSettings={updateSettings}
                    localKeys={localKeys}
                    setLocalKeys={setLocalKeys}
                    backendKeys={backendKeys}
                  />
                )}
                <LocalLLMSection settings={settings} updateSettings={updateSettings} />
              </section>

              <section className="space-y-6 animate-fade-in">
                <ApiKeysPanel
                  localKeys={localKeys}
                  setLocalKeys={setLocalKeys}
                  backendKeys={backendKeys}
                />

                <div className="bg-surface-container-highest/60 backdrop-blur-md p-6 rounded-sm border-r border-tertiary/10">
                  <div className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-tertiary mt-1">info</span>
                    <div>
                      <h3 className="font-headline text-tertiary text-sm mb-2">{t('settings.apiKeysTitle')}</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {t('settings.apiKeysDescription')}
                      </p>
                      <p className="text-xs text-on-surface-variant leading-relaxed mt-3">
                        {t('settings.elevenlabsServerOnly')}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-outline-variant/15 bg-surface-container-highest/80 backdrop-blur-xl px-6 lg:px-12 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-8 items-center">
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.activeProvider')}
              </p>
              <p className="font-headline text-tertiary">
                {settings.aiProvider === 'openai' ? t('settings.openaiProvider') : t('settings.anthropicProvider')}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-outline-variant/20 hidden md:block" />
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.modelTier')}
              </p>
              <p className="font-headline text-tertiary">
                {settings.aiModel
                  ? (AI_MODELS.find((m) => m.id === settings.aiModel)?.label || settings.aiModel)
                  : t('settings.modelRecommended')}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-outline-variant/20 hidden md:block" />
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.status')}
              </p>
              <p className={`font-headline ${(hasApiKey('openai') || hasApiKey('anthropic')) ? 'text-primary' : 'text-error'}`}>
                {(hasApiKey('openai') || hasApiKey('anthropic'))
                  ? (!(localKeys.openaiApiKey || localKeys.anthropicApiKey) && apiClient.isConnected()
                    ? t('settings.serverKeyActive')
                    : t('settings.keyConfigured'))
                  : t('settings.noKeySet')}
              </p>
            </div>
          </div>
          <Button onClick={handleApply} className="w-full md:w-auto">
            {saved ? t('settings.saved') : t('settings.applyChanges')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
