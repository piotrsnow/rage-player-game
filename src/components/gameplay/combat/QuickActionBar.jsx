import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { isInMeleeRange, canCharge, getDistance } from '../../../services/combatEngine';
import { findClosestEnemy } from '../../../hooks/useCombatKeyboard';

const QUICK_ACTIONS = [
  { key: 'attack', icon: 'swords', labelKey: 'combat.quickAttack', shortcut: '1', needsTarget: true, color: 'text-red-400 hover:bg-red-500/15' },
  { key: 'defend', icon: 'shield', labelKey: 'combat.quickDefend', shortcut: '2', needsTarget: false, color: 'text-sky-400 hover:bg-sky-500/15' },
  { key: 'dodge', icon: 'directions_run', labelKey: 'combat.quickDodge', shortcut: '3', needsTarget: false, color: 'text-emerald-400 hover:bg-emerald-500/15' },
  { key: 'charge', icon: 'sprint', labelKey: 'combat.quickCharge', shortcut: '4', needsTarget: true, color: 'text-amber-400 hover:bg-amber-500/15' },
];

export default function QuickActionBar({
  combat,
  myCombatantId,
  isMyTurn,
  combatOver,
  onExecuteManoeuvre,
  disabled,
}) {
  const { t } = useTranslation();

  const closestEnemy = useMemo(() => {
    if (!myCombatantId) return null;
    return findClosestEnemy(combat.combatants, myCombatantId);
  }, [combat.combatants, myCombatantId]);

  const me = useMemo(
    () => combat.combatants.find(c => c.id === myCombatantId),
    [combat.combatants, myCombatantId],
  );

  const actionAvailability = useMemo(() => {
    const result = {};
    if (!me || !isMyTurn || combatOver) {
      for (const a of QUICK_ACTIONS) result[a.key] = { available: false };
      return result;
    }
    for (const a of QUICK_ACTIONS) {
      if (!a.needsTarget) {
        result[a.key] = { available: true, targetId: null };
        continue;
      }
      if (!closestEnemy) {
        result[a.key] = { available: false, reason: 'no_target' };
        continue;
      }
      if (a.key === 'charge') {
        const check = canCharge(me, closestEnemy, combat.combatants);
        result[a.key] = { available: check.valid, targetId: closestEnemy.id, reason: check.reason };
      } else {
        const inRange = isInMeleeRange(me, closestEnemy);
        result[a.key] = { available: inRange, targetId: closestEnemy.id, reason: inRange ? undefined : 'out_of_range' };
      }
    }
    return result;
  }, [me, closestEnemy, isMyTurn, combatOver, combat.combatants]);

  const handleClick = useCallback((key) => {
    const avail = actionAvailability[key];
    if (!avail?.available || disabled) return;
    onExecuteManoeuvre(key, avail.targetId, '');
  }, [actionAvailability, disabled, onExecuteManoeuvre]);

  if (!isMyTurn || combatOver) return null;

  return (
    <div className="flex items-center gap-1 px-1">
      {QUICK_ACTIONS.map(({ key, icon, labelKey, shortcut, color }) => {
        const avail = actionAvailability[key];
        const isAvailable = avail?.available && !disabled;
        return (
          <button
            key={key}
            onClick={() => handleClick(key)}
            disabled={!isAvailable}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
              border border-outline-variant/20 bg-surface-container/30
              transition-colors duration-100
              ${isAvailable ? `${color} cursor-pointer` : 'text-outline/40 cursor-not-allowed opacity-50'}
            `}
            title={`${t(labelKey, key)} [${shortcut}]${avail?.reason ? ` — ${avail.reason}` : ''}`}
          >
            <span className="material-symbols-outlined text-sm">{icon}</span>
            <span className="hidden sm:inline">{t(labelKey, key)}</span>
            <kbd className="text-[8px] opacity-50 ml-0.5">{shortcut}</kbd>
          </button>
        );
      })}
      {closestEnemy && (
        <span className="text-[9px] text-outline ml-1">
          → {closestEnemy.name} ({getDistance(me, closestEnemy)})
        </span>
      )}
    </div>
  );
}
