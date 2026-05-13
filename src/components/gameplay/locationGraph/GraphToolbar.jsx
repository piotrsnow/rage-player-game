import { useTranslation } from 'react-i18next';
import { EDGE_CATEGORIES } from '../../../../shared/domain/locationGraph.js';
import { EDGE_VISUALS } from './graphVisuals.js';

const CATEGORIES = Object.keys(EDGE_CATEGORIES);

export default function GraphToolbar({
  filters, onToggleFilter,
  scaleFilter, onScaleChange,
  onAddNode, onAddEdge,
  addingNode, addingEdge,
  mode, onModeChange,
  onSearch, searchQuery,
  onValidate,
  searchInputRef,
  snapToGrid, onToggleSnap, onResetLayout,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5 border-t border-outline-variant/10 text-xs">
      {/* Scale slider */}
      <div className="flex items-center gap-2" title={t('locationGraph.tooltips.scale')}>
        <span className="text-outline uppercase tracking-widest">{t('locationGraph.toolbar.scale')}</span>
        <input
          type="range" min={0} max={7} step={1}
          value={scaleFilter}
          onChange={(e) => onScaleChange(Number(e.target.value))}
          className="w-24 h-1.5"
        />
        <span className="text-on-surface-variant w-4 text-center">{scaleFilter}</span>
      </div>

      <div className="w-px h-5 bg-outline-variant/20" />

      {/* Category filters */}
      <div className="flex items-center gap-1 flex-wrap">
        {CATEGORIES.map((cat) => {
          const vis = EDGE_VISUALS[cat];
          return (
            <button
              key={cat}
              onClick={() => onToggleFilter(cat)}
              title={t(`locationGraph.tooltips.${cat}`)}
              className={`px-2 py-1 rounded-sm transition-colors uppercase tracking-widest ${
                filters[cat] ? 'text-on-surface' : 'text-outline/40 line-through'
              }`}
              style={filters[cat] ? { backgroundColor: vis?.color + '22', color: vis?.color } : undefined}
            >
              {t(`locationGraph.categories.${cat}`)}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div
        className="flex items-center gap-1.5 bg-white/5 rounded-sm px-2.5 py-1 border border-outline-variant/10"
        title={t('locationGraph.tooltips.search')}
      >
        <span className="material-symbols-outlined text-sm text-outline">search</span>
        <input
          ref={searchInputRef}
          className="bg-transparent outline-none text-on-surface w-28 placeholder:text-outline/50"
          placeholder={t('locationGraph.toolbar.search')}
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="w-px h-5 bg-outline-variant/20" />

      {/* Action buttons */}
      <button
        onClick={onAddNode}
        title={t('locationGraph.tooltips.addNode')}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-sm transition-colors uppercase tracking-widest ${
          addingNode ? 'bg-primary/30 text-primary' : 'hover:bg-white/5 text-on-surface-variant'
        }`}
      >
        <span className="material-symbols-outlined text-sm">add_location</span>
        {t('locationGraph.toolbar.addNode')}
      </button>

      <button
        onClick={onAddEdge}
        title={t('locationGraph.tooltips.addEdge')}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-sm transition-colors uppercase tracking-widest ${
          addingEdge ? 'bg-primary/30 text-primary' : 'hover:bg-white/5 text-on-surface-variant'
        }`}
      >
        <span className="material-symbols-outlined text-sm">conversion_path</span>
        {t('locationGraph.toolbar.addEdge')}
      </button>

      <button
        onClick={onToggleSnap}
        title={t('locationGraph.tooltips.snapToGrid')}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-sm transition-colors uppercase tracking-widest ${
          snapToGrid ? 'bg-primary/30 text-primary' : 'hover:bg-white/5 text-on-surface-variant'
        }`}
      >
        <span className="material-symbols-outlined text-sm">{snapToGrid ? 'grid_on' : 'grid_off'}</span>
        {t('locationGraph.toolbar.snapToGrid')}
      </button>

      <button
        onClick={onResetLayout}
        title={t('locationGraph.tooltips.resetLayout')}
        className="flex items-center gap-1 px-3 py-1.5 rounded-sm hover:bg-white/5 text-on-surface-variant transition-colors uppercase tracking-widest"
      >
        <span className="material-symbols-outlined text-sm">restart_alt</span>
        {t('locationGraph.toolbar.resetLayout')}
      </button>

      {/* Mode toggle */}
      <div className="w-px h-5 bg-outline-variant/20" />
      <button
        onClick={onModeChange}
        title={t(`locationGraph.tooltips.${mode === 'gm' ? 'gm' : 'player'}`)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-sm hover:bg-white/5 text-on-surface-variant uppercase tracking-widest"
      >
        <span className="material-symbols-outlined text-sm">
          {mode === 'gm' ? 'shield_person' : 'person'}
        </span>
        {mode === 'gm' ? 'GM' : t('locationGraph.toolbar.player')}
      </button>

      <button
        onClick={onValidate}
        title={t('locationGraph.tooltips.validate')}
        className="flex items-center gap-1 px-3 py-1.5 rounded-sm hover:bg-white/5 text-on-surface-variant uppercase tracking-widest"
      >
        <span className="material-symbols-outlined text-sm">verified</span>
      </button>
    </div>
  );
}
