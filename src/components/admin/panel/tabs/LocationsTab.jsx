// Locations tab — toggles between WorldLocation (canonical) and CampaignLocation
// (per-campaign sandbox).

import { useState, useEffect } from 'react';
import EntityForm from '../shared/EntityForm';
import ListDetailLayout from '../shared/ListDetailLayout';
import { worldLocationFields, campaignLocationFields } from '../entityConfigs';
import { adminApi } from '../shared/adminApi';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';
import LocationDetailModal from '../../adminLivingWorld/shared/LocationDetailModal';

export default function LocationsTab({ campaign }) {
  const [mode, setMode] = useState('campaign'); // 'campaign' | 'world'

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode('campaign')}
          className={`rounded border px-3 py-1.5 text-sm ${mode === 'campaign' ? 'border-emerald-600 bg-emerald-700/20 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-300'}`}
        >
          CampaignLocation ({(campaign.campaignLocations || []).length})
        </button>
        <button
          type="button"
          onClick={() => setMode('world')}
          className={`rounded border px-3 py-1.5 text-sm ${mode === 'world' ? 'border-emerald-600 bg-emerald-700/20 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-300'}`}
        >
          WorldLocation (canonical)
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === 'campaign' ? <CampaignLocationsPane campaign={campaign} /> : <WorldLocationsPane />}
      </div>
    </div>
  );
}

function CampaignLocationsPane({ campaign }) {
  const refreshCurrent = useAdminPanelStore((s) => s.refreshCurrent);
  const validate = useAdminPanelStore((s) => s.validate);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const items = campaign.campaignLocations || [];

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    adminApi.getCampaignLocation(campaign.campaign.id, selectedId).then(setDetail);
  }, [selectedId, campaign.campaign.id]);

  async function save(diff) {
    setBusy(true);
    try {
      await adminApi.patchCampaignLocation(campaign.campaign.id, selectedId, diff);
      const fresh = await adminApi.getCampaignLocation(campaign.campaign.id, selectedId);
      setDetail(fresh);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  async function create() {
    const name = window.prompt('Nazwa nowej lokacji:');
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
    setBusy(true);
    try {
      const created = await adminApi.createCampaignLocation(campaign.campaign.id, {
        name, canonicalSlug: slug,
      });
      setSelectedId(created.id);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!detail) return;
    if (!window.confirm(`Usunąć lokację "${detail.name}"?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteCampaignLocation(campaign.campaign.id, selectedId);
      setSelectedId(null);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  return (
    <ListDetailLayout
      items={items}
      getKey={(l) => l.id}
      getLabel={(l) => l.name}
      getSublabel={(l) => `${l.locationType} · ${l.dangerLevel}`}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onCreate={create}
      createLabel="+ Nowa lokacja"
      emptyHint="Brak lokacji w tej kampanii."
    >
      {detail && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">{detail.name}</h2>
            <button
              type="button"
              onClick={remove}
              className="rounded border border-red-700 bg-red-900/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/50"
            >
              Usuń
            </button>
          </div>
          <EntityForm
            fields={campaignLocationFields}
            value={detail}
            onSave={save}
            onValidate={validate}
            busy={busy}
          />
        </div>
      )}
    </ListDetailLayout>
  );
}

function WorldLocationsPane() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inspectId, setInspectId] = useState(null);

  async function loadList() {
    setLoading(true);
    try {
      const rows = await adminApi.listWorldLocations(search.trim() || undefined);
      setList(rows);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    adminApi.getWorldLocation(selectedId).then(setDetail);
  }, [selectedId]);

  async function save(diff) {
    setBusy(true);
    try {
      await adminApi.patchWorldLocation(selectedId, diff);
      const fresh = await adminApi.getWorldLocation(selectedId);
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
          placeholder="Szukaj WorldLocation…"
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
          getKey={(l) => l.id}
          getLabel={(l) => l.displayName || l.canonicalName}
          getSublabel={(l) => `${l.locationType} · ${l.dangerLevel}`}
          selectedId={selectedId}
          onSelect={setSelectedId}
          emptyHint="Brak wyników."
        >
          {detail && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">{detail.displayName || detail.canonicalName}</h2>
                <button
                  type="button"
                  onClick={() => setInspectId(selectedId)}
                  className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
                >
                  Szczegoly
                </button>
              </div>
              <EntityForm
                fields={worldLocationFields}
                value={detail}
                onSave={save}
                busy={busy}
              />
            </div>
          )}
        </ListDetailLayout>
      </div>
      {inspectId && <LocationDetailModal id={inspectId} onClose={() => setInspectId(null)} />}
    </div>
  );
}
