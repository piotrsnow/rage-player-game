import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import ImageProviderSection from './keys/ImageProviderSection';
import SceneVisualizationSection from './sections/SceneVisualizationSection';
import ImagePromptLlmSection from './sections/ImagePromptLlmSection';
import ImagePlaygroundSection from './sections/ImagePlaygroundSection';
import EffectIntensitySection from './sections/EffectIntensitySection';

export default function ImageConfigModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, updateDMSettings, backendKeys, backendUser } = useSettings();
  const isAdmin = !!backendUser?.isAdmin;

  const showImageProvider = (settings.sceneVisualization || 'image') === 'image';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('imageConfig.title')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-5xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">brush</span>
            {t('imageConfig.title')}
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
                {t('imageConfig.subtitle')}
              </p>
            </header>

            <div className="space-y-6 animate-fade-in">
              <SceneVisualizationSection
                settings={settings}
                updateSettings={updateSettings}
                updateDMSettings={updateDMSettings}
              />

              {showImageProvider && isAdmin && (
                <div className="relative bg-surface-container-highest/50 rounded-sm ring-1 ring-outline-variant/10">
                  <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] text-on-surface-variant/60 font-label uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                    Admin
                  </div>
                  <ImageProviderSection
                    settings={settings}
                    updateSettings={updateSettings}
                    backendKeys={backendKeys}
                  />
                </div>
              )}

              {showImageProvider && (
                <ImagePromptLlmSection
                  settings={settings}
                  updateSettings={updateSettings}
                />
              )}

              {showImageProvider && isAdmin && (
                <div className="relative bg-surface-container-highest/50 rounded-sm ring-1 ring-outline-variant/10">
                  <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] text-on-surface-variant/60 font-label uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                    Admin
                  </div>
                  <ImagePlaygroundSection />
                </div>
              )}

              <EffectIntensitySection settings={settings} updateSettings={updateSettings} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
