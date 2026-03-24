import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSoloActionCooldown } from '../../hooks/useSoloActionCooldown';

function SoloBadge({ lastSoloActionAt }) {
  const { t } = useTranslation();
  const { isAvailable, formattedTime } = useSoloActionCooldown(lastSoloActionAt);
  if (!lastSoloActionAt) return null;
  if (isAvailable) {
    return (
      <span className="ml-auto flex items-center gap-0.5 text-tertiary/60" title={t('multiplayer.soloActionReady')}>
        <span className="material-symbols-outlined text-xs">bolt</span>
      </span>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-0.5 text-tertiary/50 text-[10px] font-label" title={t('multiplayer.soloActionCooldown', { time: formattedTime })}>
      <span className="material-symbols-outlined text-xs">timer</span>
      {formattedTime}
    </span>
  );
}

export default function PendingActions() {
  const { t } = useTranslation();
  const { state } = useMultiplayer();
  const { players, myOdId } = state;

  const playersWithActions = players.filter((p) => p.pendingAction);
  const playersWaiting = players.filter((p) => !p.pendingAction);

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
        {t('multiplayer.pendingActions')} ({playersWithActions.length}/{players.length})
      </div>

      {playersWithActions.length > 0 && (
        <div className="space-y-2">
          {playersWithActions.map((p) => (
            <div
              key={p.odId}
              className={`p-3 rounded-sm border ${
                p.odId === myOdId
                  ? 'bg-surface-tint/10 border-primary/30'
                  : 'bg-surface-container-high/30 border-outline-variant/15'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                <span className="text-xs font-bold text-on-surface">{p.name}</span>
                {p.odId === myOdId && (
                  <span className="text-[10px] text-tertiary">({t('multiplayer.you')})</span>
                )}
                {p.connected === false && (
                  <span className="text-[10px] text-error/70 flex items-center gap-0.5" title={t('multiplayer.playerDisconnected')}>
                    <span className="material-symbols-outlined text-[10px]">wifi_off</span>
                    {t('multiplayer.disconnected', 'offline')}
                  </span>
                )}
                <SoloBadge lastSoloActionAt={p.lastSoloActionAt} />
              </div>
              <p className="text-sm text-on-surface-variant pl-6 italic">
                &ldquo;{p.pendingAction}&rdquo;
              </p>
            </div>
          ))}
        </div>
      )}

      {playersWaiting.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {playersWaiting.map((p) => (
            <div
              key={p.odId}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs ${
                p.connected === false
                  ? 'bg-error/10 text-error/60'
                  : 'bg-surface-container-high/20 text-on-surface-variant'
              }`}
            >
              {p.connected === false ? (
                <span className="material-symbols-outlined text-sm">wifi_off</span>
              ) : (
                <span className="material-symbols-outlined text-sm text-outline">hourglass_top</span>
              )}
              {p.name}
              {p.connected === false && (
                <span className="text-[10px]">({t('multiplayer.disconnected', 'offline')})</span>
              )}
              <SoloBadge lastSoloActionAt={p.lastSoloActionAt} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
