import { useTranslation } from 'react-i18next';

const TABS = [
  { id: 'graph', icon: 'hub', labelKey: 'locationGraph.tabs.graph' },
  { id: 'entities', icon: 'database', labelKey: 'locationGraph.tabs.entities' },
];

export default function ModalNavBar({ activeTab, onTabChange }) {
  const { t } = useTranslation();
  return (
    <div className="w-12 flex-shrink-0 border-r border-outline-variant/15 flex flex-col items-center pt-2 gap-1 bg-surface-container/40">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          title={t(tab.labelKey)}
          className={`w-10 h-10 flex items-center justify-center rounded-sm transition-colors ${
            activeTab === tab.id
              ? 'bg-primary/15 text-primary border-l-2 border-primary'
              : 'text-on-surface-variant hover:text-primary hover:bg-primary/5'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">{tab.icon}</span>
        </button>
      ))}
    </div>
  );
}
