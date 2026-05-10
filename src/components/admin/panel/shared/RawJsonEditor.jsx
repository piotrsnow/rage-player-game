// Controlled JSON textarea with parse-on-blur. Surfaces parse errors inline
// so the user knows what's wrong before clicking Save.

import { useEffect, useState } from 'react';

export default function RawJsonEditor({ value, onChange, readOnly = false, rows = 8 }) {
  const [text, setText] = useState(() => safeStringify(value));
  const [error, setError] = useState(null);

  // Re-sync from props when the upstream value changes (e.g. snapshot reload).
  useEffect(() => {
    setText(safeStringify(value));
    setError(null);
  }, [value]);

  function commit(next) {
    setText(next);
    if (readOnly) return;
    if (next.trim() === '') {
      setError(null);
      onChange?.(null);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      setError(null);
      onChange?.(parsed);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-950">
      <textarea
        className="block w-full resize-y rounded-t bg-slate-950 p-2 font-mono text-xs text-slate-100 focus:outline-none"
        rows={rows}
        readOnly={readOnly}
        value={text}
        onChange={(e) => commit(e.target.value)}
        spellCheck={false}
      />
      {error && (
        <div className="border-t border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-300">
          JSON parse: {error}
        </div>
      )}
    </div>
  );
}

function safeStringify(v) {
  if (v === undefined || v === null) return '';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
