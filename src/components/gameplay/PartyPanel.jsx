import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateSkill } from '../../utils/rpgTranslate';
import { ATTRIBUTE_KEYS } from '../../data/rpgSystem';
import { shortId } from '../../utils/ids';

const BEHAVIORS = ['aggressive', 'defensive', 'supportive', 'passive'];
const STANCES = ['attack', 'defend', 'support'];

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

function WoundsBar({ current, max, memberType }) {
  const safeMax = max > 0 ? max : 1;
  const pct = (Math.min(current ?? 0, safeMax) / safeMax) * 100;
  const color = memberType === 'companion' ? 'bg-tertiary' : 'bg-primary';
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-on-surface-variant tabular-nums shrink-0">
        {current ?? 0}/{max ?? 0}
      </span>
    </div>
  );
}

function buildDefaultCompanion({ name, species, sila, zrecznosc, wytrzymalosc }) {
  const id = `companion_${Date.now()}_${shortId()}`;
  return {
    id,
    type: 'companion',
    name: name?.trim() || 'Companion',
    species: species?.trim() || 'Human',
    characterLevel: 1,
    characterXp: 0,
    attributePoints: 0,
    attributes: {
      sila: Number(sila) || 10,
      inteligencja: 10,
      charyzma: 8,
      zrecznosc: Number(zrecznosc) || 10,
      wytrzymalosc: Number(wytrzymalosc) || 10,
      szczescie: 5,
    },
    wounds: 10,
    maxWounds: 10,
    movement: 4,
    mana: { current: 0, max: 0 },
    skills: { 'Walka bronia jednoręczna': { level: 5, progress: 0, cap: 10 }, 'Atletyka': { level: 3, progress: 0, cap: 10 } },
    spells: { known: [], usageCounts: {}, scrolls: [] },
    inventory: [],
    statuses: [],
    backstory: '',
    companionBehavior: 'defensive',
    combatStance: 'attack',
  };
}

