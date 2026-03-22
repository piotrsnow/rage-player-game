import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import MapCanvas from './MapCanvas';

const TABS = ['npcs', 'map', 'time', 'effects', 'journal'];
const TAB_ICONS = { npcs: 'group', map: 'map', time: 'schedule', effects: 'auto_fix_high', journal: 'menu_book' };

export default function WorldStateModal({ world, characterVoiceMap, characterVoices, dispatch, onClose }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('npcs');

  const npcs = world?.npcs || [];
  const mapState = world?.mapState || [];
  const mapConnections = world?.mapConnections || [];
  const currentLocation = world?.currentLocation || '';
  const timeState = world?.timeState || { day: 1, timeOfDay: 'morning', season: 'unknown' };
  const activeEffects = (world?.activeEffects || []).filter((e) => e.active !== false);
  const eventHistory = world?.eventHistory || [];
  const compressedHistory = world?.compressedHistory || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[80vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">public</span>
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest">{t('worldState.title')}</h2>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/10 px-2 gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-label uppercase tracking-widest transition-colors whitespace-nowrap border-b-2 ${
                activeTab === tab
                  ? 'text-primary border-primary'
                  : 'text-outline border-transparent hover:text-on-surface-variant hover:border-outline-variant/30'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{TAB_ICONS[tab]}</span>
              {t(`worldState.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {activeTab === 'npcs' && (
            <NpcTab npcs={npcs} characterVoiceMap={characterVoiceMap} characterVoices={characterVoices} dispatch={dispatch} t={t} />
          )}
          {activeTab === 'map' && (
            <MapTab mapState={mapState} currentLocation={currentLocation} connections={mapConnections} t={t} />
          )}
          {activeTab === 'time' && (
            <TimeTab timeState={timeState} t={t} />
          )}
          {activeTab === 'effects' && (
            <EffectsTab effects={activeEffects} t={t} />
          )}
          {activeTab === 'journal' && (
            <JournalTab eventHistory={eventHistory} compressedHistory={compressedHistory} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

function NpcTab({ npcs, characterVoiceMap, characterVoices, dispatch, t }) {
  if (npcs.length === 0) {
    return <EmptyState icon="group" text={t('worldState.emptyNpcs')} />;
  }

  const hasVoicePool = characterVoices && characterVoices.length > 0;

  const handleVoiceChange = (npcName, npcGender, voiceId) => {
    if (!voiceId) return;
    dispatch({
      type: 'MAP_CHARACTER_VOICE',
      payload: { characterName: npcName, voiceId, gender: npcGender || null },
    });
  };

  return (
    <div className="grid gap-3">
      {npcs.map((npc) => {
        const mapping = characterVoiceMap?.[npc.name];
        const currentVoiceId = mapping?.voiceId;
        const currentVoiceName = currentVoiceId
          ? characterVoices?.find((v) => v.voiceId === currentVoiceId)?.voiceName
          : null;

        return (
          <div key={npc.id} className={`p-3 rounded-sm border ${npc.alive === false ? 'bg-error-container/10 border-error/15 opacity-60' : 'bg-surface-container/40 border-outline-variant/10'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary">person</span>
                <span className="text-sm font-bold text-on-surface">{npc.name}</span>
                {npc.gender && <span className="text-[10px] text-outline">({npc.gender})</span>}
                {npc.alive === false && <span className="text-[10px] text-error font-bold uppercase">{t('worldState.dead')}</span>}
              </div>
              {npc.attitude && (
                <span className={`text-[10px] font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                  npc.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
                  npc.attitude === 'hostile' ? 'bg-error/15 text-error' :
                  'bg-outline/10 text-outline'
                }`}>{npc.attitude}</span>
              )}
            </div>
            <div className="text-[11px] text-on-surface-variant space-y-0.5">
              {npc.role && <div><span className="text-outline">{t('worldState.role')}:</span> {npc.role}</div>}
              {npc.personality && <div><span className="text-outline">{t('worldState.personality')}:</span> {npc.personality}</div>}
              {npc.lastLocation && <div><span className="text-outline">{t('worldState.location')}:</span> {npc.lastLocation}</div>}
              {npc.notes && <div className="text-outline italic mt-1">{npc.notes}</div>}
            </div>
            {hasVoicePool && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-outline-variant/10">
                <span className="material-symbols-outlined text-xs text-outline">record_voice_over</span>
                <span className="text-[10px] text-outline shrink-0">{t('worldState.voice')}:</span>
                <select
                  value={currentVoiceId || ''}
                  onChange={(e) => handleVoiceChange(npc.name, npc.gender, e.target.value)}
                  className="flex-1 min-w-0 text-[11px] bg-surface-container/60 border border-outline-variant/15 rounded-sm px-2 py-1 text-on-surface appearance-none cursor-pointer hover:border-primary/30 transition-colors focus:outline-none focus:border-primary/50"
                >
                  <option value="">{t('worldState.noVoice')}</option>
                  {characterVoices.map((v) => (
                    <option key={v.voiceId} value={v.voiceId}>
                      {v.voiceName}{v.gender ? ` (${v.gender === 'male' ? '\u2642' : '\u2640'})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MapTab({ mapState, currentLocation, connections, t }) {
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
          <MapCanvas mapState={mapState} currentLocation={currentLocation} connections={connections} />
        </div>
      )}

      {mapState.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-outline-variant/10">
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1">
            {t('worldState.mapExplored')}
          </div>
          {mapState.map((loc) => {
            const isCurrent = loc.name?.toLowerCase() === currentLocation?.toLowerCase();
            return (
              <div key={loc.id} className={`p-2.5 rounded-sm border ${isCurrent ? 'bg-primary/10 border-primary/25' : 'bg-surface-container/40 border-outline-variant/10'}`}>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimeTab({ timeState, t }) {
  const timeIcons = { morning: 'wb_sunny', afternoon: 'light_mode', evening: 'wb_twilight', night: 'dark_mode' };
  const hour = timeState.hour ?? 6;
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  const displayHour = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6">
      <span className="material-symbols-outlined text-5xl text-primary">{timeIcons[timeState.timeOfDay] || 'schedule'}</span>
      <div className="text-center space-y-2">
        <div className="text-3xl font-headline text-primary tabular-nums">{displayHour}</div>
        <div className="text-lg font-bold text-on-surface capitalize">{timeState.timeOfDay}</div>
        <div className="text-sm text-on-surface-variant">{t('worldState.day')} {timeState.day}</div>
        <div className="text-[11px] text-outline capitalize">{t('worldState.season')}: {timeState.season}</div>
      </div>
    </div>
  );
}

function EffectsTab({ effects, t }) {
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

function JournalTab({ eventHistory, compressedHistory, t }) {
  if (eventHistory.length === 0 && !compressedHistory) {
    return <EmptyState icon="menu_book" text={t('worldState.emptyJournal')} />;
  }
  return (
    <div className="space-y-4">
      {compressedHistory && (
        <div className="p-3 rounded-sm bg-primary/5 border border-primary/15">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-sm text-primary">summarize</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-primary">{t('worldState.archivedHistory')}</span>
          </div>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">{compressedHistory}</p>
        </div>
      )}
      {eventHistory.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1">{t('worldState.eventLog')}</div>
          {eventHistory.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-on-surface-variant">
              <span className="text-outline shrink-0 w-5 text-right">{i + 1}.</span>
              <span>{entry}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-outline">
      <span className="material-symbols-outlined text-3xl">{icon}</span>
      <p className="text-[11px] font-label uppercase tracking-widest">{text}</p>
    </div>
  );
}
