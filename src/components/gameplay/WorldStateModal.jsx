import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import MapCanvas from './MapCanvas';
import CustomSelect from '../ui/CustomSelect';
import { FACTION_DEFINITIONS, getReputationTierData } from '../../data/rpgFactions';

const TABS = ['npcs', 'map', 'quests', 'factions', 'time', 'effects', 'journal'];
const TAB_ICONS = { npcs: 'group', map: 'map', quests: 'assignment', factions: 'groups', time: 'schedule', effects: 'auto_fix_high', journal: 'menu_book' };

function matchName(a, b) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function findQuestsForNpc(npc, quests) {
  const all = [...(quests?.active || []), ...(quests?.completed || [])];
  return all.filter((q) =>
    matchName(q.questGiverId, npc.name) || matchName(q.questGiverId, npc.id) ||
    matchName(q.turnInNpcId, npc.name) || matchName(q.turnInNpcId, npc.id) ||
    (npc.relatedQuestIds || []).includes(q.id)
  );
}

function findQuestsForLocation(locName, quests) {
  const all = [...(quests?.active || []), ...(quests?.completed || [])];
  return all.filter((q) => matchName(q.locationId, locName));
}

function findNpcsAtLocation(locName, npcs) {
  return (npcs || []).filter((n) => matchName(n.lastLocation, locName));
}

function findNpcByRef(ref, npcs) {
  if (!ref) return null;
  return (npcs || []).find((n) => matchName(n.name, ref) || matchName(n.id, ref));
}

function CrossLinkChip({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
    >
      <span className="material-symbols-outlined text-[10px]">{icon}</span>
      <span className="truncate max-w-[120px]">{label}</span>
    </button>
  );
}

