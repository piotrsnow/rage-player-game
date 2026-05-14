import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import JsonViewer from '../ui/JsonViewer';

const STORAGE_KEY = 'aiCallLog_pos';
const DEFAULT_POS = { x: 120, y: 60, w: 680, h: 560 };

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

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false });
}

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function safeStringify(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function HighlightedContent({ text, isJson }) {
  if (!text || text === '—') return <span className="text-outline">{text}</span>;

  if (isJson) {
    const parts = text.split(/("(?:[^"\\]|\\.)*")\s*:/g);
    const elements = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        elements.push(<span key={i} className="text-primary font-semibold">{parts[i]}:</span>);
      } else {
        elements.push(...colorizeValues(parts[i], `v${i}`));
      }
    }
    return <>{elements}</>;
  }

  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const kvMatch = line.match(/^(\s*"?[\w.]+["']?\s*:\s*)(.+)$/);
        if (kvMatch) {
          return (
            <span key={i}>
              <span className="text-primary font-semibold">{kvMatch[1]}</span>
              <span className="text-on-surface">{kvMatch[2]}</span>
              {'\n'}
            </span>
          );
        }
        return <span key={i}>{line}{'\n'}</span>;
      })}
    </>
  );
}

function colorizeValues(chunk, keyPrefix) {
  const elements = [];
  const regex = /("(?:[^"\\]|\\.)*")|(true|false|null)|([-+]?\d+\.?\d*(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let match;
  let idx = 0;
  while ((match = regex.exec(chunk)) !== null) {
    if (match.index > last) {
      elements.push(<span key={`${keyPrefix}-${idx++}`}>{chunk.slice(last, match.index)}</span>);
    }
    if (match[1]) {
      elements.push(<span key={`${keyPrefix}-${idx++}`} className="text-tertiary">{match[1]}</span>);
    } else if (match[2]) {
      elements.push(<span key={`${keyPrefix}-${idx++}`} className="text-secondary font-bold">{match[2]}</span>);
    } else if (match[3]) {
      elements.push(<span key={`${keyPrefix}-${idx++}`} className="text-secondary">{match[3]}</span>);
    }
    last = regex.lastIndex;
  }
  if (last < chunk.length) {
    elements.push(<span key={`${keyPrefix}-${idx++}`}>{chunk.slice(last)}</span>);
  }
  return elements;
}

