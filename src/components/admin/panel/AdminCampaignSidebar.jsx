// Sidebar — list of all campaigns the admin can edit. Search filters server-side.

import { useState, useMemo } from 'react';
import { useAdminPanelStore } from '../../../stores/adminPanelStore';

export default function AdminCampaignSidebar({ selectedId, onSelect }) {
  const campaigns = useAdminPanelStore((s) => s.campaigns);
  const loading = useAdminPanelStore((s) => s.campaignsLoading);
  const error = useAdminPanelStore((s) => s.campaignsError);
  const loadCampaigns = useAdminPanelStore((s) => s.loadCampaigns);

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) =>
      (c.name || '').toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q),
    );
  }, [campaigns, search]);

  return (
    <aside className="flex w-72 flex-col border-r border-slate-800 bg-slate-900/50">
      <div className="border-b border-slate-800 p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadCampaigns(search.trim() || undefined);
          }}
          placeholder="Szukaj kampanii…"
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-4 text-sm text-slate-400">Ładowanie…</div>}
        {error && <div className="p-4 text-sm text-red-400">{error}</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-4 text-sm text-slate-500">Brak kampanii.</div>
        )}
        <ul>
          {filtered.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={[
                    'block w-full border-b border-slate-800/60 px-3 py-2 text-left transition-colors',
                    active
                      ? 'bg-emerald-700/20 text-emerald-200'
                      : 'text-slate-200 hover:bg-slate-800/50',
                  ].join(' ')}
                >
                  <div className="truncate text-sm font-medium">{c.name || '(bez nazwy)'}</div>
                  <div className="mt-0.5 flex gap-2 text-[11px] text-slate-500">
                    <span>{c._count?.scenes ?? 0} scen</span>
                    <span>•</span>
                    <span>{c._count?.npcs ?? 0} NPC</span>
                    <span>•</span>
                    <span>{c._count?.quests ?? 0} questy</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
