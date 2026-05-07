import { useCallback, useEffect, useMemo, useState } from 'react';
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
    entry.status === 'error' ? 'text-error'
    : entry.status === 'pending' ? 'text-tertiary animate-pulse'
    : 'text-primary';
  const sourceTag = entry.source === 'backend' ? 'bg-tertiary/20 text-tertiary' : 'bg-primary/20 text-primary';

  return (
    <button
      onClick={() => { onOpenEntry(entry.id); onCloseModal(); }}
      className="w-full text-left px-4 py-3 rounded-md bg-surface-container-low/40 hover:bg-surface-container/60 border border-outline-variant/10 hover:border-primary/30 transition-all group"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-lg ${statusColor}`}>
          {entry.status === 'pending' ? 'hourglass_top' : entry.status === 'error' ? 'error' : icon}
        </span>
        <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant truncate">
          {entry.type}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-sm ${sourceTag} shrink-0`}>
          {entry.source === 'backend' ? 'SERVER' : 'CLIENT'}
        </span>
        <span className="text-xs text-on-surface-variant/40 ml-auto shrink-0 tabular-nums">
          {formatTime(entry.startedAt)}
        </span>
      </div>
      <div className="text-sm text-on-surface group-hover:text-primary transition-colors truncate">
        {entry.label || '\u2014'}
      </div>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-xs text-on-surface-variant/60">
          {entry.provider || '\u2014'}
          {entry.model ? ` \u00b7 ${entry.model}` : ''}
        </span>
        {entry.status === 'error' && entry.error && (
          <span className="text-xs text-error truncate max-w-[200px]">{entry.error}</span>
        )}
        {entry.status === 'success' && entry.durationMs != null && (
          <span className="text-xs text-on-surface-variant/40 ml-auto shrink-0 tabular-nums">
            {entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${(entry.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>
      {(entry.request || entry.response) && (
        <div className="mt-2 pt-2 border-t border-outline-variant/10 space-y-1">
          {entry.request && (
            <div className="text-[10px] text-on-surface-variant/60">
              <span className="text-primary/70 uppercase tracking-widest mr-1">req</span>
              {truncateText(entry.request)}
            </div>
          )}
          {entry.response && (
            <div className="text-[10px] text-on-surface-variant/60">
              <span className="text-tertiary/70 uppercase tracking-widest mr-1">res</span>
              {truncateText(entry.response)}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

export default function FullCallLogModal({ logs, onClose, onOpenEntry }) {
  const { activeTypes, toggle, filter } = useTypeFilter();
  const filtered = useMemo(() => filter(logs), [filter, logs]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container rounded-lg border border-outline-variant/20 shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">smart_toy</span>
            <h2 className="text-lg font-headline text-on-surface">LLM Call Log</h2>
            <span className="text-sm text-on-surface-variant/60">
              {activeTypes.size > 0 ? `${filtered.length}/${logs.length}` : logs.length}
            </span>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface text-xl">close</button>
        </div>

        <div className="px-6 py-2.5 border-b border-outline-variant/10">
          <TypeFilterBar logs={logs} activeTypes={activeTypes} onToggle={toggle} />
        </div>

        <div className="overflow-y-auto flex-1 p-4 custom-scrollbar">
          {filtered.length === 0 ? (
            <p className="text-sm text-on-surface-variant/50 italic text-center py-8">
              {logs.length === 0 ? 'No LLM calls recorded.' : 'No calls match the filter.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((entry) => (
                <FullCallEntry key={entry.id} entry={entry} onOpenEntry={onOpenEntry} onCloseModal={onClose} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
