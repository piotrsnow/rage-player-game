// Scenes tab — slim view of every scene (only meta in the list payload), full
// edit when one is selected.

import { useState, useEffect } from 'react';
import EntityForm from '../shared/EntityForm';
import ListDetailLayout from '../shared/ListDetailLayout';
import { sceneFields } from '../entityConfigs';
import { adminApi } from '../shared/adminApi';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';

export default function ScenesTab({ campaign }) {
  const refreshCurrent = useAdminPanelStore((s) => s.refreshCurrent);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const scenes = campaign.scenes || [];

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    adminApi.getScene(campaign.campaign.id, selectedId).then(setDetail);
  }, [selectedId, campaign.campaign.id]);

  async function save(diff) {
    setBusy(true);
    try {
      await adminApi.patchScene(campaign.campaign.id, selectedId, diff);
      const fresh = await adminApi.getScene(campaign.campaign.id, selectedId);
      setDetail(fresh);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!detail) return;
    if (!window.confirm(`Usunąć scenę #${detail.sceneIndex}?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteScene(campaign.campaign.id, selectedId);
      setSelectedId(null);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  return (
    <ListDetailLayout
      items={scenes}
      getKey={(s) => s.id}
      getLabel={(s) => `Scena #${s.sceneIndex}`}
      getSublabel={(s) => (s.chosenAction ? `→ ${s.chosenAction.slice(0, 40)}` : '')}
      selectedId={selectedId}
      onSelect={setSelectedId}
      emptyHint="Brak scen."
    >
      {detail && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Scena #{detail.sceneIndex}</h2>
            <button
              type="button"
              onClick={remove}
              className="rounded border border-red-700 bg-red-900/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/50"
            >
              Usuń scenę
            </button>
          </div>
          <EntityForm
            fields={sceneFields}
            value={detail}
            onSave={save}
            busy={busy}
          />
        </div>
      )}
    </ListDetailLayout>
  );
}
