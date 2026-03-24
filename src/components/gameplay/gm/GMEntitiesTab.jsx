import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FACTION_DEFINITIONS, getReputationTierData } from '../../../data/wfrpFactions';

const ENTITY_FILTERS = ['all', 'npcs', 'locations', 'factions'];

export default function GMEntitiesTab({ gameState }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const world = gameState?.world || {};
  const npcs = world.npcs || [];
  const mapState = world.mapState || [];
  const factions = world.factions || {};
  const currentLocation = world.currentLocation || '';

  const searchLower = search.toLowerCase();
  const filteredNpcs = useMemo(
    () => npcs.filter((n) => !searchLower || n.name?.toLowerCase().includes(searchLower) || n.role?.toLowerCase().includes(searchLower)),
    [npcs, searchLower]
  );
  const filteredLocations = useMemo(
    () => mapState.filter((l) => !searchLower || l.name?.toLowerCase().includes(searchLower)),
    [mapState, searchLower]
  );
  const filteredFactions = useMemo(() => {
    return Object.entries(factions)
      .map(([id, rep]) => ({ id, reputation: rep, def: FACTION_DEFINITIONS[id] }))
      .filter((f) => !searchLower || f.def?.name?.toLowerCase().includes(searchLower) || f.id.includes(searchLower));
  }, [factions, searchLower]);

  const showNpcs = filter === 'all' || filter === 'npcs';
  const showLocations = filter === 'all' || filter === 'locations';
  const showFactions = filter === 'all' || filter === 'factions';

  const isEmpty = (showNpcs ? filteredNpcs.length : 0) + (showLocations ? filteredLocations.length : 0) + (showFactions ? filteredFactions.length : 0) === 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-outline-variant/10 shrink-0 flex-wrap">
        <div className="flex gap-1">
          {ENTITY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-[10px] font-label uppercase tracking-wider rounded-sm transition-colors ${
                filter === f
                  ? 'bg-primary/15 text-primary border border-primary/20'
                  : 'text-outline hover:text-on-surface-variant border border-transparent'
              }`}
            >
              {t(`gmModal.entityFilters.${f}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[120px] max-w-[240px]">
          <span className="material-symbols-outlined text-sm text-outline absolute left-2 top-1/2 -translate-y-1/2">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('gmModal.searchPlaceholder')}
            className="w-full pl-7 pr-2 py-1 text-[11px] bg-surface-container/60 border border-outline-variant/15 rounded-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary/40"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-outline">
            <span className="material-symbols-outlined text-3xl">search_off</span>
            <p className="text-[11px] font-label uppercase tracking-widest">{t('gmModal.noResults')}</p>
          </div>
        )}

        {/* NPCs */}
        {showNpcs && filteredNpcs.length > 0 && (
          <Section title={t('gmModal.entityFilters.npcs')} icon="group" count={filteredNpcs.length}>
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredNpcs.map((npc) => (
                <NpcCard key={npc.id || npc.name} npc={npc} t={t} />
              ))}
            </div>
          </Section>
        )}

        {/* Locations */}
        {showLocations && filteredLocations.length > 0 && (
          <Section title={t('gmModal.entityFilters.locations')} icon="place" count={filteredLocations.length}>
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredLocations.map((loc) => (
                <LocationCard key={loc.id || loc.name} location={loc} isCurrent={loc.name?.toLowerCase() === currentLocation?.toLowerCase()} t={t} />
              ))}
            </div>
          </Section>
        )}

        {/* Factions */}
        {showFactions && filteredFactions.length > 0 && (
          <Section title={t('gmModal.entityFilters.factions')} icon="shield" count={filteredFactions.length}>
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredFactions.map((fac) => (
                <FactionCard key={fac.id} faction={fac} t={t} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, count, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-sm text-primary">{icon}</span>
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{title}</span>
        <span className="text-[10px] text-outline">({count})</span>
      </div>
      {children}
    </div>
  );
}

function NpcCard({ npc, t }) {
  const isDead = npc.alive === false;
  return (
    <div className={`p-3 rounded-sm border ${isDead ? 'bg-error-container/10 border-error/15 opacity-60' : 'bg-surface-container/40 border-outline-variant/10'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-sm text-primary">person</span>
          <span className="text-[11px] font-bold text-on-surface truncate">{npc.name}</span>
          {npc.gender && <span className="text-[10px] text-outline shrink-0">({t(`gmModal.genders.${npc.gender}`, npc.gender)})</span>}
        </div>
        {isDead && <span className="text-[9px] text-error font-bold uppercase shrink-0">{t('gmModal.detail.dead')}</span>}
      </div>
      <div className="text-[10px] text-on-surface-variant space-y-0.5">
        {npc.role && <div><span className="text-outline">{t('gmModal.detail.role')}:</span> {npc.role}</div>}
        {npc.personality && <div><span className="text-outline">{t('gmModal.detail.personality')}:</span> {npc.personality}</div>}
        {npc.lastLocation && <div><span className="text-outline">{t('gmModal.detail.location')}:</span> {npc.lastLocation}</div>}
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {npc.attitude && (
          <span className={`text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
            npc.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
            npc.attitude === 'hostile' ? 'bg-error/15 text-error' :
            'bg-outline/10 text-outline'
          }`}>{t(`gmModal.attitudes.${npc.attitude}`, npc.attitude)}</span>
        )}
        {npc.disposition != null && npc.disposition !== 0 && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${
            npc.disposition > 0 ? 'bg-primary/15 text-primary' : 'bg-error/15 text-error'
          }`}>{npc.disposition > 0 ? '+' : ''}{npc.disposition}</span>
        )}
        {npc.factionId && (
          <span className="text-[9px] text-outline px-1.5 py-0.5 rounded-sm bg-surface-container/60">
            {FACTION_DEFINITIONS[npc.factionId]?.name || npc.factionId}
          </span>
        )}
      </div>
      {npc.relationships?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-outline-variant/10">
          {npc.relationships.map((rel, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary/80">
              {rel.npcName} ({rel.type})
            </span>
          ))}
        </div>
      )}
      {npc.notes && <div className="text-[10px] text-outline italic mt-1.5 pt-1.5 border-t border-outline-variant/10">{npc.notes}</div>}
    </div>
  );
}

