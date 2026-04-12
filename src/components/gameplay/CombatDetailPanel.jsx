import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDistance } from '../../services/combatEngine';

function ConditionBadge({ condition }) {
  const icons = {
    defending: 'security',
    dodging: 'shield',
    fled: 'exit_to_app',
  };
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-surface-container text-[10px] text-on-surface-variant uppercase tracking-wider">
      <span className="material-symbols-outlined text-[11px]">{icons[condition] || 'info'}</span>
      {condition}
    </span>
  );
}

export default function CombatDetailPanel({ combatant, myCombatant, allCombatants }) {
  const { t } = useTranslation();

  const distance = useMemo(() => {
    if (!combatant || !myCombatant || combatant.id === myCombatant.id) return null;
    return getDistance(combatant, myCombatant);
  }, [combatant, myCombatant]);

  if (!combatant) {
    return (
      <div className="p-3 rounded-sm border border-outline-variant/10 bg-surface-container/20 text-center">
        <span className="text-[11px] text-outline-variant">{t('combat.hoverForDetails', 'Hover a token for details')}</span>
      </div>
    );
  }

  const isEnemy = combatant.type === 'enemy';
  const healthPct = combatant.maxWounds > 0 ? combatant.wounds / combatant.maxWounds : 0;
  const activeConditions = (combatant.conditions || []).filter((c) => c !== 'fled' || combatant.isDefeated);

  const mainWeapon = (() => {
    // Player: equipped.mainHand → inventory item name
    if (combatant.equipped?.mainHand) {
      const item = (combatant.inventory || []).find(i => i.id === combatant.equipped.mainHand);
      if (item) return item.name;
    }
    // NPC: weapons array
    return (combatant.weapons || [])
      .map((w) => (typeof w === 'string' ? w : w.name))
      .find(Boolean);
  })();

  const offHand = (() => {
    if (combatant.equipped?.offHand) {
      const item = (combatant.inventory || []).find(i => i.id === combatant.equipped.offHand);
      if (item) return item.name;
    }
    return combatant.equippedShield || null;
  })();

  const armourSummary = (() => {
    // Player: equipped.armour → inventory item name
    if (combatant.equipped?.armour) {
      const item = (combatant.inventory || []).find(i => i.id === combatant.equipped.armour);
      if (item) return item.name;
    }
    // NPC: equippedArmour or armourDR
    if (combatant.equippedArmour) return combatant.equippedArmour;
    if (combatant.armourDR) return `DR ${combatant.armourDR}`;
    return null;
  })();

  const accentColor = isEnemy ? 'error' : 'primary';
  const barColor = healthPct > 0.5 ? (isEnemy ? 'bg-error' : 'bg-primary')
    : healthPct > 0.25 ? 'bg-amber-500' : 'bg-error';

  return (
    <div className="p-3 rounded-sm border border-outline-variant/10 bg-surface-container/20 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`material-symbols-outlined text-base text-${accentColor}`}>
            {isEnemy ? 'skull' : 'shield_person'}
          </span>
          <span className={`text-[13px] font-bold text-${accentColor} truncate`}>
            {combatant.name}
          </span>
          {combatant.isDefeated && (
            <span className="text-[10px] text-error bg-error/10 px-1.5 py-0.5 rounded-sm uppercase font-bold">
              {t('combat.defeated', 'KO')}
            </span>
          )}
        </div>
        {distance !== null && (
          <span className="text-[10px] text-on-surface-variant shrink-0 px-1.5 py-0.5 bg-surface-container rounded-sm">
            {distance}y
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-on-surface-variant">{t('combat.wounds', 'Wounds')}</span>
          <span className="text-on-surface font-bold tabular-nums">{combatant.wounds} / {combatant.maxWounds}</span>
        </div>
        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-300`}
            style={{ width: `${Math.max(0, healthPct * 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px]">
        {combatant.position != null && (
          <div className="flex items-center gap-1">
            <span className="text-on-surface-variant">{t('combat.position', 'Pos')}</span>
            <span className="text-on-surface font-bold">{combatant.position}y</span>
          </div>
        )}
        {combatant.movementAllowance > 0 && !combatant.isDefeated && (
          <div className="flex items-center gap-1">
            <span className="text-on-surface-variant">{t('combat.movementShort', 'Mov')}</span>
            <span className="text-on-surface font-bold">
              {combatant.movementAllowance - (combatant.movementUsed || 0)}/{combatant.movementAllowance}
            </span>
          </div>
        )}
      </div>

      {activeConditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeConditions.map((cond, i) => (
            <ConditionBadge key={`${cond}_${i}`} condition={cond} />
          ))}
        </div>
      )}

      {(mainWeapon || offHand || armourSummary) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-on-surface-variant pt-0.5 border-t border-outline-variant/10">
          {mainWeapon && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[11px]">swords</span>
              {mainWeapon}
            </span>
          )}
          {offHand && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[11px]">shield_with_heart</span>
              {offHand}
            </span>
          )}
          {armourSummary && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[11px]">shield</span>
              {armourSummary}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
