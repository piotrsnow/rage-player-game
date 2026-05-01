// DebugOverlay — fixed bottom-right panel that tails the debug ring buffer
// live. Only mounted when debug gating is on. Toggle with Ctrl+Shift+D.

import React, { useEffect, useMemo, useState } from 'react';
import {
  clearEntries,
  exportLog,
  getEntries,
  isDebugEnabled,
  subscribe,
} from './logger.js';

const NAMESPACES = ['all', 'studio', 'editor', 'chargen', 'logger'];
const MAX_ROWS = 120;

const LEVEL_CLS = {
  debug: 'text-on-surface-variant/70',
  info: 'text-on-surface',
  warn: 'text-amber-300',
  error: 'text-error',
};

export default function DebugOverlay() {
  // Re-check every mount — `setEnabled` could have flipped this at runtime.
  const enabled = isDebugEnabled();
  const [visible, setVisible] = useState(false);
  const [entries, setEntries] = useState(() => getEntries());
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!enabled) return undefined;
    function onKey(ev) {
      if (ev.ctrlKey && ev.shiftKey && (ev.key === 'D' || ev.key === 'd')) {
        ev.preventDefault();
        setVisible((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !visible) return undefined;
    // Subscribe only while visible — avoids re-rendering a hidden panel.
    const unsub = subscribe((next) => setEntries(next.slice()));
    setEntries(getEntries());
    return unsub;
  }, [enabled, visible]);

  const filtered = useMemo(() => {
    const slice = filter === 'all' ? entries : entries.filter((e) => e.ns === filter);
    // Newest first, cap the DOM.
    const tail = slice.slice(-MAX_ROWS).reverse();
    return tail;
  }, [entries, filter]);

  if (!enabled || !visible) return null;

  return (
    <div
      className="fixed bottom-2 right-2 z-50 w-[480px] max-w-[95vw] h-[320px] flex flex-col rounded-sm glass-panel-elevated border border-outline-variant/25 shadow-xl"
      role="log"
      aria-label="mapapp debug overlay"
    >
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-outline-variant/20 text-xs">
        <span className="font-semibold text-on-surface">debug</span>
        <span className="text-on-surface-variant/60">({entries.length})</span>
        <div className="flex gap-1 ml-1.5">
          {NAMESPACES.map((ns) => (
            <button
              key={ns}
              type="button"
              onClick={() => setFilter(ns)}
              className={[
                'px-1.5 py-0.5 rounded-sm border text-[10px] transition-colors',
                filter === ns
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-transparent border-outline-variant/25 text-on-surface-variant hover:border-primary/30',
              ].join(' ')}
            >
              {ns}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => exportLog()}
            title="Copy log to clipboard (JSON)"
            className="px-1.5 py-0.5 rounded-sm border border-outline-variant/30 text-on-surface-variant text-[10px] hover:border-primary/30 hover:text-on-surface"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => clearEntries()}
            title="Clear ring buffer"
            className="px-1.5 py-0.5 rounded-sm border border-outline-variant/30 text-on-surface-variant text-[10px] hover:border-primary/30 hover:text-on-surface"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            title="Hide (Ctrl+Shift+D to reopen)"
            className="px-1.5 py-0.5 rounded-sm border border-outline-variant/30 text-on-surface-variant text-[10px] hover:border-error/40 hover:text-error"
          >
            ×
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar font-mono text-[11px] leading-[1.35] p-1">
        {filtered.length === 0 && (
          <div className="text-on-surface-variant/50 px-1 py-2">
            No entries yet. Interact with Studio / Editor / CharGen to populate.
          </div>
        )}
        {filtered.map((e, i) => (
          <LogRow key={entries.length - i} entry={e} />
        ))}
      </div>
      <div className="px-2 py-1 border-t border-outline-variant/20 text-[10px] text-on-surface-variant/60 flex items-center gap-2">
        <span>Ctrl+Shift+D · window.__mapappLog</span>
      </div>
    </div>
  );
}

function LogRow({ entry }) {
  const time = new Date(entry.t);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const ss = String(time.getSeconds()).padStart(2, '0');
  const ms = String(time.getMilliseconds()).padStart(3, '0');
  const dataStr = entry.data !== null ? safeStringify(entry.data) : '';
  return (
    <div className={`px-1 py-0.5 ${LEVEL_CLS[entry.level] || ''}`}>
      <span className="opacity-50">{hh}:{mm}:{ss}.{ms}</span>
      {' '}
      <span className="opacity-70">{entry.ns}</span>
      {' '}
      <span className="opacity-50">[{entry.level}]</span>
      {' '}
      <span>{entry.msg}</span>
      {dataStr && (
        <span className="opacity-70"> {dataStr}</span>
      )}
    </div>
  );
}

function safeStringify(v) {
  try {
    const s = JSON.stringify(v);
    if (!s) return '';
    return s.length > 200 ? s.slice(0, 200) + '…' : s;
  } catch {
    return String(v);
  }
}
