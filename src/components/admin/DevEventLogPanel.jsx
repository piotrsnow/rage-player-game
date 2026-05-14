import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDevEventLogStore, CATEGORIES } from '../../stores/devEventLogStore';
import JsonViewer from '../ui/JsonViewer';

const CATEGORY_META = {
  pipeline: { icon: 'route', color: 'text-blue-400', bg: 'bg-blue-400/15' },
  ai: { icon: 'smart_toy', color: 'text-purple-400', bg: 'bg-purple-400/15' },
  state: { icon: 'database', color: 'text-emerald-400', bg: 'bg-emerald-400/15' },
  validation: { icon: 'verified', color: 'text-amber-400', bg: 'bg-amber-400/15' },
  combat: { icon: 'swords', color: 'text-red-400', bg: 'bg-red-400/15' },
  image: { icon: 'image', color: 'text-pink-400', bg: 'bg-pink-400/15' },
  mechanics: { icon: 'casino', color: 'text-cyan-400', bg: 'bg-cyan-400/15' },
  system: { icon: 'terminal', color: 'text-gray-400', bg: 'bg-gray-400/15' },
};

const SEVERITY_STYLE = {
  info: '',
  warn: 'border-l-2 border-l-amber-500/60',
  error: 'border-l-2 border-l-red-500/60',
};

const STORAGE_KEY = 'devEventLog_pos';
const DEFAULT_POS = { x: 80, y: 80, w: 520, h: 480 };

function loadPosition() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_POS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_POS;
}

function savePosition(pos) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
}

function formatTs(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}


