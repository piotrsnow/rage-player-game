// World NPCs tab — canonical NPC kanon. Lists are loaded on demand because
// WorldNPC is global, not bundled into the campaign payload.

import { useState, useEffect } from 'react';
import EntityForm from '../shared/EntityForm';
import ListDetailLayout from '../shared/ListDetailLayout';
import { worldNpcFields } from '../entityConfigs';
import { adminApi } from '../shared/adminApi';

export default function WorldNpcsTab() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadList() {
    setLoading(true);
    try {
      const rows = await adminApi.listWorldNpcs(search.trim() || undefined);
      setList(rows);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    adminApi.getWorldNpc(selectedId).then(setDetail);
  }, [selectedId]);

  async function save(diff) {
    setBusy(true);
    try {
      await adminApi.patchWorldNpc(selectedId, diff);
      const fresh = await adminApi.getWorldNpc(selectedId);
      setDetail(fresh);
      await loadList();
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') loadList(); }}
          placeholder="Szukaj WorldNPC…"
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
        />
        <button
          type="button"
          onClick={loadList}
          disabled={loading}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? 'Ładuję…' : 'Szukaj'}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <ListDetailLayout
          items={list}
          getKey={(n) => n.id}
          getLabel={(n) => n.name}
          getSublabel={(n) => `${n.alive ? '🟢' : '💀'} ${n.role || n.category}`}
          selectedId={selectedId}
          onSelect={setSelectedId}
          emptyHint="Brak wyników."
        >
          {detail && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-100">{detail.name}</h2>
              <EntityForm
                fields={worldNpcFields}
                value={detail}
                onSave={save}
                busy={busy}
              />
            </div>
          )}
        </ListDetailLayout>
      </div>
    </div>
  );
}
