import { FACTION_DEFINITIONS, getReputationTierData } from '../../../data/rpgFactions';
import { EmptyState } from './shared';

export default function FactionsTab({ factions, t }) {
  const entries = Object.entries(FACTION_DEFINITIONS);
  const hasFactions = Object.keys(factions).length > 0;

  if (!hasFactions) {
    return <EmptyState icon="groups" text={t('worldState.emptyFactions', 'No faction interactions yet')} />;
  }

  return (
    <div className="grid gap-3">
      {entries.map(([id, def]) => {
        const rep = factions[id];
        if (rep === undefined) return null;
        const tierData = getReputationTierData(rep);
        const pct = ((rep + 100) / 200) * 100;
        const colorClass = tierData.color === 'error' ? 'text-error bg-error'
          : tierData.color === 'primary' ? 'text-primary bg-primary'
          : tierData.color === 'tertiary' ? 'text-tertiary bg-tertiary'
          : 'text-outline bg-outline';
        const textColor = colorClass.split(' ')[0];
        const bgColor = colorClass.split(' ')[1];

        return (
          <div key={id} className="p-3 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-sm ${textColor}`}>{def.icon}</span>
                <span className="text-sm font-bold text-on-surface">{def.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${bgColor}/15 ${textColor}`}>
                  {tierData.label}
                </span>
                <span className={`text-[10px] font-bold tabular-nums ${textColor}`}>
                  {rep > 0 ? '+' : ''}{rep}
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-surface-container rounded-full overflow-hidden mb-2">
              <div
                className={`h-full ${bgColor} transition-all duration-300 rounded-full`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[10px] text-on-surface-variant">{def.effects[tierData.tier]}</p>
          </div>
        );
      }).filter(Boolean)}
    </div>
  );
}
