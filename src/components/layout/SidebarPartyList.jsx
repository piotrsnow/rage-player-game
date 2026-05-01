import { useTranslation } from 'react-i18next';

function speciesIcon(species) {
  const s = (species || '').toLowerCase();
  if (s.includes('elf')) return 'forest';
  if (s.includes('dwarf')) return 'engineering';
  if (s.includes('halfling') || s.includes('hobbit')) return 'restaurant';
  if (s.includes('skaven')) return 'pest_control';
  if (s.includes('orc') || s.includes('goblin')) return 'sports_martial_arts';
  if (s.includes('human')) return 'person';
  return 'person_outline';
}

function memberId(m) {
  if (!m) return '';
  return m.id ?? m.odId ?? m.name ?? '';
}

function MiniWoundsBar({ current, max }) {
  const safeMax = max > 0 ? max : 1;
  const pct = (Math.min(current ?? 0, safeMax) / safeMax) * 100;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1 bg-surface-container rounded-full overflow-hidden">
        <div
          className="h-full bg-tertiary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[8px] text-on-surface-variant tabular-nums shrink-0">
        {current ?? 0}/{max ?? 0}
      </span>
    </div>
  );
}

export default function SidebarPartyList({ party = [], activeCharacterId }) {
  const { t } = useTranslation();
  const list = Array.isArray(party) ? party : [];
  if (list.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
        <span className="material-symbols-outlined text-primary text-sm">groups</span>
        <span className="text-[10px] font-label uppercase tracking-widest text-primary truncate">
          {t('party.title', 'Party')}
        </span>
        <span className="text-[10px] text-on-surface-variant tabular-nums">({list.length})</span>
      </div>
      <div className="space-y-1.5">
        {list.map((m) => {
          const id = memberId(m);
          const selected = id && id === activeCharacterId;
          return (
            <div
              key={id || m.name}
              className={`flex items-center gap-2 p-1.5 rounded-sm bg-surface-container/40 border ${
                selected
                  ? 'border-primary/35 ring-1 ring-primary/20'
                  : 'border-outline-variant/10'
              }`}
            >
              <div className="w-7 h-7 rounded-sm flex items-center justify-center shrink-0 bg-tertiary/10 border border-tertiary/25 text-tertiary">
                <span className="material-symbols-outlined text-base">{speciesIcon(m.species)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-on-surface truncate">{m.name}</div>
                <div className="text-[9px] text-on-surface-variant truncate">
                  {t(`species.${m.species}`, { defaultValue: m.species })}
                </div>
                <div className="mt-0.5">
                  <MiniWoundsBar current={m.wounds} max={m.maxWounds} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
