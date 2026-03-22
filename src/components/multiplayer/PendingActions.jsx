import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../contexts/MultiplayerContext';

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
              className="flex items-center gap-1.5 px-2 py-1 bg-surface-container-high/20 rounded-sm text-xs text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-sm text-outline">hourglass_top</span>
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
