import { useTranslation } from 'react-i18next';
import { GENRES, TONES, SORT_OPTIONS } from './galleryHelpers';

export default function GalleryFilters({
  search,
  onSearchChange,
  genreFilter,
  onGenreChange,
  toneFilter,
  onToneChange,
  sort,
  onSortChange,
}) {
  const { t } = useTranslation();
  return (
    <header className="relative z-10 max-w-7xl mx-auto mb-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary text-3xl">grid_view</span>
            <h1 className="font-headline text-3xl md:text-4xl text-on-surface tracking-tight">
              {t('gallery.title', 'Campaign Gallery')}
            </h1>
          </div>
          <p className="text-on-surface-variant text-sm max-w-xl">
            {t('gallery.subtitle', 'Browse community campaigns — like a workshop library for your next WFRP tale.')}
          </p>
        </div>

        <div className="w-full lg:max-w-md">
          <label className="sr-only" htmlFor="gallery-search">
            {t('gallery.search', 'Search')}
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-xl">
              search
            </span>
            <input
              data-testid="gallery-search"
              id="gallery-search"
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('gallery.searchPlaceholder', 'Search campaigns…')}
              className="w-full pl-11 pr-4 py-3 rounded-sm bg-surface-container border border-outline-variant/30 text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-8 items-center">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.genre', 'Genre')}</span>
          <select
            value={genreFilter}
            onChange={(e) => onGenreChange(e.target.value)}
            className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{t('gallery.allGenres', 'All genres')}</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.tone', 'Tone')}</span>
          <select
            value={toneFilter}
            onChange={(e) => onToneChange(e.target.value)}
            className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{t('gallery.allTones', 'All tones')}</option>
            {TONES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.sortBy', 'Sort by')}</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.key, o.value === 'newest' ? 'Newest' : o.value === 'rating' ? 'Rating' : 'Most played')}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
