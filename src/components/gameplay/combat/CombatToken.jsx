import { useState, useEffect, useRef, useMemo } from 'react';
import LpcSprite, { getAnimDirection } from '../../shared/LpcSprite';

const HEALTH_COLORS = {
  friendlyHigh: '#c59aff',
  friendlyMid: '#e8a040',
  friendlyLow: '#ff6e84',
  enemy: '#ff6e84',
};

const EFFECT_COLORS = {
  buff: 'rgba(74, 222, 128, 0.95)',
  debuff: 'rgba(248, 113, 113, 0.95)',
  dot: 'rgba(251, 146, 60, 0.95)',
  control: 'rgba(96, 165, 250, 0.95)',
  mixed: 'rgba(209, 213, 219, 0.95)',
};

function getHealthColor(pct, isEnemy) {
  if (isEnemy) return HEALTH_COLORS.enemy;
  if (pct > 0.5) return HEALTH_COLORS.friendlyHigh;
  if (pct > 0.25) return HEALTH_COLORS.friendlyMid;
  return HEALTH_COLORS.friendlyLow;
}

function formatDuration(duration) {
  if (!duration) return '';
  if (duration.type === 'rounds' && duration.remaining != null) return `${duration.remaining}r`;
  if (duration.type === 'scenes' && duration.remaining != null) return `${duration.remaining}s`;
  if (duration.type === 'time' && duration.remaining != null) return `${duration.remaining}h`;
  if (duration.type === 'permanent') return '∞';
  if (duration.type === 'until_rest') return 'rest';
  if (duration.type === 'manual') return 'manual';
  return '';
}

