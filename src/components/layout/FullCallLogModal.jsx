import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const TYPE_ICONS = {
  scene: 'auto_stories',
  campaign: 'public',
  recap: 'short_text',
  'recap-merge': 'merge',
  'story-prompt': 'edit_note',
  'character-legend': 'history_edu',
  'character-badge': 'badge',
  'image-prompt': 'image',
  'enhance-image-prompt': 'auto_fix_high',
  'combat-commentary': 'swords',
  'verify-objective': 'rule',
  'auto-player': 'smart_toy',
  'translate-prompt': 'translate',
  'memory-compression': 'compress',
  'location-summary': 'map',
  'quest-check': 'checklist',
  'quest-wrapup': 'flag',
  'quest-audit': 'fact_check',
  'graph-extraction': 'account_tree',
  'fact-extraction': 'psychology',
  'npc-dialog': 'chat',
  'npc-tick': 'update',
  'dm-memory': 'note_alt',
  'kill-judge': 'gavel',
  'promotion-verdict': 'upgrade',
  'offline-summary': 'schedule',
  'yassato-cameo': 'star',
  'shortcut-narrative': 'bolt',
};

export function useTypeFilter() {
  const [activeTypes, setActiveTypes] = useState(new Set());
  const toggle = useCallback((type) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);
  const filter = useCallback(
    (logs) => (activeTypes.size === 0 ? logs : logs.filter((l) => activeTypes.has(l.type))),
    [activeTypes],
  );
  return { activeTypes, toggle, filter };
}

export function TypeFilterBar({ logs, activeTypes, onToggle, compact = false }) {
  const presentTypes = useMemo(() => {
    const counts = {};
    for (const l of logs) counts[l.type] = (counts[l.type] || 0) + 1;
    return Object.keys(TYPE_ICONS).filter((t) => counts[t]);
  }, [logs]);

  if (presentTypes.length <= 1) return null;

  const iconSize = compact ? 'text-xs' : 'text-sm';
  return (
    <div className={`flex flex-wrap ${compact ? 'gap-px' : 'gap-0.5'}`}>
      {presentTypes.map((type) => {
        const on = activeTypes.size === 0 || activeTypes.has(type);
        const highlighted = activeTypes.size > 0 && activeTypes.has(type);
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            title={type}
            className={`
              ${compact ? 'p-0.5' : 'p-1'} rounded-sm transition-all
              ${highlighted
                ? 'bg-primary/25 text-primary ring-1 ring-primary/40'
                : on
                  ? 'text-on-surface-variant/50 hover:text-on-surface-variant hover:bg-surface-container/60'
                  : 'text-on-surface-variant/20 hover:text-on-surface-variant/40'
              }
            `}
          >
            <span className={`material-symbols-outlined ${iconSize}`}>
              {TYPE_ICONS[type]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function truncateText(value, maxLen = 120) {
  if (!value) return '\u2014';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) + '\u2026' : str;
}

function FullCallEntry({ entry, onOpenEntry, onCloseModal }) {
  const icon = TYPE_ICONS[entry.type] || 'smart_toy';
  const statusColor =
    entry.status === 'error' ? 'text-red-400'
    : entry.status === 'pending' ? 'text-purple-400 animate-pulse'
    : 'text-blue-400';
  const sourceTag = entry.source === 'backend' ? 'bg-purple-400/15 text-purple-400' : 'bg-blue-400/15 text-blue-400';

  return (
    <button
      onClick={() => { onOpenEntry(entry.id); onCloseModal(); }}
      className="w-full text-left px-3 py-2 rounded-sm hover:bg-white/[0.04] border border-white/5 hover:border-white/10 transition-all group"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`material-symbols-outlined text-sm ${statusColor}`}>
          {entry.status === 'pending' ? 'hourglass_top' : entry.status === 'error' ? 'error' : icon}
        </span>
        <span className="text-[10px] font-label uppercase tracking-widest text-gray-400 truncate">
          {entry.type}
        </span>
        <span className={`text-[8px] px-1 py-px rounded-sm ${sourceTag} shrink-0`}>
          {entry.source === 'backend' ? 'SRV' : 'CLI'}
        </span>
        <span className="text-[10px] text-gray-600 ml-auto shrink-0 tabular-nums">
          {formatTime(entry.startedAt)}
        </span>
      </div>
      <div className="text-xs text-gray-200 group-hover:text-blue-300 transition-colors truncate">
        {entry.label || '\u2014'}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-gray-500">
          {entry.provider || '\u2014'}
          {entry.model ? ` \u00b7 ${entry.model}` : ''}
        </span>
        {entry.status === 'error' && entry.error && (
          <span className="text-[10px] text-red-400 truncate max-w-[180px]">{entry.error}</span>
        )}
        {entry.status === 'success' && entry.durationMs != null && (
          <span className="text-[10px] text-gray-600 ml-auto shrink-0 tabular-nums">
            {entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${(entry.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>
    </button>
  );
}

const STORAGE_KEY = 'fullCallLog_pos';
const DEFAULT_POS = { x: 60, y: 60, w: 620, h: 520 };

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

export default function FullCallLogModal({ logs, onClose, onOpenEntry }) {
  const { activeTypes, toggle, filter } = useTypeFilter();
  const filtered = useMemo(() => filter(logs), [filter, logs]);

  const [pos, setPos] = useState(loadPosition);
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  useEffect(() => { savePosition(pos); }, [pos]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        w: Math.max(380, startW + (ev.clientX - startX)),
        h: Math.max(220, startH + (ev.clientY - startY)),
      }));
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [pos.w, pos.h]);

  const panel = (
    <div
      className="fixed z-[99997] select-none"
      style={{ left: pos.x, top: pos.y, width: pos.w, height: minimized ? 'auto' : pos.h }}
    >
      <div className="flex flex-col h-full rounded-lg border border-white/10 shadow-2xl overflow-hidden bg-[#0d0d11]/95 backdrop-blur-xl">
        {/* Titlebar */}
        <div
          ref={dragRef}
          onPointerDown={handleDragStart}
          className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/5 cursor-grab active:cursor-grabbing shrink-0"
        >
          <span className="material-symbols-outlined text-sm text-primary">smart_toy</span>
          <span className="text-xs font-label text-gray-200 tracking-wide flex-1">
            LLM Call Log
          </span>
          <span className="text-[10px] text-gray-500 tabular-nums">
            {activeTypes.size > 0 ? `${filtered.length}/${logs.length}` : logs.length}
          </span>
          <button
            onClick={() => setMinimized(!minimized)}
            className="material-symbols-outlined text-sm text-gray-500 hover:text-gray-300 transition-colors"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? 'expand_content' : 'minimize'}
          </button>
          <button
            onClick={onClose}
            className="material-symbols-outlined text-sm text-gray-500 hover:text-gray-300 transition-colors"
            title="Close"
          >
            close
          </button>
        </div>

        {!minimized && (
          <>
            {/* Filter bar */}
            <div className="px-3 py-1.5 border-b border-white/5">
              <TypeFilterBar logs={logs} activeTypes={activeTypes} onToggle={toggle} />
            </div>

            {/* Entry list */}
            <div className="overflow-y-auto flex-1 p-2 custom-scrollbar min-h-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2 py-8">
                  <span className="material-symbols-outlined text-2xl">inbox</span>
                  <span className="text-xs">
                    {logs.length === 0 ? 'No LLM calls recorded.' : 'No calls match the filter.'}
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((entry) => (
                    <FullCallEntry key={entry.id} entry={entry} onOpenEntry={onOpenEntry} onCloseModal={() => {}} />
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
