import { useState, useEffect, useRef, useCallback } from 'react';
import Tooltip from '../../ui/Tooltip';
import { getDistance } from '../../../services/combatEngine';

const HEALTH_COLORS = {
  friendlyHigh: '#c59aff',
  friendlyMid: '#e8a040',
  friendlyLow: '#ff6e84',
  enemy: '#ff6e84',
};

function getHealthColor(pct, isEnemy) {
  if (isEnemy) return HEALTH_COLORS.enemy;
  if (pct > 0.5) return HEALTH_COLORS.friendlyHigh;
  if (pct > 0.25) return HEALTH_COLORS.friendlyMid;
  return HEALTH_COLORS.friendlyLow;
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function HealthRing({ pct, isEnemy }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(1, pct)));
  const color = getHealthColor(pct, isEnemy);

  return (
    <svg className="combat-health-ring" viewBox="0 0 60 60">
      <circle className="combat-health-ring__bg" cx="30" cy="30" r={r} />
      <circle
        className="combat-health-ring__fill"
        cx="30" cy="30" r={r}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
}

function buildTooltipContent(c, myCombatant, t) {
  const isEnemy = c.type === 'enemy';
  const dist = myCombatant && c.id !== myCombatant.id ? getDistance(c, myCombatant) : null;

  const mainWeapon = (() => {
    if (c.equipped?.mainHand) {
      const item = (c.inventory || []).find(i => i.id === c.equipped.mainHand);
      if (item) return item.name;
    }
    return (c.weapons || []).map((w) => (typeof w === 'string' ? w : w.name)).find(Boolean);
  })();

  const armour = (() => {
    if (c.equipped?.armour) {
      const item = (c.inventory || []).find(i => i.id === c.equipped.armour);
      if (item) return item.name;
    }
    if (c.equippedArmour) return c.equippedArmour;
    if (c.armourDR) return `DR ${c.armourDR}`;
    return null;
  })();

  const conditions = (c.conditions || []).filter(cond => cond !== 'fled' || c.isDefeated);

  return (
    <div className="space-y-1.5 min-w-[140px]">
      <div className="flex items-center gap-2">
        <span className={`font-bold text-[13px] ${isEnemy ? 'text-error' : 'text-primary'}`}>
          {c.name}
        </span>
        {c.isDefeated && (
          <span className="text-[9px] text-error bg-error/10 px-1 py-0.5 rounded-sm uppercase font-bold">KO</span>
        )}
      </div>
      <div className="text-[11px] text-on-surface">
        {t('combat.wounds', 'Wounds')}: <span className="font-bold tabular-nums">{c.wounds}/{c.maxWounds}</span>
      </div>
      {dist != null && (
        <div className="text-[10px] text-on-surface-variant">
          {t('combat.distanceLabel', 'Distance')}: <span className="font-bold">{dist}y</span>
        </div>
      )}
      {c.position != null && (
        <div className="text-[10px] text-on-surface-variant">
          {t('combat.position', 'Pos')}: <span className="font-bold">{c.position}y</span>
        </div>
      )}
      {mainWeapon && (
        <div className="text-[10px] text-on-surface-variant flex items-center gap-1">
          <span className="material-symbols-outlined text-[11px]">swords</span>
          {mainWeapon}
        </div>
      )}
      {armour && (
        <div className="text-[10px] text-on-surface-variant flex items-center gap-1">
          <span className="material-symbols-outlined text-[11px]">shield</span>
          {armour}
        </div>
      )}
      {conditions.length > 0 && (
        <div className="flex flex-wrap gap-0.5 pt-0.5">
          {conditions.map((cond, i) => (
            <span key={`${cond}_${i}`} className="px-1 py-0.5 rounded-sm bg-surface-container text-[8px] text-on-surface-variant uppercase tracking-wider">
              {cond}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CombatToken({
  combatant,
  x,
  y,
  isActive,
  isSelected,
  turnsUntil,
  spriteUrl,
  myCombatant,
  onClick,
  t,
}) {
  const c = combatant;
  const isEnemy = c.type === 'enemy';
  const isFriendly = !isEnemy;
  const healthPct = c.maxWounds > 0 ? c.wounds / c.maxWounds : 0;
  const [shaking, setShaking] = useState(false);
  const prevWoundsRef = useRef(c.wounds);

  useEffect(() => {
    if (prevWoundsRef.current !== undefined && c.wounds < prevWoundsRef.current) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 400);
      prevWoundsRef.current = c.wounds;
      return () => clearTimeout(timer);
    }
    prevWoundsRef.current = c.wounds;
  }, [c.wounds]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    onClick?.(c);
  }, [onClick, c]);

  const classNames = [
    'combat-token',
    isFriendly ? 'combat-token--friendly' : 'combat-token--enemy',
    isActive && 'combat-token--active',
    isSelected && 'combat-token--selected',
    c.isDefeated && 'combat-token--defeated',
    shaking && 'combat-token--shake',
  ].filter(Boolean).join(' ');

  const nameLabel = c.name.length > 10 ? c.name.slice(0, 9) + '\u2026' : c.name;

  const tooltipContent = buildTooltipContent(c, myCombatant, t);

  return (
    <Tooltip content={tooltipContent} placement="top" offset={12} asChild>
      <div
        className={classNames}
        style={{ left: x, top: y }}
        onClick={handleClick}
      >
        {!c.isDefeated && turnsUntil != null && (
          <div className={`combat-token__turn-badge ${
            turnsUntil === 0 ? 'combat-token__turn-badge--now' : 'combat-token__turn-badge--waiting'
          }`}>
            {turnsUntil === 0 ? (
              <span className="material-symbols-outlined text-[11px]">arrow_downward</span>
            ) : turnsUntil}
          </div>
        )}

        <div className="combat-token__sprite-wrap">
          <HealthRing pct={healthPct} isEnemy={isEnemy} />

          {spriteUrl ? (
            <img src={spriteUrl} alt={c.name} draggable={false} />
          ) : (
            <div className="combat-token__initials">
              {c.isDefeated ? '\u2620' : getInitials(c.name)}
            </div>
          )}

          {c.advantage > 0 && !c.isDefeated && (
            <div className="combat-token__advantage">+{c.advantage}</div>
          )}
        </div>

        <span className="combat-token__name">{nameLabel}</span>
        <span className="combat-token__hp">{c.wounds}/{c.maxWounds}</span>
      </div>
    </Tooltip>
  );
}
