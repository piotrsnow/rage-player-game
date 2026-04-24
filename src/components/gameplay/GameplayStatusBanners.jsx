import { useTranslation } from 'react-i18next';

/**
 * Two optional banners above the scene area:
 *   - MP reconnection / offline notice (only when multiplayer socket is down)
 *   - Error banner (any unhandled error surfaced through the game state)
 *
 * Neither renders in `readOnly` viewer mode — viewers can't dismiss errors
 * and the MP state doesn't apply to them anyway.
 */
export default function GameplayStatusBanners({
  readOnly,
  showMpConnectionBanner,
  isMpReconnecting,
  reconnectState,
  error,
  mpErrorCode,
  isMultiplayer,
  onDismissError,
  onOpenSettings,
}) {
  const { t } = useTranslation();

  if (readOnly) return null;

  return (
    <>
      {showMpConnectionBanner && (
        <div className="bg-warning-container/20 border border-warning/20 p-3 rounded-sm mx-2 animate-fade-in">
          <p className="text-warning text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">{isMpReconnecting ? 'sync' : 'wifi_off'}</span>
            {isMpReconnecting
              ? `Reconnecting to multiplayer server (${reconnectState.attempt}/${reconnectState.maxAttempts})...`
              : 'Multiplayer connection is offline. Actions cannot be sent until reconnect succeeds.'}
          </p>
        </div>
      )}

      {error && (
        <div className="bg-error-container/20 border border-error/20 p-4 rounded-sm mx-2 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <p className="text-error text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </p>
            <button onClick={onDismissError} aria-label={t('common.close')} className="text-error/60 hover:text-error transition-colors shrink-0">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
          {mpErrorCode === 'NO_SERVER_API_KEY' && (
            <p className="mt-2 text-xs text-on-surface-variant">
              {t('gameplay.serverApiKeyMissingHint', 'Server API keys are missing. Ask the host/admin to configure backend environment variables.')}
            </p>
          )}
          {!isMultiplayer && error.includes('backend') && (
            <button
              onClick={onOpenSettings}
              className="mt-2 text-xs text-primary hover:text-tertiary transition-colors underline"
            >
              {t('gameplay.goToSettings')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
