import { useTranslation } from 'react-i18next';

const TABS = [
  { id: 'discover', icon: 'explore', key: 'gallery.tabDiscover' },
  { id: 'chronicles', icon: 'auto_stories', key: 'gallery.tabChronicles' },
  { id: 'campaigns', icon: 'grid_view', key: 'gallery.tabCampaigns' },
];

export default function GalleryTabs({ activeTab, onTabChange }) {
  const { t } = useTranslation();

  return (
    <nav className="flex gap-1 border-b border-outline-variant/20 mb-8" role="tablist">
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-widest
              transition-all duration-300 border-b-2 -mb-px
              ${active
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40'}
            `}
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {t(tab.key, tab.id)}
          </button>
        );
      })}
    </nav>
  );
}
