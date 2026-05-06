import { useMemo, useState } from 'react';
import { useAiCallLogStore } from '../../stores/aiCallLogStore';
import AiCallLogModal from './AiCallLogModal';

const TYPE_ICONS = {
  scene: 'auto_stories',
  campaign: 'public',
  recap: 'short_text',
  'story-prompt': 'edit_note',
  'character-legend': 'history_edu',
  'image-prompt': 'image',
  'enhance-image-prompt': 'auto_fix_high',
  'combat-commentary': 'swords',
  'verify-objective': 'rule',
};

function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export default function SidebarAiCallLog() {
  const logs = useAiCallLogStore((s) => s.logs);
  const clearLogs = useAiCallLogStore((s) => s.clearLogs);
  const [openId, setOpenId] = useState(null);

  const orderedLogs = useMemo(() => [...logs].reverse(), [logs]);
  const openEntry = useMemo(() => logs.find((l) => l.id === openId) || null, [logs, openId]);

  return (
    <>
      <div className="mt-6 border-t border-outline-variant/15 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-sm">smart_toy</span>
            <h3 className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              LLM calls
            </h3>
            <span className="text-[10px] text-on-surface-variant/60">
              {logs.length}
            </span>
          </div>
          {logs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 hover:text-error transition-colors"
              title="Clear log"
            >
              clear
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="text-[10px] text-on-surface-variant/50 italic">
            No LLM calls in this session yet.
          </p>
        ) : (
          <ul className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar pr-1">
            {orderedLogs.map((entry) => {
              const icon = TYPE_ICONS[entry.type] || 'smart_toy';
              const statusColor =
                entry.status === 'error' ? 'text-error'
                : entry.status === 'pending' ? 'text-tertiary'
                : 'text-primary';
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => setOpenId(entry.id)}
                    className="w-full text-left px-2 py-1.5 rounded-sm bg-surface-container-low/30 hover:bg-surface-container/60 border border-outline-variant/10 hover:border-primary/30 transition-all group"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`material-symbols-outlined text-[14px] ${statusColor}`}>
                        {entry.status === 'pending' ? 'hourglass_top' : entry.status === 'error' ? 'error' : icon}
                      </span>
                      <span className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/80 truncate">
                        {entry.type}
                      </span>
                      <span className="text-[9px] text-on-surface-variant/40 ml-auto shrink-0 tabular-nums">
                        {formatTime(entry.startedAt)}
                      </span>
                    </div>
                    <div className="text-[11px] text-on-surface truncate group-hover:text-primary transition-colors">
                      {entry.label || '—'}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-on-surface-variant/60 truncate">
                        {entry.provider || '—'}
                        {entry.model ? ` · ${entry.model}` : ''}
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
            })}
          </ul>
        )}
      </div>

      {openEntry && (
        <AiCallLogModal entry={openEntry} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
