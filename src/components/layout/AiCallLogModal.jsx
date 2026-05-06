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

export default function AiCallLogModal({ entry, onClose }) {
  const [copiedKey, setCopiedKey] = useState(null);

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

        <div className="px-4 py-2 border-b border-outline-variant/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] uppercase tracking-widest text-on-surface-variant">
          <div>
            <div className="opacity-60">Provider</div>
            <div className="text-on-surface normal-case tracking-normal">{entry.provider || '—'}</div>
          </div>
          <div>
            <div className="opacity-60">Model</div>
            <div className="text-on-surface normal-case tracking-normal">{entry.model || 'default'}</div>
          </div>
          <div>
            <div className="opacity-60">Started</div>
            <div className="text-on-surface normal-case tracking-normal">{formatTime(entry.startedAt)}</div>
          </div>
          <div>
            <div className="opacity-60">Duration</div>
            <div className="text-on-surface normal-case tracking-normal">
              {entry.status === 'pending' ? 'in progress…' : formatDuration(entry.durationMs)}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          <section>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[10px] font-label uppercase tracking-widest text-primary">Request</h3>
              <button
                onClick={() => handleCopy('req', requestText)}
                className="text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
              >
                {copiedKey === 'req' ? 'copied' : 'copy'}
              </button>
            </div>
            <pre className="text-[11px] leading-relaxed bg-surface-container-low/60 border border-outline-variant/15 rounded-sm p-3 whitespace-pre-wrap break-words text-on-surface max-h-[40vh] overflow-y-auto custom-scrollbar">
{requestText || '—'}
            </pre>
          </section>

          <section>
            <div className="flex items-center justify-between mb-1">
              <h3 className={`text-[10px] font-label uppercase tracking-widest ${entry.error ? 'text-error' : 'text-tertiary'}`}>
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
            <pre className={`text-[11px] leading-relaxed bg-surface-container-low/60 border rounded-sm p-3 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto custom-scrollbar ${entry.error ? 'border-error/30 text-error' : 'border-outline-variant/15 text-on-surface'}`}>
{entry.status === 'pending' ? 'Waiting for response…' : (responseText || '—')}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