export default function PartyPanel({
  party = [],
  activeCharacterId,
  onSwitchCharacter,
  onManageCompanion,
  dispatch,
}) {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', species: 'Human', sila: 10, zrecznosc: 10, wytrzymalosc: 10 });

  const list = Array.isArray(party) ? party : [];
  const active = useMemo(() => {
    const id = activeCharacterId ?? '';
    return list.find((m) => memberId(m) === id) || list[0] || null;
  }, [list, activeCharacterId]);

  const activeKey = memberId(active);

  const topSkills = useMemo(() => {
    if (!active?.skills || typeof active.skills !== 'object') return [];
    return Object.entries(active.skills)
      .map(([name, v]) => [name, typeof v === 'object' ? v.level : (v || 0)])
      .filter(([, level]) => level > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [active]);

  const equipmentSummary = useMemo(() => {
    const inv = active?.inventory;
    if (!Array.isArray(inv) || inv.length === 0) return t('party.noEquipment', 'No gear');
    const equipped = inv.filter((i) => i.equipped || i.slot);
    const slice = (equipped.length ? equipped : inv).slice(0, 4);
    return slice.map((i) => (typeof i === 'string' ? i : i.name)).filter(Boolean).join(', ');
  }, [active, t]);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    const companion = buildDefaultCompanion(form);
    if (typeof dispatch === 'function') {
      dispatch({ type: 'ADD_PARTY_COMPANION', payload: companion });
    }
    setForm({ name: '', species: 'Human', sila: 10, zrecznosc: 10, wytrzymalosc: 10 });
    setAddOpen(false);
  };

  const setCompanionField = (field, value) => {
    if (!active || active.type !== 'companion') return;
    const id = memberId(active);
    if (typeof onManageCompanion === 'function') {
      onManageCompanion(id, { [field]: value });
    }
  };

  return (
    <div className="space-y-3 p-3 bg-surface-container/25 backdrop-blur-md border border-outline-variant/15 rounded-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-primary text-lg shrink-0">groups</span>
          <h3 className="text-sm font-bold text-primary uppercase tracking-widest truncate">
            {t('party.title', 'Party')}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen((o) => !o)}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/20 rounded-sm hover:bg-primary/20 transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-sm">person_add</span>
          {t('party.addCompanion', 'Add')}
        </button>
      </div>

      {addOpen && (
        <form
          onSubmit={handleAddSubmit}
          className="p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10 space-y-2"
        >
          <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
            {t('party.newCompanion', 'New companion')}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('party.name', 'Name')}
              className="px-2 py-1 text-[10px] bg-surface-container border border-outline-variant/20 rounded-sm text-on-surface placeholder:text-outline"
            />
            <input
              value={form.species}
              onChange={(e) => setForm((f) => ({ ...f, species: e.target.value }))}
              placeholder={t('party.species', 'Species')}
              className="px-2 py-1 text-[10px] bg-surface-container border border-outline-variant/20 rounded-sm text-on-surface placeholder:text-outline"
            />
            {['sila', 'zrecznosc', 'wytrzymalosc'].map((k) => (
              <label key={k} className="flex items-center gap-1 text-[9px] text-on-surface-variant">
                <span className="uppercase w-8">{t(`rpgAttributeShort.${k}`)}</span>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="flex-1 px-1 py-0.5 text-[10px] bg-surface-container border border-outline-variant/20 rounded-sm text-on-surface"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-2 py-1 text-[9px] uppercase tracking-widest text-on-surface-variant border border-outline-variant/20 rounded-sm"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest bg-tertiary/20 text-tertiary border border-tertiary/25 rounded-sm"
            >
              {t('party.create', 'Create')}
            </button>
          </div>
        </form>
      )}

      {/* Party strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 custom-scrollbar">
        {list.length === 0 && (
          <div className="text-[10px] text-on-surface-variant py-2">
            {t('party.empty', 'No party members')}
          </div>
        )}
        {list.map((m) => {
          const id = memberId(m);
          const selected = id === activeKey;
          return (
            <button
              key={id || m.name}
              type="button"
              onClick={() => onSwitchCharacter?.(id)}
              className={`shrink-0 w-[132px] text-left p-2 rounded-sm border transition-all ${
                selected
                  ? 'bg-primary/15 border-primary/35 ring-1 ring-primary/20'
                  : 'bg-surface-container/40 border-outline-variant/10 hover:border-primary/20'
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`w-9 h-9 rounded-sm flex items-center justify-center shrink-0 border ${
                    m.type === 'companion'
                      ? 'bg-tertiary/10 border-tertiary/25 text-tertiary'
                      : 'bg-primary/10 border-primary/20 text-primary'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">{speciesIcon(m.species)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-on-surface truncate">{m.name}</div>
                  <div className="text-[9px] text-on-surface-variant truncate">
                    {t(`species.${m.species}`, { defaultValue: m.species })}
                  </div>
                </div>
              </div>
              <div className="mt-1.5">
                <WoundsBar current={m.wounds} max={m.maxWounds} memberType={m.type} />
              </div>
              {selected && (
                <div className="mt-1 text-[8px] font-bold uppercase tracking-widest text-primary text-center">
                  {t('party.active', 'Active')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active detail */}
      {active && (
        <div className="space-y-2 p-2 rounded-sm bg-surface-container/35 border border-outline-variant/10">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-label uppercase tracking-widest text-primary">
              {t('party.activeDetail', 'Selected')}
            </span>
            <span
              className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-sm border ${
                active.type === 'companion'
                  ? 'text-tertiary border-tertiary/30 bg-tertiary/10'
                  : 'text-on-surface-variant border-outline-variant/15'
              }`}
            >
              {active.type === 'companion'
                ? t('party.typeCompanion', 'Companion')
                : t('party.typePlayer', 'Player')}
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
            {ATTRIBUTE_KEYS.map((key) => (
              <div
                key={key}
                className="text-center px-0.5 py-1 rounded-sm bg-surface-container/50 border border-outline-variant/5"
              >
                <div className="text-[8px] text-on-surface-variant">{t(`rpgAttributeShort.${key}`)}</div>
                <div className="text-[10px] font-bold text-on-surface tabular-nums">
                  {(active.attributes || active.characteristics)?.[key] ?? '—'}
                </div>
              </div>
            ))}
          </div>

          {topSkills.length > 0 && (
            <div>
              <div className="text-[8px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                {t('party.skills', 'Skills')}
              </div>
              <div className="flex flex-wrap gap-1">
                {topSkills.map(([name, val]) => (
                  <span
                    key={name}
                    className="text-[9px] px-1.5 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/10 text-on-surface-variant"
                  >
                    <span className="text-on-surface font-bold tabular-nums">{val}</span>{' '}
                    {translateSkill(name, t)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[8px] font-label uppercase tracking-widest text-on-surface-variant mb-0.5">
              {t('party.equipment', 'Equipment')}
            </div>
            <p className="text-[9px] text-on-surface leading-snug line-clamp-3">{equipmentSummary}</p>
          </div>

          {active.type === 'companion' && (
            <div className="pt-2 border-t border-outline-variant/10 space-y-2">
              <div>
                <div className="text-[8px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                  {t('party.behavior', 'Behavior')}
                </div>
                <div className="flex flex-wrap gap-1">
                  {BEHAVIORS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setCompanionField('companionBehavior', b)}
                      className={`px-2 py-0.5 rounded-sm border text-[8px] font-bold uppercase tracking-wider transition-colors ${
                        (active.companionBehavior || 'defensive') === b
                          ? 'bg-tertiary/20 text-tertiary border-tertiary/30'
                          : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-tertiary/20'
                      }`}
                    >
                      {t(`party.behavior.${b}`, b)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                  {t('party.combatStance', 'In combat')}
                </div>
                <div className="flex flex-wrap gap-1">
                  {STANCES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCompanionField('combatStance', s)}
                      className={`px-2 py-0.5 rounded-sm border text-[8px] font-bold uppercase tracking-wider transition-colors ${
                        (active.combatStance || 'attack') === s
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-primary/20'
                      }`}
                    >
                      {t(`party.stance.${s}`, s)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
