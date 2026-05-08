import { useState, useEffect, useCallback, useRef } from 'react';
import { TAG_COLORS, TAG_ICONS } from '../../../../shared/domain/actionTag';

/**
 * Floating autocomplete popup that filters entity pool by fuzzy substring match.
 * Positioned above/below the anchor element. Keyboard navigable.
 */
export default function EntityAutocomplete({
  query,
  pool,
  anchor,
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

  if (filtered.length === 0) return null;

  const anchorRect = anchor?.getBoundingClientRect();
  const style = anchorRect
    ? {
        position: 'fixed',
        left: anchorRect.left,
        bottom: window.innerHeight - anchorRect.top + 4,
        minWidth: 240,
        maxWidth: 320,
        zIndex: 50,
      }
    : { position: 'absolute', bottom: '100%', left: 0, zIndex: 50 };

  return (
    <div
      style={style}
      className="rounded-sm border border-outline-variant/20 bg-surface-container-highest/95 backdrop-blur-xl shadow-2xl overflow-hidden"
    >
      <div className="px-2 py-1.5 border-b border-outline-variant/10">
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60">
          @ {query || '…'}
        </span>
      </div>
      <div ref={listRef} className="max-h-60 overflow-y-auto custom-scrollbar py-1">
        {filtered.map((entity, i) => {
          const colors = TAG_COLORS[entity.kind] || TAG_COLORS.npc;
          const icon = TAG_ICONS[entity.kind] || 'label';
          const isActive = i === activeIndex;
          return (
            <button
              key={`${entity.kind}:${entity.id}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(entity);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                isActive ? 'bg-primary/10' : 'hover:bg-white/5'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-sm text-[12px] ${colors.bg} ${colors.text}`}
              >
                <span className="material-symbols-outlined text-[14px]">{icon}</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-xs font-bold text-on-surface truncate block">{entity.name}</span>
                {entity.meta?.tree && (
                  <span className="text-[10px] text-on-surface-variant/60">{entity.meta.tree}</span>
                )}
                {entity.meta?.role && (
                  <span className="text-[10px] text-on-surface-variant/60">{entity.meta.role}</span>
                )}
              </span>
              <span className={`text-[9px] uppercase tracking-wider ${colors.text} opacity-60`}>
                {entity.kind}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
