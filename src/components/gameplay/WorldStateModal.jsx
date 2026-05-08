import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import QuestsTab from './world/QuestsTab';
import NpcTab from './world/NpcTab';
import TimeTab from './world/TimeTab';
import EffectsTab from './world/EffectsTab';
import JournalTab from './world/JournalTab';
import FactionsTab from './world/FactionsTab';
import MapTab from './world/MapTab';

const TABS = ['map', 'npcs', 'quests', 'factions', 'time', 'effects', 'journal'];
const TAB_ICONS = { map: 'map', npcs: 'group', quests: 'assignment', factions: 'groups', time: 'schedule', effects: 'auto_fix_high', journal: 'menu_book' };

export default function WorldStateModal({ world, quests, characterVoiceMap, maleVoices, femaleVoices, ttsProvider, dispatch, autoSave, campaignId, currentSceneId, initialTab = 'npcs', onTravel, onEnterSub, onClose }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [highlightId, setHighlightId] = useState(null);
  const contentRef = useRef(null);
  const modalRef = useModalA11y(onClose);

  const npcs = world?.npcs || [];
  const currentLocation = world?.currentLocation || '';
  const timeState = world?.timeState || { day: 1, timeOfDay: 'morning', season: 'unknown' };
  const activeEffects = (world?.activeEffects || []).filter((e) => e.active !== false);
  const eventHistory = world?.eventHistory || [];
  const compressedHistory = world?.compressedHistory || '';
  const factions = world?.factions || {};

  const navigateTo = useCallback((tab, entityId) => {
    setActiveTab(tab);
    setHighlightId(entityId || null);
  }, []);

  useEffect(() => {
    if (TABS.includes(initialTab)) setActiveTab(initialTab);
  }, [initialTab]);

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
        className={`relative w-full max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in ${
          activeTab === 'map' ? 'max-w-[80vw] h-[88vh]' : 'max-w-5xl'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">public</span>
            {t('worldState.title')}
          </h2>
          <button onClick={onClose} aria-label={t('common.close')} className="text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex border-b border-outline-variant/15 px-2 gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-label uppercase tracking-widest transition-colors whitespace-nowrap border-b-2 ${
                activeTab === tab
                  ? 'text-primary border-primary'
                  : 'text-outline border-transparent hover:text-on-surface-variant hover:border-outline-variant/30'
              }`}
            >
              <span className="material-symbols-outlined text-base">{TAB_ICONS[tab]}</span>
              {t(`worldState.tabs.${tab}`)}
            </button>
          ))}
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {activeTab === 'map' && (
            <MapTab campaignId={campaignId} onTravel={onTravel} />
          )}
          {activeTab === 'npcs' && (
            <NpcTab npcs={npcs} quests={quests} characterVoiceMap={characterVoiceMap} maleVoices={maleVoices} femaleVoices={femaleVoices} ttsProvider={ttsProvider} dispatch={dispatch} autoSave={autoSave} navigateTo={navigateTo} t={t} />
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