function extractSimpleRequest(entry) {
  const r = entry?.request;
  if (r == null) return { text: '' };
  if (typeof r === 'string') return { text: r };

  const PRIO = [
    r.userPrompt,
    r.settings?.storyPrompt,
    r.playerAction,
    r.seedText,
    r.objectiveDescription,
    r.questDescription,
    r.character?.description,
    r.narrative,
  ];
  let main = PRIO.find((v) => typeof v === 'string' && v.trim());

  if (!main) {
    const arr = [r.keywords, r.imagePromptTags].find(Array.isArray);
    if (arr) main = arr.join(', ');
  }

  if (!main) {
    const SKIP = new Set(['provider', 'model', 'language', 'modelTier', 'type']);
    const lines = Object.entries(r)
      .filter(([k, v]) => !SKIP.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
      .map(([k, v]) => `${k}: ${v}`);
    if (lines.length) main = lines.join('\n');
  }

  return { text: main || '(brak czytelnego pola — zobacz Advanced)' };
}

function extractSimpleResponse(entry) {
  if (entry?.error) return null;
  const r = entry?.response;
  if (r == null) return { text: '' };
  if (typeof r === 'string') return { text: r };
  if (Array.isArray(r)) {
    const first = r[0];
    const inner = first && typeof first === 'object'
      ? (first.recap || first.text || JSON.stringify(first).slice(0, 200))
      : String(first ?? '');
    return { text: `(${r.length} items)\n\n${inner}` };
  }

  const PRIO = [
    r.text,
    r.result?.prompt,
    r.result?.legend,
    r.result?.description,
    r.result?.recap,
    r.result?.narration,
    r.result?.reasoning,
    r.recap,
    r.processed?.narrative,
    r.narrative,
  ];
  let main = PRIO.find((v) => typeof v === 'string' && v.trim());

  if (r.result && typeof r.result.fulfilled === 'boolean') {
    main = `fulfilled: ${r.result.fulfilled}\n\n${main || ''}`.trim();
  }
  if (r.result?.negativePrompt) {
    main = `${main || ''}\n\nnegative: ${r.result.negativePrompt}`.trim();
  }

  if (!main) {
    const firstStr = Object.entries(r).find(([, v]) => typeof v === 'string' && v.trim());
    main = firstStr ? `${firstStr[0]}: ${firstStr[1]}` : '(brak czytelnego tekstu — zobacz Advanced)';
  }
  return { text: main };
}

export default function AiCallLogModal({ entry, onClose }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [tab, setTab] = useState('simple');
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
        w: Math.max(400, startW + (ev.clientX - startX)),
        h: Math.max(250, startH + (ev.clientY - startY)),
      }));
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [pos.w, pos.h]);

  if (!entry) return null;

  const handleCopy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch { /* ignore */ }
  };

  const requestText = safeStringify(entry.request);
  const responseText = entry.error ? entry.error : safeStringify(entry.response);
  const simpleReq = extractSimpleRequest(entry);
  const simpleRes = extractSimpleResponse(entry);

  const statusColor =
    entry.status === 'error' ? 'text-error'
    : entry.status === 'pending' ? 'text-tertiary'
    : 'text-primary';

  const panel = (
    <div
      className="fixed z-[99998] select-none"
      style={{ left: pos.x, top: pos.y, width: pos.w, height: minimized ? 'auto' : pos.h }}
    >
      <div className="flex flex-col h-full rounded-lg border border-outline-variant/20 shadow-2xl overflow-hidden bg-surface-container-highest/95 backdrop-blur-xl">
        {/* Titlebar */}
        <div
          ref={dragRef}
          onPointerDown={handleDragStart}
          className="flex items-center gap-2 px-3 py-2 bg-surface-container/60 border-b border-outline-variant/15 cursor-grab active:cursor-grabbing shrink-0"
        >
          <span className={`material-symbols-outlined text-sm ${statusColor}`}>
            {entry.status === 'error' ? 'error' : entry.status === 'pending' ? 'hourglass_top' : 'auto_awesome'}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant shrink-0">
            {entry.type}
          </span>
          <span className="text-xs text-on-surface truncate flex-1 min-w-0 font-medium">
            {entry.label || '—'}
          </span>
          <button
            onClick={() => setMinimized(!minimized)}
            className="material-symbols-outlined text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? 'expand_content' : 'minimize'}
          </button>
          <button
            onClick={onClose}
            className="material-symbols-outlined text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            title="Close"
          >
            close
          </button>
        </div>

        {!minimized && (
          <>
            {/* Metadata row */}
            <div className="px-3 py-2 border-b border-outline-variant/10 grid grid-cols-4 gap-2 text-[10px] uppercase tracking-widest text-on-surface-variant shrink-0">
              <div>
                <div className="opacity-60">Provider</div>
                <div className="text-on-surface normal-case tracking-normal font-medium">{entry.provider || '—'}</div>
              </div>
              <div>
                <div className="opacity-60">Model</div>
                <div className="text-on-surface normal-case tracking-normal font-medium">{entry.model || '—'}</div>
              </div>
              <div>
                <div className="opacity-60">Started</div>
                <div className="text-on-surface normal-case tracking-normal font-medium">{formatTime(entry.startedAt)}</div>
              </div>
              <div>
                <div className="opacity-60">Duration</div>
                <div className="text-on-surface normal-case tracking-normal font-medium">
                  {entry.status === 'pending' ? 'in progress…' : formatDuration(entry.durationMs)}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-3 py-2 border-b border-outline-variant/10 shrink-0">
              <div className="inline-flex text-[11px] border border-outline-variant/30 rounded overflow-hidden">
                {['simple', 'advanced', 'tree'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`px-3 py-1 uppercase tracking-widest transition-colors ${
                      tab === t ? 'bg-tertiary/20 text-tertiary' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 min-h-0">
              {tab === 'simple' && (
                <>
                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-xs font-label uppercase tracking-widest text-primary font-bold">Request</h3>
                      <button
                        onClick={() => handleCopy('req', simpleReq.text)}
                        className="text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                      >
                        {copiedKey === 'req' ? 'copied' : 'copy'}
                      </button>
                    </div>
                    <pre className="text-sm leading-relaxed bg-surface-container-low/60 border border-outline-variant/15 rounded-sm p-3 whitespace-pre-wrap break-words text-on-surface max-h-[40vh] overflow-y-auto custom-scrollbar">
                      <HighlightedContent text={simpleReq.text || '—'} />
                    </pre>
                  </section>
                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className={`text-xs font-label uppercase tracking-widest font-bold ${entry.error ? 'text-error' : 'text-tertiary'}`}>
                        {entry.error ? 'Error' : 'Response'}
                      </h3>
                      {!entry.error && simpleRes && (
                        <button
                          onClick={() => handleCopy('res', simpleRes.text)}
                          className="text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                        >
                          {copiedKey === 'res' ? 'copied' : 'copy'}
                        </button>
                      )}
                    </div>
                    <pre className={`text-sm leading-relaxed bg-surface-container-low/60 border rounded-sm p-3 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto custom-scrollbar ${entry.error ? 'border-error/30 text-error' : 'border-outline-variant/15 text-on-surface'}`}>
                      {entry.status === 'pending'
                        ? <span className="text-tertiary italic">Waiting for response…</span>
                        : entry.error
                          ? <span className="text-error font-medium">{entry.error}</span>
                          : <HighlightedContent text={simpleRes?.text || '—'} />}
                    </pre>
                  </section>
                </>
              )}

              {tab === 'advanced' && (
                <>
                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-xs font-label uppercase tracking-widest text-primary font-bold">Request</h3>
                      <button
                        onClick={() => handleCopy('req', requestText)}
                        className="text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                      >
                        {copiedKey === 'req' ? 'copied' : 'copy'}
                      </button>
                    </div>
                    <pre className="text-[12px] leading-relaxed bg-surface-container-low/60 border border-outline-variant/15 rounded-sm p-3 whitespace-pre-wrap break-words text-on-surface max-h-[40vh] overflow-y-auto custom-scrollbar">
                      <HighlightedContent text={requestText || '—'} isJson />
                    </pre>
                  </section>
                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className={`text-xs font-label uppercase tracking-widest font-bold ${entry.error ? 'text-error' : 'text-tertiary'}`}>
                        {entry.error ? 'Error' : 'Response'}
                      </h3>
                      {!entry.error && (
                        <button
                          onClick={() => handleCopy('res', responseText)}
                          className="text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                        >
                          {copiedKey === 'res' ? 'copied' : 'copy'}
                        </button>
                      )}
                    </div>
                    <pre className={`text-[12px] leading-relaxed bg-surface-container-low/60 border rounded-sm p-3 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto custom-scrollbar ${entry.error ? 'border-error/30 text-error' : 'border-outline-variant/15 text-on-surface'}`}>
                      {entry.status === 'pending'
                        ? <span className="text-tertiary italic">Waiting for response…</span>
                        : <HighlightedContent text={responseText || '—'} isJson />}
                    </pre>
                  </section>
                </>
              )}

              {tab === 'tree' && (
                <>
                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-xs font-label uppercase tracking-widest text-primary font-bold">Request</h3>
                      <button
                        onClick={() => handleCopy('req', requestText)}
                        className="text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                      >
                        {copiedKey === 'req' ? 'copied' : 'copy'}
                      </button>
                    </div>
                    <div className="text-[12px] font-mono leading-relaxed bg-surface-container-low/60 border border-outline-variant/15 rounded-sm p-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
                      {entry.request != null
                        ? <JsonViewer data={entry.request} />
                        : <span className="text-on-surface-variant/50 italic">—</span>}
                    </div>
                  </section>
                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className={`text-xs font-label uppercase tracking-widest font-bold ${entry.error ? 'text-error' : 'text-tertiary'}`}>
                        {entry.error ? 'Error' : 'Response'}
                      </h3>
                      {!entry.error && (
                        <button
                          onClick={() => handleCopy('res', responseText)}
                          className="text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                        >
                          {copiedKey === 'res' ? 'copied' : 'copy'}
                        </button>
                      )}
                    </div>
                    <div className={`text-[12px] font-mono leading-relaxed bg-surface-container-low/60 border rounded-sm p-3 max-h-[50vh] overflow-y-auto custom-scrollbar ${entry.error ? 'border-error/30' : 'border-outline-variant/15'}`}>
                      {entry.status === 'pending'
                        ? <span className="text-tertiary italic">Waiting for response…</span>
                        : entry.error
                          ? <span className="text-error font-medium">{entry.error}</span>
                          : entry.response != null
                            ? <JsonViewer data={entry.response} />
                            : <span className="text-on-surface-variant/50 italic">—</span>}
                    </div>
                  </section>
                </>
              )}
            </div>

            {/* Resize handle */}
            <div
              ref={resizeRef}
              onPointerDown={handleResizeStart}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize group"
            >
              <svg className="w-3 h-3 absolute bottom-0.5 right-0.5 text-outline-variant/40 group-hover:text-on-surface-variant transition-colors" viewBox="0 0 12 12">
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
