import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import AiProviderSection from './keys/AiProviderSection';
import ApiKeysStatusPanel from './keys/ApiKeysStatusPanel';
import ModelOverridesSection from './keys/ModelOverridesSection';
import LLMTimeoutSection from './sections/LLMTimeoutSection';

const TABS = [
  { id: 'keys', icon: 'vpn_key', labelKey: 'keys.tabKeys' },
  { id: 'models', icon: 'tune', labelKey: 'keys.tabModels' },
];

export default function KeysModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, updateDMSettings, backendKeys, backendUser } = useSettings();
  const [activeTab, setActiveTab] = useState('keys');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('keys.title')} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-4xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">settings</span>
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

        {backendUser?.isAdmin && (
          <div className="flex gap-1 px-6 pt-3 shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-label tracking-wide rounded-t-sm border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-surface-container-high/40'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto custom-scrollbar flex-1">
          <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
            {activeTab === 'keys' && (
              <>
                <header className="mb-8 animate-fade-in">
                  <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
                    {t('keys.subtitle')}
                  </p>
                </header>

                <section className="animate-fade-in mb-8">
                  <ApiKeysStatusPanel backendKeys={backendKeys} />
                </section>

                {backendUser?.isAdmin && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                    <div className="space-y-6">
                      <AiProviderSection settings={settings} updateSettings={updateSettings} backendKeys={backendKeys} />

                    </div>

                    <div>
                      <LLMTimeoutSection dmSettings={settings.dmSettings} updateDMSettings={updateDMSettings} />
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'models' && backendUser?.isAdmin && (
              <section className="animate-fade-in">
                <ModelOverridesSection />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
