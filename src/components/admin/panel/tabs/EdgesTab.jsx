// LocationEdge tab — semantic graph edges between WorldLocations / CampaignLocations.

import { useState, useEffect } from 'react';
import EntityForm from '../shared/EntityForm';
import ListDetailLayout from '../shared/ListDetailLayout';
import { locationEdgeFields } from '../entityConfigs';
import { adminApi } from '../shared/adminApi';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';

export default function EdgesTab({ campaign }) {
  const refreshCurrent = useAdminPanelStore((s) => s.refreshCurrent);
  const validate = useAdminPanelStore((s) => s.validate);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  const edges = campaign.locationEdges || [];
  const detail = edges.find((e) => e.id === selectedId) || null;

  async function save(diff) {
    setBusy(true);
    try {
      await adminApi.patchEdge(campaign.campaign.id, selectedId, diff);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  async function create() {
    setBusy(true);
    try {
      const created = await adminApi.createEdge(campaign.campaign.id, {
        fromKind: 'world', fromId: '00000000-0000-0000-0000-000000000000',
        toKind: 'world', toId: '00000000-0000-0000-0000-000000000000',
        edgeType: 'path', category: 'movement', bidirectional: true,
      });
      setSelectedId(created.id);
      await refreshCurrent();
      window.alert('Krawędź utworzona z placeholder UUIDami — wypełnij from/to przed dalszą edycją.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!detail) return;
    if (!window.confirm('Usunąć krawędź?')) return;
    setBusy(true);
    try {
      await adminApi.deleteEdge(campaign.campaign.id, selectedId);
      setSelectedId(null);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  return (
    <ListDetailLayout
      items={edges}
      getKey={(e) => e.id}
      getLabel={(e) => `${e.edgeType} (${e.category})`}
      getSublabel={(e) => `${e.fromKind}/${shortId(e.fromId)} → ${e.toKind}/${shortId(e.toId)}`}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onCreate={create}
      createLabel="+ Nowa krawędź"
      emptyHint="Brak krawędzi."
    >
      {detail && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">{detail.edgeType} ({detail.category})</h2>
            <button
              type="button"
              onClick={remove}
              className="rounded border border-red-700 bg-red-900/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/50"
            >
              Usuń
            </button>
          </div>
          <EntityForm
            fields={locationEdgeFields}
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

function shortId(id) {
  if (!id) return '?';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