function EventRow({ event, isPinned, onTogglePin }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[event.category] || CATEGORY_META.system;
  const severityStyle = SEVERITY_STYLE[event.severity] || '';

  return (
    <div className={`group px-2 py-1 hover:bg-white/[0.03] rounded-sm transition-colors ${severityStyle}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-1.5 min-w-0"
      >
        <span className={`material-symbols-outlined text-xs shrink-0 ${meta.color}`}>
          {meta.icon}
        </span>
        <span className="text-[10px] text-gray-500 tabular-nums shrink-0 font-mono">
          {formatTs(event.ts)}
        </span>
        <span className="text-xs text-gray-200 truncate flex-1 min-w-0">
          {event.label}
        </span>
        {event.severity === 'warn' && (
          <span className="material-symbols-outlined text-xs text-amber-400 shrink-0">warning</span>
        )}
        {event.severity === 'error' && (
          <span className="material-symbols-outlined text-xs text-red-400 shrink-0">error</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(event.id); }}
          className={`material-symbols-outlined text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
            isPinned ? 'text-primary opacity-100' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          push_pin
        </button>
        <span className={`material-symbols-outlined text-xs text-gray-600 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
      </button>
      {expanded && event.data != null && (
        <div className="mt-1 ml-5 p-2 rounded-sm bg-black/30 text-[10px] font-mono leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto custom-scrollbar">
          <JsonViewer data={event.data} />
        </div>
      )}
    </div>
  );
}

function FilterBar({ filters, onToggle, onClear, eventCounts }) {
  return (
    <div className="flex flex-wrap gap-0.5 px-2 py-1.5 border-b border-white/5">
      {CATEGORIES.map((cat) => {
        const meta = CATEGORY_META[cat];
        const active = filters.size === 0 || filters.has(cat);
        const count = eventCounts[cat] || 0;
        if (count === 0 && filters.size > 0 && !filters.has(cat)) return null;
        return (
          <button
            key={cat}
            onClick={() => onToggle(cat)}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[10px] transition-all ${
              active && filters.size > 0
                ? `${meta.bg} ${meta.color} ring-1 ring-current/30`
                : active
                  ? `text-gray-400 hover:${meta.color} hover:${meta.bg}`
                  : 'text-gray-600 opacity-50'
            }`}
            title={cat}
          >
            <span className={`material-symbols-outlined text-xs`}>{meta.icon}</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        );
      })}
      {filters.size > 0 && (
        <button
          onClick={onClear}
          className="text-[10px] text-gray-500 hover:text-gray-300 px-1"
          title="Clear filters"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function DevEventLogPanel() {
  const isOpen = useDevEventLogStore((s) => s.isOpen);
  const events = useDevEventLogStore((s) => s.events);
  const filters = useDevEventLogStore((s) => s.filters);
  const pinnedIds = useDevEventLogStore((s) => s.pinnedIds);
  const autoScroll = useDevEventLogStore((s) => s.autoScroll);
  const toggleOpen = useDevEventLogStore((s) => s.toggleOpen);
  const close = useDevEventLogStore((s) => s.close);
  const clear = useDevEventLogStore((s) => s.clear);
  const toggleFilter = useDevEventLogStore((s) => s.toggleFilter);
  const clearFilters = useDevEventLogStore((s) => s.clearFilters);
  const togglePin = useDevEventLogStore((s) => s.togglePin);
  const setAutoScroll = useDevEventLogStore((s) => s.setAutoScroll);

  const [pos, setPos] = useState(loadPosition);
  const [minimized, setMinimized] = useState(false);
  const [search, setSearch] = useState('');
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { savePosition(pos); }, [pos]);

  useEffect(() => {
    if (autoScroll && listRef.current && !minimized) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length, autoScroll, minimized]);

  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    e.preventDefault();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
    const onMove = (ev) => {
      setPos((p) => ({
        ...p,
        x: Math.max(0, Math.min(window.innerWidth - 100, ev.clientX - startX)),
        y: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - startY)),
      }));
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [pos.x, pos.y]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = pos.w;
    const startH = pos.h;
    const onMove = (ev) => {
      setPos((p) => ({
        ...p,
        w: Math.max(360, startW + (ev.clientX - startX)),
        h: Math.max(200, startH + (ev.clientY - startY)),
      }));
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [pos.w, pos.h]);

  const eventCounts = useMemo(() => {
    const counts = {};
    for (const ev of events) counts[ev.category] = (counts[ev.category] || 0) + 1;
    return counts;
  }, [events]);

  const filteredEvents = useMemo(() => {
    let list = events;
    if (filters.size > 0) list = list.filter((e) => filters.has(e.category));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.label.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        (e.data && JSON.stringify(e.data).toLowerCase().includes(q))
      );
    }
    return list;
  }, [events, filters, search]);

  const pinnedEvents = useMemo(
    () => events.filter((e) => pinnedIds.has(e.id)),
    [events, pinnedIds]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isOpen) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const panel = (
    <div
      className="fixed z-[99999] select-none"
      style={{ left: pos.x, top: pos.y, width: pos.w, height: minimized ? 'auto' : pos.h }}
    >
      <div className="flex flex-col h-full rounded-lg border border-white/10 shadow-2xl overflow-hidden bg-[#0d0d11]/95 backdrop-blur-xl">
        {/* Titlebar */}
        <div
          ref={dragRef}
          onPointerDown={handleDragStart}
          className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/5 cursor-grab active:cursor-grabbing shrink-0"
        >
          <span className="material-symbols-outlined text-sm text-primary">monitoring</span>
          <span className="text-xs font-label text-gray-200 tracking-wide flex-1">
            Dev Event Log
          </span>
          <span className="text-[10px] text-gray-500 tabular-nums">{events.length}</span>
          <button
            onClick={() => setMinimized(!minimized)}
            className="material-symbols-outlined text-sm text-gray-500 hover:text-gray-300 transition-colors"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? 'expand_content' : 'minimize'}
          </button>
          <button
            onClick={clear}
            className="material-symbols-outlined text-sm text-gray-500 hover:text-gray-300 transition-colors"
            title="Clear log"
          >
            delete_sweep
          </button>
          <button
            onClick={close}
            className="material-symbols-outlined text-sm text-gray-500 hover:text-gray-300 transition-colors"
            title="Close"
          >
            close
          </button>
        </div>

        {!minimized && (
          <>
            {/* Search + auto-scroll */}
            <div className="flex items-center gap-1.5 px-2 py-1 border-b border-white/5">
              <span className="material-symbols-outlined text-xs text-gray-500">search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events…"
                className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none"
              />
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`material-symbols-outlined text-xs transition-colors ${
                  autoScroll ? 'text-primary' : 'text-gray-600 hover:text-gray-400'
                }`}
                title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
              >
                vertical_align_bottom
              </button>
            </div>

            {/* Filter bar */}
            <FilterBar
              filters={filters}
              onToggle={toggleFilter}
              onClear={clearFilters}
              eventCounts={eventCounts}
            />

            {/* Pinned events */}
            {pinnedEvents.length > 0 && (
              <div className="px-2 py-1 border-b border-primary/20 bg-primary/[0.03] max-h-[100px] overflow-y-auto custom-scrollbar">
                <div className="text-[9px] text-primary/60 uppercase tracking-widest mb-0.5">Pinned</div>
                {pinnedEvents.map((ev) => (
                  <EventRow key={ev.id} event={ev} isPinned onTogglePin={togglePin} />
                ))}
              </div>
            )}

            {/* Event timeline */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar min-h-0"
              onScroll={(e) => {
                const el = e.target;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
                if (autoScroll && !atBottom) setAutoScroll(false);
                if (!autoScroll && atBottom) setAutoScroll(true);
              }}
            >
              {filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2 py-8">
                  <span className="material-symbols-outlined text-2xl">inbox</span>
                  <span className="text-xs">
                    {events.length === 0 ? 'No events captured yet' : 'No events match filter'}
                  </span>
                </div>
              ) : (
                <div className="py-1">
                  {filteredEvents.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      isPinned={pinnedIds.has(ev.id)}
                      onTogglePin={togglePin}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Resize handle */}
            <div
              ref={resizeRef}
              onPointerDown={handleResizeStart}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize group"
            >
              <svg className="w-3 h-3 absolute bottom-0.5 right-0.5 text-gray-600 group-hover:text-gray-400 transition-colors" viewBox="0 0 12 12">
                <path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
