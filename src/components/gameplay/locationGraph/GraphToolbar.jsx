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
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-outline-variant/10 text-[10px]">
      {/* Scale slider */}
      <div className="flex items-center gap-1.5">
        <span className="text-outline uppercase tracking-widest">{t('locationGraph.toolbar.scale')}</span>
        <input
          type="range" min={0} max={7} step={1}
          value={scaleFilter}
          onChange={(e) => onScaleChange(Number(e.target.value))}
          className="w-16 h-1"
        />
        <span className="text-on-surface-variant w-3 text-center">{scaleFilter}</span>
      </div>

      <div className="w-px h-4 bg-outline-variant/20" />

      {/* Category filters */}
      <div className="flex items-center gap-1 flex-wrap">
        {CATEGORIES.map((cat) => {
          const vis = EDGE_VISUALS[cat];
          return (
            <button
              key={cat}
              onClick={() => onToggleFilter(cat)}
              className={`px-1.5 py-0.5 rounded-sm transition-colors uppercase tracking-widest ${
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
      <div className="flex items-center gap-1 bg-white/5 rounded-sm px-2 py-0.5 border border-outline-variant/10">
        <span className="material-symbols-outlined text-xs text-outline">search</span>
        <input
          className="bg-transparent outline-none text-on-surface w-20 placeholder:text-outline/50"
          placeholder={t('locationGraph.toolbar.search')}
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="w-px h-4 bg-outline-variant/20" />

      {/* Action buttons */}
      <button
        onClick={onAddNode}
        className={`flex items-center gap-0.5 px-2 py-1 rounded-sm transition-colors uppercase tracking-widest ${
          addingNode ? 'bg-primary/30 text-primary' : 'hover:bg-white/5 text-on-surface-variant'
        }`}
      >
        <span className="material-symbols-outlined text-xs">add_location</span>
        {t('locationGraph.toolbar.addNode')}
      </button>

      <button
        onClick={onAddEdge}
        className={`flex items-center gap-0.5 px-2 py-1 rounded-sm transition-colors uppercase tracking-widest ${
          addingEdge ? 'bg-primary/30 text-primary' : 'hover:bg-white/5 text-on-surface-variant'
        }`}
      >
        <span className="material-symbols-outlined text-xs">conversion_path</span>
        {t('locationGraph.toolbar.addEdge')}
      </button>

      {/* Mode toggle */}
      <div className="w-px h-4 bg-outline-variant/20" />
      <button
        onClick={onModeChange}
        className="flex items-center gap-0.5 px-2 py-1 rounded-sm hover:bg-white/5 text-on-surface-variant uppercase tracking-widest"
      >
        <span className="material-symbols-outlined text-xs">
          {mode === 'gm' ? 'shield_person' : 'person'}
        </span>
        {mode === 'gm' ? 'GM' : t('locationGraph.toolbar.player')}
      </button>

      <button
        onClick={onValidate}
        className="flex items-center gap-0.5 px-2 py-1 rounded-sm hover:bg-white/5 text-on-surface-variant uppercase tracking-widest"
        title={t('locationGraph.toolbar.validate')}
      >
        <span className="material-symbols-outlined text-xs">verified</span>
      </button>
    </div>
  );
}
