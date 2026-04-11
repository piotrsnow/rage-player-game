import { EmptyState } from './shared';

export default function EffectsTab({ effects, t }) {
  if (effects.length === 0) {
    return <EmptyState icon="auto_fix_high" text={t('worldState.emptyEffects')} />;
  }
  return (
    <div className="grid gap-3">
      {effects.map((fx) => (
        <div key={fx.id} className="p-3 rounded-sm bg-surface-container/40 border border-outline-variant/10">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-sm text-tertiary">{
              fx.type === 'trap' ? 'warning' : fx.type === 'spell' ? 'auto_awesome' : 'eco'
            }</span>
            <span className="text-[10px] font-label uppercase tracking-wider text-tertiary">{fx.type}</span>
          </div>
          <p className="text-sm text-on-surface">{fx.description}</p>
          <div className="text-[10px] text-outline mt-1 space-x-3">
            {fx.location && <span>{t('worldState.location')}: {fx.location}</span>}
            {fx.placedBy && <span>{t('worldState.placedBy')}: {fx.placedBy}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
