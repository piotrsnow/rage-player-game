// Campaign NPCs tab.

import { useState, useEffect } from 'react';
import EntityForm from '../shared/EntityForm';
import ListDetailLayout from '../shared/ListDetailLayout';
import { npcFields } from '../entityConfigs';
import { adminApi } from '../shared/adminApi';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';

export default function NpcsTab({ campaign }) {
  const refreshCurrent = useAdminPanelStore((s) => s.refreshCurrent);
  const validate = useAdminPanelStore((s) => s.validate);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const npcs = campaign.npcs || [];

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    adminApi.getNpc(campaign.campaign.id, selectedId).then(setDetail);
  }, [selectedId, campaign.campaign.id]);

  async function save(diff) {
    setBusy(true);
    try {
      await adminApi.patchNpc(campaign.campaign.id, selectedId, diff);
      const fresh = await adminApi.getNpc(campaign.campaign.id, selectedId);
      setDetail(fresh);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  async function create() {
    const name = window.prompt('Imię nowego NPC:');
    if (!name) return;
    setBusy(true);
    try {
      const created = await adminApi.createNpc(campaign.campaign.id, { name, alive: true });
      setSelectedId(created.id);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!detail) return;
    if (!window.confirm(`Usunąć NPC "${detail.name}"?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteNpc(campaign.campaign.id, selectedId);
      setSelectedId(null);
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  return (
    <ListDetailLayout
      items={npcs}
      getKey={(n) => n.id}
      getLabel={(n) => n.name}
      getSublabel={(n) => `${n.alive ? '🟢' : '💀'} ${n.role || n.category}`}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onCreate={create}
      createLabel="+ Nowy NPC"
      emptyHint="Brak NPC w tej kampanii."
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
              Usuń NPC
            </button>
          </div>
          <EntityForm
            fields={npcFields}
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
