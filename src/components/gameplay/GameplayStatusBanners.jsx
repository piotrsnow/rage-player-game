/**
 * Optional banner below the scene image (in document flow):
 *   - MP reconnection / offline notice (only when multiplayer socket is down)
 *
 * Gameplay errors (TTS, scene gen, etc.) render as an overlay on the scene
 * panel — see `ScenePanel`.
 *
 * Does not render in `readOnly` viewer mode — the MP state doesn't apply.
 */
export default function GameplayStatusBanners({
  readOnly,
  showMpConnectionBanner,
  isMpReconnecting,
  reconnectState,
}) {
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
    </>
  );
}