function LocationCard({ location, isCurrent, t }) {
  const npcsHere = [];
  return (
    <div className={`p-3 rounded-sm border ${isCurrent ? 'bg-primary/10 border-primary/25' : 'bg-surface-container/40 border-outline-variant/10'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-sm text-primary">place</span>
        <span className="text-[11px] font-bold text-on-surface truncate">{location.name}</span>
        {isCurrent && <span className="text-[9px] text-primary font-label uppercase tracking-wider">{t('gmModal.detail.currentLocation')}</span>}
      </div>
      {location.description && (
        <p className="text-[10px] text-on-surface-variant mb-1">{location.description}</p>
      )}
      {location.modifications?.length > 0 && (
        <div className="space-y-0.5 mt-1">
          {location.modifications.map((mod, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[9px] text-outline">
              <span className="material-symbols-outlined text-[10px] mt-0.5">
                {mod.type === 'trap' ? 'warning' : mod.type === 'destruction' ? 'dangerous' : mod.type === 'discovery' ? 'search' : 'change_circle'}
              </span>
              <span>{mod.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FactionCard({ faction, t }) {
  const { def, reputation } = faction;
  const tierData = getReputationTierData(reputation);
  const pct = ((reputation + 100) / 200) * 100;
  const colorClass = tierData.color === 'error' ? 'text-error bg-error'
    : tierData.color === 'primary' ? 'text-primary bg-primary'
    : tierData.color === 'tertiary' ? 'text-tertiary bg-tertiary'
    : 'text-outline bg-outline';
  const textColor = colorClass.split(' ')[0];
  const bgColor = colorClass.split(' ')[1];

  return (
    <div className="p-3 rounded-sm bg-surface-container/40 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`material-symbols-outlined text-sm ${textColor}`}>{def?.icon || 'shield'}</span>
          <span className="text-[11px] font-bold text-on-surface truncate">{def?.name || faction.id}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${bgColor}/15 ${textColor}`}>{t(`gmModal.reputationTiers.${tierData.tier}`, tierData.label)}</span>
          <span className={`text-[10px] font-bold tabular-nums ${textColor}`}>{reputation > 0 ? '+' : ''}{reputation}</span>
        </div>
      </div>
      <div className="h-1 bg-surface-container rounded-full overflow-hidden mb-2">
        <div className={`h-full ${bgColor} transition-all duration-300 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      {def?.effects[tierData.tier] && (
        <p className="text-[9px] text-on-surface-variant">{def.effects[tierData.tier]}</p>
      )}
    </div>
  );
}
