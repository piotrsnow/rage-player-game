import { useState } from 'react';

export default function JsonViewer({ data, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null || data === undefined) return <span className="text-gray-500 italic">null</span>;
  if (typeof data === 'boolean') return <span className="text-amber-300">{String(data)}</span>;
  if (typeof data === 'number') return <span className="text-cyan-300">{data}</span>;
  if (typeof data === 'string') {
    if (data.length > 200) {
      return <span className="text-emerald-300 break-all">&quot;{data.slice(0, 200)}…&quot;</span>;
    }
    return <span className="text-emerald-300 break-all">&quot;{data}&quot;</span>;
  }

  const isArray = Array.isArray(data);
  const entries = isArray ? data.map((v, i) => [i, v]) : Object.entries(data);
  const bracket = isArray ? ['[', ']'] : ['{', '}'];

  if (entries.length === 0) return <span className="text-gray-500">{bracket[0]}{bracket[1]}</span>;

  return (
    <span>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="text-gray-500 hover:text-gray-300 transition-colors"
      >
        {bracket[0]}{collapsed ? `…${entries.length}` : ''}
      </button>
      {!collapsed && (
        <div className="pl-3 border-l border-white/5">
          {entries.slice(0, 50).map(([key, val]) => (
            <div key={key} className="flex gap-1 leading-tight">
              <span className="text-gray-500 shrink-0">{isArray ? '' : `${key}: `}</span>
              <JsonViewer data={val} depth={depth + 1} />
            </div>
          ))}
          {entries.length > 50 && <div className="text-gray-600 italic">…{entries.length - 50} more</div>}
        </div>
      )}
      {collapsed && <span className="text-gray-500">{bracket[1]}</span>}
      {!collapsed && <span className="text-gray-500">{bracket[1]}</span>}
    </span>
  );
}
