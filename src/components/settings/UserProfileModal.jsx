import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useMediaCacheStats } from '../../hooks/useMediaCacheStats';
import { useConfigImportExport } from '../../hooks/useConfigImportExport';
import BackendServerSection from './sections/BackendServerSection';
import SceneCostSection from './sections/SceneCostSection';
import ConfigBackupSection from './sections/ConfigBackupSection';
import CreditsSection from './sections/CreditsSection';

export default function UserProfileModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const {
    settings,
    updateSettings,
    importSettings,
    backendUser,
    backendAuthChecking,
    backendLogout,
  } = useSettings();

  const { cacheStats } = useMediaCacheStats({
    useBackend: settings.useBackend,
    backendUrl: settings.backendUrl,
  });

  const { fileInputRef, importStatus, exportConfig, importConfig } = useConfigImportExport({
    importSettings,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('profile.title')}
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
            <span className="material-symbols-outlined text-primary-dim">account_circle</span>
            {t('profile.title')}
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
          <div className="px-6 lg:px-12 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="space-y-6">
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

              <section className="space-y-6">
                <CreditsSection />

                <SceneCostSection settings={settings} updateSettings={updateSettings} />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
