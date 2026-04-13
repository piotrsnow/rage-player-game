import { useTranslation } from 'react-i18next';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function BackendServerSection({
  backendAuthChecking,
  backendUser,
  backendLogout,
  cacheStats,
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">cloud</span>
        {t('settings.backendTitle')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-6">{t('settings.backendDesc')}</p>

      {backendAuthChecking ? (
        <div className="flex items-center gap-3 p-4 bg-surface-container-high/40 rounded-sm border border-primary/10">
          <span className="material-symbols-outlined text-primary/60 animate-spin">progress_activity</span>
          <div className="flex-1">
            <p className="text-on-surface-variant text-xs">{t('common.loading')}</p>
          </div>
        </div>
      ) : backendUser ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-surface-container-high/40 rounded-sm border border-primary/10">
            <div>
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.backendLoggedInAs')}
              </p>
              <p className="font-headline text-tertiary text-sm">{backendUser.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(197,154,255,0.8)]" />
              <span className="text-xs text-primary font-headline">{t('settings.backendConnected')}</span>
            </div>
          </div>

          {cacheStats && (
            <div className="p-4 bg-surface-container-high/40 rounded-sm border border-outline-variant/10">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
                {t('settings.cacheStats')}
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-on-surface-variant">{t('settings.cacheTotal')}: </span>
                  <span className="text-tertiary font-headline">{cacheStats.total}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant">{t('settings.cacheSize')}: </span>
                  <span className="text-tertiary font-headline">{formatBytes(cacheStats.totalSize)}</span>
                </div>
                {cacheStats.byType && Object.entries(cacheStats.byType).map(([type, data]) => (
                  <div key={type}>
                    <span className="text-on-surface-variant">
                      {t(`settings.cache${type.charAt(0).toUpperCase() + type.slice(1)}`, type)}:
                    </span>{' '}
                    <span className="text-tertiary font-headline">
                      {data.count} ({formatBytes(data.size)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={backendLogout}
            className="w-full p-3 rounded-sm border border-error/20 text-error text-xs font-headline uppercase tracking-widest hover:bg-error/10 transition-all"
          >
            {t('settings.backendLogout')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-surface-container-high/40 rounded-sm border border-outline-variant/10">
          <span className="material-symbols-outlined text-outline/40">person_off</span>
          <div className="flex-1">
            <p className="text-on-surface-variant text-xs">{t('settings.backendDisconnected')}</p>
            <p className="text-outline/40 text-[10px] mt-0.5">{t('lobby.loginOnMainPage')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
