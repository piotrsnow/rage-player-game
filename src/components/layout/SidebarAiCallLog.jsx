import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAiCallLogStore } from '../../stores/aiCallLogStore';
import AiCallLogModal from './AiCallLogModal';

const TYPE_ICONS = {
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

function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function truncateText(value, maxLen = 120) {
  if (!value) return '—';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

const POLL_INTERVAL = 8000;

export default function SidebarAiCallLog() {
  const clientLogs = useAiCallLogStore((s) => s.logs);
  const backendLogs = useAiCallLogStore((s) => s.backendLogs);
  const fetchBackendLogs = useAiCallLogStore((s) => s.fetchBackendLogs);
  const clearLogs = useAiCallLogStore((s) => s.clearLogs);
  const [openId, setOpenId] = useState(null);
  const [showFullModal, setShowFullModal] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchBackendLogs();
    pollRef.current = setInterval(fetchBackendLogs, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchBackendLogs]);

  const mergedLogs = useMemo(() => {
    const clientIds = new Set(clientLogs.map((l) => l.id));
    const combined = [...clientLogs];
    for (const bl of backendLogs) {
      if (!clientIds.has(bl.id)) combined.push(bl);
    }
    combined.sort((a, b) => b.startedAt - a.startedAt);
    return combined.slice(0, 100);
  }, [clientLogs, backendLogs]);

  const openEntry = useMemo(
    () => mergedLogs.find((l) => l.id === openId) || null,
    [mergedLogs, openId],
  );

  const handleOpenFullModal = useCallback(() => setShowFullModal(true), []);

  return (
    <>
      <div className="mt-6 border-t border-outline-variant/15 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenFullModal}
              className="material-symbols-outlined text-primary text-sm hover:text-tertiary transition-colors"
              title="Open full LLM call log"
            >
              smart_toy
            </button>
            <h3 className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              LLM calls
            </h3>
            <span className="text-[10px] text-on-surface-variant/60">
              {mergedLogs.length}
            </span>
          </div>
          {mergedLogs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 hover:text-error transition-colors"
              title="Clear log"
            >
              clear
            </button>
          )}
        </div>

        {mergedLogs.length === 0 ? (
          <p className="text-[10px] text-on-surface-variant/50 italic">
            No LLM calls in this session yet.
          </p>
        ) : (
          <ul className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar pr-1">
            {mergedLogs.map((entry) => (
              <CallEntry key={entry.id} entry={entry} onOpen={setOpenId} />
            ))}
          </ul>
        )}
      </div>

      {openEntry && (
        <AiCallLogModal entry={openEntry} onClose={() => setOpenId(null)} />
      )}

      {showFullModal && (
        <FullCallLogModal logs={mergedLogs} onClose={() => setShowFullModal(false)} onOpenEntry={setOpenId} />
      )}
    </>
  );
}

function CallEntry({ entry, onOpen }) {
  const icon = TYPE_ICONS[entry.type] || 'smart_toy';
  const statusColor =
    entry.status === 'error' ? 'text-error'
    : entry.status === 'pending' ? 'text-tertiary'
    : 'text-primary';
  const sourceTag = entry.source === 'backend' ? 'bg-tertiary/20 text-tertiary' : 'bg-primary/20 text-primary';

  return (
    <li>
      <button
        onClick={() => onOpen(entry.id)}
        className="w-full text-left px-2 py-2 rounded-sm bg-surface-container-low/30 hover:bg-surface-container/60 border border-outline-variant/10 hover:border-primary/30 transition-all group"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`material-symbols-outlined text-base ${statusColor}`}>
            {entry.status === 'pending' ? 'hourglass_top' : entry.status === 'error' ? 'error' : icon}
          </span>
          <span className="text-sm font-headline font-bold uppercase tracking-wide text-on-surface truncate">
            {entry.type}
          </span>
          {entry.source !== 'backend' && (
            <span className="material-symbols-outlined text-[13px] text-primary/60 shrink-0" title="Frontend call">military_tech</span>
          )}
          <span className="text-[9px] text-on-surface-variant/40 ml-auto shrink-0 tabular-nums">
            {formatTime(entry.startedAt)}
          </span>
        </div>
        <div className="text-[11px] text-on-surface/80 truncate group-hover:text-primary transition-colors">
          {entry.label || '—'}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-on-surface-variant/60 truncate">
            {entry.provider || '—'}
            {entry.model ? ` · ${entry.model}` : ''}
          </span>
          <span className={`text-[8px] px-1 rounded-sm ${sourceTag} shrink-0`}>
            {entry.source === 'backend' ? 'SRV' : 'CLI'}
          </span>
          {entry.status === 'success' && entry.durationMs != null && (
            <span className="text-[9px] text-on-surface-variant/40 ml-auto shrink-0 tabular-nums">
              {entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${(entry.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function FullCallLogModal({ logs, onClose, onOpenEntry }) {
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
            <span className="text-sm text-on-surface-variant/60">{logs.length}</span>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface text-xl">close</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 custom-scrollbar">
          {logs.length === 0 ? (
            <p className="text-sm text-on-surface-variant/50 italic text-center py-8">No LLM calls recorded.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((entry) => (
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
        {entry.label || '—'}
      </div>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-xs text-on-surface-variant/60">
          {entry.provider || '—'}
          {entry.model ? ` · ${entry.model}` : ''}
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
