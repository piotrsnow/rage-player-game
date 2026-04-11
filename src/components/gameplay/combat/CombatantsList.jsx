function sortCombatants(combatants) {
  return combatants.slice().sort((a, b) => {
    if (a.type === 'player' && b.type !== 'player') return -1;
    if (a.type !== 'player' && b.type === 'player') return 1;
    if (a.type === 'ally' && b.type === 'enemy') return -1;
    if (a.type === 'enemy' && b.type === 'ally') return 1;
    return 0;
  });
}

export default function CombatantsList({ combatants, currentTurn, onHoverCombatant, t }) {
  return (
    <div className="space-y-1.5 max-h-[480px] overflow-y-auto custom-scrollbar">
      <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1 pb-1">
        {t('combat.combatants', 'Combatants')}
      </div>
      {sortCombatants(combatants).map((c) => {
        const isEnemy = c.type === 'enemy';
        const isCurrent = currentTurn?.id === c.id;
        const healthPct = c.maxWounds > 0 ? c.wounds / c.maxWounds : 0;
        const barColor = healthPct > 0.5
          ? (isEnemy ? 'bg-error' : 'bg-primary')
          : healthPct > 0.25 ? 'bg-amber-500' : 'bg-error';
        const accentColor = isEnemy ? 'text-error' : 'text-primary';

        return (
          <div
            key={c.id}
            className={`p-2 rounded-sm border transition-colors cursor-default ${
              isCurrent
                ? 'border-primary/40 bg-primary/5'
                : c.isDefeated
                  ? 'border-outline-variant/5 bg-surface-container/10 opacity-50'
                  : 'border-outline-variant/10 bg-surface-container/20 hover:bg-surface-container/30'
            }`}
            onMouseEnter={() => onHoverCombatant(c.id)}
            onMouseLeave={() => onHoverCombatant(null)}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isCurrent && (
                <span className="material-symbols-outlined text-[11px] text-primary shrink-0 animate-pulse">
                  arrow_right
                </span>
              )}
              <span className={`material-symbols-outlined text-[13px] shrink-0 ${accentColor}`}>
                {isEnemy ? 'skull' : c.type === 'ally' ? 'group' : 'shield_person'}
              </span>
              <span className={`text-[11px] font-bold truncate ${accentColor} ${c.isDefeated ? 'line-through' : ''}`}>
                {c.name}
              </span>
            </div>

            <div className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-on-surface-variant">{t('combat.wounds', 'Wounds')}</span>
                <span className="text-on-surface font-bold tabular-nums">
                  {c.wounds}/{c.maxWounds}
                </span>
              </div>
              <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-300`}
                  style={{ width: `${Math.max(0, healthPct * 100)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1 text-[9px] text-on-surface-variant">
              {c.position != null && (
                <span>{t('combat.position', 'Pos')} <span className="font-bold text-on-surface">{c.position}y</span></span>
              )}
              {c.movementAllowance > 0 && !c.isDefeated && (
                <span>{t('combat.movementShort', 'Mov')} <span className="font-bold text-on-surface">{c.movementAllowance - (c.movementUsed || 0)}/{c.movementAllowance}</span></span>
              )}
            </div>

            {(c.conditions || []).filter((cond) => cond !== 'fled' || c.isDefeated).length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-1">
                {(c.conditions || []).filter((cond) => cond !== 'fled' || c.isDefeated).map((cond, i) => (
                  <span key={`${c.id}_${cond}_${i}`} className="px-1 py-0.5 rounded-sm bg-surface-container text-[8px] text-on-surface-variant uppercase tracking-wider">
                    {cond}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
