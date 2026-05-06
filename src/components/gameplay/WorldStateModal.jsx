import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import QuestsTab from './world/QuestsTab';
import NpcTab from './world/NpcTab';
import MapTab from './world/MapTab';
import TimeTab from './world/TimeTab';
import EffectsTab from './world/EffectsTab';
import JournalTab from './world/JournalTab';
import FactionsTab from './world/FactionsTab';

const LocationGraphModal = lazy(() => import('./locationGraph/LocationGraphModal'));

const TABS = ['npcs', 'map', 'graph', 'quests', 'factions', 'time', 'effects', 'journal'];
const TAB_ICONS = { npcs: 'group', map: 'map', graph: 'hub', quests: 'assignment', factions: 'groups', time: 'schedule', effects: 'auto_fix_high', journal: 'menu_book' };

export default function WorldStateModal({ world, quests, characterVoiceMap, maleVoices, femaleVoices, ttsProvider, dispatch, autoSave, campaignId, currentSceneId, onTravel, onEnterSub, onClose }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('npcs');
  const [highlightId, setHighlightId] = useState(null);
  const [showGraphModal, setShowGraphModal] = useState(false);
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
            <NpcTab npcs={npcs} quests={quests} characterVoiceMap={characterVoiceMap} maleVoices={maleVoices} femaleVoices={femaleVoices} ttsProvider={ttsProvider} dispatch={dispatch} autoSave={autoSave} navigateTo={navigateTo} t={t} />
          )}
          {activeTab === 'map' && (
            <MapTab campaignId={campaignId} currentSceneId={currentSceneId} currentLocation={currentLocation} onTravel={onTravel} onEnterSub={onEnterSub} t={t} />
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
          {activeTab === 'graph' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <span className="material-symbols-outlined text-3xl text-primary">hub</span>
              <p className="text-[11px] text-on-surface-variant">{t('locationGraph.openFullEditor')}</p>
              <button
                onClick={() => setShowGraphModal(true)}
                className="px-4 py-2 bg-primary/20 text-primary rounded-sm hover:bg-primary/30 transition-colors text-xs uppercase tracking-widest font-bold"
              >
                {t('locationGraph.openEditor')}
              </button>
            </div>
          )}
        </div>
      </div>

      {showGraphModal && (
        <Suspense fallback={null}>
          <LocationGraphModal campaignId={campaignId} onClose={() => setShowGraphModal(false)} />
        </Suspense>
      )}
    </div>
  );
}
