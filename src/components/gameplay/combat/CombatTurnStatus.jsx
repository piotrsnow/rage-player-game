import { useTranslation } from 'react-i18next';

export default function CombatTurnStatus({
  isMyTurn,
  combatOver,
  isMultiplayer,
  isHost,
  currentTurn,
  isAwaitingAiTurn,
  combat,
  enemies,
}) {
  const { t } = useTranslation();

  if (combatOver) {
    return (
      <div className="text-center py-3 rounded-sm border border-outline-variant/10 bg-surface-container/20">
        <div className="text-[11px] text-on-surface-variant">
          {combat.round} {t('combat.roundsPlural', 'rounds')} — {enemies.filter((e) => e.isDefeated).length}/{enemies.length} {t('combat.enemiesDefeated', 'enemies defeated')}
        </div>
        {isMultiplayer && !isHost && (
          <div className="text-[10px] text-outline mt-2">
            {t('combat.hostWillEnd', 'The host will end combat...')}
          </div>
        )}
      </div>
    );
  }

  if (isMultiplayer && !isMyTurn && currentTurn?.type === 'player') {
    return (
      <div className="text-center py-3 text-[12px] text-on-surface-variant rounded-sm border border-outline-variant/10 bg-surface-container/20">
        <span className="material-symbols-outlined text-sm mr-1 animate-pulse">hourglass_top</span>
        {t('combat.waitingFor', 'Waiting for {{name}}...', { name: currentTurn?.name })}
      </div>
    );
  }

  if (!isMyTurn && currentTurn?.type !== 'player' && isAwaitingAiTurn) {
    return (
      <div className="text-center py-3 text-[12px] text-on-surface-variant rounded-sm border border-outline-variant/10 bg-surface-container/20">
        <span className="material-symbols-outlined text-sm mr-1 animate-pulse">hourglass_top</span>
        {t('combat.nextTurnSoon', 'Next turn in a moment: {{name}}', { name: currentTurn?.name })}
      </div>
    );
  }

  if (!isMyTurn && currentTurn?.type !== 'player' && !isAwaitingAiTurn) {
    return (
      <div className="text-center py-3 text-[12px] text-on-surface-variant rounded-sm border border-outline-variant/10 bg-surface-container/20">
        <span className="material-symbols-outlined text-sm mr-1 animate-spin">sync</span>
        {currentTurn?.name} {t('combat.isActing', 'is acting...')}
      </div>
    );
  }

  return null;
}