export default function WorldStateModal({ world, quests, characterVoiceMap, characterVoices, dispatch, autoSave, onClose }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('npcs');
  const [highlightId, setHighlightId] = useState(null);
  const contentRef = useRef(null);
  const modalRef = useModalA11y(onClose);

  const npcs = world?.npcs || [];
  const mapState = world?.mapState || [];
  const mapConnections = world?.mapConnections || [];
  const currentLocation = world?.currentLocation || '';
  const timeState = world?.timeState || { day: 1, timeOfDay: 'morning', season: 'unknown' };
  const activeEffects = (world?.activeEffects || []).filter((e) => e.active !== false);
  const eventHistory = world?.eventHistory || [];
  const compressedHistory = world?.compressedHistory || '';
  const factions = world?.factions || {};
  const exploredLocations = world?.exploredLocations || [];

  const navigateTo = useCallback((tab, entityId) => {
    setActiveTab(tab);
    setHighlightId(entityId || null);
  }, []);

  useEffect(() => {
    if (!highlightId || !contentRef.current) return;
    const timer = setTimeout(() => {
      const el = contentRef.current?.querySelector(`[data-entity-id="${CSS.escape(highlightId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('ring-2', 'ring-primary/50');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary/50');
          setHighlightId(null);
        }, 2000);
      } else {
        setHighlightId(null);
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [highlightId, activeTab]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('worldState.title')}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[80vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">public</span>
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest">{t('worldState.title')}</h2>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
        </div>

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

        <div ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {activeTab === 'npcs' && (
            <NpcTab npcs={npcs} quests={quests} characterVoiceMap={characterVoiceMap} characterVoices={characterVoices} dispatch={dispatch} autoSave={autoSave} navigateTo={navigateTo} t={t} />
          )}
          {activeTab === 'map' && (
            <MapTab mapState={mapState} currentLocation={currentLocation} connections={mapConnections} exploredLocations={exploredLocations} npcs={npcs} quests={quests} navigateTo={navigateTo} t={t} />
          )}
          {activeTab === 'quests' && (
            <QuestsTab quests={quests} npcs={npcs} navigateTo={navigateTo} t={t} />
          )}
          {activeTab === 'factions' && (
            <FactionsTab factions={factions} t={t} />
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

/* ── Quests Tab ── */

function QuestsTab({ quests, npcs, navigateTo, t }) {
  const active = quests?.active || [];
  const completed = quests?.completed || [];
  const [showCompleted, setShowCompleted] = useState(false);

  if (active.length === 0 && completed.length === 0) {
    return <EmptyState icon="assignment" text={t('worldState.emptyQuests')} />;
  }

  const typeColors = {
    main: 'bg-tertiary/15 text-tertiary',
    side: 'bg-primary/15 text-primary',
    personal: 'bg-secondary/15 text-secondary',
  };

  const renderQuest = (quest, isCompleted) => (
    <div
      key={quest.id}
      data-entity-id={quest.id}
      className={`p-3 rounded-sm border transition-all ${isCompleted ? 'bg-surface-container/20 border-outline-variant/10 opacity-60' : 'bg-surface-container/40 border-outline-variant/10'}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-primary">{isCompleted ? 'task_alt' : 'assignment'}</span>
          <span className="text-sm font-bold text-on-surface">{quest.name}</span>
        </div>
        {quest.type && (
          <span className={`text-[10px] font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${typeColors[quest.type] || typeColors.side}`}>
            {t(`worldState.${quest.type}`)}
          </span>
        )}
      </div>

      {quest.description && (
        <p className="text-[11px] text-on-surface-variant mb-2">{quest.description}</p>
      )}

      {quest.objectives?.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-outline uppercase tracking-wider mb-1">{t('worldState.objectives')}</div>
          {quest.objectives.map((obj) => (
            <div key={obj.id} className="flex items-start gap-1.5 text-[11px] text-on-surface-variant">
              <span className={`material-symbols-outlined text-[12px] mt-0.5 ${obj.completed ? 'text-primary' : 'text-outline'}`}>
                {obj.completed ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={obj.completed ? 'line-through text-outline' : ''}>{obj.description}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {quest.questGiverId && (
          <CrossLinkChip
            icon="person"
            label={`${t('worldState.questGiver')}: ${quest.questGiverId}`}
            onClick={() => {
              const npc = findNpcByRef(quest.questGiverId, npcs);
              navigateTo('npcs', npc?.id || quest.questGiverId);
            }}
          />
        )}
        {quest.turnInNpcId && quest.turnInNpcId !== quest.questGiverId && (
          <CrossLinkChip
            icon="person_pin"
            label={`${t('worldState.turnIn')}: ${quest.turnInNpcId}`}
            onClick={() => {
              const npc = findNpcByRef(quest.turnInNpcId, npcs);
              navigateTo('npcs', npc?.id || quest.turnInNpcId);
            }}
          />
        )}
        {quest.locationId && (
          <CrossLinkChip
            icon="location_on"
            label={quest.locationId}
            onClick={() => navigateTo('map', quest.locationId)}
          />
        )}
      </div>

      {quest.reward && (
        <div className="text-[10px] text-outline mt-2 pt-1.5 border-t border-outline-variant/10">
          <span className="text-outline">{t('worldState.reward')}:</span>{' '}
          {quest.reward.xp > 0 && <span>{quest.reward.xp} XP</span>}
          {quest.reward.money && (quest.reward.money.gold > 0 || quest.reward.money.silver > 0 || quest.reward.money.copper > 0) && (
            <span>
              {quest.reward.xp > 0 && ', '}
              {quest.reward.money.gold > 0 && `${quest.reward.money.gold} GC `}
              {quest.reward.money.silver > 0 && `${quest.reward.money.silver} SS `}
              {quest.reward.money.copper > 0 && `${quest.reward.money.copper} CP`}
            </span>
          )}
          {quest.reward.description && <span> — {quest.reward.description}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <>
          <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-1">
            {t('worldState.activeQuests')} ({active.length})
          </div>
          {active.map((q) => renderQuest(q, false))}
        </>
      )}

      {completed.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-label uppercase tracking-widest text-outline hover:text-on-surface-variant transition-colors px-1"
          >
            <span className="material-symbols-outlined text-xs">{showCompleted ? 'expand_less' : 'expand_more'}</span>
            {t('worldState.completedQuests')} ({completed.length})
          </button>
          {showCompleted && (
            <div className="space-y-3 mt-2">
              {completed.map((q) => renderQuest(q, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── NPC Tab ── */

function NpcTab({ npcs, quests, characterVoiceMap, characterVoices, dispatch, autoSave, navigateTo, t }) {
  if (npcs.length === 0) {
    return <EmptyState icon="group" text={t('worldState.emptyNpcs')} />;
  }

  const hasVoicePool = characterVoices && characterVoices.length > 0;

  const handleVoiceChange = (npcName, npcGender, voiceId) => {
    dispatch({
      type: 'MAP_CHARACTER_VOICE',
      payload: { characterName: npcName, voiceId: voiceId || null, gender: npcGender || null },
    });
    if (autoSave) setTimeout(() => autoSave(), 300);
  };

  return (
    <div className="grid gap-3">
      {npcs.map((npc) => {
        const mapping = characterVoiceMap?.[npc.name];
        const currentVoiceId = mapping?.voiceId;
        const relatedQuests = findQuestsForNpc(npc, quests);

        return (
          <div key={npc.id} data-entity-id={npc.id} className={`p-3 rounded-sm border transition-all ${npc.alive === false ? 'bg-error-container/10 border-error/15 opacity-60' : 'bg-surface-container/40 border-outline-variant/10'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary">person</span>
                <span className="text-sm font-bold text-on-surface">{npc.name}</span>
                {npc.gender && <span className="text-[10px] text-outline">({npc.gender})</span>}
                {npc.alive === false && <span className="text-[10px] text-error font-bold uppercase">{t('worldState.dead')}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {npc.disposition != null && npc.disposition !== 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                    npc.disposition > 0
                      ? 'bg-primary/15 text-primary'
                      : 'bg-error/15 text-error'
                  }`}>
                    {npc.disposition > 0 ? '+' : ''}{npc.disposition}
                  </span>
                )}
                {npc.attitude && (
                  <span className={`text-[10px] font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                    npc.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
                    npc.attitude === 'hostile' ? 'bg-error/15 text-error' :
                    'bg-outline/10 text-outline'
                  }`}>{npc.attitude}</span>
                )}
              </div>
            </div>
            <div className="text-[11px] text-on-surface-variant space-y-0.5">
              {npc.role && <div><span className="text-outline">{t('worldState.role')}:</span> {npc.role}</div>}
              {npc.personality && <div><span className="text-outline">{t('worldState.personality')}:</span> {npc.personality}</div>}
              {npc.lastLocation && (
                <div className="flex items-center gap-1">
                  <span className="text-outline">{t('worldState.location')}:</span>
                  <button
                    onClick={() => navigateTo('map', npc.lastLocation)}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    {npc.lastLocation}
                  </button>
                </div>
              )}
              {npc.notes && <div className="text-outline italic mt-1">{npc.notes}</div>}
            </div>

            {relatedQuests.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-outline-variant/10">
                <span className="text-[10px] text-outline">{t('worldState.relatedQuests')}:</span>
                {relatedQuests.map((q) => (
                  <CrossLinkChip
                    key={q.id}
                    icon="assignment"
                    label={q.name}
                    onClick={() => navigateTo('quests', q.id)}
                  />
                ))}
              </div>
            )}

            {hasVoicePool && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-outline-variant/10">
                <span className="material-symbols-outlined text-xs text-outline">record_voice_over</span>
                <span className="text-[10px] text-outline shrink-0">{t('worldState.voice')}:</span>
                <CustomSelect
                  value={currentVoiceId || ''}
                  onChange={(nextVoiceId) => handleVoiceChange(npc.name, npc.gender, nextVoiceId)}
                  options={[
                    { value: '', label: t('worldState.noVoice') },
                    ...characterVoices.map((v) => ({
                      value: v.voiceId,
                      label: `${v.voiceName}${v.gender ? ` (${v.gender === 'male' ? '\u2642' : '\u2640'})` : ''}`,
                    })),
                  ]}
                  className="flex-1 min-w-0"
                  buttonClassName="text-[11px] py-1 px-2 border-outline-variant/15"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Map Tab ── */

function MapTab({ mapState, currentLocation, connections, exploredLocations, npcs, quests, navigateTo, t }) {
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

/* ── Time Tab ── */

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
        <div className="text-lg font-bold text-on-surface capitalize">{t(`worldState.periods.${timeState.timeOfDay}`, timeState.timeOfDay)}</div>
        <div className="text-sm text-on-surface-variant">{t('worldState.day')} {timeState.day}</div>
        <div className="text-[11px] text-outline capitalize">{t('worldState.season')}: {t(`worldState.seasons.${timeState.season}`, timeState.season)}</div>
      </div>
    </div>
  );
}

/* ── Effects Tab ── */

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

/* ── Journal Tab ── */

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

/* ── Factions Tab ── */

function FactionsTab({ factions, t }) {
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

/* ── Shared ── */

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-outline">
      <span className="material-symbols-outlined text-3xl">{icon}</span>
      <p className="text-[11px] font-label uppercase tracking-widest">{text}</p>
    </div>
  );
}
