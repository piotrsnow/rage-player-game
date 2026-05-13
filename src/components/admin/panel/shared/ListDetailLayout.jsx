// Shared two-pane layout for tabs that browse a list of items and edit one
// at a time (NPCs, locations, edges, scenes, …). Caller supplies:
//
//   - items[]: array (already loaded from campaign payload)
//   - getKey(item): string id
//   - getLabel(item) / getSublabel(item): row rendering
//   - selectedId / onSelect: controlled selection
//   - onCreate?(): optional creator (renders "+ Nowy" button)
//   - children: detail pane content (rendered when selectedId matches)

export default function ListDetailLayout({
  items, getKey, getLabel, getSublabel,
  selectedId, onSelect, onCreate, createLabel = '+ Nowy',
  emptyHint = 'Brak elementów.', children,
}) {
  return (
    <div className="flex h-full gap-4">
      <div className="w-72 shrink-0 overflow-y-auto rounded border border-slate-800 bg-slate-900/30">
        {onCreate && (
          <div className="border-b border-slate-800 p-2">
            <button
              type="button"
              onClick={onCreate}
              className="w-full rounded border border-emerald-700 bg-emerald-700/30 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-700/50"
            >
              {createLabel}
            </button>
          </div>
        )}
        <ul>
          {items.length === 0 && (
            <li className="px-3 py-4 text-xs text-slate-500">{emptyHint}</li>
          )}
          {items.map((item) => {
            const id = getKey(item);
            const active = id === selectedId;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className={[
                    'block w-full border-b border-slate-800/60 px-3 py-2 text-left',
                    active ? 'bg-emerald-700/20 text-emerald-200' : 'text-slate-200 hover:bg-slate-800/50',
                  ].join(' ')}
                >
                  <div className="truncate text-sm font-medium">{getLabel(item)}</div>
                  {getSublabel && (
                    <div className="text-[11px] text-slate-500">{getSublabel(item)}</div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!selectedId && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-6 text-sm text-slate-400">
            Wybierz element z listy po lewej.
          </div>
        )}
        {selectedId && children}
      </div>
    </div>
  );
}
