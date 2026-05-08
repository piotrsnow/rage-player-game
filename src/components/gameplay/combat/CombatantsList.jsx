import ActiveEffectsRow from '../../ui/ActiveEffectsRow';
import { apiClient } from '../../../services/apiClient';
import { speciesIcon } from '../../../utils/speciesIcons';

function sortCombatants(combatants) {
  return combatants.slice().sort((a, b) => {
    if (a.type === 'player' && b.type !== 'player') return -1;
    if (a.type !== 'player' && b.type === 'player') return 1;
    if (a.type === 'ally' && b.type === 'enemy') return -1;
    if (a.type === 'enemy' && b.type === 'ally') return 1;
    return 0;
  });
}

export default function CombatantsList({ combatants, currentTurn, onHoverCombatant, t, horizontal = false }) {
  return (
    <div className={horizontal ? 'overflow-x-auto custom-scrollbar' : 'space-y-1.5 overflow-y-auto custom-scrollbar'}>
      <div className={horizontal
        ? 'flex items-stretch gap-2'
        : undefined
      }>
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
              className={`flex rounded-md overflow-hidden transition-colors cursor-default ${horizontal ? 'flex-1 min-w-[15rem]' : ''} ${
                isCurrent
                  ? 'border-2 border-primary/60 bg-primary/10'
                  : c.isDefeated
                    ? 'border border-outline-variant/10 bg-surface-container/10 opacity-50'
                    : 'border border-outline-variant/20 bg-surface-container/20 hover:bg-surface-container/30'
              }`}
              onMouseEnter={() => onHoverCombatant(c.id)}
              onMouseLeave={() => onHoverCombatant(null)}
            >
              {/* Portrait */}
              <div className="w-14 shrink-0 relative bg-surface-container/50 self-stretch">
                {c.portraitUrl ? (
                  <img
                    src={apiClient.resolveMediaUrl(c.portraitUrl)}
                    alt={c.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.style.display = 'flex'; }}
                  />
                ) : null}
                <div
                  className={`absolute inset-0 items-center justify-center ${isEnemy ? 'text-error/60' : 'text-primary/60'}`}
                  style={{ display: c.portraitUrl ? 'none' : 'flex' }}
                >
                  <span className="material-symbols-outlined text-3xl">
                    {isEnemy ? 'skull' : c.type === 'ally' ? 'group' : speciesIcon(c.species)}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 p-2.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isCurrent && (
                    <span className="material-symbols-outlined text-sm text-primary shrink-0 animate-pulse">
                      arrow_right
                    </span>
                  )}
                  <span className={`material-symbols-outlined text-base shrink-0 ${accentColor}`}>
                    {isEnemy ? 'skull' : c.type === 'ally' ? 'group' : 'shield_person'}
                  </span>
                  <span className={`text-sm leading-tight font-bold ${accentColor} ${c.isDefeated ? 'line-through' : ''} line-clamp-2 break-words`}>
                    {c.name}
                  </span>
                </div>

                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
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

                <div className="flex items-center gap-2 mt-1 text-xs text-on-surface-variant">
                  {c.position != null && (
                    <span>{t('combat.position', 'Pos')} <span className="font-bold text-on-surface">[{typeof c.position === 'object' ? `${c.position.x},${c.position.y}` : c.position}]</span></span>
                  )}
                  {c.movementAllowance > 0 && !c.isDefeated && (
                    <span>{t('combat.movementShort', 'Mov')} <span className="font-bold text-on-surface">{c.movementAllowance - (c.movementUsed || 0)}/{c.movementAllowance}</span></span>
                  )}
                </div>

                {(c.conditions || []).filter((cond) => cond !== 'fled' || c.isDefeated).length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {(c.conditions || []).filter((cond) => cond !== 'fled' || c.isDefeated).map((cond, i) => (
                      <span key={`${c.id}_${cond}_${i}`} className="px-1 py-0.5 rounded-sm bg-surface-container text-[10px] text-on-surface-variant uppercase tracking-wider">
                        {cond}
                      </span>
                    ))}
                  </div>
                )}

                {(c.activeEffects || []).length > 0 && (
                  <div className="mt-1">
                    <ActiveEffectsRow effects={c.activeEffects} compact large maxVisible={4} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
