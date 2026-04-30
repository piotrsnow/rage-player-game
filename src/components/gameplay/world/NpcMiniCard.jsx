import { useTranslation } from 'react-i18next';
import { ATTRIBUTE_KEYS, ATTRIBUTE_SHORT } from '../../../data/rpgSystem';

/**
 * Compact NPC card rendered inside a tooltip on chat speaker labels. Shows
 * just enough to tell players who they're talking to without opening the
 * full sheet. Six lines tops: name row, race/level, role, attitude + wounds,
 * top-two attributes.
 */
export default function NpcMiniCard({ npc }) {
  const { t } = useTranslation();
  if (!npc) return null;

  const stats = npc.stats && typeof npc.stats === 'object' ? npc.stats : null;
  const attrs = stats?.attributes || {};
  const wounds = stats?.wounds ?? null;
  const maxWounds = stats?.maxWounds ?? null;

  const raceLabel = npc.race
    ? t(`worldState.races.${npc.race}`, npc.race)
    : npc.creatureKind || t('worldState.races.none');

  // Top 2 attributes by value — highlights what the NPC is "known for".
  const topAttrs = ATTRIBUTE_KEYS
    .filter((key) => typeof attrs[key] === 'number')
    .map((key) => ({ key, value: attrs[key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 2);

  return (
    <div className="min-w-[200px] max-w-[240px] space-y-1 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm text-on-surface">{npc.name}</span>
        {npc.alive === false && (
          <span className="text-[9px] font-bold uppercase text-error">{t('worldState.dead')}</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
        <span>{raceLabel}</span>
        <span className="text-outline">·</span>
        <span className="text-primary font-bold">{t('worldState.lvl')} {stats?.level ?? npc.level ?? 1}</span>
      </div>
      {npc.role && (
        <div className="text-[11px] text-on-surface-variant truncate">{npc.role}</div>
      )}
      <div className="flex items-center justify-between text-[10px]">
        {npc.attitude && (
          <span className={`font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
            npc.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
            npc.attitude === 'hostile' ? 'bg-error/15 text-error' :
            'bg-outline/10 text-outline'
          }`}>{npc.attitude}</span>
        )}
        {wounds != null && maxWounds != null && (
          <span className="text-outline">
            <span className="material-symbols-outlined text-[10px] align-middle">favorite</span>
            {' '}{wounds}/{maxWounds}
          </span>
        )}
      </div>
      {topAttrs.length > 0 && (
        <div className="flex gap-1 pt-0.5">
          {topAttrs.map(({ key, value }) => (
            <span key={key} className="text-[10px] px-1.5 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/15">
              <span className="text-outline">{ATTRIBUTE_SHORT[key]}</span>{' '}
              <span className="font-bold text-on-surface">{value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
