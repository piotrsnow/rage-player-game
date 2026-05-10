import { useTranslation } from 'react-i18next';

export default function CombatHeader({
  round,
  combatOver,
  canControl,
  playerWinning,
  isMultiplayer,
  onRequestTruce,
  onRequestSurrender,
  onEndCombat,
  onSkipTurn,
  expandedLayout,
  onToggleLayout,
  movementInfo,
  isMyTurn,
  allowNegotiationControls = true,
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap" data-testid="combat-header">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-error text-lg">swords</span>
        <span className="text-[11px] text-on-surface-variant px-2 py-0.5 bg-surface-container rounded-sm" data-testid="combat-round">
          {t('combat.round', 'Round')} {round}
        </span>
        {isMultiplayer && (
          <span className="text-[10px] text-tertiary px-2 py-0.5 bg-tertiary/10 rounded-sm uppercase tracking-widest">
            {t('combat.multiplayer', 'MP')}
          </span>
        )}
        {movementInfo && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-container/30 border border-outline-variant/10 rounded-sm text-[11px]">
            <span className="material-symbols-outlined text-sm text-primary">directions_walk</span>
            <span className="text-on-surface-variant">{t('combat.movement', 'Movement')}:</span>
            <span className="text-primary font-bold tabular-nums">
              {movementInfo.remaining}/{movementInfo.total}
            </span>
            <span className="text-[10px] text-outline-variant ml-1">{t('combat.clickToMove', 'Click grid cell to move')}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!combatOver && canControl && isMyTurn && (
          <button
            onClick={onSkipTurn}
            title={t('combat.skipTurn', 'Skip turn')}
            className="p-1.5 rounded-sm text-on-surface-variant border border-outline-variant/20 hover:bg-primary/15 hover:text-primary hover:border-primary/20 transition-colors"
          >
            <span className="material-symbols-outlined text-base">redo</span>
          </button>
        )}
        {allowNegotiationControls && !combatOver && canControl && playerWinning && (
          <button
            onClick={onRequestTruce}
            data-testid="combat-truce-button"
            title={t('combat.forceTruce', 'Force Truce')}
            className="p-1.5 rounded-sm text-on-surface-variant border border-outline-variant/20 hover:bg-tertiary/15 hover:text-tertiary hover:border-tertiary/20 transition-colors"
          >
            <span className="material-symbols-outlined text-base">handshake</span>
          </button>
        )}
        {allowNegotiationControls && !combatOver && canControl && (
          <button
            onClick={onRequestSurrender}
            data-testid="combat-surrender-button"
            title={t('combat.surrender', 'Surrender')}
            className="p-1.5 rounded-sm text-on-surface-variant border border-outline-variant/20 hover:bg-error/15 hover:text-error hover:border-error/20 transition-colors"
          >
            <span className="material-symbols-outlined text-base">flag</span>
          </button>
        )}
        {combatOver && canControl && (
          <button
            onClick={onEndCombat}
            data-testid="combat-end-button"
            title={t('combat.endCombat', 'End Combat')}
            className="p-1.5 rounded-sm text-primary border border-primary/20 hover:bg-primary/25 transition-colors"
          >
            <span className="material-symbols-outlined text-base">done_all</span>
          </button>
        )}
      </div>
    </div>
  );
}
