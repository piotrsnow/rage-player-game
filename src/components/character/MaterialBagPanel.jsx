import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '../../services/gameDataService.js';

const CATEGORY_CONFIG = {
  metal: { icon: 'hardware', label: 'materialBag.catMetal' },
  wood: { icon: 'park', label: 'materialBag.catWood' },
  fabric: { icon: 'styler', label: 'materialBag.catFabric' },
  herb: { icon: 'local_florist', label: 'materialBag.catHerb' },
  liquid: { icon: 'water_drop', label: 'materialBag.catLiquid' },
  misc: { icon: 'category', label: 'materialBag.catMisc' },
};

const AVAILABILITY_COLORS = {
  common: 'text-on-surface-variant',
  uncommon: 'text-primary-dim',
  rare: 'text-tertiary-dim',
};

export default function MaterialBagPanel({ materials = [], onClose }) {
  const { t } = useTranslation();
  const [filterCategory, setFilterCategory] = useState(null);

  // Build lookup map from catalog once
  const catalogMap = useMemo(() => {
    const map = {};
    for (const m of gameData.materials || []) {
      map[m.name.toLowerCase()] = m;
    }
    return map;
  }, []);

  // Resolve full data from catalog for each material in bag
  const resolved = useMemo(() =>
    materials.map((m) => {
      const cat = catalogMap[(m.name || '').toLowerCase()];
      return {
        name: m.name,
        quantity: m.quantity || 1,
        category: cat?.category || 'misc',
        price: cat?.price || { gold: 0, silver: 0, copper: 0 },
        availability: cat?.availability || 'common',
        weight: cat?.weight || 0,
      };
    }), [materials, catalogMap]);

  const grouped = useMemo(() => {
    const cats = {};
    for (const mat of resolved) {
      const cat = mat.category;
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(mat);
    }
    for (const cat of Object.keys(cats)) {
      cats[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    return cats;
  }, [resolved]);

  const totalItems = resolved.reduce((sum, m) => sum + m.quantity, 0);
  const totalWeight = resolved.reduce((sum, m) => sum + m.weight * m.quantity, 0);
  const categories = Object.keys(grouped);

  const visibleCategories = filterCategory
    ? categories.filter((c) => c === filterCategory)
    : categories;

  // Fixed category order
  const catOrder = ['metal', 'wood', 'fabric', 'herb', 'liquid', 'misc'];
  visibleCategories.sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b));

  return (
    <div className="bg-surface-container-low p-5 rounded-sm border border-outline-variant/10 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-tertiary">inventory_2</span>
          <h3 className="text-tertiary font-headline text-lg">{t('materialBag.title', 'Material Bag')}</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-on-surface-variant font-label uppercase tracking-widest">
            {t('materialBag.count', { count: totalItems })} | {totalWeight.toFixed(1)} kg
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-surface-container-high/40 rounded-sm transition-colors"
            >
              <span className="material-symbols-outlined text-sm text-on-surface-variant">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-1 mb-3 flex-wrap">
        <button
          onClick={() => setFilterCategory(null)}
          className={`px-2 py-1 text-[9px] font-label uppercase tracking-wider rounded-sm border transition-colors ${
            !filterCategory
              ? 'bg-primary/15 border-primary/30 text-primary'
              : 'bg-surface-container/30 border-outline-variant/10 text-on-surface-variant hover:bg-surface-container/50'
          }`}
        >
          {t('materialBag.all', 'All')}
        </button>
        {catOrder.filter((c) => grouped[c]).map((cat) => {
          const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.misc;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
              className={`px-2 py-1 text-[9px] font-label uppercase tracking-wider rounded-sm border transition-colors flex items-center gap-1 ${
                filterCategory === cat
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-surface-container/30 border-outline-variant/10 text-on-surface-variant hover:bg-surface-container/50'
              }`}
            >
              <span className="material-symbols-outlined text-[10px]">{config.icon}</span>
              {t(config.label, cat)} ({grouped[cat].length})
            </button>
          );
        })}
      </div>

      {/* Materials list */}
      {materials.length === 0 ? (
        <p className="text-[10px] text-on-surface-variant text-center py-6">
          {t('materialBag.empty', 'No materials collected yet.')}
        </p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar">
          {visibleCategories.map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-1.5 py-1">
                <span className="material-symbols-outlined text-[11px] text-on-surface-variant/50">
                  {(CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.misc).icon}
                </span>
                <span className="text-[9px] font-label text-on-surface-variant/50 uppercase tracking-widest">
                  {t((CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.misc).label, cat)}
                </span>
              </div>
              {grouped[cat].map((mat) => {
                const availColor = AVAILABILITY_COLORS[mat.availability] || AVAILABILITY_COLORS.common;
                const price = mat.price || {};
                return (
                  <div
                    key={mat.name}
                    className="flex items-center justify-between px-2 py-1.5 rounded-sm hover:bg-surface-container/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-headline ${availColor} truncate`}>{mat.name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Price */}
                      <span className="text-[9px] text-on-surface-variant/50">
                        {price.gold > 0 && `${price.gold}g `}
                        {price.silver > 0 && `${price.silver}s `}
                        {price.copper > 0 && `${price.copper}c`}
                      </span>
                      {/* Quantity badge */}
                      <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 text-[10px] font-bold font-label bg-primary/15 text-primary border border-primary/20 rounded-sm">
                        x{mat.quantity || 1}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
