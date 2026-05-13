import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!entry) return null;

  const handleCopy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore
    }
  };

  const requestText = safeStringify(entry.request);
  const responseText = entry.error ? entry.error : safeStringify(entry.response);
  const simpleReq = extractSimpleRequest(entry);
  const simpleRes = extractSimpleResponse(entry);

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="close"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-4xl bg-surface-container-highest/85 backdrop-blur-2xl border border-outline-variant/15 rounded-sm shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`material-symbols-outlined text-lg ${entry.status === 'error' ? 'text-error' : entry.status === 'pending' ? 'text-tertiary' : 'text-primary'}`}>
              {entry.status === 'error' ? 'error' : entry.status === 'pending' ? 'hourglass_top' : 'auto_awesome'}
            </span>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant">
                {entry.type}
              </div>
              <div className="text-sm font-bold text-on-surface truncate">
                {entry.label}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="close"
            className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors"
          >
            close
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-outline-variant/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] uppercase tracking-widest text-on-surface-variant">
          <div>
            <div className="opacity-60">Provider</div>
            <div className="text-on-surface normal-case tracking-normal font-medium">{entry.provider || '—'}</div>
          </div>
          <div>
            <div className="opacity-60">Model</div>
            <div className="text-on-surface normal-case tracking-normal font-medium">{entry.model || 'default'}</div>
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

        <div className="px-4 pt-3 pb-2 border-b border-outline-variant/10">
          <div className="inline-flex text-[11px] border border-outline-variant/30 rounded overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1 uppercase tracking-widest transition-colors ${
                tab === 'simple' ? 'bg-tertiary/20 text-tertiary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setTab('simple')}
            >
              Simple
            </button>
            <button
              type="button"
              className={`px-3 py-1 uppercase tracking-widest transition-colors ${
                tab === 'advanced' ? 'bg-tertiary/20 text-tertiary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setTab('advanced')}
            >
              Advanced
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {tab === 'simple' ? (
            <>
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-label uppercase tracking-widest text-primary font-bold">Request</h3>
                  <button
                    onClick={() => handleCopy('req', simpleReq.text)}
                    className="text-[11px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                  >
                    {copiedKey === 'req' ? 'copied' : 'copy'}
                  </button>
                </div>
                <pre className="text-sm leading-relaxed bg-surface-container-low/60 border border-outline-variant/15 rounded-sm p-4 whitespace-pre-wrap break-words text-on-surface max-h-[40vh] overflow-y-auto custom-scrollbar">
                  <HighlightedContent text={simpleReq.text || '—'} />
                </pre>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-xs font-label uppercase tracking-widest font-bold ${entry.error ? 'text-error' : 'text-tertiary'}`}>
                    {entry.error ? 'Error' : 'Response'}
                  </h3>
                  {!entry.error && simpleRes && (
                    <button
                      onClick={() => handleCopy('res', simpleRes.text)}
                      className="text-[11px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                    >
                      {copiedKey === 'res' ? 'copied' : 'copy'}
                    </button>
                  )}
                </div>
                <pre className={`text-sm leading-relaxed bg-surface-container-low/60 border rounded-sm p-4 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto custom-scrollbar ${entry.error ? 'border-error/30 text-error' : 'border-outline-variant/15 text-on-surface'}`}>
                  {entry.status === 'pending'
                    ? <span className="text-tertiary italic">Waiting for response…</span>
                    : entry.error
                      ? <span className="text-error font-medium">{entry.error}</span>
                      : <HighlightedContent text={simpleRes?.text || '—'} />}
                </pre>
              </section>
            </>
          ) : (
            <>
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-label uppercase tracking-widest text-primary font-bold">Request</h3>
                  <button
                    onClick={() => handleCopy('req', requestText)}
                    className="text-[11px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                  >
                    {copiedKey === 'req' ? 'copied' : 'copy'}
                  </button>
                </div>
                <pre className="text-[13px] leading-relaxed bg-surface-container-low/60 border border-outline-variant/15 rounded-sm p-4 whitespace-pre-wrap break-words text-on-surface max-h-[40vh] overflow-y-auto custom-scrollbar">
                  <HighlightedContent text={requestText || '—'} isJson />
                </pre>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-xs font-label uppercase tracking-widest font-bold ${entry.error ? 'text-error' : 'text-tertiary'}`}>
                    {entry.error ? 'Error' : 'Response'}
                  </h3>
                  {!entry.error && (
                    <button
                      onClick={() => handleCopy('res', responseText)}
                      className="text-[11px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                    >
                      {copiedKey === 'res' ? 'copied' : 'copy'}
                    </button>
                  )}
                </div>
                <pre className={`text-[13px] leading-relaxed bg-surface-container-low/60 border rounded-sm p-4 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto custom-scrollbar ${entry.error ? 'border-error/30 text-error' : 'border-outline-variant/15 text-on-surface'}`}>
                  {entry.status === 'pending'
                    ? <span className="text-tertiary italic">Waiting for response…</span>
                    : <HighlightedContent text={responseText || '—'} isJson />}
                </pre>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
