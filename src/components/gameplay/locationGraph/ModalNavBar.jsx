import { useTranslation } from 'react-i18next';

const TABS = [
  { id: 'graph', icon: 'hub', labelKey: 'locationGraph.tabs.graph' },
  { id: 'entities', icon: 'database', labelKey: 'locationGraph.tabs.entities' },
];

const ADMIN_TABS = [
  { id: 'admin-npcs', icon: 'group', label: 'NPCs' },
  { id: 'admin-locations', icon: 'location_on', label: 'Locations' },
  { id: 'admin-events', icon: 'timeline', label: 'Events' },
  { id: 'admin-reputation', icon: 'military_tech', label: 'Reputation' },
  { id: 'admin-lore', icon: 'auto_stories', label: 'Lore' },
  { id: 'admin-promotions', icon: 'approval', label: 'Promotions' },
  { id: 'admin-canon', icon: 'account_tree', label: 'Canon' },
  { id: 'admin-registry', icon: 'fact_check', label: 'Registry' },
  { id: 'admin-fonts', icon: 'font_download', label: 'Fonts' },
];

function TabButton({ tab, activeTab, onTabChange, title }) {
  return (
    <button
      key={tab.id}
      onClick={() => onTabChange(tab.id)}
      title={title}
      className={`w-10 h-10 flex items-center justify-center rounded-sm transition-colors ${
        activeTab === tab.id
          ? 'bg-primary/15 text-primary border-l-2 border-primary'
          : 'text-on-surface-variant hover:text-primary hover:bg-primary/5'
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{tab.icon}</span>
    </button>
  );
}

export default function ModalNavBar({ activeTab, onTabChange, isAdmin = false }) {
  const { t } = useTranslation();
  return (
    <div className="w-12 flex-shrink-0 border-r border-outline-variant/15 flex flex-col items-center pt-2 gap-1 bg-surface-container/40">
      {TABS.map((tab) => (
        <TabButton key={tab.id} tab={tab} activeTab={activeTab} onTabChange={onTabChange} title={t(tab.labelKey)} />
      ))}

      {isAdmin && (
        <>
          <div className="w-8 border-t border-outline-variant/15 mt-1 mb-0.5" />
          <span className="text-[8px] font-label uppercase tracking-widest text-tertiary/70 mb-0.5">Admin</span>
          {ADMIN_TABS.map((tab) => (
            <TabButton key={tab.id} tab={tab} activeTab={activeTab} onTabChange={onTabChange} title={tab.label} />
          ))}
        </>
      )}
    </div>
  );
}
