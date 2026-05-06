import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useGame } from '../../../contexts/GameContext';
import { useMultiplayer } from '../../../contexts/MultiplayerContext';
import { useSettings } from '../../../contexts/SettingsContext';
import GMGraphTab from './GMGraphTab';
import GMEntitiesTab from './GMEntitiesTab';
import GMQuestsTab from './GMQuestsTab';
import GMJournalTab from './GMJournalTab';
import GMAssetsTab from './GMAssetsTab';
import GMOverviewTab from './GMOverviewTab';

const NpcListTab = lazy(() => import('../../admin/adminLivingWorld/tabs/NpcListTab'));
const LocationListTab = lazy(() => import('../../admin/adminLivingWorld/tabs/LocationListTab'));
const EventTimelineTab = lazy(() => import('../../admin/adminLivingWorld/tabs/EventTimelineTab'));
const ReputationListTab = lazy(() => import('../../admin/adminLivingWorld/tabs/ReputationListTab'));
const MapTab = lazy(() => import('../../admin/adminLivingWorld/tabs/MapTab'));
const AdminWorldLoreTab = lazy(() => import('../../admin/AdminWorldLoreTab'));
const PromotionsTab = lazy(() => import('../../admin/adminLivingWorld/tabs/PromotionsTab'));
const CanonGraphTab = lazy(() => import('../../admin/adminLivingWorld/tabs/CanonGraphTab'));
const FontConfigTab = lazy(() => import('../../admin/adminLivingWorld/tabs/FontConfigTab'));

const GAME_TABS = ['graph', 'entities', 'quests', 'journal', 'assets', 'overview'];
const ADMIN_TABS = ['admin-npcs', 'admin-locations', 'admin-events', 'admin-reputation', 'admin-map', 'admin-lore', 'admin-promotions', 'admin-canon', 'admin-fonts'];

const TAB_ICONS = {
  graph: 'hub',
  entities: 'group',
  quests: 'assignment',
  journal: 'menu_book',
  assets: 'inventory_2',
  overview: 'dashboard',
  'admin-npcs': 'group',
  'admin-locations': 'location_on',
  'admin-events': 'timeline',
  'admin-reputation': 'military_tech',
  'admin-map': 'map',
  'admin-lore': 'auto_stories',
  'admin-promotions': 'approval',
  'admin-canon': 'account_tree',
  'admin-fonts': 'font_download',
};

const TAB_LABELS = {
  'admin-npcs': 'NPCs',
  'admin-locations': 'Locations',
  'admin-events': 'Events',
  'admin-reputation': 'Reputation',
  'admin-map': 'Map',
  'admin-lore': 'Lore',
  'admin-promotions': 'Promotions',
  'admin-canon': 'Canon',
  'admin-fonts': 'Fonts',
};

const ADMIN_TAB_COMPONENTS = {
  'admin-npcs': NpcListTab,
  'admin-locations': LocationListTab,
  'admin-events': EventTimelineTab,
  'admin-reputation': ReputationListTab,
  'admin-map': MapTab,
  'admin-lore': AdminWorldLoreTab,
  'admin-promotions': PromotionsTab,
  'admin-canon': CanonGraphTab,
  'admin-fonts': FontConfigTab,
};

function AdminTabFallback() {
  return <div className="flex items-center justify-center h-32 text-on-surface-variant text-sm">Loading…</div>;
}

export default function GMModal({ onClose }) {
  const { t } = useTranslation();
  const { state } = useGame();
  const mp = useMultiplayer();
  const { backendUser } = useSettings();
  const isAdmin = !!backendUser?.isAdmin;
  const [activeTab, setActiveTab] = useState('graph');
  const modalRef = useModalA11y(onClose);

  const allTabs = useMemo(
    () => (isAdmin ? [...GAME_TABS, ...ADMIN_TABS] : GAME_TABS),
    [isAdmin],
  );

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const gameState = isMultiplayer
    ? { ...state, ...(mp.state.gameState || {}), world: mp.state.gameState?.world || state.world }
    : state;

  const AdminTab = ADMIN_TAB_COMPONENTS[activeTab];

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
        className="relative w-full max-w-[95vw] h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">auto_stories</span>
            {t('gmModal.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/15 px-2 gap-1 overflow-x-auto shrink-0">
          {allTabs.map((tab, i) => {
            const isFirstAdmin = tab === ADMIN_TABS[0];
            return (
              <div key={tab} className="flex items-center">
                {isFirstAdmin && (
                  <div className="flex items-center gap-1.5 mr-1 ml-1 pl-2 border-l border-outline-variant/25 self-stretch">
                    <span className="text-[9px] font-label uppercase tracking-widest text-tertiary/70 whitespace-nowrap self-center">
                      Admin
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-label uppercase tracking-widest transition-colors whitespace-nowrap border-b-2 ${
                    activeTab === tab
                      ? 'text-primary border-primary'
                      : 'text-outline border-transparent hover:text-on-surface-variant hover:border-outline-variant/30'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">{TAB_ICONS[tab]}</span>
                  {TAB_LABELS[tab] || t(`gmModal.tabs.${tab}`)}
                </button>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'graph' && <GMGraphTab gameState={gameState} />}
          {activeTab === 'entities' && <GMEntitiesTab gameState={gameState} />}
          {activeTab === 'quests' && <GMQuestsTab gameState={gameState} />}
          {activeTab === 'journal' && <GMJournalTab gameState={gameState} />}
          {activeTab === 'assets' && <GMAssetsTab gameState={gameState} />}
          {activeTab === 'overview' && <GMOverviewTab gameState={gameState} />}
          {AdminTab && (
            <Suspense fallback={<AdminTabFallback />}>
              <div className="h-full overflow-y-auto custom-scrollbar p-4">
                <AdminTab />
              </div>
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
