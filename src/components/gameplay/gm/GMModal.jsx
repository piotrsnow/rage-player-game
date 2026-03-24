import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useGame } from '../../../contexts/GameContext';
import { useMultiplayer } from '../../../contexts/MultiplayerContext';
import GMGraphTab from './GMGraphTab';
import GMEntitiesTab from './GMEntitiesTab';
import GMQuestsTab from './GMQuestsTab';
import GMJournalTab from './GMJournalTab';
import GMAssetsTab from './GMAssetsTab';
import GMOverviewTab from './GMOverviewTab';

const TABS = ['graph', 'entities', 'quests', 'journal', 'assets', 'overview'];
const TAB_ICONS = {
  graph: 'hub',
  entities: 'group',
  quests: 'assignment',
  journal: 'menu_book',
  assets: 'inventory_2',
  overview: 'dashboard',
};

export default function GMModal({ onClose }) {
  const { t } = useTranslation();
  const { state } = useGame();
  const mp = useMultiplayer();
  const [activeTab, setActiveTab] = useState('graph');
  const modalRef = useModalA11y(onClose);

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const gameState = isMultiplayer
    ? { ...state, ...(mp.state.gameState || {}), world: mp.state.gameState?.world || state.world }
    : state;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('gmModal.title')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">auto_stories</span>
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest">
              {t('gmModal.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors"
          >
            close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/10 px-2 gap-1 overflow-x-auto shrink-0">
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
              {t(`gmModal.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'graph' && <GMGraphTab gameState={gameState} />}
          {activeTab === 'entities' && <GMEntitiesTab gameState={gameState} />}
          {activeTab === 'quests' && <GMQuestsTab gameState={gameState} />}
          {activeTab === 'journal' && <GMJournalTab gameState={gameState} />}
          {activeTab === 'assets' && <GMAssetsTab gameState={gameState} />}
          {activeTab === 'overview' && <GMOverviewTab gameState={gameState} />}
        </div>
      </div>
    </div>
  );
}