function buildEffectsTooltip(effects) {
  return effects
    .map((effect) => {
      const duration = formatDuration(effect.duration);
      return duration ? `${effect.name} (${duration})` : effect.name;
    })
    .join('\n');
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function HealthBar({ pct, isEnemy, wounds, maxWounds }) {
  const color = getHealthColor(pct, isEnemy);
  return (
    <div className="combat-token__health-bar">
      <div
        className="combat-token__health-bar-fill"
        style={{
          width: `${Math.max(0, Math.min(100, pct * 100))}%`,
          backgroundColor: color,
        }}
      />
      <span className="combat-token__health-bar-text">{wounds}/{maxWounds}</span>
    </div>
  );
}

function ActiveEffectsDots({ effects, t }) {
  if (!effects?.length) return null;

  const visibleEffects = effects.slice(0, 3);
  const overflow = effects.length - visibleEffects.length;
  const tooltipText = buildEffectsTooltip(effects);

  return (
    <div
      className="mt-1 flex items-center justify-center gap-1"
      title={tooltipText}
      aria-label={t?.('combat.activeEffects', 'Active effects')}
    >
      {visibleEffects.map((effect) => {
        const color = EFFECT_COLORS[effect.category] || EFFECT_COLORS.mixed;
        return (
          <span
            key={effect.id || effect.name}
            className="inline-block h-1.5 w-1.5 rounded-full border border-black/40"
            style={{ backgroundColor: color }}
          />
        );
      })}
      {overflow > 0 && (
        <span className="rounded-full bg-surface-container/80 px-1 py-px text-[9px] font-bold leading-none text-on-surface-variant">
          +{overflow}
        </span>
      )}
    </div>
  );
}


export default function CombatToken({
  combatant,
  x,
  y,
  cellSize = 40,
  isActive,
  isSelected,
  isHovered,
  turnsUntil,
  spriteUrl,
  spriteSheetUrl,
  myCombatant,
  isActing,
  actDirection,
  shoveOffset,
  transitionDuration = 0,
  t,
}) {
  const c = combatant;
  const isEnemy = c.type === 'enemy';
  const isFriendly = !isEnemy;
  const healthPct = c.maxWounds > 0 ? c.wounds / c.maxWounds : 0;
  const [shaking, setShaking] = useState(false);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [spriteFailed, setSpriteFailed] = useState(false);
  const tokenSize = Math.round(cellSize * 1.2);
  const spriteImgSize = Math.round(cellSize * 1.05);
  const prevWoundsRef = useRef(c.wounds);
  const prevPosRef = useRef({ x, y });

  useEffect(() => {
    if (prevWoundsRef.current !== undefined && c.wounds < prevWoundsRef.current) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 400);
      prevWoundsRef.current = c.wounds;
      return () => clearTimeout(timer);
    }
    prevWoundsRef.current = c.wounds;
  }, [c.wounds]);

  useEffect(() => {
    setSpriteLoaded(false);
    setSpriteFailed(false);
  }, [spriteUrl]);

  const isMoving = transitionDuration > 0 && (prevPosRef.current.x !== x || prevPosRef.current.y !== y);

  useEffect(() => {
    prevPosRef.current = { x, y };
  }, [x, y]);

  const lpcAnimation = useMemo(() => {
    if (c.isDefeated) return 'die_down';
    if (isActing && !shoveOffset) {
      const dir = actDirection > 0 ? 'right' : actDirection < 0 ? 'left' : 'right';
      return `slash_${dir}`;
    }
    if (isMoving) {
      const dx = x - prevPosRef.current.x;
      const dy = y - prevPosRef.current.y;
      return `walk_${getAnimDirection(dx, dy)}`;
    }
    return 'idle_down';
  }, [c.isDefeated, isActing, shoveOffset, actDirection, isMoving, x, y]);

  const hasSheet = Boolean(spriteSheetUrl);
  const showSpriteImage = Boolean(spriteUrl && !spriteFailed && !hasSheet);
  const showSpritePlaceholder = showSpriteImage && !spriteLoaded;

  const isShoving = !!shoveOffset;
  const classNames = [
    'combat-token',
    isFriendly ? 'combat-token--friendly' : 'combat-token--enemy',
    isActive && 'combat-token--active',
    isSelected && 'combat-token--selected',
    isHovered && !c.isDefeated && 'combat-token--hovered',
    c.isDefeated && 'combat-token--defeated',
    shaking && 'combat-token--shake',
    (spriteLoaded || hasSheet) && 'combat-token--has-sprite',
    isShoving && 'combat-token--shoving',
    !isShoving && isActing && actDirection > 0 && 'combat-token--acting-right',
    !isShoving && isActing && actDirection < 0 && 'combat-token--acting-left',
    !isShoving && isActing && actDirection === 0 && 'combat-token--acting-right',
  ].filter(Boolean).join(' ');

  const nameLabel = c.name;

  const positionStyle = transitionDuration > 0
    ? { left: x, top: y, transition: `left ${transitionDuration}ms ease-out, top ${transitionDuration}ms ease-out` }
    : { left: x, top: y };

  if (shoveOffset) {
    positionStyle['--shove-dx'] = `${shoveOffset.dx}px`;
    positionStyle['--shove-dy'] = `${shoveOffset.dy}px`;
  }

  return (
    <div
      className={classNames}
      style={positionStyle}
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

        <div className="combat-token__sprite-wrap" style={{ width: tokenSize, height: tokenSize }}>
          {hasSheet ? (
            <LpcSprite
              sheetUrl={spriteSheetUrl}
              animation={lpcAnimation}
              width={tokenSize}
              height={tokenSize}
              playing={!c.isDefeated}
              fallback={
                <div className="combat-token__initials">
                  {c.isDefeated ? '\u2620' : getInitials(c.name)}
                </div>
              }
            />
          ) : (
            <>
              {showSpritePlaceholder && (
                <div
                  className="combat-token__initials combat-token__sprite-placeholder"
                  aria-hidden="true"
                >
                  {c.isDefeated ? '\u2620' : getInitials(c.name)}
                </div>
              )}
              {showSpriteImage ? (
                <img
                  className={`combat-token__sprite-img${spriteLoaded ? ' combat-token__sprite-img--visible' : ''}`}
                  src={spriteUrl}
                  alt={c.name}
                  draggable={false}
                  onLoad={() => setSpriteLoaded(true)}
                  onError={() => {
                    setSpriteFailed(true);
                    setSpriteLoaded(false);
                  }}
                  style={{ width: spriteImgSize, height: spriteImgSize }}
                />
              ) : (
                <div className="combat-token__initials">
                  {c.isDefeated ? '\u2620' : getInitials(c.name)}
                </div>
              )}
            </>
          )}

          {c.advantage > 0 && !c.isDefeated && (
            <div className="combat-token__advantage">+{c.advantage}</div>
          )}
        </div>

        {!c.isDefeated && (
          <HealthBar pct={healthPct} isEnemy={isEnemy} wounds={c.wounds} maxWounds={c.maxWounds} />
        )}
        {!c.isDefeated && <ActiveEffectsDots effects={c.activeEffects} t={t} />}

        <span className="combat-token__name">{nameLabel}</span>
      </div>
  );
}
