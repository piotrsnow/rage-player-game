import Tooltip from '../../ui/Tooltip';

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function InitiativeBar({ combatants, turnIndex, myCombatantId, t }) {
  return (
    <div className="combat-initiative-bar">
      {combatants.map((c, i) => {
        const isActive = i === turnIndex;
        const isMe = c.id === myCombatantId;
        const isEnemy = c.type === 'enemy';
        const bg = isActive
          ? (isEnemy ? '#ff6e84' : '#c59aff')
          : (isEnemy ? '#b8344a' : '#9547f7');

        const classNames = [
          'combat-initiative-pip',
          isActive && 'combat-initiative-pip--active',
          c.isDefeated && 'combat-initiative-pip--defeated',
          isMe && !c.isDefeated && 'combat-initiative-pip--me',
        ].filter(Boolean).join(' ');

        const turnsUntil = (i - turnIndex + combatants.length) % combatants.length;
        const label = isActive
          ? t('combat.turnNow', 'Now')
          : c.isDefeated
            ? t('combat.defeated', 'KO')
            : t('combat.turnsUntil', 'In {{count}} turns', { count: turnsUntil });

        return (
          <Tooltip
            key={c.id}
            content={
              <div className="text-[11px]">
                <div className="font-bold">{c.name}</div>
                <div className="text-on-surface-variant">{label}</div>
              </div>
            }
            placement="bottom"
            variant="compact"
            asChild
          >
            <div
              className={classNames}
              style={{ background: bg, color: isActive ? '#0e0e10' : '#fffbfe' }}
            >
              {c.isDefeated ? '\u2715' : getInitials(c.name)}
              {isActive && !c.isDefeated && (
                <span
                  className="absolute inset-0 rounded-full border-2 animate-ping opacity-30"
                  style={{ borderColor: bg }}
                />
              )}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}
