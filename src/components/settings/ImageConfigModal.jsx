import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import ImageProviderSection from './keys/ImageProviderSection';
import SceneVisualizationSection from './sections/SceneVisualizationSection';

export default function ImageConfigModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, updateDMSettings, backendKeys } = useSettings();

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

              {showImageProvider && (
                <ImageProviderSection
                  settings={settings}
                  updateSettings={updateSettings}
                  backendKeys={backendKeys}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
