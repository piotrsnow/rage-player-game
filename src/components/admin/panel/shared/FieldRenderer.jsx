// Single form-field renderer. Driven by a config row from entityConfigs/*.
// Supported types:
//   - text, textarea, number, bool, enum
//   - json (RawJsonEditor)
//   - polymorphRef (kind dropdown + uuid input)
//   - relRef (uuid input — autocomplete is left as a future polish; admin
//     usually pastes IDs from the table view above)

import RawJsonEditor from './RawJsonEditor';

export default function FieldRenderer({ field, value, onChange, polymorphValue }) {
  const { key, type, options, required, readonly, rows } = field;

  if (readonly) {
    return (
      <div>
        <Label field={field} />
        <div className="rounded bg-slate-950 px-2 py-1.5 text-xs text-slate-400">
          {value === null || value === undefined ? '—' : type === 'json' ? <RawJsonEditor value={value} readOnly /> : String(value)}
        </div>
      </div>
    );
  }

  switch (type) {
    case 'text':
      return (
        <div>
          <Label field={field} />
          <input
            type="text"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            value={value ?? ''}
            required={required}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case 'textarea':
      return (
        <div>
          <Label field={field} />
          <textarea
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            rows={rows || 4}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case 'number':
      return (
        <div>
          <Label field={field} />
          <input
            type="number"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            value={value ?? ''}
            onChange={(e) => {
              const n = e.target.value;
              onChange(n === '' ? null : Number(n));
            }}
          />
        </div>
      );
    case 'bool':
      return (
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label || key}
        </label>
      );
    case 'enum':
      return (
        <div>
          <Label field={field} />
          <select
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">—</option>
            {(options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    case 'json':
      return (
        <div>
          <Label field={field} />
          <RawJsonEditor value={value} onChange={onChange} rows={rows || 6} />
        </div>
      );
    case 'polymorphRef': {
      // value is { kind, id } passed via `polymorphValue` prop. The form owner
      // updates two columns in parallel (kindKey, idKey).
      const kind = polymorphValue?.kind || '';
      const id = polymorphValue?.id || '';
      const targets = field.targets || {};
      return (
        <div>
          <Label field={field} />
          <div className="flex gap-2">
            <select
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              value={kind}
              onChange={(e) => onChange({ kind: e.target.value || null, id: id || null })}
            >
              <option value="">—</option>
              {Object.keys(targets).map((k) => (
                <option key={k} value={k}>{k} ({targets[k]})</option>
              ))}
            </select>
            <input
              type="text"
              className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-mono text-slate-100"
              placeholder="uuid"
              value={id}
              onChange={(e) => onChange({ kind: kind || null, id: e.target.value || null })}
            />
          </div>
        </div>
      );
    }
    case 'relRef':
      return (
        <div>
          <Label field={field} />
          <input
            type="text"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-100"
            placeholder={field.target || 'reference'}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </div>
      );
    default:
      return (
        <div className="text-xs text-amber-400">
          Unknown field type: {type} for {key}
        </div>
      );
  }
}

function Label({ field }) {
  return (
    <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
      <span className="font-medium">{field.label || field.key}</span>
      {field.required && <span className="text-red-400">*</span>}
      {field.hint && <span className="text-slate-500">— {field.hint}</span>}
    </div>
  );
}
