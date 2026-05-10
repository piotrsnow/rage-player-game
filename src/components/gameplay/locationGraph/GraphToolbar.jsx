import { useTranslation } from 'react-i18next';
import { EDGE_CATEGORIES } from '../../../../shared/domain/locationGraph.js';
import { EDGE_VISUALS } from './graphVisuals.js';

const CATEGORIES = Object.keys(EDGE_CATEGORIES);

export default function GraphToolbar({
  readOnly = false,
  filters, onToggleFilter,
  scaleFilter, onScaleChange,
  onAddNode, onAddEdge,
  addingNode, addingEdge,
  mode, onModeChange,
  onSearch, searchQuery,
  onValidate,
  searchInputRef,
  snapToGrid, onToggleSnap, onResetLayout,
  spriteJob,
  showOrphans = false, onToggleOrphans,
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

      {!readOnly && (
        <>
          <button
            type="button"
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
            type="button"
            onClick={onAddEdge}
            title={t('locationGraph.tooltips.addEdge')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-sm transition-colors uppercase tracking-widest ${
              addingEdge ? 'bg-primary/30 text-primary' : 'hover:bg-white/5 text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-sm">conversion_path</span>
            {t('locationGraph.toolbar.addEdge')}
          </button>
        </>
      )}

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

      {!readOnly && (
        <>
          <div className="w-px h-5 bg-outline-variant/20" />
          <button
            type="button"
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
            type="button"
            onClick={onValidate}
            title={t('locationGraph.tooltips.validate')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-sm hover:bg-white/5 text-on-surface-variant uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-sm">verified</span>
          </button>
        </>
      )}

      {onToggleOrphans && (
        <>
          <div className="w-px h-5 bg-outline-variant/20" />
          <label className="flex items-center gap-1.5 px-2 py-1 rounded-sm hover:bg-white/5 text-on-surface-variant cursor-pointer select-none uppercase tracking-widest">
            <input
              type="checkbox"
              checked={showOrphans}
              onChange={onToggleOrphans}
              className="accent-primary w-3 h-3"
            />
            {t('locationGraph.toolbar.showOrphans', { defaultValue: 'orphans' })}
          </label>
        </>
      )}

      {spriteJob && (
        <>
          <div className="w-px h-5 bg-outline-variant/20" />
          <SpriteJobControls spriteJob={spriteJob} t={t} />
        </>
      )}
    </div>
  );
}

function SpriteJobControls({ spriteJob, t }) {
  const { start, cancel, clearJob, starting, isActive, status } = spriteJob;

  if (isActive && status) {
    const pct = status.total > 0 ? Math.round(((status.done + status.failed) / status.total) * 100) : 0;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-primary/10 border border-primary/20 text-primary text-xs">
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          <span>{status.done}/{status.total}</span>
          {status.failed > 0 && <span className="text-red-400">({status.failed} err)</span>}
          <span className="text-primary/50">{pct}%</span>
        </div>
        <button
          type="button"
          onClick={cancel}
          className="flex items-center gap-1 px-2 py-1 rounded-sm bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs transition-colors"
        >
          <span className="material-symbols-outlined text-sm">stop</span>
          {t('locationGraph.toolbar.cancelSprites', { defaultValue: 'Stop' })}
        </button>
      </div>
    );
  }

  if (status && (status.status === 'completed' || status.status === 'failed')) {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs ${status.status === 'completed' ? 'text-green-400' : 'text-red-400'}`}>
          {status.status === 'completed'
            ? t('locationGraph.toolbar.spritesDone', { done: status.done, failed: status.failed, defaultValue: `Gotowe: ${status.done}, err: ${status.failed}` })
            : t('locationGraph.toolbar.spritesFailed', { defaultValue: 'Job nie powiódł się' })}
        </span>
        <button
          type="button"
          onClick={clearJob}
          className="text-outline hover:text-on-surface text-xs"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => start(spriteJob.nodes)}
      disabled={starting}
      className="flex items-center gap-1 px-3 py-1.5 rounded-sm bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary text-xs transition-colors uppercase tracking-widest disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-sm">auto_fix_high</span>
      {starting
        ? t('locationGraph.toolbar.startingSprites', { defaultValue: 'Startuję...' })
        : t('locationGraph.toolbar.generateAllSprites', { defaultValue: 'Generuj wszystkie' })}
    </button>
  );
}
