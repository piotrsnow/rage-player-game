import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const CATEGORY_META = {
  artifact: { icon: 'diamond', order: 0 },
  person: { icon: 'person', order: 1 },
  creature: { icon: 'pets', order: 2 },
  place: { icon: 'location_on', order: 3 },
  faction: { icon: 'groups', order: 4 },
  event: { icon: 'history', order: 5 },
  concept: { icon: 'lightbulb', order: 6 },
};

const ASPECT_ICONS = {
  history: 'menu_book',
  description: 'description',
  location: 'pin_drop',
  weakness: 'broken_image',
  rumor: 'hearing',
  technical: 'build',
  political: 'gavel',
};

function CodexEntry({ entry, t }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[entry.category] || CATEGORY_META.concept;

  return (
    <div className="bg-surface-container-high/40 border border-outline-variant/10 rounded-sm overflow-hidden transition-all hover:border-primary/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-center gap-3 group"
      >
        <span className="material-symbols-outlined text-primary-dim text-lg shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <h4 className="font-headline text-sm text-tertiary truncate">{entry.name}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">
              {t(`codex.categories.${entry.category}`, entry.category)}
            </span>
            <span className="text-[9px] text-outline">
              {entry.fragments.length} {entry.fragments.length === 1 ? t('codex.fragment') : t('codex.fragments')}
            </span>
          </div>
        </div>
        <span className={`material-symbols-outlined text-sm text-outline transition-transform ${expanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-outline-variant/10 pt-3 animate-fade-in">
          {entry.fragments.map((frag) => (
            <div key={frag.id} className="pl-3 border-l-2 border-primary/30">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-xs text-primary-dim">
                  {ASPECT_ICONS[frag.aspect] || 'info'}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-primary-dim">
                  {t(`codex.aspects.${frag.aspect}`, frag.aspect)}
                </span>
              </div>
              <p className="text-sm text-on-surface-variant font-body leading-relaxed">
                {frag.content}
              </p>
              <p className="text-[10px] text-outline mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[10px]">person</span>
                {frag.source}
              </p>
            </div>
          ))}

          {entry.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {entry.tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-surface-container-lowest text-outline text-[9px] rounded-sm">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CodexPanel({ codex }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState(null);

  const entries = useMemo(() => Object.values(codex || {}), [codex]);

  const grouped = useMemo(() => {
    const searchLower = search.toLowerCase();
    const filtered = entries.filter((e) => {
      if (filterCategory && e.category !== filterCategory) return false;
      if (!search) return true;
      if (e.name.toLowerCase().includes(searchLower)) return true;
      if (e.tags?.some((tag) => tag.toLowerCase().includes(searchLower))) return true;
      return e.fragments.some((f) => f.content.toLowerCase().includes(searchLower));
    });

    const groups = {};
    for (const entry of filtered) {
      const cat = entry.category || 'concept';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    }

    return Object.entries(groups).sort(
      ([a], [b]) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99)
    );
  }, [entries, search, filterCategory]);

  const categories = useMemo(() => {
    const cats = new Set(entries.map((e) => e.category || 'concept'));
    return [...cats].sort((a, b) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99));
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10">
      <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-sm">auto_stories</span>
        {t('codex.title')}
        <span className="ml-auto text-[10px] text-outline font-body">{entries.length} {t('codex.entries')}</span>
      </h3>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-sm text-outline">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('codex.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-2 bg-surface-container-high/60 border border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm rounded-sm font-body"
          />
        </div>

        {categories.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setFilterCategory(null)}
              className={`px-2.5 py-1.5 text-[10px] uppercase tracking-widest rounded-sm border transition-all ${
                !filterCategory
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:text-primary'
              }`}
            >
              {t('codex.all')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                className={`px-2.5 py-1.5 text-[10px] uppercase tracking-widest rounded-sm border transition-all flex items-center gap-1 ${
                  filterCategory === cat
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-xs">{CATEGORY_META[cat]?.icon || 'category'}</span>
                {t(`codex.categories.${cat}`, cat)}
              </button>
            ))}
          </div>
        )}
      </div>

      {grouped.length === 0 ? (
        <p className="text-center text-outline text-sm py-4 italic">{t('codex.noResults')}</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, items]) => (
            <div key={category}>
              {grouped.length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-xs text-primary-dim">
                    {CATEGORY_META[category]?.icon || 'category'}
                  </span>
                  <h4 className="text-[10px] uppercase tracking-widest text-primary-dim font-label">
                    {t(`codex.categories.${category}`, category)}
                  </h4>
                  <div className="flex-1 h-px bg-outline-variant/10" />
                </div>
              )}
              <div className="space-y-2">
                {items.map((entry) => (
                  <CodexEntry key={entry.id} entry={entry} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
