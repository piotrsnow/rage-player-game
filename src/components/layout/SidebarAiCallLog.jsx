import { useEffect, useMemo, useRef, useState } from 'react';
import { useAiCallLogStore } from '../../stores/aiCallLogStore';
import AiCallLogModal from './AiCallLogModal';
import FullCallLogModal from './FullCallLogModal';
import { TYPE_ICONS, useTypeFilter, TypeFilterBar, formatTime } from './FullCallLogModal';

const POLL_INTERVAL = 8000;

export default function SidebarAiCallLog() {
  const clientLogs = useAiCallLogStore((s) => s.logs);
  const backendLogs = useAiCallLogStore((s) => s.backendLogs);
  const fetchBackendLogs = useAiCallLogStore((s) => s.fetchBackendLogs);
  const clearLogs = useAiCallLogStore((s) => s.clearLogs);
  const openFullLog = useAiCallLogStore((s) => s.openFullLog);
  const [openId, setOpenId] = useState(null);
  const pollRef = useRef(null);
  const { activeTypes, toggle, filter } = useTypeFilter();

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

  const filteredLogs = useMemo(() => filter(mergedLogs), [filter, mergedLogs]);

  const openEntry = useMemo(
    () => mergedLogs.find((l) => l.id === openId) || null,
    [mergedLogs, openId],
  );

  return (
    <>
      <div className="mt-6 border-t border-outline-variant/15 pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={openFullLog}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            title="Open full LLM call log"
          >
            <span className="material-symbols-outlined text-primary text-xs">terminal</span>
            <h3 className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
              LLM calls
            </h3>
            <span className="text-[9px] text-on-surface-variant/50 tabular-nums">
              {filteredLogs.length}{activeTypes.size > 0 ? `/${mergedLogs.length}` : ''}
            </span>
          </button>
          {mergedLogs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-[8px] uppercase tracking-widest text-on-surface-variant/50 hover:text-error transition-colors"
              title="Clear log"
            >
              clear
            </button>
          )}
        </div>

        <TypeFilterBar logs={mergedLogs} activeTypes={activeTypes} onToggle={toggle} compact />

        {filteredLogs.length === 0 ? (
          <p className="text-[9px] text-on-surface-variant/50 italic mt-1">
            {mergedLogs.length === 0 ? 'No LLM calls in this session yet.' : 'No calls match the filter.'}
          </p>
        ) : (
          <ul className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar pr-1 mt-1">
            {filteredLogs.map((entry) => (
              <CallEntry key={entry.id} entry={entry} onOpen={setOpenId} />
            ))}
          </ul>
        )}
      </div>

      {openEntry && (
        <AiCallLogModal entry={openEntry} onClose={() => setOpenId(null)} />
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
        className="w-full text-left px-1.5 py-1.5 rounded-sm bg-surface-container-low/30 hover:bg-surface-container/60 border border-outline-variant/10 hover:border-primary/30 transition-all group"
      >
        <div className="flex items-center gap-1 mb-0.5">
          <span className={`material-symbols-outlined text-sm ${statusColor}`}>
            {entry.status === 'pending' ? 'hourglass_top' : entry.status === 'error' ? 'error' : icon}
          </span>
          <span className="text-[10px] font-headline font-bold uppercase tracking-wide text-on-surface truncate">
            {entry.type}
          </span>
          {entry.source !== 'backend' && (
            <span className="material-symbols-outlined text-[11px] text-primary/60 shrink-0" title="Frontend call">military_tech</span>
          )}
          <span className="text-[8px] text-on-surface-variant/40 ml-auto shrink-0 tabular-nums">
            {formatTime(entry.startedAt)}
          </span>
        </div>
        <div className="text-[10px] text-on-surface/80 truncate group-hover:text-primary transition-colors">
          {entry.label || '\u2014'}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[8px] text-on-surface-variant/60 truncate">
            {entry.provider || '\u2014'}
            {entry.model ? ` \u00b7 ${entry.model}` : ''}
          </span>
          <span className={`text-[7px] px-0.5 rounded-sm ${sourceTag} shrink-0`}>
            {entry.source === 'backend' ? 'SRV' : 'CLI'}
          </span>
          {entry.status === 'success' && entry.durationMs != null && (
            <span className="text-[8px] text-on-surface-variant/40 ml-auto shrink-0 tabular-nums">
              {entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${(entry.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
