import { useTranslation } from 'react-i18next';

export default function ConfigBackupSection({
  fileInputRef,
  importStatus,
  onExport,
  onImport,
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-tertiary/20">
      <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">settings_backup_restore</span>
        {t('settings.configBackup')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-6">{t('settings.configBackupDesc')}</p>

      <div className="space-y-3">
        <button
          onClick={onExport}
          className="w-full p-4 rounded-sm border bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20 hover:text-primary text-left flex items-center gap-3 transition-all"
        >
          <span className="material-symbols-outlined">download</span>
          <div>
            <span className="font-headline text-sm block">{t('settings.exportConfig')}</span>
            <span className="text-[10px] font-label uppercase tracking-widest">{t('settings.exportConfigDesc')}</span>
          </div>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-4 rounded-sm border bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20 hover:text-primary text-left flex items-center gap-3 transition-all"
        >
          <span className="material-symbols-outlined">upload</span>
          <div>
            <span className="font-headline text-sm block">{t('settings.importConfig')}</span>
            <span className="text-[10px] font-label uppercase tracking-widest">{t('settings.importConfigDesc')}</span>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={onImport}
          className="hidden"
        />

        {importStatus === 'success' && (
          <div className="flex items-center gap-2 p-3 rounded-sm bg-primary/10 border border-primary/20 text-primary text-xs font-headline">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            {t('settings.importSuccess')}
          </div>
        )}
        {importStatus === 'error' && (
          <div className="flex items-center gap-2 p-3 rounded-sm bg-error/10 border border-error/20 text-error text-xs font-headline">
            <span className="material-symbols-outlined text-sm">error</span>
            {t('settings.importError')}
          </div>
        )}
      </div>

      <p className="text-[10px] text-on-surface-variant mt-4">{t('settings.configBackupWarning')}</p>
    </div>
  );
}
