import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import LanguageSection from './sections/LanguageSection';
import NarrativeAnchorsSection from './sections/NarrativeAnchorsSection';
import NarratorStyleSection from './sections/NarratorStyleSection';

export default function DMSettingsPage({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const {
    settings,
    updateSettings,
    updateDMSettings,
    resetSettings,
  } = useSettings();

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
              <section className="space-y-6 animate-fade-in">
                <LanguageSection
                  language={settings.language}
                  onChange={(language) => updateSettings({ language })}
                />

                <NarrativeAnchorsSection
                  dmSettings={settings.dmSettings}
                  updateDMSettings={updateDMSettings}
                />
              </section>

              <section className="space-y-6 animate-fade-in">
                <NarratorStyleSection
                  dmSettings={settings.dmSettings}
                  updateDMSettings={updateDMSettings}
                />
              </section>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8 animate-fade-in">
              <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
                <div>
                  <p className="font-headline text-tertiary">{t('settings.canvasEffects')}</p>
                  <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                    {t('settings.canvasEffectsDesc')}
                  </p>
                </div>
                <Toggle
                  checked={settings.canvasEffectsEnabled !== false}
                  onClick={() => updateSettings({ canvasEffectsEnabled: !settings.canvasEffectsEnabled })}
                />
              </div>

              <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
                <div>
                  <p className="font-headline text-tertiary">{t('settings.itemImages')}</p>
                  <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                    {t('settings.itemImagesDesc')}
                  </p>
                </div>
                <Toggle
                  checked={settings.itemImagesEnabled !== false}
                  onClick={() => updateSettings({ itemImagesEnabled: !(settings.itemImagesEnabled !== false) })}
                />
              </div>

              <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
                <div>
                  <p className="font-headline text-tertiary">{t('settings.needsSystem')}</p>
                  <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                    {t('settings.needsSystemDesc')}
                  </p>
                </div>
                <Toggle
                  checked={!!settings.needsSystemEnabled}
                  onClick={() => updateSettings({ needsSystemEnabled: !settings.needsSystemEnabled })}
                />
              </div>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-outline-variant/15 bg-surface-container-highest/80 backdrop-blur-xl px-6 lg:px-12 py-4 flex justify-end">
          <Button variant="ghost" onClick={resetSettings}>
            {t('settings.resetGrimoire')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
