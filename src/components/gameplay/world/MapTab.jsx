import MapCanvas from '../MapCanvas';
import { CrossLinkChip, EmptyState, findNpcsAtLocation, findQuestsForLocation } from './shared';

export default function MapTab({ mapState, currentLocation, connections, exploredLocations, npcs, quests, navigateTo, t }) {
  if (mapState.length === 0 && !currentLocation) {
    return <EmptyState icon="map" text={t('worldState.emptyMap')} />;
  }

  const hasGraph = mapState.length > 0 || currentLocation;

  return (
    <div className="space-y-3">
      {currentLocation && (
        <div className="flex items-center gap-2 px-1">
          <span className="material-symbols-outlined text-sm text-primary">my_location</span>
          <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('worldState.currentLocation')}:</span>
          <span className="text-sm font-bold text-primary">{currentLocation}</span>
        </div>
      )}

      {hasGraph && (
        <div className="h-[280px]">
          <MapCanvas mapState={mapState} currentLocation={currentLocation} connections={connections} exploredLocations={exploredLocations} />
        </div>
      )}

      {mapState.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-outline-variant/10">
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1">
            {t('worldState.mapExplored')}
          </div>
          {mapState.map((loc) => {
            const isCurrent = loc.name?.toLowerCase() === currentLocation?.toLowerCase();
            const npcsHere = findNpcsAtLocation(loc.name, npcs);
            const locQuests = findQuestsForLocation(loc.name, quests);

            return (
              <div key={loc.id} data-entity-id={loc.name} className={`p-2.5 rounded-sm border transition-all ${isCurrent ? 'bg-primary/10 border-primary/25' : 'bg-surface-container/40 border-outline-variant/10'}`}>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-xs text-primary">location_on</span>
                  <span className="text-[11px] font-bold text-on-surface">{loc.name}</span>
                  {isCurrent && <span className="text-[9px] text-primary font-label uppercase tracking-wider">{t('worldState.here')}</span>}
                </div>
                {loc.modifications?.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {loc.modifications.map((mod, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10px] text-outline">
                        <span className="material-symbols-outlined text-[10px] mt-0.5">{
                          mod.type === 'trap' ? 'warning' :
                          mod.type === 'destruction' ? 'dangerous' :
                          mod.type === 'discovery' ? 'search' :
                          'change_circle'
                        }</span>
                        <span>[{mod.type}] {mod.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(npcsHere.length > 0 || locQuests.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-outline-variant/10">
                    {npcsHere.length > 0 && (
                      <>
                        <span className="text-[10px] text-outline">{t('worldState.npcsHere')}:</span>
                        {npcsHere.map((n) => (
                          <CrossLinkChip
                            key={n.id}
                            icon="person"
                            label={n.name}
                            onClick={() => navigateTo('npcs', n.id)}
                          />
                        ))}
                      </>
                    )}
                    {locQuests.length > 0 && (
                      <>
                        <span className="text-[10px] text-outline">{t('worldState.relatedQuests')}:</span>
                        {locQuests.map((q) => (
                          <CrossLinkChip
                            key={q.id}
                            icon="assignment"
                            label={q.name}
                            onClick={() => navigateTo('quests', q.id)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
