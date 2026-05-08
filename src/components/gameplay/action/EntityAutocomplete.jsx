import { useState, useEffect, useCallback, useRef } from 'react';
import { TAG_ICONS } from '../../../../shared/domain/actionTag';

const KIND_COLORS = {
  spell:    'rgb(255, 130, 180)',
  npc:      'rgb(100, 180, 255)',
  item:     'rgb(180, 180, 195)',
  location: 'rgb(180, 140, 255)',
};

function hintForEntity(entity) {
  const { kind, meta } = entity;
  if (kind === 'spell') {
    const parts = [];
    if (meta?.tree) parts.push(meta.tree);
    if (meta?.manaCost != null) parts.push(`${meta.manaCost} many`);
    return parts.length > 0 ? parts.join(' · ') : 'Zaklęcie';
  }
  if (kind === 'item') return 'Przedmiot z ekwipunku';
  if (kind === 'npc') return meta?.role || 'Postać';
  if (kind === 'location') return meta?.locationType || 'Lokacja';
  return kind;
}

/**
 * Floating autocomplete popup that filters entity pool by fuzzy substring match.
 * Absolutely positioned above the input wrapper, to the right of '@'. Keyboard navigable.
 */
export default function EntityAutocomplete({
  query,
  pool,
  anchorRect,
  containerEl,
  onSelect,
  onClose,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  const filtered = query.length > 0
    ? pool.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : pool.slice(0, 8);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const item = listRef.current?.children[activeIndex];
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e) => {
      if (filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (filtered[activeIndex]) onSelect(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, activeIndex, onSelect, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  let leftPx = 0;
  if (anchorRect && containerEl) {
    const cr = containerEl.getBoundingClientRect();
    leftPx = Math.max(0, anchorRect.right - cr.left);
    const maxLeft = cr.width - 260;
    if (leftPx > maxLeft) leftPx = Math.max(0, maxLeft);
  }

  const style = {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: leftPx,
    minWidth: 260,
    maxWidth: 340,
    zIndex: 50,
  };

  return (
    <div style={style} className="holo-card backdrop-blur-xl overflow-hidden">
      <div className="px-2.5 py-1.5 border-b border-[rgba(197,154,255,0.15)]">
        <span className="text-[10px] font-label uppercase tracking-widest text-[rgba(197,154,255,0.55)]">
          @ {query || '…'}
        </span>
      </div>
      <div ref={listRef} className="max-h-72 overflow-y-auto custom-scrollbar pt-0.5 pb-2">
        {filtered.length === 0 && (
          <div className="px-2.5 py-3 text-center text-[11px] text-[rgba(197,154,255,0.4)]">
            Brak wyników
          </div>
        )}
        {filtered.map((entity, i) => {
          const icon = TAG_ICONS[entity.kind] || 'label';
          const color = KIND_COLORS[entity.kind] || KIND_COLORS.npc;
          const isActive = i === activeIndex;
          const hint = hintForEntity(entity);
          return (
            <button
              key={`${entity.kind}:${entity.id}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(entity);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={[
                'w-full h-11 flex items-center gap-2.5 px-2.5 text-left transition-colors',
                i > 0 ? 'border-t border-[rgba(197,154,255,0.1)]' : '',
                isActive
                  ? 'bg-[rgba(197,154,255,0.12)] shadow-[inset_0_0_12px_rgba(197,154,255,0.08)]'
                  : 'hover:bg-[rgba(197,154,255,0.07)]',
              ].join(' ')}
            >
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded shrink-0"
                style={{ color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
              </span>
              <span className="flex-1 min-w-0 flex flex-col leading-none">
                <span className="text-xs font-bold text-[rgba(220,200,255,0.92)] truncate">
                  {entity.name}
                </span>
                <span className="text-[10px] text-[rgba(197,154,255,0.45)] truncate mt-px">
                  {hint}
                </span>
              </span>
              <span
                className="material-symbols-outlined shrink-0 text-[16px] opacity-40"
                style={{ color }}
              >
                {icon}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
