// Generic config-driven form. The owner passes:
//   - `fields`: array of { key, type, ... } (see FieldRenderer for shape)
//   - `value`: current entity object
//   - `onSave(diff)`: called with the patch object on Save click
//
// EntityForm tracks dirty state internally; Save sends ONLY the changed
// fields. Polymorphic refs (kind+id pairs) are handled by the form so the
// caller doesn't have to wire two fields together.

import { useState, useEffect, useMemo } from 'react';
import FieldRenderer from './FieldRenderer';

export default function EntityForm({ fields, value, onSave, onValidate, busy = false }) {
  const [draft, setDraft] = useState(() => ({ ...(value || {}) }));
  const [error, setError] = useState(null);

  useEffect(() => {
    setDraft({ ...(value || {}) });
    setError(null);
  }, [value]);

  const diff = useMemo(() => buildDiff(value || {}, draft, fields), [value, draft, fields]);
  const dirty = Object.keys(diff).length > 0;

  function setField(key, next) {
    setDraft((d) => ({ ...d, [key]: next }));
  }

  async function handleSave() {
    setError(null);
    if (!onSave) return;
    try {
      await onSave(diff);
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((f) => {
          if (f.type === 'polymorphRef') {
            const pv = { kind: draft[f.kindKey], id: draft[f.idKey] };
            return (
              <FieldRenderer
                key={f.key}
                field={f}
                polymorphValue={pv}
                onChange={(next) => {
                  setDraft((d) => ({
                    ...d,
                    [f.kindKey]: next.kind,
                    [f.idKey]: next.id,
                  }));
                }}
              />
            );
          }
          if (f.type === 'json' || f.type === 'textarea') {
            return (
              <div key={f.key} className="md:col-span-2">
                <FieldRenderer
                  field={f}
                  value={draft[f.key]}
                  onChange={(v) => setField(f.key, v)}
                />
              </div>
            );
          }
          return (
            <FieldRenderer
              key={f.key}
              field={f}
              value={draft[f.key]}
              onChange={(v) => setField(f.key, v)}
            />
          );
        })}
      </div>

      {error && (
        <div className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={handleSave}
          className="rounded border border-emerald-700 bg-emerald-700/30 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-700/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Zapisuję…' : `Zapisz${dirty ? ` (${Object.keys(diff).length})` : ''}`}
        </button>
        {onValidate && (
          <button
            type="button"
            onClick={onValidate}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            Sprawdź spójność
          </button>
        )}
        <button
          type="button"
          disabled={!dirty}
          onClick={() => setDraft({ ...(value || {}) })}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          Anuluj zmiany
        </button>
        {dirty && (
          <span className="ml-auto text-xs text-amber-400">Niezapisane zmiany</span>
        )}
      </div>
    </div>
  );
}

function buildDiff(original, draft, fields) {
  const out = {};
  const keys = new Set(fields.flatMap((f) => {
    if (f.type === 'polymorphRef') return [f.kindKey, f.idKey];
    return [f.key];
  }));
  for (const k of keys) {
    if (!shallowEqual(original[k], draft[k])) {
      out[k] = draft[k];
    }
  }
  return out;
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  // For objects/arrays, compare JSON serialization. Cheap, correct enough
  // for admin UI inputs (no functions, no cycles).
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
