import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDistance, isInMeleeRange } from '../../../services/combatEngine';

function getHpPercent(c) {
  if (!c || !c.maxWounds || c.maxWounds <= 0) return 100;
  return Math.round((Math.max(0, c.wounds) / c.maxWounds) * 100);
}

export default function CombatTelegraph({ combat, myCombatantId, isMyTurn }) {
  const { t } = useTranslation();

  const threats = useMemo(() => {
    if (!myCombatantId || !combat?.combatants) return [];
    const me = combat.combatants.find(c => c.id === myCombatantId);
    if (!me || me.isDefeated) return [];

    const result = [];

    for (const c of combat.combatants) {
      if (c.type !== 'enemy' || c.isDefeated) continue;
      const dist = getDistance(me, c);
      const inMelee = isInMeleeRange(me, c);

      if (inMelee) {
        result.push({
          id: c.id,
          name: c.name,
          type: 'melee_threat',
          label: t('combat.telegraphMelee', '{{name}} w zasięgu walki!', { name: c.name }),
          color: 'text-red-400',
          icon: 'swords',
        });
      } else if (dist <= 3) {
        result.push({
          id: c.id,
          name: c.name,
          type: 'close_threat',
          label: t('combat.telegraphClose', '{{name}} blisko ({{dist}})', { name: c.name, dist }),
          color: 'text-amber-400',
          icon: 'warning',
        });
      }
    }
    return result;
  }, [combat, myCombatantId, t]);

  const hpWarning = useMemo(() => {
    if (!myCombatantId || !combat?.combatants) return null;
    const me = combat.combatants.find(c => c.id === myCombatantId);
    if (!me) return null;
    const pct = getHpPercent(me);
    if (pct <= 25) return { level: 'critical', pct, label: t('combat.hpCritical', 'HP krytyczne!') };
    if (pct <= 50) return { level: 'low', pct, label: t('combat.hpLow', 'Niskie HP') };
    return null;
  }, [combat, myCombatantId, t]);

  if (!threats.length && !hpWarning) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-1">
      {hpWarning && (
        <span className={`
          inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-semibold
          ${hpWarning.level === 'critical'
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
            : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'}
        `}>
          <span className="material-symbols-outlined text-xs">heart_broken</span>
          {hpWarning.label} ({hpWarning.pct}%)
        </span>
      )}
      {isMyTurn && threats.map((th) => (
        <span
          key={th.id}
          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium border border-outline-variant/20 bg-surface-container/30 ${th.color}`}
        >
          <span className="material-symbols-outlined text-xs">{th.icon}</span>
          {th.label}
        </span>
      ))}
    </div>
  );
}
