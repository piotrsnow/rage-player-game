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
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-error text-lg">swords</span>
        <h3 className="text-sm font-bold text-error uppercase tracking-widest">
          {t('combat.title', 'Combat')}
        </h3>
        <span className="text-[11px] text-on-surface-variant px-2 py-0.5 bg-surface-container rounded-sm">
          {t('combat.round', 'Round')} {round}
        </span>
        {isMultiplayer && (
          <span className="text-[10px] text-tertiary px-2 py-0.5 bg-tertiary/10 rounded-sm uppercase tracking-widest">
            {t('combat.multiplayer', 'MP')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!combatOver && canControl && playerWinning && (
          <button
            onClick={onRequestTruce}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-outline/10 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-tertiary/15 hover:text-tertiary hover:border-tertiary/20 transition-colors"
          >
            {t('combat.forceTruce', 'Force Truce')}
          </button>
        )}
        {!combatOver && canControl && (
          <button
            onClick={onRequestSurrender}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-outline/10 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-error/15 hover:text-error hover:border-error/20 transition-colors"
          >
            {t('combat.surrender', 'Surrender')}
          </button>
        )}
        {combatOver && canControl && (
          <button
            onClick={onEndCombat}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-primary/15 text-primary border border-primary/20 rounded-sm hover:bg-primary/25 transition-colors"
          >
            {t('combat.endCombat', 'End Combat')}
          </button>
        )}
      </div>
    </div>
  );
}
