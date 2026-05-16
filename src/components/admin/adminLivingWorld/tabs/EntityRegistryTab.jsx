import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import FilterSelect from '../shared/FilterSelect';
import ActionBtn from '../shared/ActionBtn';
import NpcDetailModal from '../shared/NpcDetailModal';
import LocationDetailModal from '../shared/LocationDetailModal';

const TYPES = ['WorldNPC', 'WorldLocation', 'CustomSpell', 'WorldItemDefinition'];
const TYPE_LABELS = {
  WorldNPC: 'NPC',
  WorldLocation: 'Lokacja',
  CustomSpell: 'Zaklęcie',
  WorldItemDefinition: 'Przedmiot',
};

function entityDisplayName(type, row) {
  if (type === 'WorldNPC') return row.name;
  if (type === 'WorldLocation') return row.displayName || row.canonicalName;
  if (type === 'CustomSpell') return row.name;
  if (type === 'WorldItemDefinition') return row.displayName;
  return row.id;
}

function StatusBadge({ active, deleted }) {
  if (deleted) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/20 text-error">usunięty</span>;
  if (active) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">aktywny</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-variant text-on-surface-variant">nieaktywny</span>;
}

export default function EntityRegistryTab() {
  const [type, setType] = useState('WorldNPC');
  const [activeFilter, setActiveFilter] = useState('');
  const [deletedFilter, setDeletedFilter] = useState('false');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [inspectNpcId, setInspectNpcId] = useState(null);
  const [inspectLocId, setInspectLocId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('type', type);
      if (activeFilter) q.set('active', activeFilter);
      if (deletedFilter) q.set('deleted', deletedFilter);
      if (search.trim()) q.set('search', search.trim());
      q.set('limit', '100');
      const res = await apiClient.get(`/v1/admin/livingWorld/entity-registry?${q}`);
      const bucket = res?.[type];
      setRows(Array.isArray(bucket?.rows) ? bucket.rows : []);
      setTotal(Number(bucket?.total) || 0);
    } finally {
      setLoading(false);
    }
  }, [type, activeFilter, deletedFilter, search]);

  useEffect(() => { refresh(); }, [refresh]);

  const act = useCallback(async (entityType, id, action) => {
    const key = `${entityType}:${id}:${action}`;
    setBusy(key);
    try {
      if (action === 'hard-delete') {
        await apiClient.del(`/v1/admin/livingWorld/entity-registry/${entityType}/${encodeURIComponent(id)}/hard-delete`);
      } else {
        await apiClient.post(`/v1/admin/livingWorld/entity-registry/${entityType}/${encodeURIComponent(id)}/${action}`);
      }
      await refresh();
    } catch (err) {
      alert(err?.message || 'Operacja nie powiodła się');
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const idOf = (row) => (type === 'CustomSpell' ? row.name : row.id);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3 text-[11px] items-end">
        <FilterSelect
          label="Typ"
          value={type}
          onChange={setType}
          options={TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
        />
        <FilterSelect
          label="Status"
          value={activeFilter}
          onChange={setActiveFilter}
          options={[{ value: '', label: 'Wszystkie' }, { value: 'true', label: 'Aktywne' }, { value: 'false', label: 'Nieaktywne' }]}
        />
        <FilterSelect
          label="Usunięte"
          value={deletedFilter}
          onChange={setDeletedFilter}
          options={[{ value: '', label: 'Wszystkie' }, { value: 'false', label: 'Nie' }, { value: 'true', label: 'Tak' }]}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">Szukaj</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="nazwa…"
            className="bg-surface-variant/40 text-on-surface text-[11px] px-2 py-1 rounded border border-outline-variant/30 w-40"
          />
        </div>
      </div>

      <div className="text-[10px] text-on-surface-variant mb-2">
        {loading ? 'Ładowanie…' : `${total} wyników`}
      </div>

      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {rows.map((row) => {
          const id = idOf(row);
          const isDeleted = !!row.softDeletedAt;
          const isActive = !!row.globallyActive;
          return (
            <div
              key={id}
              className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-variant/20 hover:bg-surface-variant/40 text-[11px]"
            >
              <div className="flex-1 min-w-0">
                {(type === 'WorldNPC' || type === 'WorldLocation') ? (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline truncate block text-left w-full"
                    onClick={() => {
                      if (type === 'WorldNPC') setInspectNpcId(id);
                      else setInspectLocId(id);
                    }}
                  >
                    {entityDisplayName(type, row)}
                  </button>
                ) : (
                  <div className="font-medium text-on-surface truncate">{entityDisplayName(type, row)}</div>
                )}
                {row.originCampaignId && (
                  <div className="text-[9px] text-on-surface-variant truncate">
                    origin: {row.originCampaignId.slice(0, 8)}…
                  </div>
                )}
              </div>
              <StatusBadge active={isActive} deleted={isDeleted} />
              <div className="flex gap-1 shrink-0">
                {!isDeleted && !isActive && (
                  <ActionBtn
                    disabled={busy === `${type}:${id}:activate`}
                    onClick={() => act(type, id, 'activate')}
                  >
                    Aktywuj
                  </ActionBtn>
                )}
                {!isDeleted && isActive && (
                  <ActionBtn
                    disabled={busy === `${type}:${id}:deactivate`}
                    onClick={() => act(type, id, 'deactivate')}
                  >
                    Dezaktywuj
                  </ActionBtn>
                )}
                {!isDeleted && (
                  <ActionBtn
                    danger
                    disabled={busy === `${type}:${id}:soft-delete`}
                    onClick={() => act(type, id, 'soft-delete')}
                  >
                    Soft-del
                  </ActionBtn>
                )}
                {isDeleted && (
                  <ActionBtn
                    disabled={busy === `${type}:${id}:restore`}
                    onClick={() => act(type, id, 'restore')}
                  >
                    Przywróć
                  </ActionBtn>
                )}
                {isDeleted && (
                  <ActionBtn
                    danger
                    disabled={busy === `${type}:${id}:hard-delete`}
                    onClick={() => {
                      if (confirm('Trwałe usunięcie — na pewno?')) act(type, id, 'hard-delete');
                    }}
                  >
                    Hard-del
                  </ActionBtn>
                )}
              </div>
            </div>
          );
        })}
        {!loading && rows.length === 0 && (
          <div className="text-center py-6 text-on-surface-variant text-[11px]">Brak wyników</div>
        )}
      </div>
      {inspectNpcId && <NpcDetailModal id={inspectNpcId} onClose={() => setInspectNpcId(null)} />}
      {inspectLocId && <LocationDetailModal id={inspectLocId} onClose={() => setInspectLocId(null)} />}
    </div>
  );
}
